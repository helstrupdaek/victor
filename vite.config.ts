import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin, type ViteDevServer } from 'vite'

/**
 * Runs the `/api/*` Vercel serverless functions locally under `npm run dev`
 * by loading them through Vite's own SSR module pipeline (so the `@/`
 * alias and TypeScript work exactly like they do for the client code) and
 * invoking their default-exported `(req, res)` handler directly. Vercel
 * runs the very same files in production — this is dev-only convenience,
 * not a reimplementation of them.
 */
function localApiRoutes(): Plugin {
  return {
    name: 'local-api-routes',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) {
          next()
          return
        }

        const [pathname, search] = req.url.split('?')
        const routeName = pathname.replace(/^\/api\//, '').replace(/\/$/, '')
        if (!routeName) {
          next()
          return
        }

        try {
          const modulePath = path.resolve(import.meta.dirname, 'api', `${routeName}.ts`)
          const mod = await server.ssrLoadModule(modulePath)
          const handler = mod.default as (
            req: IncomingMessage & { query?: Record<string, string> },
            res: ServerResponse,
          ) => Promise<void> | void

          const query: Record<string, string> = {}
          new URLSearchParams(search ?? '').forEach((value, key) => {
            query[key] = value
          })
          Object.assign(req, { query })

          await handler(req, res)
        } catch (error) {
          console.error(`[api] /api/${routeName} failed:`, error)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ ok: false, error: 'Internal error (dev API route).' }))
          }
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), localApiRoutes()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
