import type { IncomingMessage } from 'node:http'

/**
 * Lightweight gate for the /wish routes — not real authentication, just
 * enough friction to keep a stranger who stumbles on the URL from adding
 * junk or scraping arbitrary sites through us. The client resends the PIN
 * as a bearer token on every request; there's no session/expiry.
 */
export function isWishPinValid(req: IncomingMessage): boolean {
  const expected = process.env.WISH_PIN
  if (!expected) return false

  const header = req.headers.authorization
  const provided = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
  return provided === expected
}
