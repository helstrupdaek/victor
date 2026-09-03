export interface ScrapedLink {
  title: string | null
  image_url: string | null
  price: number | null
}

const FETCH_TIMEOUT_MS = 8000

/** Reads one `<meta property="..." content="...">` (attribute order-agnostic). */
function readMetaContent(html: string, property: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`,
      'i',
    ),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return decodeHtmlEntities(match[1])
  }
  return null
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function parsePrice(raw: string | null): number | null {
  if (!raw) return null
  const normalized = raw.replace(/[^\d.,]/g, '').replace(',', '.')
  const value = Number.parseFloat(normalized)
  return Number.isFinite(value) ? value : null
}

/**
 * Fetches a URL server-side (browsers can't do this themselves — most
 * shops don't send CORS headers, and many block obvious bot user-agents)
 * and pulls out the handful of Open Graph / product meta tags that link
 * previews rely on. Missing fields just come back null rather than
 * failing the whole request — a title-only result is still useful, and
 * the caller falls back to manual entry for anything left empty.
 */
export async function scrapeLink(url: string): Promise<ScrapedLink | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!response.ok) return null

    const html = await response.text()

    const title =
      readMetaContent(html, 'og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null

    const image = readMetaContent(html, 'og:image') ?? readMetaContent(html, 'product:image')

    const price = parsePrice(
      readMetaContent(html, 'product:price:amount') ?? readMetaContent(html, 'og:price:amount'),
    )

    return { title, image_url: image, price }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
