import type { IncomingMessage, ServerResponse } from 'node:http'
import { isWishPinValid } from '../_lib/wishAuth.js'
import { sendJson } from '../_lib/http.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }
  if (!isWishPinValid(req)) {
    sendJson(res, 401, { ok: false, error: 'Forkert pinkode.' })
    return
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('wishlist_items')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    sendJson(res, 500, { ok: false, error: error.message })
    return
  }

  sendJson(res, 200, { ok: true, items: data })
}
