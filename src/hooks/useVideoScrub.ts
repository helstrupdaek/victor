import { type RefObject, useEffect, useRef } from 'react'
import { clamp } from '@/lib/utils'

/**
 * How strongly horizontal mouse movement drives the scrub. `deltaX` (in
 * pixels, as a fraction of window width) is multiplied by this and by the
 * video's duration to get a time offset — tune this to make the scrub feel
 * faster/slower per pixel of mouse movement.
 */
const SENSITIVITY = 1.2

/** Slow, gentle autoplay-of-frames used on touch devices that never emit mousemove. */
const IDLE_DRIFT_SECONDS_PER_CYCLE = 14

interface UseVideoScrubOptions {
  /** Only track input / run idle drift while the hero is visible and enabled. */
  enabled: boolean
  /** Touch devices get a subtle automatic drift instead of pointer tracking. */
  useIdleDrift: boolean
  /** Skip all animation and just show a static middle frame. */
  reducedMotion: boolean
  onFirstInteraction?: () => void
}

/**
 * Drives `video.currentTime` directly from horizontal mouse movement — no
 * easing, no lerp, no rAF-chased target. Each `mousemove` computes
 * `deltaX` against the previous event, converts it to a time offset, and
 * seeks immediately, so the frame tracks the pointer with no perceptible
 * lag. On touch devices (no mousemove) a slow sine-wave drift takes over
 * instead. The video element itself always stays paused — all motion
 * comes from seeking.
 */
export function useVideoScrub(
  videoRef: RefObject<HTMLVideoElement | null>,
  options: UseVideoScrubOptions,
) {
  const { enabled, useIdleDrift, reducedMotion } = options

  const targetTimeRef = useRef(0)
  const durationRef = useRef(0)
  const metadataReadyRef = useRef(false)
  const previousXRef = useRef<number | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const startTimestampRef = useRef<number | null>(null)
  const onFirstInteractionRef = useRef(options.onFirstInteraction)
  onFirstInteractionRef.current = options.onFirstInteraction

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    function setMiddleFrame() {
      if (!video || durationRef.current <= 0) return
      const middle = durationRef.current / 2
      targetTimeRef.current = middle
      video.currentTime = middle
    }

    function handleLoadedMetadata() {
      if (!video || !Number.isFinite(video.duration)) return
      durationRef.current = video.duration
      metadataReadyRef.current = true
      setMiddleFrame()
    }

    if (video.readyState >= 1 && Number.isFinite(video.duration)) {
      handleLoadedMetadata()
    } else {
      video.addEventListener('loadedmetadata', handleLoadedMetadata)
    }

    return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata)
  }, [videoRef])

  useEffect(() => {
    if (!enabled || reducedMotion || useIdleDrift) return
    const video = videoRef.current
    if (!video) return

    function handleMouseMove(event: MouseEvent) {
      if (!video || !metadataReadyRef.current) return

      // First movement just calibrates the baseline — there's no prior
      // point yet to compute a meaningful delta from.
      if (previousXRef.current === null) {
        previousXRef.current = event.clientX
        return
      }

      const deltaX = event.clientX - previousXRef.current
      previousXRef.current = event.clientX

      const timeOffset = (deltaX / window.innerWidth) * SENSITIVITY * durationRef.current
      const nextTime = clamp(targetTimeRef.current + timeOffset, 0, durationRef.current)
      targetTimeRef.current = nextTime
      video.currentTime = nextTime

      onFirstInteractionRef.current?.()
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      previousXRef.current = null
    }
  }, [videoRef, enabled, reducedMotion, useIdleDrift])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !enabled || reducedMotion || !useIdleDrift) return

    function tick(timestamp: number) {
      rafIdRef.current = null
      if (!video || document.hidden) return // visibilitychange listener resumes this

      if (metadataReadyRef.current && durationRef.current > 0) {
        if (startTimestampRef.current === null) startTimestampRef.current = timestamp
        const elapsedSeconds = (timestamp - startTimestampRef.current) / 1000
        const phase =
          (elapsedSeconds % IDLE_DRIFT_SECONDS_PER_CYCLE) / IDLE_DRIFT_SECONDS_PER_CYCLE
        // phase 0 → sin(0) = 0 → wave 0.5, so drift starts from the middle frame too.
        const wave = (Math.sin(phase * Math.PI * 2) + 1) / 2
        const nextTime = wave * durationRef.current
        targetTimeRef.current = nextTime
        video.currentTime = nextTime
      }

      rafIdRef.current = requestAnimationFrame(tick)
    }

    function handleVisibilityChange() {
      if (!document.hidden && rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(tick)
      }
    }

    rafIdRef.current = requestAnimationFrame(tick)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
  }, [videoRef, enabled, reducedMotion, useIdleDrift])

  useEffect(() => {
    if (!reducedMotion) return
    const video = videoRef.current
    if (!video) return

    function showMiddleFrame() {
      if (!video || !Number.isFinite(video.duration)) return
      video.currentTime = video.duration / 2
    }

    if (video.readyState >= 1) showMiddleFrame()
    else video.addEventListener('loadedmetadata', showMiddleFrame)
    return () => video.removeEventListener('loadedmetadata', showMiddleFrame)
  }, [videoRef, reducedMotion])
}
