import { useEffect, useRef, useState } from 'react'
import { Polaroid } from '@/components/Polaroid'
import { cn } from '@/lib/utils'
import type { Photo } from '@/types'

/**
 * The polaroids, in a loose grid rather than the fully overlapping pile of
 * the reference image: a pile hides half the photos and breaks tap targets
 * once there are forty of them. The per-photo tilt and offset do the
 * "scattered" work while every print stays visible and tappable.
 *
 * Photos that were not in the previous render fade in, which is what makes
 * the wall visibly grow on a screen at the party.
 */
export function PolaroidWall({ photos, onOpen }: { photos: Photo[]; onOpen: (index: number) => void }) {
  const seen = useRef<Set<string>>(new Set())
  const [fresh, setFresh] = useState<Set<string>>(new Set())

  useEffect(() => {
    const incoming = new Set(photos.filter((p) => !seen.current.has(p.id)).map((p) => p.id))
    if (seen.current.size > 0 && incoming.size > 0) {
      setFresh(incoming)
      const t = setTimeout(() => setFresh(new Set()), 1200)
      return () => clearTimeout(t)
    }
    return undefined
  }, [photos])
  useEffect(() => {
    for (const p of photos) seen.current.add(p.id)
  }, [photos])

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo, index) => (
        <button
          key={photo.id}
          onClick={() => onOpen(index)}
          className={cn(
            'block text-left transition-opacity duration-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600',
            fresh.has(photo.id) ? 'animate-[fadeIn_700ms_ease-out]' : '',
          )}
          aria-label={photo.caption ?? 'Billede fra konfirmationen'}
        >
          <Polaroid
            id={photo.id}
            url={photo.url}
            caption={photo.caption}
            guestName={photo.guest_name}
            width={photo.width}
            height={photo.height}
          />
        </button>
      ))}
    </div>
  )
}
