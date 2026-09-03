import { useEffect, useState } from 'react'
import { deleteGuest, fetchAllGuests } from '@/lib/api/guests'
import { fetchReservations, fetchWishlist } from '@/lib/api/wishlist'
import type { Guest } from '@/types'

export function RsvpTab() {
  const [guests, setGuests] = useState<Guest[]>([])
  /** email (lowercased) -> reserved gift titles */
  const [giftsByEmail, setGiftsByEmail] = useState<Record<string, string[]>>({})
  const [isLoading, setIsLoading] = useState(true)

  function load() {
    setIsLoading(true)
    Promise.all([fetchAllGuests(), fetchReservations(), fetchWishlist()])
      .then(([guestRows, reservations, wishlistItems]) => {
        setGuests(guestRows)
        const titleById = new Map(wishlistItems.map((item) => [item.id, item.title]))
        const map: Record<string, string[]> = {}
        for (const reservation of reservations) {
          if (!reservation.guest_email) continue
          const email = reservation.guest_email.toLowerCase()
          const title = titleById.get(reservation.wishlist_item_id)
          if (!title) continue
          map[email] = [...(map[email] ?? []), title]
        }
        setGiftsByEmail(map)
      })
      .finally(() => setIsLoading(false))
  }

  useEffect(load, [])

  async function handleDelete(id: string) {
    if (!confirm('Slet denne tilmelding?')) return
    await deleteGuest(id)
    load()
  }

  const attending = guests.filter((g) => g.attending)
  const declined = guests.filter((g) => !g.attending)
  const withDietary = guests.filter((g) => g.allergies?.trim())
  const totals = {
    responses: guests.length,
    attendingHouseholds: attending.length,
    declined: declined.length,
    adults: attending.reduce((sum, g) => sum + g.adults_count, 0),
    children: attending.reduce((sum, g) => sum + g.children_count, 0),
    withDietary: withDietary.length,
    reservedGifts: Object.values(giftsByEmail).reduce((sum, titles) => sum + titles.length, 0),
  }
  const totalGuests = totals.adults + totals.children

  if (isLoading) return <p className="text-ink-600">Indlæser...</p>

  return (
    <div>
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ['Besvarelser', totals.responses],
          ['Kommer', totals.attendingHouseholds],
          ['Afbud', totals.declined],
          ['Med kostbehov', totals.withDietary],
          ['Voksne', totals.adults],
          ['Børn', totals.children],
          ['Reserverede gaver', totals.reservedGifts],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-ink-900/10 bg-cream-50 p-4">
            <p className="text-xs text-ink-600">{label}</p>
            <p className="mt-1 font-display text-2xl text-ink-900">{value}</p>
          </div>
        ))}
        <div className="col-span-2 rounded-xl border border-green-700/20 bg-green-50 p-4 sm:col-span-1">
          <p className="text-xs text-green-800">Samlet antal gæster</p>
          <p className="mt-1 font-display text-2xl text-green-900">{totalGuests}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-ink-900/10">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="bg-cream-50 text-ink-600">
            <tr>
              {[
                'Navn',
                'Email',
                'Status',
                'V',
                'B',
                'Deltagere',
                'Allergier',
                'Kommentar',
                'Gaver',
                '',
              ].map((heading) => (
                <th key={heading} className="px-4 py-3 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {guests.map((guest) => {
              const gifts = giftsByEmail[guest.email.toLowerCase()] ?? []
              return (
                <tr key={guest.id} className="border-t border-ink-900/[0.06]">
                  <td className="px-4 py-3 font-medium text-ink-900">{guest.name}</td>
                  <td className="px-4 py-3 text-ink-600">{guest.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        guest.attending
                          ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800'
                          : 'rounded-full bg-ink-900/10 px-2 py-0.5 text-xs text-ink-600'
                      }
                    >
                      {guest.attending ? 'Kommer' : 'Kommer ikke'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{guest.adults_count}</td>
                  <td className="px-4 py-3">{guest.children_count}</td>
                  <td className="px-4 py-3 text-ink-600">{guest.attendee_names.join(', ')}</td>
                  <td className="px-4 py-3 text-ink-600">{guest.allergies}</td>
                  <td className="px-4 py-3 text-ink-600">{guest.comment}</td>
                  <td className="px-4 py-3 text-ink-600">
                    {gifts.length > 0 ? gifts.join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(guest.id)}
                      className="text-xs text-red-700 hover:underline"
                    >
                      Slet
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {guests.length === 0 && (
          <p className="p-6 text-center text-ink-600">Ingen tilmeldinger endnu.</p>
        )}
      </div>
    </div>
  )
}
