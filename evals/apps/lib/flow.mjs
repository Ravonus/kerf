// What a database-driven site adds to a sample: is the data live, what a request cost the database, and how flows feel from a real
// click. Input goes through CDP (`Input.dispatchMouseEvent`), so it's trusted, unlike the `dispatchEvent` in measure.mjs.
import { randomBytes } from 'node:crypto'
import http from 'node:http'
import { brotliCompressSync, constants } from 'node:zlib'
import { freshness } from './app.mjs'
import { raceOnce } from './race.mjs'
import { SITE_METRICS, median, spread } from './stats.mjs'
import { benchUser } from '../shared/pg/env.mjs'

const sleep = ms => new Promise(r => setTimeout(r, ms))
export const cookieHeader = cookies => (cookies?.length ? cookies.map(c => `${c.name}=${c.value}`).join('; ') : undefined)
export const randomValue = () => `v${randomBytes(5).toString('hex')}`
const fill = (sql, value) => sql.replaceAll('$1', `'${value}'`)

/** "role:name", or a bare role. Exact names, because that's what the contract gives every stack. */
export function target(page, spec) {
  const i = spec.indexOf(':')
  return i < 0 ? page.getByRole(spec) : page.getByRole(spec.slice(0, i), { name: spec.slice(i + 1), exact: true })
}

async function centre(locator) {
  await locator.scrollIntoViewIfNeeded()
  const b = await locator.boundingBox()
  if (!b) throw new Error(`nothing to click: ${locator}`)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

export async function press(cdp, { x, y }) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}

export async function trustedClick(cdp, locator) {
  const at = await centre(locator)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y })
  await press(cdp, at)
  return at
}
export { centre }

const settled = page => page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})

/** Signs in through the page's own form, roles only, so the cookie is whatever that stack really sets. */
export async function signIn(browser, url, login, user = benchUser) {
  const ctx = await browser.newContext(), page = await ctx.newPage()
  await page.goto(url + login.path); await settled(page)
  await page.getByRole('textbox', { name: login.email, exact: true }).fill(user.email)
  await page.getByRole('textbox', { name: login.password, exact: true }).fill(user.password)
  await page.getByRole('button', { name: login.submit, exact: true }).click()
  await page.waitForURL(u => !u.pathname.startsWith(login.path), { timeout: 15000 })
  const cookies = await ctx.cookies()
  await ctx.close()
  return cookies
}

/** Requests the page has open, and when it last finished one. Streams that never end aren't data. */
export function tracker(page) {
  const open = new Set(), t = { sent: 0, last: 0 }
  const counts = r => !['script', 'stylesheet', 'image', 'font', 'media', 'websocket', 'eventsource'].includes(r.resourceType())
  page.on('request', r => { if (counts(r)) { open.add(r); t.sent++ } })
  const done = r => { if (open.delete(r)) t.last = Date.now() }
  page.on('requestfinished', done); page.on('requestfailed', done)
  /** Until nothing has been open for `ms`, at most `max`. */
  t.quiet = async (ms = 400, max = 8000) => {
    const end = Date.now() + max
    let calm = Date.now()
    while (Date.now() < end) {
      if (open.size) calm = Date.now()
      else if (Date.now() - calm >= ms) return true
      await sleep(25)
    }
    return false
  }
  return t
}

/** Writes a value into a row the page shows, and the page has to show it, or it wasn't read for this sample. */
export async function canaryPass(browser, url, canary, { db, cookies = [] }) {
  const value = randomValue()
  await db.sql(fill(canary.sql, value))
  const ctx = await browser.newContext()
  await ctx.addCookies(cookies)
  const page = await ctx.newPage()
  try {
    await page.goto(url)
    await page.getByText(value).first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => { throw new Error(`CANARY: ${url} doesn't show the value just written, so it wasn't read for this sample. If that's by design, label the page "freshness": "cached".`) })
  } finally { await ctx.close() }
  return true
}

/** Time to first byte and to the `</head>` byte, closed loop. Uncompressed: a compressed stream hides where the byte is. */
export function ttfbPass(url, { connections = 10, seconds = 2, cookie } = {}) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: connections }), { hostname, port, pathname, search } = new URL(url)
  const first = [], head = [], end = performance.now() + seconds * 1000
  let bad = 0
  const one = () => new Promise(ok => {
    if (performance.now() > end) return ok()
    const t = performance.now()
    let tail = '', seen = false
    http.get({ agent, hostname, port, path: pathname + search, headers: { 'accept-encoding': 'identity', accept: 'text/html', ...(cookie && { cookie }) } }, r => {
      first.push(performance.now() - t)
      r.setEncoding('latin1')
      r.on('data', d => { if (!seen && (tail + d).includes('</head>')) { seen = true; head.push(performance.now() - t) } tail = d.slice(-6) })
      r.on('end', () => { if (r.statusCode >= 400) bad++; ok(one()) })
    }).on('error', () => { bad++; ok(one()) })
  })
  return Promise.all(Array.from({ length: connections }, one)).then(() => {
    agent.destroy()
    first.sort((a, b) => a - b)
    const at = p => first[Math.min(first.length - 1, Math.floor(first.length * p))] ?? null
    return { p50: at(0.5), p95: at(0.95), p99: at(0.99), head: head.length ? median(head) : null, errors: bad }
  })
}

const br = s => brotliCompressSync(Buffer.from(s), { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length

/** A page's HTML in two: embedded data, being every inline script's body, and the markup around it. */
export function splitHtml(html) {
  let data = ''
  const markup = html.replace(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, (_, body) => { data += body; return '' })
  return { html: { raw: Buffer.byteLength(markup), br: br(markup) }, data: { raw: Buffer.byteLength(data), br: data ? br(data) : 0 } }
}

export async function htmlPass(url, { cookie } = {}) {
  const r = await fetch(url, { headers: { 'accept-encoding': 'identity', ...(cookie && { cookie }) } })
  return splitHtml(await r.text())
}

// Installed in every document, so a hard navigation is timed the same as a soft one. Date.now because a hard one has a new clock.
const WATCH = ({ url, see }) => {
  const f = window.__flow = { url: null, paint: null, data: null, mutated: false, rearm() { f.url = f.paint = f.data = null; f.mutated = false } }
  new MutationObserver(() => { f.mutated = true }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true })
  const after = fn => { const c = new MessageChannel(); c.port1.onmessage = fn; c.port2.postMessage(0) }
  const tick = () => {
    requestAnimationFrame(tick)
    if (f.url === null && location.href.includes(url)) f.url = Date.now()
    if (f.paint === null && f.mutated) after(() => { if (f.mutated) f.paint ??= Date.now() })
    if (f.url !== null && f.data === null && see && document.body?.innerText.includes(see)) f.data = Date.now()
  }
  requestAnimationFrame(tick)
}

const marks = async (page, t0) => {
  await page.waitForFunction(() => window.__flow.url !== null && window.__flow.paint !== null, null, { timeout: 10000 }).catch(() => {})
  await page.waitForFunction(() => window.__flow.data !== null, null, { timeout: 10000 }).catch(() => {})
  const f = await page.evaluate(() => { const { url, paint, data } = window.__flow; return { url, paint, data } })
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === null ? null : v - t0]))
}

async function browserPage(browser, cookies, init, cpu = 1) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await ctx.addCookies(cookies)
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page)
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
  for (const [fn, arg] of init) await page.addInitScript(fn, arg)
  return { ctx, page, cdp }
}

/** `nav`: a real click to the URL changing, first new paint and the named text: cold, then again after going back. */
export async function navPass(browser, url, nav, { db, cookies = [] }) {
  const see = nav.canary ? randomValue() : nav.see
  if (nav.canary) await db.sql(fill(nav.canary, see))
  const { ctx, page, cdp } = await browserPage(browser, cookies, [[WATCH, { url: nav.url, see }]])
  try {
    const go = async () => {
      await settled(page)
      const link = target(page, nav.click), at = await centre(link)
      // Last before the click: a fade or a late swap from the visit before writes to the DOM, and it isn't this click's paint.
      await page.evaluate(() => window.__flow.rearm())
      const t0 = Date.now()
      await press(cdp, at)
      return marks(page, t0)
    }
    await page.goto(url)
    const cold = await go()
    await page.goBack()
    return { cold, second: await go() }
  } finally { await ctx.close() }
}

const EVENTS = () => {
  window.__events = new Map()
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.interactionId) window.__events.set(e.interactionId, Math.max(window.__events.get(e.interactionId) ?? 0, e.duration)) }).observe({ type: 'event', durationThreshold: 16, buffered: true })
}

/** `interact`: real clicks at 4x CPU, by Event Timing. It reports nothing under 16 ms, so a click it didn't report counts as 8. Not INP: nobody's field data. */
export async function interactionPass(browser, url, targets, { cookies = [] }) {
  const { ctx, page, cdp } = await browserPage(browser, cookies, [[EVENTS]], 4)
  try {
    await page.goto(url); await settled(page)
    for (const t of targets) { await trustedClick(cdp, target(page, t)); await sleep(250) }
    await sleep(300)
    const seen = await page.evaluate(() => [...window.__events.values()])
    const all = [...seen, ...Array(Math.max(0, targets.length - seen.length)).fill(8)].sort((a, b) => a - b)
    return { worst: all.at(-1), p75: all[Math.min(all.length - 1, Math.floor(all.length * 0.75))] }
  } finally { await ctx.close() }
}

/** `streaming`: from navigation start, 4x CPU, the first click on the control that changes its status, while the rest still streams. */
export async function streamingPass(browser, url, { click, status }, { cookies = [] }) {
  const { ctx, page, cdp } = await browserPage(browser, cookies, [], 4)
  try {
    const t0 = Date.now(), button = target(page, click), shown = page.getByRole('status').filter({ hasText: status })
    await page.goto(url, { waitUntil: 'commit' })
    let before = null
    while (Date.now() - t0 < 10000) {
      if (await button.count() && await shown.count()) {
        before ??= await shown.textContent()
        await trustedClick(cdp, button)
        await sleep(30)
        if ((await shown.textContent()) !== before) return Date.now() - t0
      } else await sleep(10)
    }
    return null
  } finally { await ctx.close() }
}

/** `mutate`: input to the DOM showing it (optimistic, if it beats the reply), to the last reply done (confirmed), and requests it took. */
export async function mutatePass(browser, url, mutate, { cookies = [] }) {
  const value = randomValue(), put = s => s.replaceAll('$value', value), see = put(mutate.see)
  const { ctx, page, cdp } = await browserPage(browser, cookies, [[WATCH, { url: '', see }]])
  try {
    await page.goto(url); await settled(page)
    for (const [field, text] of Object.entries(mutate.fill ?? {})) await target(page, field).fill(put(text))
    const button = target(page, mutate.click), at = await centre(button), t = tracker(page)
    await page.evaluate(() => window.__flow.rearm())
    const t0 = Date.now()
    await press(cdp, at)
    await page.waitForFunction(() => window.__flow.data !== null, null, { timeout: 10000 })
    const shown = await page.evaluate(() => window.__flow.data)
    await t.quiet()
    return { optimistic: shown - t0, confirmed: Math.max(shown, t.last) - t0, requests: t.sent }
  } finally { await ctx.close() }
}

/**
 * Everything above, per page and sample, written into `out.pages[path].metrics`, and the races into `out.race`. One variant at a
 * time and last in a run: it resets the database and moves the RTT. A reset drops sessions, so each one signs in again.
 */
export async function sitePass({ app, v, site, server, browser, samples, out, say = () => {} }) {
  const { db } = site, [low, high] = app.db.rtt, got = {}, push = (path, k, x) => ((got[path] ??= {})[k] ??= []).push(x)
  const fresh = async () => { await db.reset(); await site.login(); return site.cookies() }
  out.db = { name: db.name, pool: app.db.pool, rtt: {} }
  for (const rtt of [high, low]) {
    await db.rtt(rtt)
    const m = out.db.rtt[rtt] = await db.measureRtt()
    if (Math.abs(m.added - rtt) > Math.max(2, rtt / 2)) throw new Error(`${v.name}: the proxy added ${m.added.toFixed(1)} ms for a ${rtt} ms RTT`)
  }
  const race = {}
  for (let i = 0; i < samples; i++) {
    for (const p of app.pages) {
      const url = server.url + p.path, cookie = cookieHeader(site.cookies(p)), get = () => fetch(url, { headers: { cookie: cookie ?? '' }, redirect: 'manual' }).then(r => r.arrayBuffer())
      await get()
      const n = await db.counted(async () => { for (let j = 0; j < 3; j++) await get() })
      out.db.queries = n.source
      push(p.path, 'db.queries', n.queries / 3); if (n.rows !== null) push(p.path, 'db.rows', n.rows / 3)
      const loaded = await ttfbPass(url, { cookie, seconds: 1 })
      // One connection for the slope: at ten, queueing moves TTFB more than the RTT does.
      const near = await ttfbPass(url, { cookie, seconds: 0.5, connections: 1 })
      await db.rtt(high)
      const far = await ttfbPass(url, { cookie, seconds: 0.5, connections: 1 })
      await db.rtt(low)
      for (const k of ['p50', 'p95', 'p99']) push(p.path, `server.ttfb.${k}`, loaded[k])
      push(p.path, 'server.flush.head', loaded.head)
      if (loaded.errors + near.errors + far.errors) say(`  ${v.name} ${p.path}: ${loaded.errors + near.errors + far.errors} failed requests timing first bytes`)
      if (near.p50 !== null && far.p50 !== null) push(p.path, 'db.roundTrips', (far.p50 - near.p50) / (high - low))
      if (p.nav) {
        const r = await navPass(browser, url, p.nav, { db, cookies: site.cookies() })
        for (const visit of ['cold', 'second']) for (const k of ['url', 'paint', 'data']) push(p.path, `flow.nav.${k}.${visit}`, r[visit][k])
      }
      if (p.streaming) push(p.path, 'flow.interaction.streaming', await streamingPass(browser, url, p.streaming, { cookies: site.cookies() }))
      if (p.interact) {
        const r = await interactionPass(browser, url, p.interact, { cookies: await fresh() })
        push(p.path, 'flow.interaction.worst', r.worst); push(p.path, 'flow.interaction.p75', r.p75)
      }
      if (p.mutate) {
        const r = await mutatePass(browser, url, p.mutate, { cookies: await fresh() })
        for (const k of ['optimistic', 'confirmed', 'requests']) push(p.path, `flow.mutate.${k}`, r[k])
      }
      for (const [size, sql] of Object.entries(p.rows ?? {})) {
        const cookies = await fresh()
        await db.sql(sql)
        const r = await htmlPass(url, { cookie: cookieHeader(cookies) })
        for (const part of ['html', 'data']) for (const c of ['raw', 'br']) push(p.path, `bytes.${part}.${size}.${c}`, r[part][c])
      }
    }
    if (app.race) {
      const r = await raceOnce({ browser, url: server.url, race: app.race, fresh, rows: () => db.rows(app.race.state) })
      for (const [k, x] of Object.entries(r)) ((race[k] ??= { passes: 0, of: 0, failures: [] }), race[k].of++, x.pass ? race[k].passes++ : race[k].failures.push(x.detail))
    }
  }
  await fresh()
  for (const p of app.pages) {
    const m = out.pages[p.path].metrics
    for (const k of SITE_METRICS) m[k] = spread(got[p.path]?.[k] ?? [])
    const label = freshness(p, v.name)
    out.pages[p.path].canary = { label, checked: label === 'live' ? out.pages[p.path].fresh.samples : 0 }
  }
  if (app.race) out.race = Object.fromEntries(Object.entries(race).map(([k, x]) => [k, { ...x, pass: x.passes === x.of }]))
  out.db.peakConnections = (await db.proxy.stats()).peak
}
