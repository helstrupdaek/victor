import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Guest } from '@/types'
import { getEventInfo } from './_lib/eventInfo'
import { getQueryParam, sendJson } from './_lib/http'
import { buildConfirmationIcs, ICS_FILENAME } from './_lib/ics'
import { getSupabaseAdmin } from './_lib/supabaseAdmin'

/**
 * GET /api/calendar-invite?email=... — regenerates the same .ics on demand
 * (rather than storing the file anywhere) so the "Tilføj til kalender"
 * button in the confirmation email always reflects the current event info
 * and gift reservations.
 */
export default async function handler(
  req: IncomingMessage & { query?: Record<string, string | string[]> },
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  try {
    const email = getQueryParam(req, 'email')?.trim().toLowerCase()
    if (!email) {
      sendJson(res, 400, { ok: false, error: 'Email er påkrævet.' })
      return
    }

    const supabase = getSupabaseAdmin()
    const { data: guest, error: guestError } = await supabase
      .from('guests')
      .select('*')
      .eq('email', email)
      .maybeSingle<Guest>()
    if (guestError) throw guestError
    if (!guest) {
      sendJson(res, 404, { ok: false, error: 'Ingen tilmelding fundet for denne email.' })
      return
    }

    const { data: reservations, error: reservationsError } = await supabase
      .from('gift_reservations')
      .select('wishlist_items(title)')
      .eq('guest_email', email)
    if (reservationsError) throw reservationsError

    const reservedGiftTitles = (
      (reservations ?? []) as unknown as Array<{ wishlist_items: { title: string } | null }>
    )
      .map((row) => row.wishlist_items?.title)
      .filter((title): title is string => Boolean(title))

    const event = await getEventInfo()
    const ics = buildConfirmationIcs({
      event,
      attendeeCount: guest.adults_count + guest.children_count,
      reservedGiftTitles,
      uid: `${guest.id}@victors-konfirmation-2027`,
    })

    res.statusCode = 200
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${ICS_FILENAME}"`)
    res.end(ics)
  } catch (error) {
    console.error('calendar-invite failed', error)
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : 'Ukendt fejl.',
    })
  }
}
