import { useEffect, useRef, useState } from 'react'
import * as MP4Box from 'mp4box'

const LERP_TAU = 8
const SNAP = 0.002
const LRU_MAX = 24
const LEAD = 24
const WATCHDOG = 60_000

type FrameRecord = {
  ts: number
  blob: Blob
}

type FailureStage =
  | 'CloudFront frame-bank fetch/CORS'
  | 'MP4 parsing'
  | 'WebCodecs decoding'
  | 'WebP frame encoding'
  | 'WebP bitmap decoding'
  | 'frame-bank watchdog'

class FrameBankError extends Error {
  stage: FailureStage

  constructor(stage: FailureStage, message: string) {
    super(message)
    this.name = 'FrameBankError'
    this.stage = stage
  }
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))

const asError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error))

const toFrameBankError = (
  stage: FailureStage,
  error: unknown,
): FrameBankError => {
  if (error instanceof FrameBankError) {
    return error
  }

  return new FrameBankError(stage, asError(error).message)
}

const nearestIndex = (bank: FrameRecord[], time: number) => {
  const target = time * 1_000_000
  let low = 0
  let high = bank.length - 1

  while (low <= high) {
    const middle = (low + high) >> 1
    if (bank[middle].ts < target) {
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  if (low <= 0) return 0
  if (low >= bank.length) return bank.length - 1

  return target - bank[low - 1].ts <= bank[low].ts - target
    ? low - 1
    : low
}

const encodeFrame = async (frame: VideoFrame) => {
  const canvas = document.createElement('canvas')
  canvas.width = frame.displayWidth || frame.codedWidth
  canvas.height = frame.displayHeight || frame.codedHeight
  const context = canvas.getContext('2d')

  if (!context) {
    frame.close()
    throw new FrameBankError(
      'WebP frame encoding',
      'A 2D canvas context could not be created.',
    )
  }

  try {
    context.drawImage(frame, 0, 0, canvas.width, canvas.height)
  } finally {
    frame.close()
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(
            new FrameBankError(
              'WebP frame encoding',
              'The browser could not encode a WebP frame.',
            ),
          )
        }
      },
      'image/webp',
      0.82,
    )
  })
}

const codecDescription = (
  file: MP4Box.MP4File,
  track: MP4Box.MP4TrackInfo,
  source: ArrayBuffer,
) => {
  const sampleEntry =
    file.getTrackById(track.id)?.mdia.minf.stbl.stsd.entries[0]
  const box =
    sampleEntry?.avcC ??
    sampleEntry?.hvcC ??
    sampleEntry?.vpcC ??
    sampleEntry?.av1C

  if (!box) {
    throw new FrameBankError(
      'MP4 parsing',
      'The video track has no avcC, hvcC, vpcC, or av1C description.',
    )
  }

  const start = box.start + box.hdr_size
  const end = box.start + box.size

  if (start < 0 || end > source.byteLength || start >= end) {
    throw new FrameBankError(
      'MP4 parsing',
      'The codec description is outside the MP4 buffer.',
    )
  }

  return new Uint8Array(source.slice(start, end))
}

type DecodeAttemptOptions = {
  acceleration: HardwareAcceleration
  onDecoder: (decoder: VideoDecoder | null) => void
  onDuration: (duration: number) => void
  onCancel: (cancel: (() => void) | null) => void
  source: ArrayBuffer
}

const decodeAttempt = ({
  acceleration,
  onDecoder,
  onDuration,
  onCancel,
  source,
}: DecodeAttemptOptions) =>
  new Promise<FrameRecord[]>((resolve, reject) => {
    const file = MP4Box.createFile()
    const frames: FrameRecord[] = []
    const samples: MP4Box.MP4Sample[] = []
    let decoder: VideoDecoder | null = null
    let expectedSamples = 0
    let extractedSamples = 0
    let submittedSamples = 0
    let pendingEncodes = 0
    let flushStarted = false
    let flushDone = false
    let settled = false

    const stop = () => {
      onCancel(null)
      onDecoder(null)
      file.stop()
      if (decoder && decoder.state !== 'closed') {
        decoder.close()
      }
    }

    const fail = (error: unknown, stage: FailureStage) => {
      if (settled) return
      settled = true
      stop()
      reject(toFrameBankError(stage, error))
    }

    const complete = () => {
      if (
        settled ||
        !flushDone ||
        pendingEncodes !== 0 ||
        frames.length === 0
      ) {
        return
      }

      settled = true
      stop()
      frames.sort((a, b) => a.ts - b.ts)
      resolve(frames)
    }

    const maybeFlush = () => {
      if (
        settled ||
        flushStarted ||
        !decoder ||
        extractedSamples < expectedSamples ||
        submittedSamples < samples.length
      ) {
        return
      }

      flushStarted = true
      decoder
        .flush()
        .then(() => {
          flushDone = true
          complete()
        })
        .catch((error) => fail(error, 'WebCodecs decoding'))
    }

    const pump = () => {
      if (!decoder || settled || decoder.state !== 'configured') return

      try {
        while (
          submittedSamples < samples.length &&
          decoder.decodeQueueSize + pendingEncodes < LEAD
        ) {
          const sample = samples[submittedSamples]
          const init: EncodedVideoChunkInit = {
            data: sample.data,
            timestamp: Math.round((sample.cts * 1_000_000) / sample.timescale),
            type: sample.is_sync ? 'key' : 'delta',
          }
          const duration = Math.round(
            (sample.duration * 1_000_000) / sample.timescale,
          )

          if (duration > 0) {
            init.duration = duration
          }

          decoder.decode(new EncodedVideoChunk(init))
          submittedSamples += 1
        }
      } catch (error) {
        fail(error, 'WebCodecs decoding')
        return
      }

      maybeFlush()
    }

    file.onError = (error) => fail(error, 'MP4 parsing')

    file.onSamples = (_id, _user, extracted) => {
      if (settled) return
      samples.push(...extracted)
      extractedSamples += extracted.length
      pump()
    }

    file.onReady = (info) => {
      if (settled) return

      try {
        const track =
          info.videoTracks?.[0] ??
          info.tracks.find((candidate) => candidate.video)

        if (!track) {
          throw new FrameBankError(
            'MP4 parsing',
            'The MP4 contains no video track.',
          )
        }

        expectedSamples = track.nb_samples
        onDuration(track.duration / track.timescale)

        const config: VideoDecoderConfig = {
          codec: track.codec,
          codedHeight: track.video?.height,
          codedWidth: track.video?.width,
          description: codecDescription(file, track, source),
          hardwareAcceleration: acceleration,
          optimizeForLatency: true,
        }

        decoder = new VideoDecoder({
          error: (error) => fail(error, 'WebCodecs decoding'),
          output: (frame) => {
            if (settled) {
              frame.close()
              return
            }

            pendingEncodes += 1
            const ts = frame.timestamp

            void encodeFrame(frame)
              .then((blob) => {
                if (!settled) {
                  frames.push({ blob, ts })
                }
              })
              .catch((error) => fail(error, 'WebP frame encoding'))
              .finally(() => {
                pendingEncodes -= 1
                if (!settled) {
                  pump()
                  complete()
                }
              })
          },
        })

        onDecoder(decoder)
        decoder.configure(config)
        file.setExtractionOptions(track.id, null, {
          nbSamples: Math.min(LEAD, Math.max(1, track.nb_samples)),
        })
        file.start()
      } catch (error) {
        fail(error, 'WebCodecs decoding')
      }
    }

    onCancel(() =>
      fail(
        new FrameBankError(
          'frame-bank watchdog',
          'Frame-bank construction exceeded 60000ms.',
        ),
        'frame-bank watchdog',
      ),
    )

    try {
      const buffer = source as MP4Box.MP4ArrayBuffer
      buffer.fileStart = 0
      file.appendBuffer(buffer)
      file.flush()
    } catch (error) {
      fail(error, 'MP4 parsing')
    }
  })

export function useVideoScrub(videoSrc: string) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bank = useRef<FrameRecord[]>([])
  const lru = useRef<Map<number, ImageBitmap | null>>(new Map())
  const current = useRef(0)
  const target = useRef(0)
  const ready = useRef(false)
  const reverted = useRef(false)
  const painted = useRef(false)
  const building = useRef(false)
  const dur = useRef(0)
  const span = useRef(1)
  const [canvasLive, setCanvasLive] = useState(false)
  const [failure, setFailure] = useState<FailureStage | null>(null)
  const [scrollProgress, setScrollProgress] = useState(0)

  useEffect(() => {
    let active = true
    let animationFrame = 0
    let activeDecoder: VideoDecoder | null = null
    let cancelAttempt: (() => void) | null = null
    let watchdogId: number | undefined
    const abortController = new AbortController()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

    const clearBitmaps = () => {
      for (const bitmap of lru.current.values()) {
        bitmap?.close()
      }
      lru.current.clear()
    }

    const useFallback = (error: FrameBankError) => {
      if (!active || reverted.current) return
      reverted.current = true
      ready.current = false
      building.current = false
      painted.current = false
      setCanvasLive(false)
      setFailure(error.stage)
      clearBitmaps()
      cancelAttempt?.()
      cancelAttempt = null
      if (activeDecoder && activeDecoder.state !== 'closed') {
        activeDecoder.close()
      }
      activeDecoder = null
      console.warn(
        `[useVideoScrub] ${error.stage} failed; using video seeking fallback.`,
        error,
      )
    }

    const recomputeSpan = () => {
      span.current = Math.max(
        1,
        (containerRef.current?.offsetHeight ?? window.innerHeight) -
          window.innerHeight,
      )
    }

    const getProgress = () => clamp(window.scrollY / span.current)

    const touch = (index: number, value: ImageBitmap | null) => {
      lru.current.delete(index)
      lru.current.set(index, value)

      while (lru.current.size > LRU_MAX) {
        const oldest = lru.current.keys().next().value as number | undefined
        if (oldest === undefined) break
        const bitmap = lru.current.get(oldest)
        lru.current.delete(oldest)
        bitmap?.close()
      }
    }

    const warm = (index: number) => {
      if (
        index < 0 ||
        index >= bank.current.length ||
        lru.current.has(index)
      ) {
        return
      }

      touch(index, null)
      void createImageBitmap(bank.current[index].blob)
        .then((bitmap) => {
          if (!active || reverted.current || lru.current.get(index) !== null) {
            bitmap.close()
            return
          }
          touch(index, bitmap)
        })
        .catch((error) =>
          useFallback(
            toFrameBankError('WebP bitmap decoding', error),
          ),
        )
    }

    const drawNearestFrame = (time: number) => {
      const canvas = canvasRef.current
      if (!canvas || bank.current.length === 0) return

      const index = nearestIndex(bank.current, time)
      for (let warmIndex = index - 1; warmIndex <= index + 2; warmIndex += 1) {
        warm(warmIndex)
      }

      const bitmap = lru.current.get(index)
      if (!bitmap) return
      touch(index, bitmap)

      const context = canvas.getContext('2d')
      if (!context) return

      const scale = Math.max(
        canvas.width / bitmap.width,
        canvas.height / bitmap.height,
      )
      const width = bitmap.width * scale
      const height = bitmap.height * scale
      context.drawImage(
        bitmap,
        (canvas.width - width) / 2,
        (canvas.height - height) / 2,
        width,
        height,
      )

      if (!painted.current) {
        painted.current = true
        setCanvasLive(true)
      }
    }

    let previousTime = performance.now()
    const animate = (time: number) => {
      if (!active) return

      const dt = Math.min(0.1, Math.max(0, (time - previousTime) / 1_000))
      previousTime = time
      const progress = getProgress()
      setScrollProgress(progress)

      if (dur.current > 0) {
        target.current = progress * dur.current
        if (reducedMotion.matches) {
          current.current = target.current
        } else {
          current.current +=
            (target.current - current.current) *
            (1 - Math.exp(-dt * LERP_TAU))
          if (Math.abs(target.current - current.current) < SNAP) {
            current.current = target.current
          }
        }

        if (ready.current && !reverted.current) {
          drawNearestFrame(current.current)
        } else {
          const video = videoRef.current
          if (
            video &&
            !video.seeking &&
            Math.abs(video.currentTime - current.current) > 0.01
          ) {
            try {
              video.currentTime = current.current
            } catch {
              // The next frame retries after media metadata becomes available.
            }
          }
        }
      }

      animationFrame = window.requestAnimationFrame(animate)
    }

    const syncDuration = () => {
      const videoDuration = videoRef.current?.duration
      if (videoDuration && Number.isFinite(videoDuration)) {
        dur.current = videoDuration
      }
    }

    const buildFrameBank = async () => {
      if (
        building.current ||
        reverted.current ||
        reducedMotion.matches ||
        typeof VideoDecoder === 'undefined'
      ) {
        if (
          !reducedMotion.matches &&
          typeof VideoDecoder === 'undefined'
        ) {
          useFallback(
            new FrameBankError(
              'WebCodecs decoding',
              'VideoDecoder is unavailable in this browser.',
            ),
          )
        }
        return
      }

      building.current = true
      watchdogId = window.setTimeout(() => {
        useFallback(
          new FrameBankError(
            'frame-bank watchdog',
            'Frame-bank construction exceeded 60000ms.',
          ),
        )
      }, WATCHDOG)

      try {
        let response: Response
        try {
          response = await fetch(videoSrc, {
            signal: abortController.signal,
          })
        } catch (error) {
          throw toFrameBankError('CloudFront frame-bank fetch/CORS', error)
        }

        if (!response.ok) {
          throw new FrameBankError(
            'CloudFront frame-bank fetch/CORS',
            `The video request returned ${response.status}.`,
          )
        }

        const source = await response.arrayBuffer()
        let decoded: FrameRecord[]

        try {
          decoded = await decodeAttempt({
            acceleration: 'prefer-hardware',
            onCancel: (cancel) => {
              cancelAttempt = cancel
            },
            onDecoder: (decoder) => {
              activeDecoder = decoder
            },
            onDuration: (duration) => {
              if (duration > 0) dur.current = duration
            },
            source: source.slice(0),
          })
        } catch (error) {
          const frameBankError = toFrameBankError(
            'WebCodecs decoding',
            error,
          )
          if (frameBankError.stage !== 'WebCodecs decoding') {
            throw frameBankError
          }

          decoded = await decodeAttempt({
            acceleration: 'prefer-software',
            onCancel: (cancel) => {
              cancelAttempt = cancel
            },
            onDecoder: (decoder) => {
              activeDecoder = decoder
            },
            onDuration: (duration) => {
              if (duration > 0) dur.current = duration
            },
            source: source.slice(0),
          })
        }

        if (!active || reverted.current) return
        bank.current = decoded
        ready.current = true
        building.current = false
        cancelAttempt = null
        if (watchdogId !== undefined) {
          window.clearTimeout(watchdogId)
          watchdogId = undefined
        }
      } catch (error) {
        if (!active || abortController.signal.aborted) return
        useFallback(toFrameBankError('WebCodecs decoding', error))
      }
    }

    const video = videoRef.current
    video?.addEventListener('loadedmetadata', syncDuration)
    syncDuration()
    recomputeSpan()
    window.addEventListener('resize', recomputeSpan)
    window.addEventListener('orientationchange', recomputeSpan)
    animationFrame = window.requestAnimationFrame(animate)

    if (document.readyState === 'complete') {
      void buildFrameBank()
    } else {
      window.addEventListener('load', buildFrameBank, { once: true })
    }

    return () => {
      active = false
      abortController.abort()
      window.cancelAnimationFrame(animationFrame)
      if (watchdogId !== undefined) {
        window.clearTimeout(watchdogId)
      }
      window.removeEventListener('load', buildFrameBank)
      window.removeEventListener('resize', recomputeSpan)
      window.removeEventListener('orientationchange', recomputeSpan)
      video?.removeEventListener('loadedmetadata', syncDuration)
      cancelAttempt?.()
      if (activeDecoder && activeDecoder.state !== 'closed') {
        activeDecoder.close()
      }
      clearBitmaps()
    }
  }, [videoSrc])

  return {
    canvasLive,
    canvasRef,
    containerRef,
    failure,
    scrollProgress,
    videoRef,
  }
}
