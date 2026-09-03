import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Vercel's Node runtime pre-parses JSON bodies onto `req.body`; our local
 * Vite dev-server middleware (see vite.config.ts) hands handlers a plain
 * Node request instead, so this reads the raw stream when `body` isn't
 * already there. Keeps every handler working identically in both places.
 */
export async function readJsonBody<T>(req: IncomingMessage & { body?: unknown }): Promise<T> {
  if (req.body !== undefined) return req.body as T

  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  const raw = Buffer.concat(chunks).toString('utf-8')
  if (!raw) return {} as T
  return JSON.parse(raw) as T
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(body)
}

export function getQueryParam(
  req: IncomingMessage & { query?: Record<string, string | string[]> },
  name: string,
): string | null {
  if (req.query) {
    const value = req.query[name]
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
  }
  const url = new URL(req.url ?? '', 'http://localhost')
  return url.searchParams.get(name)
}
