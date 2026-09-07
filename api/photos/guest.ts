import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readJsonBody, sendJson } from '../_lib/http.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'
import { sanitizeText } from '../_lib/text.js'
import { BodyTooLarge, clientIp, looksLikeImage, readRawBody, uploaderHash } from '../_lib/upload.js'

/**
 * The guest camera's only write path.
 *
 * Guests never get a key with write access: the anon key can read published
 * photos and two public settings, and that is all. Everything a phone sends
 * comes through here with the service key, which is why the switch, the size
 * cap, the type check and the rate limit live in this file and nowhere else.
 * Hiding the button on /kamera when the camera is off is a courtesy; this
 * route refusing is the rule.
 */

const BUCKET = 'gallery'
const MAX_BYTES = 4 * 1024 * 1024
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp'])
const CAPTION_MAX = 120
const NAME_MAX = 30
const RATE_LIMIT = 20
const RATE_WINDOW_MS = 10 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Req = IncomingMessage & { body?: unknown }

export default async function handler(req: Req, res: ServerResponse): Promise<void> {
  // One catch for both methods, so the JSON error contract holds even for the
  // failures the bodies do not anticipate — a malformed PATCH body throwing
  // inside JSON.parse, a missing env var throwing inside getSupabaseAdmin.
  // Without it, Vercel answers those with its own plain 500, not
  // { ok: false, error }. `await` matters: a returned promise would escape.
  try {
    if (req.method === 'POST') return await upload(req, res)
    if (req.method === 'PATCH') return await caption(req, res)
    sendJson(res, 405, { ok: false, error: 'Metoden er ikke tilladt.' })
  } catch (e) {
    console.error('[photos/guest] unhandled:', e)
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Noget gik galt. Prøv igen om lidt.' })
  }
}

async function cameraEnabled(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<boolean> {
  // Read fresh on every call. The UI reads this too, but the UI is not the
  // enforcement — a request made with the button hidden must still be refused.
  const { data } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'guest_camera')
    .maybeSingle()
  return (data?.value as { enabled?: boolean } | null)?.enabled === true
}

async function upload(req: Req, res: ServerResponse): Promise<void> {
  const supabase = getSupabaseAdmin()

  if (!(await cameraEnabled(supabase))) {
    sendJson(res, 403, { ok: false, error: 'Kameraet er slukket.' })
    return
  }

  const hash = uploaderHash(clientIp(req), process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count, error: countError } = await supabase
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('uploader_hash', hash)
    .gt('created_at', since)
  if (countError) {
    sendJson(res, 500, { ok: false, error: 'Noget gik galt. Prøv igen om lidt.' })
    return
  }
  if ((count ?? 0) >= RATE_LIMIT) {
    sendJson(res, 429, { ok: false, error: 'Du har taget rigtig mange billeder. Vent lidt, og prøv igen.' })
    return
  }

  // On Vercel the Node helper drains the body before the handler runs and
  // only exposes it as req.body (a Buffer) for application/octet-stream —
  // for a real image/jpeg content type it leaves req.body undefined and the
  // stream already consumed, so the route would read zero bytes there. The
  // phone therefore sends octet-stream and names the real image type in
  // X-Image-Type; a direct image/jpeg (or png/webp) POST, e.g. from curl or
  // the local dev plugin, is still accepted as-is.
  const contentType = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  const imageType =
    contentType === 'application/octet-stream'
      ? String(req.headers['x-image-type'] ?? 'image/jpeg').toLowerCase()
      : contentType
  if (!ACCEPTED.has(imageType)) {
    sendJson(res, 415, { ok: false, error: 'Det skal være et billede (JPEG, PNG eller WebP).' })
    return
  }

  const width = Number(req.headers['x-image-width'])
  const height = Number(req.headers['x-image-height'])
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    sendJson(res, 400, { ok: false, error: 'Billedets størrelse mangler.' })
    return
  }

  let bytes: Buffer
  try {
    bytes = await readRawBody(req, MAX_BYTES)
  } catch (e) {
    if (e instanceof BodyTooLarge) {
      sendJson(res, 413, { ok: false, error: 'Billedet er for stort. Prøv igen.' })
      return
    }
    throw e
  }
  if (bytes.length === 0) {
    sendJson(res, 400, { ok: false, error: 'Der kom ikke noget billede med.' })
    return
  }
  if (!looksLikeImage(bytes, imageType)) {
    sendJson(res, 415, { ok: false, error: 'Det skal være et billede (JPEG, PNG eller WebP).' })
    return
  }

  const ext = imageType === 'image/png' ? 'png' : imageType === 'image/webp' ? 'webp' : 'jpg'
  const path = `guest/${randomUUID()}.${ext}`
  const { error: storageError } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: imageType,
    cacheControl: '31536000',
    upsert: false,
  })
  if (storageError) {
    console.error('[photos/guest] storage upload failed:', storageError)
    sendJson(res, 500, { ok: false, error: 'Billedet kunne ikke gemmes. Prøv igen.' })
    return
  }

  const { data, error } = await supabase
    .from('photos')
    .insert({
      storage_path: path,
      caption: null,
      guest_name: null,
      is_published: true,
      is_pinned: false,
      source: 'guest',
      width,
      height,
      sort_order: 0,
      uploader_hash: hash,
    })
    .select('id')
    .single()
  if (error || !data) {
    console.error('[photos/guest] insert failed:', error)
    // Do not leave an orphan file behind a failed row.
    await supabase.storage.from(BUCKET).remove([path])
    sendJson(res, 500, { ok: false, error: 'Billedet kunne ikke gemmes. Prøv igen.' })
    return
  }

  sendJson(res, 201, { ok: true, id: data.id })
}

async function caption(req: Req, res: ServerResponse): Promise<void> {
  const body = await readJsonBody<{ id?: unknown; caption?: unknown; guest_name?: unknown }>(req)
  const id = typeof body.id === 'string' && UUID.test(body.id) ? body.id : null
  if (!id) {
    sendJson(res, 400, { ok: false, error: 'Billedet blev ikke fundet.' })
    return
  }

  const supabase = getSupabaseAdmin()
  // The id is the capability: it is a UUID this route issued to the phone that
  // took the photo, nobody else has it, and it cannot be enumerated. Only
  // guest rows, and only the two text fields — never published/pinned/delete.
  const { data, error } = await supabase
    .from('photos')
    .update({
      caption: sanitizeText(body.caption, CAPTION_MAX),
      guest_name: sanitizeText(body.guest_name, NAME_MAX),
    })
    .eq('id', id)
    .eq('source', 'guest')
    .select('id')
  if (error) {
    console.error('[photos/guest] caption update failed:', error)
    sendJson(res, 500, { ok: false, error: 'Teksten kunne ikke gemmes. Prøv igen.' })
    return
  }
  if (!data || data.length === 0) {
    sendJson(res, 404, { ok: false, error: 'Billedet blev ikke fundet.' })
    return
  }
  sendJson(res, 200, { ok: true })
}
