/**
 * A small, fixed tilt per photo, so the wall looks tossed on a table but never
 * moves: the wall re-fetches every 15 s while the camera is on, and a random
 * tilt would make every polaroid twitch on each refresh. Hashing the id makes
 * the tilt a property of the photo rather than of the render.
 */
function hash(s: string): number {
  // djb2, kept as an unsigned 32-bit integer.
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  // MurmurHash3 finaliser: spreads a one-character change across all 32
  // bits, so ids that differ by one character never share a tilt.
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return h >>> 0
}

/** Maps a slice of the hash to [-limit, +limit], rounded to one decimal. */
function spread(h: number, shift: number, limit: number): number {
  const unit = ((h >>> shift) & 0xff) / 255 // 0..1
  return Math.round((unit * 2 - 1) * limit * 10) / 10
}

export function tiltFor(id: string) {
  const h = hash(id)
  return { rotate: spread(h, 0, 4), dx: spread(h, 8, 6), dy: spread(h, 16, 6) }
}
