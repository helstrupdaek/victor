/**
 * One sanitiser for every free-text field a guest can write. Control
 * characters are stripped so a name cannot smuggle terminal escapes or
 * zero-width tricks onto the wall; whitespace is collapsed so "A   B" and
 * "A B" read the same; the result is capped and empty becomes null so the
 * database stores "nothing" as NULL rather than "".
 */
export function sanitizeText(input: unknown, max: number): string | null {
  if (typeof input !== 'string') return null
  const cleaned = input
    .replace(/[\u0000-\u0008\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
  return cleaned.length > 0 ? cleaned : null
}
