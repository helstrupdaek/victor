import { DEMO_WISHLIST } from '@/data/wishlist'
import { readDemo, writeDemo } from '@/lib/demoStore'
import { isSupabaseConfigured, supabase } from '@/lib/supabaseClient'
import type { GiftReservation, WishlistItem } from '@/types'

const ITEMS_KEY = 'wishlist_items'
const RESERVATIONS_KEY = 'gift_reservations'

export class GiftAlreadyReservedError extends Error {
  constructor() {
    super('Denne gave er desværre allerede reserveret af en anden gæst.')
    this.name = 'GiftAlreadyReservedError'
  }
}

export async function fetchWishlist(): Promise<WishlistItem[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('wishlist_items')
      .select('*')
      .order('sort_order', { ascending: true })
    if (error) throw error
    return data
  }

  return readDemo<WishlistItem[]>(ITEMS_KEY, DEMO_WISHLIST)
}

export async function reserveGift(
  wishlistItemId: string,
  reservedByName: string,
  guestEmail?: string,
): Promise<{ reservationToken: string }> {
  const name = reservedByName.trim()
  const email = guestEmail?.trim().toLowerCase() || null

  if (isSupabaseConfigured && supabase) {
    const reservationToken = crypto.randomUUID()
    const { error } = await supabase.from('gift_reservations').insert({
      wishlist_item_id: wishlistItemId,
      reserved_by_name: name,
      guest_email: email,
      reservation_token: reservationToken,
    })
    if (error) {
      if (error.code === '23505') throw new GiftAlreadyReservedError()
      throw error
    }
    return { reservationToken }
  }

  const items = readDemo<WishlistItem[]>(ITEMS_KEY, DEMO_WISHLIST)
  const item = items.find((i) => i.id === wishlistItemId)
  if (!item) throw new Error('Gaven blev ikke fundet.')
  if (item.is_reserved) throw new GiftAlreadyReservedError()

  const reservationToken = crypto.randomUUID()
  const reservations = readDemo<GiftReservation[]>(RESERVATIONS_KEY, [])
  reservations.push({
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    wishlist_item_id: wishlistItemId,
    reserved_by_name: name,
    guest_email: email,
    reservation_token: reservationToken,
  })
  writeDemo(RESERVATIONS_KEY, reservations)
  writeDemo(
    ITEMS_KEY,
    items.map((i) => (i.id === wishlistItemId ? { ...i, is_reserved: true } : i)),
  )

  return { reservationToken }
}

export async function releaseGift(
  wishlistItemId: string,
  reservationToken: string,
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase
      .from('gift_reservations')
      .delete()
      .eq('wishlist_item_id', wishlistItemId)
      .eq('reservation_token', reservationToken)
    if (error) throw error
    return
  }

  const reservations = readDemo<GiftReservation[]>(RESERVATIONS_KEY, [])
  const match = reservations.find(
    (r) => r.wishlist_item_id === wishlistItemId && r.reservation_token === reservationToken,
  )
  if (!match) throw new Error('Reservationen kunne ikke findes med denne kode.')

  writeDemo(
    RESERVATIONS_KEY,
    reservations.filter((r) => r.id !== match.id),
  )
  const items = readDemo<WishlistItem[]>(ITEMS_KEY, DEMO_WISHLIST)
  writeDemo(
    ITEMS_KEY,
    items.map((i) => (i.id === wishlistItemId ? { ...i, is_reserved: false } : i)),
  )
}

export type WishlistItemInput = Omit<WishlistItem, 'id' | 'created_at' | 'is_reserved'>

export async function createWishlistItem(input: WishlistItemInput): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('wishlist_items').insert(input)
    if (error) throw error
    return
  }

  const items = readDemo<WishlistItem[]>(ITEMS_KEY, DEMO_WISHLIST)
  items.push({
    ...input,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    is_reserved: false,
  })
  writeDemo(ITEMS_KEY, items)
}

export async function updateWishlistItem(
  id: string,
  input: Partial<WishlistItemInput>,
): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('wishlist_items').update(input).eq('id', id)
    if (error) throw error
    return
  }

  const items = readDemo<WishlistItem[]>(ITEMS_KEY, DEMO_WISHLIST)
  writeDemo(
    ITEMS_KEY,
    items.map((i) => (i.id === id ? { ...i, ...input } : i)),
  )
}

export async function deleteWishlistItem(id: string): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.from('wishlist_items').delete().eq('id', id)
    if (error) throw error
    return
  }

  const items = readDemo<WishlistItem[]>(ITEMS_KEY, DEMO_WISHLIST)
  writeDemo(
    ITEMS_KEY,
    items.filter((i) => i.id !== id),
  )
}

/**
 * Lets a guest see their own reserved gift titles (for the RSVP
 * confirmation and email) without exposing who-reserved-what publicly —
 * via a security-definer RPC in Supabase that only ever returns titles
 * for the exact email passed in.
 */
export async function fetchReservedTitlesByEmail(email: string): Promise<string[]> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return []

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc('get_wishlist_titles_by_email', {
      p_email: normalized,
    })
    if (error) throw error
    return (data as Array<{ title: string }>).map((row) => row.title)
  }

  const reservations = readDemo<GiftReservation[]>(RESERVATIONS_KEY, [])
  const items = readDemo<WishlistItem[]>(ITEMS_KEY, DEMO_WISHLIST)
  const itemIds = new Set(
    reservations
      .filter((r) => r.guest_email?.toLowerCase() === normalized)
      .map((r) => r.wishlist_item_id),
  )
  return items.filter((i) => itemIds.has(i.id)).map((i) => i.title)
}

/** Admin-only: who reserved what, requires an authenticated session (RLS). */
export async function fetchReservations(): Promise<GiftReservation[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.from('gift_reservations').select('*')
    if (error) throw error
    return data
  }

  return readDemo<GiftReservation[]>(RESERVATIONS_KEY, [])
}
