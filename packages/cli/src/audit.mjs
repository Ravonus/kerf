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
import { fileURLToPath } from 'node:url'
import { findChrome } from './browser/client.mjs'
import { diagnostic } from './diag.mjs'

/** The two widths Lighthouse's defaults stand for: its mobile run (a Moto G Power) and its desktop run. */
export const FORMS = {
  phone: { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true },
  desktop: { width: 1350, height: 940, deviceScaleFactor: 1, mobile: false },
}

/**
 * axe-core is what Lighthouse runs for Accessibility and for Agentic Browsing's accessibility tree: the WCAG 2 A and AA
 * rules, and the best-practice ones Lighthouse also grades. `region` (all content in landmarks) Lighthouse leaves out.
 */
const AXE = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  rules: { 'heading-order': { enabled: true }, 'empty-heading': { enabled: true }, 'tabindex': { enabled: true }, 'duplicate-id-aria': { enabled: true }, 'image-redundant-alt': { enabled: true }, 'skip-link': { enabled: true }, 'landmark-one-main': { enabled: true }, 'list': { enabled: true }, 'listitem': { enabled: true }, 'region': { enabled: false } },
  resultTypes: ['violations'],
}
/** What a rule means in a warp app, where warp is how it usually happens. */
const WARP = {
  'heading-order': "warp's titled parts (Accordion, Chart, ActivityFeed) are h3, for a page section under an h2: one placed elsewhere takes `level`, or the place gets the heading it lacks. ",
}

/** axe rules with a code of their own; every other violation is L004, with the rule's id. */
const RULES = {
  ...Object.fromEntries(['button-name', 'link-name', 'input-button-name', 'label', 'select-name', 'aria-command-name', 'aria-input-field-name', 'aria-toggle-field-name', 'aria-progressbar-name', 'aria-meter-name', 'aria-tooltip-name', 'aria-treeitem-name', 'aria-dialog-name', 'frame-title', 'summary-name'].map(r => [r, 'L001'])),
  ...Object.fromEntries(['image-alt', 'role-img-alt', 'svg-img-alt', 'input-image-alt', 'object-alt', 'area-alt'].map(r => [r, 'L002'])),
  'color-contrast': 'L003',
}
let axe
const axeSource = () => (axe ??= readFileSync(fileURLToPath(import.meta.resolve('axe-core/axe.min.js')), 'utf8'))
/** The issue types Lighthouse's `inspector-issues` audit counts (low contrast is axe's, as L003). */
const ISSUES = new Set(['MixedContentIssue', 'CookieIssue', 'BlockedByResponseIssue', 'HeavyAdIssue', 'ContentSecurityPolicyIssue', 'SharedArrayBufferIssue', 'CorsIssue', 'AttributionReportingIssue', 'QuirksModeIssue', 'FederatedAuthRequestIssue', 'BounceTrackingIssue', 'StylesheetLoadingIssue'])

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json' }

const fail = (code, message) => Object.assign(new Error(message), { code })
const sleep = ms => new Promise(r => { setTimeout(r, ms) })

/** The public directory a build wrote: the newer of `.output/public` (server presets) and `dist` (Netlify, Vercel static). */
export function builtPublic(root) {
  const found = ['.output/public', 'dist'].map(d => join(root, d)).filter(d => existsSync(join(d, 'index.html')))
  return found.sort((a, b) => statSync(join(b, 'index.html')).mtimeMs - statSync(join(a, 'index.html')).mtimeMs)[0] ?? null
}

/** Every prerendered page under `dir`, as its URL path. */
export function pagesIn(dir) {
  const out = []
  const walk = d => {
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
    const tries = [path, `${path}/index.html`, `${path.replace(/\/$/, '')}.html`].map(p => resolve(dir, `.${p}`))
    const file = tries.find(f => (f === dir || f.startsWith(dir + sep)) && existsSync(f) && statSync(f).isFile())
    const missing = join(dir, '404.html')
    if (!file) {
      res.writeHead(404, { 'content-type': TYPES['.html'] })
      // a doctype even here: a frame showing this would put Chrome in Quirks Mode, an issue of the audit's own making
      return res.end(existsSync(missing) ? readFileSync(missing) : '<!doctype html><title>Not found</title><p>Not found</p>')
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  return new Promise(ok => { server.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })) })
}

/** A clean headless Chrome (its own empty profile: no extensions, nothing stored) and a DevTools protocol client. As root (a container, CI) Chrome only starts unsandboxed. */
async function chrome(exe) {
  const profile = mkdtempSync(join(tmpdir(), 'weft-audit-'))
  const child = spawn(exe, [`--user-data-dir=${profile}`, '--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--mute-audio', ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' })
  const portFile = join(profile, 'DevToolsActivePort')
  for (let i = 0; !existsSync(portFile) || !readFileSync(portFile, 'utf8').includes('\n'); i++) {
    if (i > 150 || child.exitCode !== null) { child.kill(); throw fail('E_NO_CHROME', `Chrome at ${exe} didn't start`) }
    await sleep(100)
  }
  const [port, path] = readFileSync(portFile, 'utf8').split('\n')
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`)
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(fail('E_CDP', 'could not reach Chrome over the DevTools protocol')) })
  let next = 0
  const waiting = new Map()
  const listeners = new Set()
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id !== undefined) {
      const w = waiting.get(m.id)
      waiting.delete(m.id)
      if (m.error) w?.no(fail('E_CDP', m.error.message))
      else w?.ok(m.result)
    } else for (const on of listeners) on(m)
  }
  const send = (method, params = {}, sessionId) => new Promise((ok, no) => {
    const id = ++next
    waiting.set(id, { ok, no })
    ws.send(JSON.stringify({ id, method, params, sessionId }))
  })
  const close = () => {
    try { ws.close() } catch {}
    child.kill()
    // Chrome holds the profile a moment after it's told to go.
    setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500).unref()
  }
  return { send, on: fn => { listeners.add(fn); return () => listeners.delete(fn) }, close }
}

/** In the page: how far the layout moved without a person asking (CLS, summed), and the first elements that moved. */
const SHIFT = `new Promise(ok => {
  let cls = 0
  const moved = []
  new PerformanceObserver(list => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue
      cls += e.value
      for (const s of e.sources ?? []) {
        if (!s.node || s.node.nodeType !== 1 || moved.length === 3) continue
        const open = s.node.outerHTML.slice(0, s.node.outerHTML.indexOf('>') + 1)
        moved.push(open.length > 120 ? open.slice(0, 117) + '…>' : open)
      }
    }
  }).observe({ type: 'layout-shift', buffered: true })
  setTimeout(() => ok({ cls: Math.round(cls * 1000) / 1000, moved }), 50)
})`

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
      if (e.isDirectory()) { walk(join(at, e.name), name ? `${prefix}/${name}` : prefix); continue }
      if (!/\.[jt]sx?$/.test(e.name) || /\.(server|test|spec)\./.test(e.name) || e.name.startsWith('_')) continue
      const leaf = e.name.replace(/\.[jt]sx?$/, '')
      const path = leaf === 'index' ? prefix : `${prefix}/${leaf}`
      const re = path.split('/').map(seg => (/^\[\.\.\.\w+\]$/.test(seg) ? '\0' : /^\[\w+\]$/.test(seg) ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/').replace(/\/\0/g, '(?:/.+)?')
      tests.push(new RegExp(`^${re || ''}/?$`))
    }
  }
  walk(dir, '')
  return path => tests.some(t => t.test(path))
}

/** In the page: what a crawler reads from the head, and what pokes past a phone's right edge. */
const HEAD = `(() => {
  const meta = n => document.querySelector('meta[name="' + n + '"]')?.getAttribute('content')?.trim() ?? null
  const wide = []
  const edge = innerWidth + 1
  if (document.documentElement.scrollWidth > edge) {
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect()
      if (r.right > edge && r.width > 0 && getComputedStyle(el).position !== 'fixed' && !(el.parentElement && el.parentElement.getBoundingClientRect().right > edge)) {
        const open = el.outerHTML.slice(0, el.outerHTML.indexOf('>') + 1)
        wide.push(open.length > 120 ? open.slice(0, 117) + '…>' : open)
        if (wide.length === 3) break
      }
    }
  }
  return {
    title: document.title.trim(), lang: document.documentElement.getAttribute('lang') ?? '', description: meta('description'),
    viewport: meta('viewport'), robots: meta('robots'), scroll: document.documentElement.scrollWidth - innerWidth, wide,
    icon: !!document.querySelector('link[rel~="icon"]'),
  }
})()`

/** Audit one page in one form factor: what Chrome said while it loaded, its head, its layout, and axe-core's rules. */
async function auditPage(browser, url, form, statics, served) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
  const send = (m, p) => browser.send(m, p, sessionId)
  const found = []
  let document = null
  let loaded
  const load = new Promise(ok => { loaded = ok })
  const where = (u, line) => (u ? `${u.replace(/^https?:\/\/127\.0\.0\.1:\d+/, '')}${line === undefined ? '' : `:${line + 1}`}` : '')
  const off = browser.on(m => {
    if (m.sessionId !== sessionId) return
    const p = m.params
    if (m.method === 'Page.loadEventFired') loaded()
    else if (m.method === 'Network.responseReceived' && p.type === 'Document' && !document) document = p.response
    else if (m.method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails
      found.push({ code: 'L010', key: d.exception?.description?.split('\n')[0] ?? d.text, at: where(d.url, d.lineNumber), text: d.exception?.description?.split('\n')[0] ?? d.text })
    } else if (m.method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'assert')) {
      const text = p.args.map(a => a.value ?? a.description ?? '').join(' ').split('\n')[0]
      const top = p.stackTrace?.callFrames?.[0]
      found.push({ code: 'L010', key: text, at: where(top?.url, top?.lineNumber), text })
    } else if (m.method === 'Log.entryAdded' && p.entry.level === 'error') {
      // a build's pages served as files have no server: its realtime and function routes answer 404 here and nowhere else
      if (statics && /\/_weft\/(rt|ws|fn|data|m|x)\b/.test(`${p.entry.url ?? ''} ${p.entry.text}`)) return
      if (statics && p.entry.url && /status of 404/.test(p.entry.text) && served(new URL(p.entry.url).pathname)) return
      // the favicon: Chrome asks for it lazily, once a session, so the head probe asks instead (below)
      if ((p.entry.url ?? '').endsWith('/favicon.ico')) return
      found.push({ code: 'L011', key: `${p.entry.url ?? ''} ${p.entry.text}`, at: where(p.entry.url), text: p.entry.text })
    } else if (m.method === 'Audits.issueAdded') {
      const { code, details } = p.issue
      if (code === 'DeprecationIssue') {
        const d = details.deprecationIssueDetails
        found.push({ code: 'L012', key: d.type, at: where(d.sourceCodeLocation?.url, d.sourceCodeLocation?.lineNumber), text: d.type })
      } else if (ISSUES.has(code)) found.push({ code: 'L013', key: code, text: code.replace(/Issue$/, '').replace(/([a-z])([A-Z])/g, '$1 $2') })
    }
  })
  try {
    const f = FORMS[form]
    await Promise.all(['Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable', 'Audits.enable'].map(m => send(m)))
    await send('Emulation.setDeviceMetricsOverride', { width: f.width, height: f.height, deviceScaleFactor: f.deviceScaleFactor, mobile: f.mobile })
    await send('Emulation.setTouchEmulationEnabled', { enabled: f.mobile, maxTouchPoints: f.mobile ? 5 : 1 })
    await send('Page.navigate', { url })
    await Promise.race([load, sleep(15_000)])
    await sleep(800) // hydration's errors, and a font swap's shift, land after load
    if (document && document.status >= 400) found.push({ code: 'L025', key: String(document.status), text: `HTTP ${document.status}` })
    const header = Object.entries(document?.headers ?? {}).find(([k]) => k.toLowerCase() === 'x-robots-tag')?.[1]
    const head = (await send('Runtime.evaluate', { expression: HEAD, returnByValue: true })).result.value
    if (!head.icon) {
      const status = (await send('Runtime.evaluate', { expression: `fetch('/favicon.ico', { method: 'HEAD' }).then(r => r.status, () => 0)`, awaitPromise: true, returnByValue: true })).result.value
      if (status >= 400) found.push({ code: 'L011', key: 'favicon', at: '/favicon.ico', text: `HTTP ${status}` })
    }
    if (!head.title) found.push({ code: 'L020', key: 'title' })
    if (!head.description) found.push({ code: 'L021', key: 'description' })
    if (!head.lang) found.push({ code: 'L022', key: 'lang' })
    if (!head.viewport || !/width=device-width/.test(head.viewport)) found.push({ code: 'L023', key: 'viewport' })
    const noindex = [header && /noindex|none/i.test(header) && `the \`x-robots-tag: ${header}\` header`, head.robots && /noindex|none/i.test(head.robots) && `<meta name="robots" content="${head.robots}">`].filter(Boolean)
    if (noindex.length) found.push({ code: 'L024', key: noindex.join(), text: noindex.join(' and '), header: !!header })
    if (f.mobile && head.scroll > 0) found.push({ code: 'L030', key: head.wide.join() || 'page', text: `${head.scroll}px`, wide: head.wide })
    const shift = (await send('Runtime.evaluate', { expression: SHIFT, awaitPromise: true, returnByValue: true })).result.value
    if (shift.cls > 0.05) found.push({ code: 'L031', key: shift.moved.join() || 'page', cls: shift.cls, moved: shift.moved })
    await send('Runtime.evaluate', { expression: axeSource() })
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression: `axe.run(document, ${JSON.stringify(AXE)}).then(r => r.violations)`, awaitPromise: true, returnByValue: true })
    if (exceptionDetails) throw fail('E_AUDIT', `axe-core failed on ${url}: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`)
    for (const v of result.value) {
      for (const n of v.nodes) {
        const tag = n.html.slice(0, n.html.indexOf('>') + 1)
        found.push({ code: RULES[v.id] ?? 'L004', key: `${v.id} ${n.target.join(' ')}`, rule: v.id, help: v.help, fix: n.failureSummary?.replace(/^Fix (any|all) of the following:\s*/, '').split('\n')[0].trim(), selector: n.target.join(' '), tag: tag.length > 160 ? `${tag.slice(0, 157)}…>` : tag, contrast: v.id === 'color-contrast' ? n.any[0]?.data : undefined })
      }
    }
    return found
  } finally {
    off()
    await browser.send('Target.closeTarget', { targetId }).catch(() => {})
  }
}

const say = {
  L001: f => `${f.tag} (\`${f.selector}\`) has no accessible name (${f.rule}): a screen reader announces only its role. When the source has text, CSS hid it at this width.`,
  L002: f => `${f.tag} (\`${f.selector}\`) is an image with no text alternative (${f.rule}): a screen reader reads its file name.`,
  L003: f => `${f.tag} (\`${f.selector}\`): ${f.contrast ? `${f.contrast.fgColor} on ${f.contrast.bgColor} is ${f.contrast.contrastRatio}:1 at ${f.contrast.fontSize}, under ${f.contrast.expectedContrastRatio}` : 'its text contrast is too low'}.`,
  L004: f => `${f.tag} (\`${f.selector}\`): ${f.help} (axe \`${f.rule}\`).`,
  L031: f => `The layout moved by ${f.cls} (CLS) while the page loaded, with no one touching it${f.moved.length ? `: ${f.moved.join(', ')} moved` : ''}. Over 0.1 costs Lighthouse's Performance score.`,
  L010: f => `Console error${f.at ? ` at ${f.at}` : ''}: ${f.text}`,
  L011: f => (f.at === '/favicon.ico' ? 'The page names no icon, so the browser asked for /favicon.ico and got a 404: Lighthouse counts it as a console error. Add `<link rel="icon">` through `site.head`, or a `public/favicon.ico`.' : `The browser logged an error${f.at ? ` for ${f.at}` : ''}: ${f.text}`),
  L012: f => `A deprecated browser API is in use${f.at ? ` at ${f.at}` : ''}: ${f.text}. Lighthouse marks Best Practices down for it.`,
  L013: f => `Chrome logged a ${f.text} issue for the page. Lighthouse marks Best Practices down for it.`,
  L020: () => 'The page has no `<title>`: search results and tabs show its URL.',
  L021: () => 'The page has no meta description: search results make one up from the page.',
  L022: () => '`<html>` has no `lang`: screen readers guess the language, and translation offers go wrong.',
  L023: () => 'No `<meta name="viewport" content="width=device-width, initial-scale=1">`: a phone renders the page at 980px and shrinks it.',
  L024: f => `Search engines are told not to index this page, by ${f.text}.${f.header ? ' Hosts add this header to preview and permalink URLs (Netlify, Vercel): on the production URL it is gone.' : ''}`,
  L025: f => `The page answered ${f.text}.`,
  L030: f => `The page scrolls sideways on a phone: it is ${f.text} wider than the screen.${f.wide?.length ? ` Past the edge: ${f.wide.join(', ')}` : ''}`,
}
/** A page may ask not to be indexed, and a host's preview URL does on its behalf: L024 says so without failing. */
const SEVERITY = { L021: 'warning', L024: 'warning', L030: 'warning', L031: 'warning' }

/**
 * @param {string} root project root
 * @param {{ url?: string, dir?: string, routes?: string[], all?: boolean, max?: number, forms?: (keyof FORMS)[], concurrency?: number }} [options]
 *   `url`: audit a running site (a deploy, `weft start`); else `dir`, a build's public directory (found when left out)
 * @returns {Promise<{ ok: boolean, skipped?: string, base: string, pages: string[], diagnostics: object[], ms: number }>}
 */
export async function audit(root, options = {}) {
  const t = performance.now()
  const exe = findChrome()
  const forms = options.forms ?? ['phone', 'desktop']
  const skip = why => ({ ok: true, skipped: why, base: options.url ?? '', pages: [], diagnostics: [diagnostic({ code: 'L000', severity: 'warning', file: 'weft.config.ts', why })], ms: 0 })
  if (!exe) return skip('No Chrome or Chromium here, so the built pages were not audited (L001–L030). Set `WEFT_CHROME`, or run `weft audit --url <deploy>` where there is one.')
  let base = options.url?.replace(/\/$/, '')
  let server
  let routes = options.routes
  if (!base) {
    const dir = options.dir ?? builtPublic(root)
    if (!dir) return skip('No built pages to audit: run `weft build` first, or pass `--url`.')
    const pages = pagesIn(dir)
    if (!pages.length) return skip(`No prerendered pages in ${relative(root, dir)} to audit: pass \`--url\` to audit a running server.`)
    routes ??= options.all ? pages : samplePages(pages, options.max)
    server = await serveStatic(dir)
    base = server.url
  }
  routes ??= ['/']
  const served = appRoutes(root)
  const browser = await chrome(exe)
  const findings = new Map()
  try {
    const jobs = routes.flatMap(route => forms.map(form => ({ route, form })))
    let i = 0
    const worker = async () => {
      for (let job; (job = jobs[i++]);) {
        for (const f of await auditPage(browser, `${base}${job.route}`, job.form, !!server, served)) {
          const key = `${f.code} ${f.key}`
          const seen = findings.get(key) ?? { ...f, routes: new Set(), forms: new Set() }
          seen.routes.add(job.route)
          seen.forms.add(job.form)
          findings.set(key, seen)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 4, jobs.length) }, worker))
  } finally {
    browser.close()
    server?.close()
  }
  const diagnostics = [...findings.values()].map(f => {
    const pages = routes.filter(r => f.routes.has(r))
    const on = `${forms.filter(x => f.forms.has(x)).join(' and ')}, ${pages.length === 1 ? pages[0] : `${pages.length} pages (${pages.slice(0, 3).join(', ')}${pages.length > 3 ? ', …' : ''})`}`
    const severity = f.code === 'L031' && f.cls > 0.1 ? 'error' : SEVERITY[f.code] ?? 'error'
    // an axe rule outside L001–L003 carries its own fix: the rule's first remedy, and its page
    const help = f.code === 'L004' ? `${f.fix ? `${f.fix}. ` : ''}${WARP[f.rule] ?? ''}The rule: https://dequeuniversity.com/rules/axe/4.14/${f.rule}` : undefined
    return diagnostic({ code: f.code, severity, file: pages[0], why: `${say[f.code](f)} (${on})`, help })
  }).sort((a, b) => (a.severity === b.severity ? a.code.localeCompare(b.code) : a.severity === 'error' ? -1 : 1))
  return { ok: !diagnostics.some(d => d.severity === 'error'), base: options.url ?? base, pages: routes, diagnostics, ms: Math.round(performance.now() - t) }
}
