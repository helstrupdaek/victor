import { LayoutGrid, List } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Container } from '@/components/Container'
import { Reveal } from '@/components/Reveal'
import { SectionHeading } from '@/components/SectionHeading'
import { WishlistCard } from '@/components/WishlistCard'
import { fetchWishlist } from '@/lib/api/wishlist'
import { getMyReservationToken } from '@/lib/myReservations'
import { cn } from '@/lib/utils'
import type { WishlistItem } from '@/types'

const LAYOUT_STORAGE_KEY = 'wishlist_layout'
type WishlistLayout = 'grid' | 'list'

function readStoredLayout(): WishlistLayout {
  return localStorage.getItem(LAYOUT_STORAGE_KEY) === 'list' ? 'list' : 'grid'
}

export function Onskeliste() {
  const [items, setItems] = useState<WishlistItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [layout, setLayout] = useState<WishlistLayout>(readStoredLayout)

  useEffect(() => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, layout)
  }, [layout])

  useEffect(() => {
    let cancelled = false
    fetchWishlist()
      .then((data) => {
        if (!cancelled) setItems(data)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function markReserved(itemId: string) {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, is_reserved: true } : item)),
    )
  }

  function markReleased(itemId: string) {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, is_reserved: false } : item)),
    )
  }

  return (
    <section id="oenskeliste" className="scroll-mt-24 bg-cream-100 py-24 sm:py-32">
      <Container>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            eyebrow="Ønskeliste"
            title="Victors ønskeliste"
            description="I skal naturligvis ikke tage en gave med — men er I i tvivl, er her nogle idéer. Reservér en gave, så andre ved, den er taget."
          />
          <div className="mb-1 flex flex-shrink-0 gap-1 rounded-full border border-ink-900/10 bg-cream-50 p-1">
            <button
              aria-label="Vis som gitter"
              onClick={() => setLayout('grid')}
              className={cn(
                'rounded-full p-2 transition-colors',
                layout === 'grid' ? 'bg-ink-900 text-cream-50' : 'text-ink-600 hover:text-ink-900',
              )}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              aria-label="Vis som liste"
              onClick={() => setLayout('list')}
              className={cn(
                'rounded-full p-2 transition-colors',
                layout === 'list' ? 'bg-ink-900 text-cream-50' : 'text-ink-600 hover:text-ink-900',
              )}
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {!isLoading && items.length === 0 && (
          <p className="mt-12 text-ink-600">Ønskelisten er tom lige nu — kig forbi igen senere.</p>
        )}

        <div
          className={cn(
            'mt-12',
            layout === 'grid'
              ? 'grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3'
              : 'flex flex-col gap-3',
          )}
        >
          {items.map((item, index) => (
            <Reveal key={item.id} delayMs={Math.min(index * 60, 240)}>
              <WishlistCard
                item={item}
                isReservedByMe={Boolean(getMyReservationToken(item.id))}
                onReserved={markReserved}
                onRelease={markReleased}
                layout={layout}
              />
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  )
}
