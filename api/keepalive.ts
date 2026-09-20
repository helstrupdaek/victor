import type { IncomingMessage, ServerResponse } from 'node:http'
import { sendJson } from './_lib/http.js'
import { getSupabaseAdmin } from './_lib/supabaseAdmin.js'

/**
 * Called once a day by the Vercel cron in vercel.json.
 *
 * Supabase pauses a free-tier project after about a week without activity and
 * removes its DNS name, which takes RSVP, the wishlist, the leaderboard, the
 * photo wall and /admin login down together (it happened on 2026-09-20). One
 * small write a day keeps the project awake. The row is private
 * (is_public: false) and its value records when the cron last ran, so
 * "is the keep-alive working?" is one query away.
 *
 * It needs no secret: anyone calling it can only cause the same harmless write.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'Metoden er ikke tilladt.' })
    return
  }
  try {
    const at = new Date().toISOString()
    const { error } = await getSupabaseAdmin()
      .from('site_settings')
      .upsert({ key: 'keepalive', value: { at }, is_public: false }, { onConflict: 'key' })
    if (error) throw error
    sendJson(res, 200, { ok: true, at })
  } catch (e) {
    console.error('[keepalive] failed:', e)
    sendJson(res, 500, { ok: false, error: 'Noget gik galt.' })
  }
}
