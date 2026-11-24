/** Fills {navn} and {link}. */
export function renderMessage(template: string, name: string, link: string): string {
  return template.replaceAll('{navn}', name).replaceAll('{link}', link)
}

/** Danish numbers may be typed as "12 34 56 78"; SureSMS wants +4512345678. */
export function normalizePhone(raw: string): string | null {
  const compact = raw.replace(/[\s\-()]/g, '').replace(/^00/, '+')
  const withCountry = /^\d{8}$/.test(compact) ? `+45${compact}` : compact
  return /^\+\d{8,15}$/.test(withCountry) ? withCountry : null
}
