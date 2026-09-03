import type { IncomingMessage, ServerResponse } from 'node:http'
import { isWishPinValid } from '../_lib/wishAuth.js'
import { readJsonBody, sendJson } from '../_lib/http.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }
  if (!isWishPinValid(req)) {
    sendJson(res, 401, { ok: false, error: 'Forkert pinkode.' })
    return
  }

  const { id } = await readJsonBody<{ id?: string }>(req)
  if (!id) {
    sendJson(res, 400, { ok: false, error: 'Id mangler.' })
    return
  }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('wishlist_items').delete().eq('id', id)
  if (error) {
    sendJson(res, 500, { ok: false, error: error.message })
    return
  }

  sendJson(res, 200, { ok: true })
}
