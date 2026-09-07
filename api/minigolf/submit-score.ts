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

  // Look the player up case-insensitively, matching the unique index on
  // lower(player_name). The name is escaped first: ilike treats % and _ as
  // wildcards, so an unescaped "100%" would match several rows and maybeSingle
  // would fail on a name that is otherwise perfectly legal.
  const likePattern = name.replace(/[\\%_]/g, (ch) => `\\${ch}`)
  const { data: existing, error: existingError } = await supabase
    .from('minigolf_scores')
    .select('id, score')
    .ilike('player_name', likePattern)
    .maybeSingle()
  if (existingError) {
    sendJson(res, 500, { ok: false, error: existingError.message })
    return
  }

  // Best round wins: a worse round is accepted and discarded, not rejected —
  // the player has still finished a hole, and telling them their round "failed"
  // because it was slower would be nonsense.
  if (existing && existing.score <= score) {
    sendJson(res, 200, { ok: true })
    return
  }

  // Deliberately NOT an upsert.
  //
  // upsert(onConflict: 'player_name') compiles to ON CONFLICT (player_name),
  // which Postgres can only resolve against a unique index on that bare column.
  // Ours is on lower(player_name) — an expression index, which is what makes
  // "Victor" and "victor" the same player — so every submission failed with
  // "no unique or exclusion constraint matching the ON CONFLICT specification".
  // Looking the row up first and choosing insert or update does work against an
  // expression index, and the lookup was already being done for the best-round
  // check above, so this costs nothing extra.
  const row = { player_name: name, shots, seconds, score, updated_at: new Date().toISOString() }

  if (existing) {
    const { error } = await supabase.from('minigolf_scores').update(row).eq('id', existing.id)
    if (error) {
      sendJson(res, 500, { ok: false, error: error.message })
      return
    }
    sendJson(res, 200, { ok: true })
    return
  }

  const { error: insertError } = await supabase.from('minigolf_scores').insert(row)
  if (insertError) {
    // 23505: two devices finished with the same name between the lookup and
    // the insert. The index did its job; fold the loser into an update rather
    // than showing a database error to someone who just holed out.
    if (insertError.code === '23505') {
      const { data: raced } = await supabase
        .from('minigolf_scores')
        .select('id, score')
        .ilike('player_name', likePattern)
        .maybeSingle()
      if (raced && raced.score > score) {
        const { error } = await supabase.from('minigolf_scores').update(row).eq('id', raced.id)
        if (error) {
          sendJson(res, 500, { ok: false, error: error.message })
          return
        }
      }
      sendJson(res, 200, { ok: true })
      return
    }
    sendJson(res, 500, { ok: false, error: insertError.message })
    return
  }

  sendJson(res, 200, { ok: true })
}
