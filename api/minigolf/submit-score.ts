import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJsonBody, sendJson } from '../_lib/http.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'

interface SubmitScoreBody {
  email?: string
  shots?: number
  seconds?: number
}

const MIN_SHOTS = 1
const MAX_SHOTS = 50
const MIN_SECONDS = 0.1
const MAX_SECONDS = 3600

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  const body = await readJsonBody<SubmitScoreBody>(req)
  const email = body.email?.trim().toLowerCase()
  const shots = body.shots
  const seconds = body.seconds

  if (!email) {
    sendJson(res, 400, { ok: false, error: 'Email mangler.' })
    return
  }
  if (
    typeof shots !== 'number' ||
    !Number.isInteger(shots) ||
    shots < MIN_SHOTS ||
    shots > MAX_SHOTS
  ) {
    sendJson(res, 400, { ok: false, error: 'Ugyldigt antal slag.' })
    return
  }
  if (typeof seconds !== 'number' || seconds < MIN_SECONDS || seconds > MAX_SECONDS) {
    sendJson(res, 400, { ok: false, error: 'Ugyldig tid.' })
    return
  }

  const supabase = getSupabaseAdmin()

  const { data: guest, error: guestError } = await supabase
    .from('guests')
    .select('email')
    .eq('email', email)
    .maybeSingle()
  if (guestError) {
    sendJson(res, 500, { ok: false, error: guestError.message })
    return
  }
  if (!guest) {
    sendJson(res, 404, {
      ok: false,
      error: 'Vi kunne ikke finde en tilmelding med denne email. Brug den email I tilmeldte jer med.',
    })
    return
  }

  const score = shots * 10 + seconds

  const { data: existing, error: existingError } = await supabase
    .from('minigolf_scores')
    .select('score')
    .eq('guest_email', email)
    .maybeSingle()
  if (existingError) {
    sendJson(res, 500, { ok: false, error: existingError.message })
    return
  }

  if (existing && existing.score <= score) {
    sendJson(res, 200, { ok: true })
    return
  }

  const { error: upsertError } = await supabase
    .from('minigolf_scores')
    .upsert(
      { guest_email: email, shots, seconds, score, updated_at: new Date().toISOString() },
      { onConflict: 'guest_email' },
    )
  if (upsertError) {
    sendJson(res, 500, { ok: false, error: upsertError.message })
    return
  }

  sendJson(res, 200, { ok: true })
}
