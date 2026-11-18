import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { here } from './shared.mjs'

/** A document served before Start can render can recover once the dev server can serve it again. */
const NOT_LOADING = `<!doctype html><meta charset="utf-8"><title>This page failed to load</title>
<body style="font:16px system-ui;padding:2rem"><h1>This page failed to load</h1><p>The error is in the terminal. This tab reloads when you save a fix.</p>
<script type="module">
import { createHotContext } from '/@vite/client'
const hot = createHotContext('/@kerf/not-loading')
let reloading = false
async function check() {
  if (reloading) return
  try {
    const response = await fetch(location.href, { cache: 'no-store', headers: { accept: 'text/html' } })
    void response.body?.cancel().catch(() => {})
    if (response.ok && !reloading) {
      reloading = true
      location.reload()
    }
  } catch {}
}
for (const event of ['vite:afterUpdate', 'kerf:refresh', 'vite:ws:connect']) hot.on(event, check)
void check()
</script>`

// Nitro passes flat headers to writeHead. An app response carries Start's request ID even when it failed.
function responseHeader(res, headers, name) {
  if (Array.isArray(headers)) {
    for (let i = 0; i < headers.length; i += 2) {
      if (headers[i].toLowerCase() === name) return headers[i + 1]
    }
  } else if (headers && typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === name) return value
    }
  }
  return res.getHeader(name)
}

export function waitingForAFix(req, res, next) {
  if (!req.headers.accept?.includes('text/html')) return next()
  const { writeHead, end } = res
  const upstreamError = (headers) => {
    const type = String(responseHeader(res, headers, 'content-type'))
    return (
      /json/.test(type) ||
      (type.startsWith('text/html') && !responseHeader(res, headers, 'x-request-id'))
    )
  }
  let failed = false
  res.writeHead = function (status, ...rest) {
    failed = status >= 500 && upstreamError(rest.at(-1))
    if (!failed) return writeHead.call(this, status, ...rest)
    res.statusCode = status
    return this
  }
  const write = res.write
  res.write = function (...args) {
    return failed ? true : write.apply(this, args)
  }
  res.end = function (...args) {
    if (!failed && !(res.statusCode >= 500 && !res.headersSent && upstreamError()))
      return end.apply(this, args)
    res.writeHead = writeHead
    res.setHeader('content-type', 'text/html')
    res.setHeader('cache-control', 'no-store')
    res.removeHeader('content-encoding')
    res.removeHeader('content-length')
    return end.call(
      this,
      NOT_LOADING,
      args.findLast((arg) => typeof arg === 'function'),
    )
  }
  next()
}

/** Whether an update to `mod` stops at a module that accepts it. */
export function reaches(mod, seen = new Set()) {
  if (mod.isSelfAccepting || mod.acceptedHmrDeps?.size) return true
  if (seen.has(mod)) return true
  seen.add(mod)
  return (
    mod.importers.size > 0 &&
    [...mod.importers].every((m) => m.acceptedHmrDeps?.has(mod) || reaches(m, seen))
  )
}

/** Ask open pages for the server's new answer, once the server's own reload has been told. A burst of saves is one ask. */
const asking = new WeakMap()
export function refresh(vite, rel, say = true, queries = true) {
  if (!vite) return
  clearTimeout(asking.get(vite))
  asking.set(
    vite,
    setTimeout(() => {
      if (say)
        vite.config.logger.info(
          `kerf: ${rel} runs on the server: refreshing the page's data, state kept`,
          { timestamp: true },
        )
      vite.ws.send({ type: 'custom', event: 'kerf:refresh', data: { queries } })
    }, 50),
  )
}

export function packageDirs(root) {
  const req = createRequire(join(root, 'package.json'))
  const own = createRequire(join(here, 'vite.mjs'))
  const out = []
  for (const name of ['@kerf-js/core/vite', 'nitro/package.json']) {
    // each at its package root
    for (const r of [req, own]) {
      try {
        out.push(dirname(realpathSync(r.resolve(name))))
        break
      } catch {}
    }
  }
  return out
}

/** The project asks for shapes: a `pending="shape"`, or a read of `.shape`. */
export function usesShapes(root) {
  const src = join(root, 'src')
  if (!existsSync(src)) return false
  return readdirSync(src, { recursive: true, withFileTypes: true }).some(
    (f) =>
      f.isFile() &&
      /\.[jt]sx?$/.test(f.name) &&
      /pending="shape"|\.shape\b/.test(readFileSync(join(f.parentPath, f.name), 'utf8')),
  )
}
