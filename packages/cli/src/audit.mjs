// `weft audit` and the last step of `weft build`: the built pages in a clean headless Chrome, at a phone's width and a
// desktop's, read the way a crawler, a screen reader and Lighthouse read them. `weft check` reads source; some failures
// only exist once CSS and a breakpoint have had their say (a button whose text a phone hides has no name), so this
// looks at the rendered page. No automation library: the DevTools protocol over the WebSocket Node already has.
//
// L001–L004 axe-core's rules, the ones Lighthouse grades (names, images, contrast, the rest), L010–L013 console and issues,
// L020–L025 the head a crawler reads, L030–L031 sideways scroll on a phone and layout shift.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, relative, resolve, sep } from 'node:path'
import { findChrome } from './browser/client.mjs'
import { diagnostic } from './diag.mjs'
import { fail, sleep } from './audit/utils.mjs'
import { auditPage } from './audit/page.mjs'
import { reportFindings } from './audit/report.mjs'
import { loadConfig } from './load-config.mjs'

/** The two widths Lighthouse's defaults stand for: its mobile run (a Moto G Power) and its desktop run. */
export const FORMS = {
  phone: { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true },
  desktop: { width: 1350, height: 940, deviceScaleFactor: 1, mobile: false },
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
}

/** The public directory a build wrote: the newer of `.output/public` (server presets) and `dist` (Netlify, Vercel static). */
export function builtPublic(root) {
  const found = ['.output/public', 'dist']
    .map((d) => join(root, d))
    .filter((d) => existsSync(join(d, 'index.html')))
  return (
    found.sort(
      (a, b) => statSync(join(b, 'index.html')).mtimeMs - statSync(join(a, 'index.html')).mtimeMs,
    )[0] ?? null
  )
}

/** Every prerendered page under `dir`, as its URL path. */
export function pagesIn(dir) {
  const out = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.startsWith('_')) continue
      const f = join(d, e.name)
      if (e.isDirectory()) walk(f)
      else if (e.name.endsWith('.html') && !/^(404|200|500)\.html$/.test(e.name)) {
        const rel = relative(dir, f).split(sep).join('/')
        out.push(`/${rel.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '')}`)
      }
    }
  }
  walk(dir)
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * One page for each kind: `/` and each top-level page, then the first page of each section at each depth (the docs'
 * 1,600 pages share a few layouts, and a layout's fault shows on its first page).
 */
export function samplePages(pages, max = 30) {
  const seen = new Map()
  for (const p of pages) {
    const parts = p.split('/').filter(Boolean)
    const key = parts.length <= 1 ? p : `${parts[0]}/${parts.length}`
    if (!seen.has(key)) seen.set(key, p)
  }
  return [...seen.values()].slice(0, max)
}

/** A static server over a build's public directory, for the audit's Chrome. */
export function serveStatic(dir) {
  dir = resolve(dir)
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const tries = [path, `${path}/index.html`, `${path.replace(/\/$/, '')}.html`].map((p) =>
      resolve(dir, `.${p}`),
    )
    const file = tries.find(
      (f) => (f === dir || f.startsWith(dir + sep)) && existsSync(f) && statSync(f).isFile(),
    )
    const missing = join(dir, '404.html')
    if (!file) {
      res.writeHead(404, { 'content-type': TYPES['.html'] })
      // a doctype even here: a frame showing this would put Chrome in Quirks Mode, an issue of the audit's own making
      return res.end(
        existsSync(missing)
          ? readFileSync(missing)
          : '<!doctype html><title>Not found</title><p>Not found</p>',
      )
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  return new Promise((ok) => {
    server.listen(0, '127.0.0.1', () =>
      ok({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }),
    )
  })
}

/** A clean headless Chrome (its own empty profile: no extensions, nothing stored) and a DevTools protocol client. As root (a container, CI) Chrome only starts unsandboxed. */
async function chrome(exe) {
  const profile = mkdtempSync(join(tmpdir(), 'weft-audit-'))
  const child = spawn(
    exe,
    [
      `--user-data-dir=${profile}`,
      '--headless=new',
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--mute-audio',
      ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  const portFile = join(profile, 'DevToolsActivePort')
  for (let i = 0; !existsSync(portFile) || !readFileSync(portFile, 'utf8').includes('\n'); i++) {
    if (i > 150 || child.exitCode !== null) {
      child.kill()
      throw fail('E_NO_CHROME', `Chrome at ${exe} didn't start`)
    }
    await sleep(100)
  }
  const [port, path] = readFileSync(portFile, 'utf8').split('\n')
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`)
  await new Promise((ok, no) => {
    ws.onopen = ok
    ws.onerror = () => no(fail('E_CDP', 'could not reach Chrome over the DevTools protocol'))
  })
  let next = 0
  const waiting = new Map()
  const listeners = new Set()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id !== undefined) {
      const w = waiting.get(m.id)
      waiting.delete(m.id)
      if (m.error) w?.no(fail('E_CDP', m.error.message))
      else w?.ok(m.result)
    } else for (const on of listeners) on(m)
  }
  const send = (method, params = {}, sessionId) =>
    new Promise((ok, no) => {
      const id = ++next
      waiting.set(id, { ok, no })
      ws.send(JSON.stringify({ id, method, params, sessionId }))
    })
  const close = () => {
    try {
      ws.close()
    } catch {}
    child.kill()
    // Chrome holds the profile a moment after it's told to go.
    setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500).unref()
  }
  return {
    send,
    on: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    close,
  }
}

/**
 * The app's own pages as a test on a path (`src/routes`, `[id]` and `[...rest]` included). A build served as files has
 * only its prerendered pages: a request for one of the others is the server's to answer, not a missing file.
 */
export function appRoutes(root) {
  const dir = join(root, 'src', 'routes')
  if (!existsSync(dir)) return () => false
  const tests = []
  const walk = (at, prefix) => {
    for (const e of readdirSync(at, { withFileTypes: true })) {
      const name = e.name.replace(/^\(.*\)$/, '')
      if (e.isDirectory()) {
        walk(join(at, e.name), name ? `${prefix}/${name}` : prefix)
        continue
      }
      if (
        !/\.[jt]sx?$/.test(e.name) ||
        /\.(server|test|spec)\./.test(e.name) ||
        e.name.startsWith('_')
      )
        continue
      const leaf = e.name.replace(/\.[jt]sx?$/, '')
      const path = leaf === 'index' ? prefix : `${prefix}/${leaf}`
      const re = path
        .split('/')
        .map((seg) =>
          /^\[\.\.\.\w+\]$/.test(seg)
            ? '\0'
            : /^\[\w+\]$/.test(seg)
              ? '[^/]+'
              : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        )
        .join('/')
        .replace(/\/\0/g, '(?:/.+)?')
      tests.push(new RegExp(`^${re || ''}/?$`))
    }
  }
  walk(dir, '')
  return (path) => tests.some((t) => t.test(path))
}

/**
 * @param {string} root project root
 * @param {{ url?: string, dir?: string, routes?: string[], all?: boolean, max?: number, forms?: (keyof FORMS)[], concurrency?: number, indexing?: 'auto' | 'public' | 'private' }} [options]
 *   `url`: audit a running site (a deploy, `weft start`); else `dir`, a build's public directory (found when left out)
 * @returns {Promise<{ ok: boolean, skipped?: string, base: string, pages: string[], diagnostics: object[], ms: number }>}
 */
export async function audit(root, options = {}) {
  const t = performance.now()
  const loaded = options.indexing === undefined ? await loadConfig(root) : undefined
  if (loaded?.diagnostics?.some((d) => d.severity === 'error'))
    throw new Error('Fix weft.config before auditing, or pass --indexing explicitly')
  const configured = loaded?.config?.build?.audit
  const indexing =
    options.indexing ?? (typeof configured === 'object' ? configured.indexing : undefined) ?? 'auto'
  if (!['auto', 'public', 'private'].includes(indexing))
    throw new Error('indexing must be auto, public or private')
  const exe = findChrome()
  const forms = options.forms ?? ['phone', 'desktop']
  const skip = (why) => ({
    ok: true,
    skipped: why,
    base: options.url ?? '',
    pages: [],
    diagnostics: [diagnostic({ code: 'L000', severity: 'warning', file: 'weft.config.ts', why })],
    ms: 0,
  })
  if (!exe)
    return skip(
      'No Chrome or Chromium here, so the built pages were not audited (L001–L030). Set `WEFT_CHROME`, or run `weft audit --url <deploy>` where there is one.',
    )
  let base = options.url?.replace(/\/$/, '')
  let server
  let routes = options.routes
  if (!base) {
    const dir = options.dir ?? builtPublic(root)
    if (!dir) return skip('No built pages to audit: run `weft build` first, or pass `--url`.')
    const pages = pagesIn(dir)
    if (!pages.length)
      return skip(
        `No prerendered pages in ${relative(root, dir)} to audit: pass \`--url\` to audit a running server.`,
      )
    routes ??= options.all ? pages : samplePages(pages, options.max)
    server = await serveStatic(dir)
    base = server.url
  }
  routes ??= ['/']
  const served = appRoutes(root)
  const browser = await chrome(exe)
  const findings = new Map()
  try {
    const jobs = routes.flatMap((route) => forms.map((form) => ({ route, form })))
    let i = 0
    const worker = async () => {
      for (let job; (job = jobs[i++]);) {
        for (const f of await auditPage(
          browser,
          `${base}${job.route}`,
          job.form,
          !!server,
          served,
          FORMS,
        )) {
          const key = `${f.code} ${f.key}`
          const seen = findings.get(key) ?? { ...f, routes: new Set(), forms: new Set() }
          seen.routes.add(job.route)
          seen.forms.add(job.form)
          findings.set(key, seen)
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(options.concurrency ?? 1, jobs.length) }, worker),
    )
  } finally {
    browser.close()
    server?.close()
  }
  const diagnostics = reportFindings(findings, routes, forms, indexing)
  return {
    ok: !diagnostics.some((d) => d.severity === 'error'),
    base: options.url ?? base,
    pages: routes,
    diagnostics,
    ms: Math.round(performance.now() - t),
  }
}
