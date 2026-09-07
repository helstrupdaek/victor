import { Camera } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Container } from '@/components/Container'
import { Lightbox } from '@/components/Lightbox'
import { PolaroidWall } from '@/components/PolaroidWall'
import { QrCode } from '@/components/QrCode'
import { Reveal } from '@/components/Reveal'
import { SectionHeading } from '@/components/SectionHeading'
import { useInViewport } from '@/hooks/useInViewport'
import { fetchGalleryOrder, fetchGuestCameraEnabled } from '@/lib/api/guestCameraSettings'
import { fetchPublishedPhotos } from '@/lib/api/photos'
import type { Photo } from '@/types'

/** How often the wall re-fetches while the camera is on and the wall is on screen. */
const REFRESH_MS = 15_000

export function Billeder() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [cameraOn, setCameraOn] = useState(false)
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const { ref, isVisible } = useInViewport<HTMLElement>({ rootMargin: '200px' })

  const load = useCallback(async () => {
    const [enabled, order] = await Promise.all([fetchGuestCameraEnabled(), fetchGalleryOrder()])
    setCameraOn(enabled)
    setPhotos(await fetchPublishedPhotos(order))
  }, [])

  useEffect(() => {
    let cancelled = false
    load().catch(() => {}).finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [load])

  // Live only while it matters: camera on, the wall on screen, no photo open
  // in the lightbox, and the tab actually visible. A page left in a
  // background tab, scrolled past, or with a photo open does not poll; a
  // visibilitychange listener starts and stops the interval as the tab is
  // switched away from and back to, rather than only checking once.
  useEffect(() => {
    if (!cameraOn || !isVisible || openIndex !== null) return undefined
    let timer: ReturnType<typeof setInterval> | undefined
    const start = () => {
      if (timer === undefined) timer = setInterval(() => { load().catch(() => {}) }, REFRESH_MS)
    }
    const stop = () => {
      if (timer !== undefined) { clearInterval(timer); timer = undefined }
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') start()
      else stop()
    }
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [cameraOn, isVisible, openIndex, load])

  const kameraUrl = typeof window === 'undefined' ? '/kamera' : `${window.location.origin}/kamera`

  return (
    <section id="billeder" ref={ref} className="scroll-mt-24 bg-cream-100 py-24 sm:py-32">
      <Container>
        <SectionHeading eyebrow="Billeder" title="Billeder fra dagen" align="center" />

        {cameraOn && (
          <Reveal className="mx-auto mt-10 flex max-w-md flex-col items-center gap-4 text-center">
            <QrCode value={kameraUrl} size={160} className="rounded-lg bg-white p-2 shadow-card" />
            <p className="text-ink-600">Scan koden, tag et billede, og se det dukke op her.</p>
            <Link
              to="/kamera"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink-900 px-6 text-sm font-medium text-cream-50 shadow-card hover:bg-green-900"
            >
              <Camera size={18} aria-hidden />
              Tag et billede
            </Link>
          </Reveal>
        )}

        {!isLoading && photos.length === 0 && (
          <Reveal className="mx-auto mt-14 flex max-w-md flex-col items-center gap-4 text-center">
            {!cameraOn && (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700">
                <Camera size={24} />
              </div>
            )}
            <p className="text-lg text-ink-600">
              {cameraOn
                ? 'Vær den første. Tag et billede, så hænger det her om et øjeblik.'
                : 'Billederne fra dagen kommer her efter festen. Vi glæder os til at dele dem med jer!'}
            </p>
          </Reveal>
        )}

        {photos.length > 0 && (
          <div className="mt-14">
            <PolaroidWall photos={photos} onOpen={setOpenIndex} />
          </div>
        )}
      </Container>

      {openIndex !== null && (
        <Lightbox photos={photos} index={openIndex} onClose={() => setOpenIndex(null)} onNavigate={setOpenIndex} />
      )}
    </section>
  )
}
