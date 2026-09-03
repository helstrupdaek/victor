import type { IncomingMessage, ServerResponse } from 'node:http'
import { isWishPinValid } from '../_lib/wishAuth.js'
import { scrapeLink } from '../_lib/scrapeLink.js'
import { readJsonBody, sendJson } from '../_lib/http.js'

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }
  if (!isWishPinValid(req)) {
    sendJson(res, 401, { ok: false, error: 'Forkert pinkode.' })
    return
  }

  const { url } = await readJsonBody<{ url?: string }>(req)
  if (!url) {
    sendJson(res, 400, { ok: false, error: 'URL mangler.' })
    return
  }

  const scraped = await scrapeLink(url)
  if (!scraped) {
    sendJson(res, 200, { ok: false, reason: 'scrape-failed' })
    return
  }

  sendJson(res, 200, { ok: true, ...scraped })
}
