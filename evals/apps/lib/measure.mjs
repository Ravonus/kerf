// One sample of each thing bench.mjs medians: a Lighthouse run, a browser pass and a short load.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import http from 'node:http'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

export const launchBrowser = () => chromium.launch()
export const chromePath = () => chromium.executablePath()

const pathOf = u => { try { const p = new URL(u); return p.pathname + p.search } catch { return u } }

// Lighthouse keeps global state (its performance marks), so runs that overlap each get a process.
const LIGHTHOUSE = fileURLToPath(new URL('lighthouse-run.mjs', import.meta.url))
const once = args => new Promise((ok, no) => execFile(process.execPath, [LIGHTHOUSE, JSON.stringify(args)], { maxBuffer: 1 << 26 }, (e, out, err) => (e ? no(new Error(String(err).slice(-400) || e.message)) : ok(JSON.parse(out)))))

/** Chrome occasionally drops the connection on a busy machine: that's a lost sample, not a result, so take it again. */
async function retried(args) {
  for (let i = 1; ; i++) {
    try { return await once(args) } catch (e) { if (i === 3) throw e }
  }
}
export const lighthouseRun = (url, formFactor, keepTo) => retried({ url, formFactor, keepTo, chrome: chromePath() })
/** Mobile Lighthouse with the network and CPU really slowed, so LCP and its phases come from one trace of one load. */
export const lighthouseThrottled = url => retried({ url, real: true, chrome: chromePath() })

const br = b => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
const sizeCache = new Map()
function sizesOf(buf) {
  const h = createHash('sha1').update(buf).digest('hex')
  if (!sizeCache.has(h)) sizeCache.set(h, { raw: buf.length, br: br(buf), gz: gzipSync(buf, { level: 9 }).length })
  return sizeCache.get(h)
}
const kind = (type, url) => /javascript|ecmascript/.test(type) || /\.m?js(\?|$)/.test(url) ? 'js' : /css/.test(type) || /\.css(\?|$)/.test(url) ? 'css' : /html/.test(type) ? 'html' : /font/.test(type) || /\.(woff2?|ttf|otf)(\?|$)/.test(url) ? 'font' : /image/.test(type) ? 'img' : 'other'

/** Bytes a V8 block-coverage entry didn't run. Ranges nest, outermost first, so later ones overwrite. */
function unusedJs(entry) {
  const len = entry.source?.length ?? 0, seen = new Uint8Array(len).fill(1)
  for (const fn of entry.functions) for (const r of fn.ranges) seen.fill(r.count ? 1 : 0, r.startOffset, r.endOffset)
  return { size: len, unused: seen.reduce((n, x) => n + (x ? 0 : 1), 0) }
}

/** Fresh context, no throttle: what crossed the wire, sized the same way for everyone, and what of it ran. */
export async function bytesPass(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 823 } }), page = await ctx.newPage()
  const seen = [], origin = new URL(url).origin, wait = []
  page.on('response', r => wait.push((async () => {
    if (r.status() >= 300 || r.url().startsWith('data:')) return
    const body = await r.body().catch(() => null), sizes = await r.request().sizes().catch(() => null)
    if (!body) return
    seen.push({ url: r.url(), local: r.url().startsWith(origin), type: kind(r.headers()['content-type'] ?? '', r.url()), wire: sizes?.responseBodySize ?? null, encoding: r.headers()['content-encoding'] ?? 'none', ...sizesOf(body) })
  })()))
  await page.coverage.startJSCoverage({ resetOnNavigation: false }); await page.coverage.startCSSCoverage({ resetOnNavigation: false })
  await page.goto(url, { waitUntil: 'load' }); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(300)
  const js = await page.coverage.stopJSCoverage(), css = await page.coverage.stopCSSCoverage()
  await Promise.all(wait)
  const unused = new Map()
  for (const e of js) { const u = unusedJs(e), a = unused.get(e.url) ?? { size: 0, unused: 0 }; a.size += u.size; a.unused += u.unused; unused.set(e.url, a) }
  for (const e of css) { const used = e.ranges.reduce((n, r) => n + r.end - r.start, 0), size = e.text?.length ?? 0; unused.set(e.url, { size, unused: Math.max(0, size - used) }) }
  await ctx.close()
  const totals = { js: { raw: 0, br: 0, gz: 0 }, css: { raw: 0, br: 0, gz: 0 }, html: { raw: 0, br: 0, gz: 0 }, font: { raw: 0, br: 0, gz: 0 }, img: { raw: 0, br: 0, gz: 0 }, other: { raw: 0, br: 0, gz: 0 } }
  for (const r of seen) for (const k of ['raw', 'br', 'gz']) totals[r.type][k] += r[k]
  const waste = t => seen.filter(r => r.type === t).reduce((n, r) => { const u = unused.get(r.url); return n + (u?.size ? r.br * u.unused / u.size : 0) }, 0)
  const top = seen.map(r => ({ path: pathOf(r.url), type: r.type, br: r.br, gz: r.gz, raw: r.raw, wire: r.wire, encoding: r.encoding, unusedPct: unused.get(r.url)?.size ? Math.round(100 * unused.get(r.url).unused / unused.get(r.url).size) : null })).sort((a, b) => b.br - a.br)
  return { totals, unusedBr: { js: waste('js'), css: waste('css') }, top, assets: seen.filter(r => r.local && (r.type === 'js' || r.type === 'css') && !/\/[^.]*$/.test(pathOf(r.url))).map(r => pathOf(r.url)), thirdParty: seen.filter(r => !r.local).reduce((n, r) => n + r.br, 0) }
}

// Installed before any page script. Clicks the probe element every frame until the watched markup answers: the first moment
// a visitor's tap would have worked, the same way for every framework. Pages with no probe report when long tasks stopped.
const PROBE = ({ click, watch }) => {
  window.__bench = { hydrated: null, tasks: 0 }
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__bench.tasks = Math.max(window.__bench.tasks, e.startTime + e.duration) }).observe({ type: 'longtask', buffered: true }) } catch {}
  if (!click) return
  const tick = () => {
    const el = document.querySelector(click), w = document.querySelector(watch ?? click)
    if (!el || !w) return requestAnimationFrame(tick)
    const before = w.outerHTML
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    requestAnimationFrame(() => {
      if (w.isConnected && w.outerHTML === before) return tick()
      window.__bench.hydrated = performance.now()
    })
  }
  requestAnimationFrame(tick)
}

/** 4x CPU throttle on a phone-sized context: time until interactive, main-thread script, and what's left in memory. */
export async function hydrationPass(browser, url, probe) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 823 }, isMobile: true, hasTouch: true }), page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page), errors = []
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)))
  await cdp.send('Performance.enable'); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.addInitScript(PROBE, probe ?? {})
  await page.goto(url, { waitUntil: 'load' })
  if (probe?.click) await page.waitForFunction(() => window.__bench.hydrated !== null, null, { timeout: 15000 }).catch(() => {})
  await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(500)
  const b = await page.evaluate(() => {
    const w = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT), c = { 1: 0, 3: 0, 8: 0 }
    while (w.nextNode()) c[w.currentNode.nodeType]++
    return { ...window.__bench, dcl: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd, elements: c[1], text: c[3], comments: c[8] }
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await cdp.send('HeapProfiler.collectGarbage')
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]))
  await ctx.close()
  const method = probe?.click ? (b.hydrated === null ? 'probe-failed' : 'probe') : 'long-tasks'
  return { hydrate: b.hydrated ?? Math.max(b.tasks, b.dcl ?? 0), method, script: m.ScriptDuration * 1000, heap: m.JSHeapUsedSize / 1048576, nodes: m.Nodes, elements: b.elements, text: b.text, comments: b.comments, errors }
}

/** `connections` keep-alive clients as fast as the server answers, for `seconds`, reading whole bodies. */
export function loadPass(url, { connections = 10, seconds = 3, encoding = 'br, gzip' } = {}) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: connections }), { hostname, port, pathname, search } = new URL(url)
  const lat = [], end = performance.now() + seconds * 1000
  let bad = 0, bytes = 0, served = 'none'
  const one = () => new Promise(ok => {
    if (performance.now() > end) return ok()
    const t = performance.now()
    http.get({ agent, hostname, port, path: pathname + search, headers: { 'accept-encoding': encoding, accept: 'text/html' } }, r => {
      served = r.headers['content-encoding'] ?? 'none'
      r.on('data', d => (bytes += d.length))
      r.on('end', () => { lat.push(performance.now() - t); if (r.statusCode >= 400) bad++; ok(one()) })
    }).on('error', () => { bad++; ok(one()) })
  })
  return Promise.all(Array.from({ length: connections }, one)).then(() => {
    agent.destroy()
    lat.sort((a, b) => a - b)
    return { rps: lat.length / seconds, p50: lat[lat.length >> 1], p95: lat[Math.floor(lat.length * 0.95)], errors: bad, bytes, served }
  })
}
