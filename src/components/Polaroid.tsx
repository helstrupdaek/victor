import { tiltFor } from '@/lib/polaroidTilt'
import { cn } from '@/lib/utils'

/**
 * One print: white frame, the photo, a deeper band at the bottom for the
 * handwriting. The tilt is a property of the photo (see polaroidTilt.ts) so
 * the wall never jitters. Uses the stored width/height for the image box so
 * the wall does not reflow as photos load.
 */
export function Polaroid({
  id,
  url,
  caption,
  guestName,
  width,
  height,
  tilted = true,
  className,
}: {
  id: string
  url: string
  caption: string | null
  guestName: string | null
  width: number | null
  height: number | null
  /** Off for the admin thumbnails, where straight rows are easier to scan. */
  tilted?: boolean
  className?: string
}) {
  const t = tilted ? tiltFor(id) : { rotate: 0, dx: 0, dy: 0 }
  const ratio = width && height ? `${width} / ${height}` : '1 / 1'
  return (
    <figure
      className={cn('bg-white p-3 pb-4 shadow-[0_6px_20px_rgba(20,20,20,0.18)]', className)}
      style={{ transform: `translate(${t.dx}px, ${t.dy}px) rotate(${t.rotate}deg)` }}
    >
      <div className="overflow-hidden bg-cream-100" style={{ aspectRatio: ratio }}>
        <img
          src={url}
          alt={caption ?? ''}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>
      <figcaption className="font-hand mt-3 line-clamp-2 min-h-7 text-center text-xl leading-7 text-ink-900">
        {caption}
        {guestName && (
          <span className={cn('text-ink-500', caption && 'ml-2')}>
            {caption ? `— ${guestName}` : guestName}
          </span>
        )}
      </figcaption>
    </figure>
  )
}
