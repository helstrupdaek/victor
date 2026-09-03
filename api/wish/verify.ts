import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJsonBody, sendJson } from '../_lib/http.js'

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed' })
    return
  }

  const expected = process.env.WISH_PIN
  if (!expected) {
    sendJson(res, 500, { ok: false, error: 'WISH_PIN er ikke sat op på serveren.' })
    return
  }

  const { pin } = await readJsonBody<{ pin?: string }>(req)
  sendJson(res, 200, { ok: pin === expected })
}
