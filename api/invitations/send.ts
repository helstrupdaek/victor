import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Invitation } from '@/types'
import { buildInvitationEmail } from '../_lib/emailTemplate.js'
import { getBaseUrl, readJsonBody, sendJson } from '../_lib/http.js'
import { normalizePhone, renderMessage } from '../_lib/invitation.js'
import { getEventInfo } from '../_lib/eventInfo.js'
import { sendEmail } from '../_lib/resend.js'
import { sendSms } from '../_lib/sms.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'

type Channel = 'email' | 'sms'
type Outcome = 'sent' | 'skipped' | string

const MESSAGE_MAX = 1000

/**
 * POST { id, channels, message, resend? } with the admin's Supabase access
 * token as Bearer. Sends ONE guest's invitation; the admin tab loops over the
 * selection, so a bulk send shows progress and never hits a function timeout.
 * A channel already sent is skipped unless `resend` is true, so pressing the
 * bulk button twice never double-sends.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Metoden er ikke tilladt.' })

    const supabase = getSupabaseAdmin()
    const jwt = req.headers.authorization?.replace(/^Bearer /, '')
    const { data: auth } = jwt ? await supabase.auth.getUser(jwt) : { data: { user: null } }
    if (!auth.user) return sendJson(res, 401, { ok: false, error: 'Log ind som admin.' })

    const body = await readJsonBody<{ id?: string; channels?: Channel[]; message?: string; resend?: boolean }>(req)
    const channels = (body.channels ?? []).filter((c) => c === 'email' || c === 'sms')
    const message = body.message?.trim() ?? ''
    if (!body.id || channels.length === 0 || !message || message.length > MESSAGE_MAX) {
      return sendJson(res, 400, { ok: false, error: 'Mangler gæst, kanal eller besked.' })
    }

    const { data: inv, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('id', body.id)
      .maybeSingle<Invitation>()
    if (error) throw error
    if (!inv) return sendJson(res, 404, { ok: false, error: 'Gæsten findes ikke.' })

    const link = `${getBaseUrl(req)}/i/${inv.token}`
    const text = renderMessage(message, inv.name, link)
    const result: Record<Channel, Outcome> = { email: 'skipped', sms: 'skipped' }
    const stamps: Partial<Invitation> = {}

    if (channels.includes('email') && inv.email && (body.resend || !inv.email_sent_at)) {
      try {
        await sendEmail({ to: inv.email, ...buildInvitationEmail(text, link, await getEventInfo()) })
        result.email = 'sent'
        stamps.email_sent_at = new Date().toISOString()
      } catch (e) {
        result.email = e instanceof Error ? e.message : 'Ukendt fejl'
      }
    }

    if (channels.includes('sms') && inv.phone && (body.resend || !inv.sms_sent_at)) {
      const to = normalizePhone(inv.phone)
      if (!to) {
        result.sms = `Ugyldigt nummer: ${inv.phone}`
      } else {
        try {
          await sendSms(to, text)
          result.sms = 'sent'
          stamps.sms_sent_at = new Date().toISOString()
        } catch (e) {
          result.sms = e instanceof Error ? e.message : 'Ukendt fejl'
        }
      }
    }

    if (Object.keys(stamps).length > 0) {
      const { error: stampError } = await supabase.from('invitations').update(stamps).eq('id', inv.id)
      if (stampError) throw stampError
    }

    sendJson(res, 200, { ok: true, result })
  } catch (e) {
    console.error('invitations/send failed', e)
    sendJson(res, 500, { ok: false, error: e instanceof Error ? e.message : 'Ukendt fejl.' })
  }
}
