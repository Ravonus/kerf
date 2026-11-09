import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

// ---- Run as a script: the static host for a variant with no server of its own, brotli then gzip, from memory like a CDN.
export function serveStatic(dist) {
  const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.txt': 'text/plain',
    '.ico': 'image/x-icon',
  }
  const cache = new Map()
  const entry = (p) => {
    if (cache.has(p)) return cache.get(p)
    const raw = readFileSync(p),
      type = TYPES[extname(p)] ?? 'application/octet-stream',
      text = /^(text|application\/json|image\/svg)/.test(type)
    const e = {
      raw,
      type,
      br: text
        ? brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
        : null,
      gz: text ? gzipSync(raw, { level: 9 }) : null,
      immutable: dirname(p).endsWith('assets'),
    }
    cache.set(p, e)
    return e
  }
  createServer((q, r) => respond(q, r, dist, entry)).listen(+process.env.PORT, process.env.HOST)
}

function respond(q, r, dist, entry) {
  let p = normalize(join(dist, decodeURIComponent(q.url.split('?')[0])))
  if (!p.startsWith(dist) || !existsSync(p) || statSync(p).isDirectory())
    p = join(dist, 'index.html')
  const e = entry(p),
    ae = q.headers['accept-encoding'] ?? '',
    enc = e.br && /\bbr\b/.test(ae) ? 'br' : e.gz && /gzip/.test(ae) ? 'gz' : null
  r.writeHead(200, {
    'content-type': e.type,
    'cache-control': e.immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...(enc ? { 'content-encoding': enc === 'br' ? 'br' : 'gzip', vary: 'accept-encoding' } : {}),
  })
  r.end(enc ? e[enc] : e.raw)
}
