declare module 'mp4box' {
  export interface MP4ArrayBuffer extends ArrayBuffer {
    fileStart: number
  }

  export interface MP4Sample {
    cts: number
    data: Uint8Array
    duration: number
    is_sync: boolean
    timescale: number
  }

  export interface MP4TrackInfo {
    codec: string
    duration: number
    id: number
    nb_samples: number
    timescale: number
    video?: {
      height: number
      width: number
    }
  }

  export interface MP4Info {
    tracks: MP4TrackInfo[]
    videoTracks: MP4TrackInfo[]
  }

  export interface MP4CodecBox {
    hdr_size: number
    size: number
    start: number
  }

  export interface MP4SampleEntry {
    av1C?: MP4CodecBox
    avcC?: MP4CodecBox
    hvcC?: MP4CodecBox
    vpcC?: MP4CodecBox
  }

  export interface MP4TrackBox {
    mdia: {
      minf: {
        stbl: {
          stsd: {
            entries: MP4SampleEntry[]
          }
        }
      }
    }
  }

  export interface MP4File {
    appendBuffer(buffer: MP4ArrayBuffer): number
    flush(): void
    getTrackById(id: number): MP4TrackBox | null
    onError: ((error: string) => void) | null
    onReady: ((info: MP4Info) => void) | null
    onSamples:
      | ((id: number, user: unknown, samples: MP4Sample[]) => void)
      | null
    setExtractionOptions(
      id: number,
      user: unknown,
      options: { nbSamples: number },
    ): void
    start(): void
    stop(): void
  }

  export function createFile(): MP4File
}
