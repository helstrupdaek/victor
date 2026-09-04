import type { IncomingMessage, ServerResponse } from 'node:http'
import { sendJson } from '../_lib/http.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'

const LEADERBOARD_LIMIT = 20

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('minigolf_scores')
    .select('guest_email, shots, seconds, score')
    .order('score', { ascending: true })
    .limit(LEADERBOARD_LIMIT)

  if (error) {
    sendJson(res, 500, { ok: false, error: error.message })
    return
  }

  const entries = (data ?? []).map((row) => ({
    display_name: row.guest_email.split('@')[0],
    shots: row.shots,
    seconds: row.seconds,
    score: row.score,
  }))

  sendJson(res, 200, { ok: true, entries })
}
