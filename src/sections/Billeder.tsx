import { Camera } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Container } from '@/components/Container'
import { Lightbox } from '@/components/Lightbox'
import { Reveal } from '@/components/Reveal'
import { SectionHeading } from '@/components/SectionHeading'
import { fetchPublishedPhotos } from '@/lib/api/photos'
import type { Photo } from '@/types'

export function Billeder() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPublishedPhotos()
      .then((data) => {
        if (!cancelled) setPhotos(data)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section id="billeder" className="scroll-mt-24 bg-cream-100 py-24 sm:py-32">
      <Container>
        <SectionHeading eyebrow="Billeder" title="Billeder fra dagen" align="center" />

        {!isLoading && photos.length === 0 && (
          <Reveal className="mx-auto mt-14 flex max-w-md flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700">
              <Camera size={24} />
            </div>
            <p className="text-lg text-ink-600">Billeder fra dagen kommer her efter festen.</p>
          </Reveal>
        )}

        {photos.length > 0 && (
          <div className="mt-12 columns-1 gap-4 sm:columns-2 lg:columns-3 [&>*]:mb-4">
            {photos.map((photo, index) => (
              <button
                key={photo.id}
                onClick={() => setOpenIndex(index)}
                className="block w-full overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
              >
                <img
                  src={photo.url}
                  alt={photo.caption ?? ''}
                  loading="lazy"
                  decoding="async"
                  className="w-full transition-transform duration-500 hover:scale-[1.02]"
                />
              </button>
            ))}
          </div>
        )}
      </Container>

      {openIndex !== null && (
        <Lightbox
          photos={photos}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onNavigate={setOpenIndex}
        />
      )}
    </section>
  )
}
