import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJsonBody, sendJson } from '../_lib/http.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'

interface SubmitScoreBody {
  /** Free-text player name. Identity is a name now, not a guest lookup. */
  name?: string
  shots?: number
  seconds?: number
}

const MAX_NAME_LENGTH = 24

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
  // Collapse internal whitespace so " A   B " and "A B" are the same player,
  // and strip control characters so a name cannot smuggle markup onto the board.
  const name = body.name?.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()
  const shots = body.shots
  const seconds = body.seconds

  if (!name) {
    sendJson(res, 400, { ok: false, error: 'Skriv dit navn.' })
    return
  }
  if (name.length > MAX_NAME_LENGTH) {
    sendJson(res, 400, { ok: false, error: `Navnet må højst være ${MAX_NAME_LENGTH} tegn.` })
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

  const score = shots * 10 + seconds

  const { data: existing, error: existingError } = await supabase
    .from('minigolf_scores')
    .select('score')
    .ilike('player_name', name)
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
      { player_name: name, shots, seconds, score, updated_at: new Date().toISOString() },
      { onConflict: 'player_name' },
    )
  if (upsertError) {
    sendJson(res, 500, { ok: false, error: upsertError.message })
    return
  }

  sendJson(res, 200, { ok: true })
}
