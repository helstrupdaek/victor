import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Guest } from '@/types'
import { getEventInfo } from './_lib/eventInfo.js'
import { readJsonBody, sendJson } from './_lib/http.js'
import { buildConfirmationIcs, ICS_FILENAME } from './_lib/ics.js'
import { buildConfirmationEmail } from './_lib/emailTemplate.js'
import { sendEmail } from './_lib/resend.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'

function getBaseUrl(req: IncomingMessage): string {
  const host = req.headers.host ?? 'localhost:5173'
  const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
  return `${protocol}://${host}`
}

/**
 * POST { email } — looks up that email's RSVP + reserved gifts (server-side,
 * via the service-role client, so this works regardless of the public RLS
 * policies), builds the confirmation email + .ics, and sends it via Resend.
 *
 * Used both right after an RSVP submission and after a later gift
 * reservation/release change (see src/lib/api/notify.ts) — if the email
 * doesn't match an existing RSVP yet, this is a silent no-op (`reason:
 * "no-guest"`) rather than an error, so reserving a gift before RSVPing
 * never sends a broken email.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  try {
    const { email } = await readJsonBody<{ email?: string }>(req)
    const normalizedEmail = email?.trim().toLowerCase()
    if (!normalizedEmail) {
      sendJson(res, 400, { ok: false, error: 'Email er påkrævet.' })
      return
    }

    const supabase = getSupabaseAdmin()

    const { data: guest, error: guestError } = await supabase
      .from('guests')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle<Guest>()
    if (guestError) throw guestError

    if (!guest) {
      sendJson(res, 200, { ok: false, reason: 'no-guest' })
      return
    }

    const { data: reservations, error: reservationsError } = await supabase
      .from('gift_reservations')
      .select('wishlist_items(title)')
      .eq('guest_email', normalizedEmail)
    if (reservationsError) throw reservationsError

    const reservedGiftTitles = (
      (reservations ?? []) as unknown as Array<{ wishlist_items: { title: string } | null }>
    )
      .map((row) => row.wishlist_items?.title)
      .filter((title): title is string => Boolean(title))

    const event = await getEventInfo()
    const calendarUrl = `${getBaseUrl(req)}/api/calendar-invite?email=${encodeURIComponent(normalizedEmail)}`

    const { subject, html, text } = buildConfirmationEmail({
      guest,
      event,
      reservedGiftTitles,
      calendarUrl,
    })

    const attachments = guest.attending
      ? [
          {
            filename: ICS_FILENAME,
            content: Buffer.from(
              buildConfirmationIcs({
                event,
                attendeeCount: guest.adults_count + guest.children_count,
                reservedGiftTitles,
                uid: `${guest.id}@victors-konfirmation-2027`,
              }),
              'utf-8',
            ).toString('base64'),
          },
        ]
      : undefined

    await sendEmail({ to: guest.email, subject, html, text, attachments })

    sendJson(res, 200, { ok: true })
  } catch (error) {
    console.error('send-confirmation failed', error)
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : 'Ukendt fejl.',
    })
  }
}
