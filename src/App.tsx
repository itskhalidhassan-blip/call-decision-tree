import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowRight,
  ChevronUp,
  Info,
  X,
} from 'lucide-react'
import { useVideoScrub } from '@/useVideoScrub'

const DARK = '#1D3045'
const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260821_114821_a8ca298f-be2c-4613-a4dd-51b69e16bbde.mp4'

const navigation = [
  'VECTRUS ENERGY',
  'VECTRUS UPSTREAM',
  'VECTRUS MARKETS',
  'VECTRUS SYSTEMS',
  'VECTRUS+',
]

type StaggerProps = {
  children: ReactNode
  className?: string
  delay: number
  visible: boolean
}

function Stagger({
  children,
  className = '',
  delay,
  visible,
}: StaggerProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const shown = mounted && visible

  return (
    <div
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(24px)',
        transition: `opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  )
}

type MobileMenuProps = {
  onClose: () => void
  open: boolean
}

function MobileMenu({ onClose, open }: MobileMenuProps) {
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-[100] bg-[#1D3045] transition-[opacity,visibility] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
        open
          ? 'visible pointer-events-auto opacity-100'
          : 'invisible pointer-events-none opacity-0'
      }`}
    >
      <div
        className={`flex h-full flex-col transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          open ? 'translate-y-0' : '-translate-y-8'
        }`}
      >
        <div className="flex justify-end px-6 pt-8 sm:px-8 sm:pt-12">
          <button
            aria-label="Close menu"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 text-white transition-colors hover:border-white"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col items-center justify-center px-8 sm:px-12">
          {navigation.map((label, index) => (
            <a
              className={`py-3 text-2xl font-light uppercase tracking-wide transition-[color,opacity,transform] duration-500 sm:text-3xl ${
                index === 0
                  ? 'text-white'
                  : 'text-white/60 hover:text-white'
              } ${open ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}
              href="#"
              key={label}
              onClick={onClose}
              style={{ transitionDelay: open ? `${index * 60}ms` : '0ms' }}
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center justify-between px-8 pb-10 text-xs font-medium uppercase tracking-[0.2em] text-white/60 sm:px-12">
          <a href="#">NEWS</a>
          <a href="#">CONTACT</a>
        </div>
      </div>
    </div>
  )
}

type NavbarProps = {
  onMenuOpen: () => void
  progress: number
}

function Navbar({ onMenuOpen, progress }: NavbarProps) {
  const [entered, setEntered] = useState(false)
  const isLight = progress > 0.55
  const color = isLight ? '#FFFFFF' : DARK

  useEffect(() => {
    const timeout = window.setTimeout(() => setEntered(true), 200)
    return () => window.clearTimeout(timeout)
  }, [])

  const entranceStyle = (delay: number) => ({
    opacity: entered ? 1 : 0,
    transform: entered ? 'translateY(0)' : 'translateY(-12px)',
    transition: `opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
  })

  return (
    <nav
      className="pointer-events-auto absolute left-0 right-0 top-0 z-50 flex items-center justify-between px-6 pb-6 pt-8 transition-colors duration-500 sm:px-8 sm:pt-12 md:px-12"
      style={{ color }}
    >
      <button
        aria-label="Open menu"
        className="flex flex-col gap-[5px] lg:hidden"
        onClick={onMenuOpen}
        style={entranceStyle(100)}
        type="button"
      >
        <span
          className="h-0.5 w-6 transition-colors duration-500"
          style={{ backgroundColor: color }}
        />
        <span
          className="h-0.5 w-6 transition-colors duration-500"
          style={{ backgroundColor: color }}
        />
        <span
          className="h-0.5 w-4 transition-colors duration-500"
          style={{ backgroundColor: color }}
        />
      </button>

      <div className="hidden items-center gap-8 lg:flex xl:gap-10">
        {navigation.map((label, index) => (
          <a
            className="relative text-xs font-medium uppercase tracking-[0.15em] hover:opacity-70"
            href="#"
            key={label}
            style={entranceStyle(index * 80 + 100)}
          >
            {label}
            {index === 0 && (
              <span
                className="absolute -bottom-3 left-0 h-0.5 w-full transition-colors duration-500"
                style={{ backgroundColor: color }}
              />
            )}
          </a>
        ))}
      </div>

      <div
        className="hidden items-center gap-8 sm:flex"
        style={entranceStyle(500)}
      >
        <div className="flex items-center gap-3">
          <a
            className="text-xs font-medium uppercase tracking-[0.2em]"
            href="#"
          >
            NEWS
          </a>
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full transition-colors duration-500"
            style={{ backgroundColor: color }}
          >
            <Info color={isLight ? DARK : '#FFFFFF'} size={10} />
          </span>
        </div>
        <span className="hidden text-xs font-medium uppercase tracking-[0.2em] lg:inline">
          MENU
        </span>
        <button
          className="text-xs font-medium uppercase tracking-[0.2em] lg:hidden"
          onClick={onMenuOpen}
          type="button"
        >
          MENU
        </button>
      </div>
    </nav>
  )
}

const sectionOneOpacity = (progress: number) =>
  progress < 0.2 ? 1 : Math.max(0, 1 - (progress - 0.2) / 0.08)

const sectionTwoOpacity = (progress: number) => {
  if (progress < 0.32) return 0
  if (progress < 0.4) return (progress - 0.32) / 0.08
  if (progress < 0.55) return 1
  return Math.max(0, 1 - (progress - 0.55) / 0.08)
}

const sectionThreeOpacity = (progress: number) => {
  if (progress < 0.67) return 0
  if (progress < 0.75) return (progress - 0.67) / 0.08
  return 1
}

export default function App() {
  const {
    canvasLive,
    canvasRef,
    containerRef,
    scrollProgress,
    videoRef,
  } = useVideoScrub(VIDEO_SRC)
  const [menuOpen, setMenuOpen] = useState(false)
  const s1Opacity = sectionOneOpacity(scrollProgress)
  const s2Opacity = sectionTwoOpacity(scrollProgress)
  const s3Opacity = sectionThreeOpacity(scrollProgress)

  return (
    <main className="relative h-[500vh]" ref={containerRef}>
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
          preload="auto"
          ref={videoRef}
          src={VIDEO_SRC}
        />
        <canvas
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            canvasLive ? 'opacity-100' : 'opacity-0'
          }`}
          height={1080}
          ref={canvasRef}
          width={1920}
        />

        <div className="pointer-events-none absolute inset-0">
          <Navbar
            onMenuOpen={() => setMenuOpen(true)}
            progress={scrollProgress}
          />

          <section
            className="absolute inset-0 flex items-center px-6 sm:px-8 md:px-20 lg:px-32"
            style={{
              opacity: s1Opacity,
              transition: 'opacity 0.1s ease-out',
            }}
          >
            <div>
              <Stagger delay={0} visible={s1Opacity > 0.3}>
                <h1
                  className="font-light uppercase leading-[1.2]"
                  style={{
                    color: DARK,
                    fontSize: 'clamp(2rem, 5vw, 5rem)',
                  }}
                >
                  Advancing resources for a cleaner future
                </h1>
              </Stagger>
              <Stagger delay={150} visible={s1Opacity > 0.3}>
                <p
                  className="mt-6 text-sm uppercase tracking-[0.3em]"
                  style={{ color: '#1D304590' }}
                >
                  Sustainable power with purpose
                </p>
              </Stagger>
            </div>

            <Stagger
              className="pointer-events-auto absolute bottom-12 right-6 sm:right-8 md:right-12"
              delay={300}
              visible={s1Opacity > 0.3}
            >
              <button
                className="flex h-12 w-12 items-center justify-center rounded-full border transition-opacity hover:opacity-70"
                style={{ borderColor: '#1D304580', color: DARK }}
                type="button"
              >
                <ArrowRight size={18} />
              </button>
            </Stagger>
          </section>

          <section
            className="absolute inset-0 flex items-center justify-center px-6 sm:px-8"
            style={{
              opacity: s2Opacity,
              transition: 'opacity 0.1s ease-out',
            }}
          >
            <Stagger
              className="max-w-[900px]"
              delay={0}
              visible={s2Opacity > 0.3}
            >
              <h2
                className="text-center font-extralight uppercase leading-[1.3] tracking-wide"
                style={{
                  color: DARK,
                  fontSize: 'clamp(1.5rem, 4.5vw, 4.5rem)',
                }}
              >
                We build lasting partnerships with vision{' '}
                <span style={{ color: '#1D3045CC' }}>and precision</span>{' '}
                <span style={{ color: '#1D304580' }}>
                  across every frontier
                </span>
              </h2>
            </Stagger>

            <div className="absolute bottom-16 right-6 flex flex-col items-center gap-4 sm:right-8 md:right-12">
              <Stagger
                className="pointer-events-auto"
                delay={200}
                visible={s2Opacity > 0.3}
              >
                <button
                  className="flex h-12 w-12 items-center justify-center rounded-full border"
                  style={{ borderColor: '#1D304566', color: DARK }}
                  type="button"
                >
                  <ArrowDown size={18} />
                </button>
              </Stagger>

              <Stagger
                className="mt-4"
                delay={350}
                visible={s2Opacity > 0.3}
              >
                <div className="flex flex-col items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: DARK }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: '#1D304566' }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: '#1D304566' }}
                  />
                </div>
              </Stagger>

              <Stagger
                className="pointer-events-auto mt-2"
                delay={500}
                visible={s2Opacity > 0.3}
              >
                <button
                  className="flex h-10 w-10 items-center justify-center rounded-full border"
                  style={{ borderColor: '#1D30454D', color: '#1D3045CC' }}
                  type="button"
                >
                  <ChevronUp size={16} />
                </button>
              </Stagger>
            </div>
          </section>

          <section
            className="absolute inset-0 flex items-center justify-end px-6 sm:px-8 md:px-20 lg:px-32"
            style={{
              opacity: s3Opacity,
              transition: 'opacity 0.1s ease-out',
            }}
          >
            <div className="w-full max-w-2xl text-left">
              <Stagger delay={0} visible={s3Opacity > 0.3}>
                <p className="mb-4 text-lg tracking-wide text-white/60">
                  Halder | Nordvik
                </p>
              </Stagger>

              <Stagger delay={150} visible={s3Opacity > 0.3}>
                <h2
                  className="mb-8 font-light uppercase leading-[1.2] tracking-wide text-white"
                  style={{ fontSize: 'clamp(2rem, 4vw, 4rem)' }}
                >
                  Fueling ambition,
                  <br />
                  shaping tomorrow.
                </h2>
              </Stagger>

              <Stagger
                className="pointer-events-auto"
                delay={300}
                visible={s3Opacity > 0.3}
              >
                <div className="flex items-center gap-4">
                  <span className="text-sm uppercase tracking-[0.3em] text-white/80">
                    Contact Nordvik
                  </span>
                  <button
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-800 transition-transform duration-300 hover:scale-110"
                    type="button"
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              </Stagger>
            </div>
          </section>

          <MobileMenu
            onClose={() => setMenuOpen(false)}
            open={menuOpen}
          />
        </div>
      </div>
    </main>
  )
}
