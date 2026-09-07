/**
 * Scales a size down so its longer side is at most `maxSide`, keeping the
 * aspect ratio. Never scales up. Pure, so it can be tested without a browser;
 * the canvas work that uses it is in guestCamera.ts.
 */
export function fitWithin(width: number, height: number, maxSide: number) {
  const longest = Math.max(width, height)
  if (longest <= maxSide) return { width, height }
  const scale = maxSide / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}
