import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect } from 'react'
import type { Photo } from '@/types'

export function Lightbox({
  photos,
  index,
  onClose,
  onNavigate,
}: {
  photos: Photo[]
  index: number
  onClose: () => void
  onNavigate: (nextIndex: number) => void
}) {
  const photo = photos[index]

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') onNavigate((index + 1) % photos.length)
      if (event.key === 'ArrowLeft') onNavigate((index - 1 + photos.length) % photos.length)
    }
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [index, photos.length, onClose, onNavigate])

  if (!photo) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={photo.caption ?? 'Billede fra konfirmationen'}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/95 p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Luk"
        className="absolute top-5 right-5 rounded-full p-2 text-cream-50/80 hover:text-cream-50"
      >
        <X size={28} />
      </button>

      {photos.length > 1 && (
        <>
          <button
            onClick={(event) => {
              event.stopPropagation()
              onNavigate((index - 1 + photos.length) % photos.length)
            }}
            aria-label="Forrige billede"
            className="absolute left-2 rounded-full p-2 text-cream-50/80 hover:text-cream-50 sm:left-6"
          >
            <ChevronLeft size={32} />
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation()
              onNavigate((index + 1) % photos.length)
            }}
            aria-label="Næste billede"
            className="absolute right-2 rounded-full p-2 text-cream-50/80 hover:text-cream-50 sm:right-6"
          >
            <ChevronRight size={32} />
          </button>
        </>
      )}

      <img
        src={photo.url}
        alt={photo.caption ?? ''}
        className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-soft"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  )
}
