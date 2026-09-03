import { ChevronDown } from 'lucide-react'
import { useRef } from 'react'
import { CONFIRMAND_NAME } from '@/data/siteConfig'
import { useInViewport } from '@/hooks/useInViewport'
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { useVideoScrub } from '@/hooks/useVideoScrub'
import { cn } from '@/lib/utils'

/**
 * ADJUSTABLE: fine-tune where Victor sits in frame within the video's own
 * box (see HERO_VIDEO_TOP_OFFSET below for why his face can't end up
 * behind the nav regardless of this value).
 */
const HERO_VIDEO_OBJECT_POSITION = 'center 35%'

/**
 * The video is inset from the top by the fixed nav's height so Victor's
 * face — which sits close to the top of the source footage — can never
 * render behind the nav bar, at any viewport size. Must match
 * Navigation's header height (h-20 = 5rem). The reserved strip shows the
 * section's own dark background, which blends with the vignette below.
 */
const HERO_VIDEO_TOP_OFFSET = 'top-20'

export function Hero() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { ref: sectionRef, isVisible } = useInViewport<HTMLElement>({ threshold: 0.1 })
  const isTouch = useIsTouchDevice()
  const reducedMotion = usePrefersReducedMotion()

  useVideoScrub(videoRef, {
    enabled: isVisible,
    useIdleDrift: isTouch,
    reducedMotion,
  })

  return (
    <section
      id="forside"
      ref={sectionRef}
      className="relative flex h-svh min-h-[640px] w-full items-center justify-center overflow-hidden bg-ink-900"
    >
      <video
        ref={videoRef}
        className={cn(
          // Explicit height (not `bottom-0` + auto) — a replaced element like
          // <video> resolves an auto height from its intrinsic aspect ratio
          // rather than stretching between top/bottom, so bottom-anchoring
          // alone silently collapses it to a short band.
          'pointer-events-none absolute inset-x-0 h-[calc(100%-5rem)] w-full object-cover',
          HERO_VIDEO_TOP_OFFSET,
        )}
        style={{ objectPosition: HERO_VIDEO_OBJECT_POSITION }}
        src="/videos/victor-hero.mp4"
        poster="/images/victor-hero-poster.jpg"
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Vignette for text legibility — kept light so Victor stays the focus. */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-900/80 via-ink-900/5 to-ink-900/30"
        aria-hidden="true"
      />

      <div className="relative flex h-full w-full flex-col items-center justify-between px-6 py-28 text-center sm:py-32">
        <div className="flex flex-1 flex-col items-center justify-center">
          <p className="text-sm font-medium tracking-[0.35em] text-cream-100/80 uppercase">
            Konfirmation
          </p>
          <h1 className="mt-4 font-display text-[clamp(3.5rem,14vw,9rem)] leading-none text-cream-50 text-balance">
            {CONFIRMAND_NAME.toUpperCase()}
          </h1>
          <p className="mt-5 text-lg font-light tracking-wide text-cream-100/90 sm:text-xl">
            1. maj 2027
          </p>
        </div>

        <div className="flex flex-col items-center gap-2 text-cream-100/80">
          <p className="text-sm tracking-[0.2em] uppercase">Du er inviteret</p>
          <ChevronDown
            size={20}
            className="motion-safe:animate-bounce motion-reduce:animate-none"
            aria-hidden="true"
          />
        </div>
      </div>
    </section>
  )
}
