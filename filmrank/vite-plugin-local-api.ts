import type { Plugin, Connect } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

type VercelRes = ServerResponse & {
  status: (code: number) => VercelRes
  json: (body: unknown) => void
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map((part) => {
      const idx = part.indexOf('=')
      if (idx === -1) return [part.trim(), '']
      return [part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim())]
    })
  )
}

function adaptRes(res: ServerResponse): VercelRes {
  const adapted = res as VercelRes
  adapted.status = (code: number) => {
    res.statusCode = code
    return adapted
  }
  adapted.json = (body: unknown) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
  }
  return adapted
}

/**
 * Serves Vercel-style `/api/*` handlers inside `vite` so local UI + API
 * work with a single `npm run dev` — no `vercel dev` port proxy needed.
 */
export function localVercelApi(): Plugin {
  return {
    name: 'local-vercel-api',
    configureServer(server) {
      const middleware: Connect.NextHandleFunction = async (req, res, next) => {
        const url = req.url
        const match = url?.match(/^\/api\/([\w-]+)/)
        if (!match) {
          next()
          return
        }
        const handlerName = match[1]
        const handlerPath = path.resolve(server.config.root, `api/${handlerName}.mjs`)
        if (!fs.existsSync(handlerPath)) {
          next()
          return
        }

        try {
          const parsed = new URL(url!, 'http://localhost')
          // Bust cache so handler edits apply on refresh during dev
          const mod = await import(`${pathToFileURL(handlerPath).href}?t=${Date.now()}`)
          const handler = mod.default

          const query = Object.fromEntries(parsed.searchParams.entries())
          const apiReq = Object.assign(req as IncomingMessage, {
            query,
            cookies: parseCookies(req.headers.cookie),
          })
          const apiRes = adaptRes(res)

          await handler(apiReq, apiRes)
          if (!res.writableEnded) {
            res.end()
          }
        } catch (err) {
          console.error('[local-vercel-api]', err)
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Local API handler failed' }))
          }
        }
      }

      server.middlewares.use(middleware)
    },
  }
}
