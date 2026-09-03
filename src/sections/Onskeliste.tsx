import { useEffect, useState } from 'react'
import { Container } from '@/components/Container'
import { Reveal } from '@/components/Reveal'
import { SectionHeading } from '@/components/SectionHeading'
import { WishlistCard } from '@/components/WishlistCard'
import { fetchWishlist } from '@/lib/api/wishlist'
import { getMyReservationToken } from '@/lib/myReservations'
import type { WishlistItem } from '@/types'

export function Onskeliste() {
  const [items, setItems] = useState<WishlistItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

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
        <SectionHeading
          eyebrow="Ønskeliste"
          title="Victors ønskeliste"
          description="I skal naturligvis ikke tage en gave med — men er I i tvivl, er her nogle idéer. Reservér en gave, så andre ved, den er taget."
        />

        {!isLoading && items.length === 0 && (
          <p className="mt-12 text-ink-600">Ønskelisten er tom lige nu — kig forbi igen senere.</p>
        )}

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <Reveal key={item.id} delayMs={Math.min(index * 60, 240)}>
              <WishlistCard
                item={item}
                isReservedByMe={Boolean(getMyReservationToken(item.id))}
                onReserved={markReserved}
                onRelease={markReleased}
              />
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  )
}
