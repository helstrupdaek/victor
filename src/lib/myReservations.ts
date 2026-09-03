/**
 * Client-side ledger of "which gifts did *this browser* reserve", so a
 * returning guest automatically sees their own reservation (and a way to
 * release it) without having to copy down a code. This is the "private
 * reservation token" mechanism from the spec: the token itself is what
 * authorizes the release (see releaseGift in lib/api/wishlist.ts) — this
 * file just remembers it locally so the guest doesn't have to. The email
 * (if they gave one) is kept alongside so releasing a gift can trigger an
 * updated confirmation email for the right address.
 */

interface StoredReservation {
  token: string
  email: string | null
}

const KEY = 'victor-konfirmation:my-reservations'

function readMap(): Record<string, StoredReservation> {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Record<string, StoredReservation>) : {}
  } catch {
    return {}
  }
}

function writeMap(map: Record<string, StoredReservation>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // Ignore — worst case the guest just won't see the "release" option later.
  }
}

export function getMyReservationToken(wishlistItemId: string): string | null {
  return readMap()[wishlistItemId]?.token ?? null
}

export function getMyReservationEmail(wishlistItemId: string): string | null {
  return readMap()[wishlistItemId]?.email ?? null
}

export function saveMyReservation(
  wishlistItemId: string,
  token: string,
  email: string | null,
): void {
  const map = readMap()
  map[wishlistItemId] = { token, email }
  writeMap(map)
}

export function forgetMyReservation(wishlistItemId: string): void {
  const map = readMap()
  delete map[wishlistItemId]
  writeMap(map)
}
