/**
 * A small request pool. Open-Meteo answers a burst of eight simultaneous
 * archive requests with a couple of 429s, and each lost year quietly skews
 * the seasonal average. Two at a time, with one polite retry, gets all of
 * them through. No imports, so it can be unit-tested with plain node --test.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker)
  await Promise.all(workers)
  return results
}

/** Milliseconds to wait before retrying, from a Retry-After header (seconds) or a fallback; capped at 10 s. */
export function retryAfterMs(header: string | null, fallbackMs: number): number {
  const seconds = header === null ? NaN : Number(header)
  const ms = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : fallbackMs
  return Math.min(ms, 10_000)
}

/** fetch() that retries once on 429 or a 5xx, waiting as the server asks. */
export async function fetchWithRetry(url: string, retries = 1): Promise<Response> {
  const response = await fetch(url)
  if (retries > 0 && (response.status === 429 || response.status >= 500)) {
    await new Promise((r) => setTimeout(r, retryAfterMs(response.headers.get('retry-after'), 800)))
    return fetchWithRetry(url, retries - 1)
  }
  return response
}
