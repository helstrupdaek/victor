import { createHmac } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

export class BodyTooLarge extends Error {
  constructor() {
    super('body too large')
    this.name = 'BodyTooLarge'
  }
}

/**
 * The request body as bytes, from either runtime.
 *
 * Vercel's Node runtime reads the body before the handler runs and puts it on
 * req.body — a Buffer for binary content types. The local Vite plugin hands
 * the handler a raw Node request whose body is still a stream. Reading either
 * here keeps the route identical in both places, which is the same reason
 * readJsonBody in http.ts exists.
 *
 * A streamed body is abandoned the moment it passes the cap rather than read
 * to the end and then rejected: a 4 MB cap is only a cap if the function stops
 * at 4 MB.
 */
export async function readRawBody(
  req: IncomingMessage & { body?: unknown },
  maxBytes: number,
): Promise<Buffer> {
  if (req.body !== undefined) {
    const buf = Buffer.isBuffer(req.body)
      ? req.body
      : typeof req.body === 'string'
        ? Buffer.from(req.body)
        : Buffer.from(JSON.stringify(req.body))
    if (buf.length > maxBytes) throw new BodyTooLarge()
    return buf
  }
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const b = chunk as Buffer
    total += b.length
    if (total > maxBytes) throw new BodyTooLarge()
    chunks.push(b)
  }
  return Buffer.concat(chunks)
}

/**
 * Vercel puts the real client first in x-forwarded-for, but on Vercel itself
 * x-vercel-forwarded-for is the more trustworthy header (set by their edge,
 * harder for a client to spoof than a plain forwarded-for) — prefer it when
 * present, and fall back to the older header everywhere else (local dev,
 * other hosts).
 */
export function clientIp(req: IncomingMessage): string {
  const vercelFwd = req.headers['x-vercel-forwarded-for']
  const vercelFirst = (Array.isArray(vercelFwd) ? vercelFwd[0] : vercelFwd)?.split(',')[0]?.trim()
  if (vercelFirst) return vercelFirst
  const fwd = req.headers['x-forwarded-for']
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim()
  return first || req.socket?.remoteAddress || 'unknown'
}

/**
 * The per-phone key for the rate limit. HMAC rather than a plain hash so the
 * value cannot be reversed by hashing candidate IPs; the secret is the service
 * key, which is already a server secret, so no new configuration is needed.
 * 32 hex characters is plenty of distinctness for a party.
 */
export function uploaderHash(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(ip).digest('hex').slice(0, 32)
}

/**
 * Confirms the bytes actually are the image type they claim to be, by magic
 * number. This matters because on Vercel the declared type now travels in a
 * header (X-Image-Type), separate from the body — see guest.ts — so a
 * mismatched or non-image body must be caught here rather than trusted.
 */
export function looksLikeImage(bytes: Buffer, type: string): boolean {
  if (bytes.length < 12) return false
  if (type === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (type === 'image/png') {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    return sig.every((b, i) => bytes[i] === b)
  }
  if (type === 'image/webp') {
    return (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    )
  }
  return false
}
