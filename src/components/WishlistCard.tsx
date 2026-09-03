import { Gift, SquareArrowOutUpRight } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Input } from '@/components/FormControls'
import {
  forgetMyReservation,
  getMyReservationEmail,
  getMyReservationToken,
  saveMyReservation,
} from '@/lib/myReservations'
import { sendConfirmationEmail } from '@/lib/api/notify'
import { GiftAlreadyReservedError, releaseGift, reserveGift } from '@/lib/api/wishlist'
import { cn } from '@/lib/utils'
import type { WishlistItem } from '@/types'

export function WishlistCard({
  item,
  isReservedByMe,
  onReserved,
  onRelease,
  layout = 'grid',
}: {
  item: WishlistItem
  isReservedByMe: boolean
  onReserved: (itemId: string) => void
  onRelease: (itemId: string) => void
  layout?: 'grid' | 'list'
}) {
  const [isReserving, setIsReserving] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isReleasing, setIsReleasing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isTakenByOther = item.is_reserved && !isReservedByMe

  async function handleConfirmReserve() {
    if (!name.trim()) {
      setError('Skriv jeres navn, så vi ved hvem der reserverede gaven.')
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const { reservationToken } = await reserveGift(item.id, name, email)
      const normalizedEmail = email.trim().toLowerCase() || null
      saveMyReservation(item.id, reservationToken, normalizedEmail)
      onReserved(item.id)
      setIsReserving(false)
      // Best-effort: if this email already has an RSVP, refresh their
      // confirmation email so it lists the new gift. No-ops silently
      // (server-side) if the email doesn't match an RSVP yet.
      if (normalizedEmail) void sendConfirmationEmail(normalizedEmail)
    } catch (err) {
      if (err instanceof GiftAlreadyReservedError) {
        onReserved(item.id)
      }
      setError(err instanceof Error ? err.message : 'Der skete en fejl. Prøv igen.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRelease() {
    const token = getMyReservationToken(item.id)
    if (!token) return
    const reservedEmail = getMyReservationEmail(item.id)
    setIsReleasing(true)
    try {
      await releaseGift(item.id, token)
      forgetMyReservation(item.id)
      onRelease(item.id)
      if (reservedEmail) void sendConfirmationEmail(reservedEmail)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke fortryde reservationen.')
    } finally {
      setIsReleasing(false)
    }
  }

  const media = (
    <div
      className={cn(
        'relative overflow-hidden bg-green-100',
        layout === 'grid' ? 'aspect-[4/3] w-full' : 'h-16 w-16 flex-shrink-0 rounded-lg sm:h-20 sm:w-20',
      )}
    >
      {item.image_url ? (
        <img
          src={item.image_url}
          alt=""
          loading="lazy"
          decoding="async"
          className={cn(
            'h-full w-full object-cover',
            layout === 'grid' && 'transition-transform duration-500 group-hover:scale-[1.03]',
          )}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-green-100 to-green-50">
          <Gift className="text-green-500" size={layout === 'grid' ? 40 : 22} strokeWidth={1.5} />
        </div>
      )}
      {layout === 'grid' && item.category && (
        <span className="absolute top-3 left-3 rounded-full bg-cream-50/90 px-3 py-1 text-xs font-medium text-ink-800">
          {item.category}
        </span>
      )}
    </div>
  )

  const reserveForm = isReserving && (
    <div className={cn('space-y-2', layout === 'list' && 'w-full basis-full pt-3')}>
      <Input
        autoFocus
        placeholder="Jeres navn"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && handleConfirmReserve()}
      />
      <Input
        type="email"
        placeholder="Email (valgfrit)"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && handleConfirmReserve()}
      />
      <p className="text-xs text-ink-400">
        Brug samme email som i jeres tilmelding, så gaven vises der.
      </p>
      <div className="flex gap-2">
        <Button
          variant="primary"
          className="!px-4 !py-2 text-sm"
          disabled={isSubmitting}
          onClick={handleConfirmReserve}
        >
          {isSubmitting ? 'Reserverer...' : 'Bekræft'}
        </Button>
        <Button
          variant="ghost"
          className="!px-4 !py-2 text-sm"
          onClick={() => {
            setIsReserving(false)
            setError(null)
          }}
        >
          Annuller
        </Button>
      </div>
    </div>
  )

  const reserveControl = isReservedByMe ? (
    <div className={cn('space-y-2', layout === 'list' && 'text-right')}>
      {layout === 'grid' && (
        <p className="text-sm font-medium text-green-700">I har reserveret denne gave</p>
      )}
      <button
        onClick={handleRelease}
        disabled={isReleasing}
        className="text-sm whitespace-nowrap text-ink-600 underline underline-offset-4 disabled:opacity-50"
      >
        {isReleasing ? 'Fortryder...' : 'Fortryd reservation'}
      </button>
    </div>
  ) : isTakenByOther ? (
    <span className="inline-block rounded-full bg-ink-900/[0.06] px-4 py-2 text-sm font-medium whitespace-nowrap text-ink-400">
      Reserveret
    </span>
  ) : !isReserving ? (
    <Button
      variant="outline"
      className={cn('text-sm', layout === 'grid' ? 'w-full' : '!px-4 !py-2 whitespace-nowrap')}
      onClick={() => setIsReserving(true)}
    >
      Reserver gave
    </Button>
  ) : null

  if (layout === 'list') {
    return (
      <Card className="flex flex-wrap items-center gap-4 !p-4">
        {media}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base text-ink-900">{item.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {item.price != null && (
              <span className="font-medium text-ink-800">{item.price} kr.</span>
            )}
            {item.external_url && (
              <a
                href={item.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-green-700 hover:underline"
              >
                Se gaveidé <SquareArrowOutUpRight size={12} />
              </a>
            )}
          </div>
        </div>
        <div className="flex-shrink-0">{reserveControl}</div>
        {reserveForm}
        {error && <p className="w-full basis-full text-sm text-red-700">{error}</p>}
      </Card>
    )
  }

  return (
    <Card className="group flex flex-col overflow-hidden !p-0 hover:-translate-y-1 hover:shadow-soft">
      {media}

      <div className="flex flex-1 flex-col p-6">
        <h3 className="font-display text-lg text-ink-900">{item.title}</h3>
        {item.description && (
          <p className="mt-1.5 flex-1 text-sm text-ink-600">{item.description}</p>
        )}

        <div className="mt-4 flex items-center justify-between text-sm">
          {item.price != null && (
            <span className="font-medium text-ink-800">{item.price} kr.</span>
          )}
          {item.external_url && (
            <a
              href={item.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-green-700 hover:underline"
            >
              Se gaveidé <SquareArrowOutUpRight size={14} />
            </a>
          )}
        </div>

        <div className="mt-5">
          {reserveControl}
          {reserveForm}
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        </div>
      </div>
    </Card>
  )
}
