import type { IncomingMessage, ServerResponse } from 'node:http'
import { isWishPinValid } from '../_lib/wishAuth.js'
import { readJsonBody, sendJson } from '../_lib/http.js'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'

interface AddWishBody {
  title?: string
  image_url?: string | null
  external_url?: string | null
  price?: number | null
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }
  if (!isWishPinValid(req)) {
    sendJson(res, 401, { ok: false, error: 'Forkert pinkode.' })
    return
  }

  const body = await readJsonBody<AddWishBody>(req)
  const title = body.title?.trim()
  if (!title) {
    sendJson(res, 400, { ok: false, error: 'Titel mangler.' })
    return
  }

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('wishlist_items').insert({
    title,
    image_url: body.image_url || null,
    external_url: body.external_url || null,
    price: body.price ?? null,
    description: null,
    category: null,
    sort_order: 0,
  })
  if (error) {
    sendJson(res, 500, { ok: false, error: error.message })
    return
  }

  sendJson(res, 200, { ok: true })
}
