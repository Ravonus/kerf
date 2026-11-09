import { freshness } from '../app.mjs'
import { raceOnce } from '../race.mjs'
import { SITE_METRICS, spread } from '../stats.mjs'
import { ttfbPass, htmlPass } from './http.mjs'
import { interactionPass, streamingPass } from './interaction.mjs'
import { mutatePass, navPass } from './passes.mjs'
import { cookieHeader } from './page.mjs'

/**
 * Everything above, per page and sample, written into `out.pages[path].metrics`, and the races into `out.race`. One variant at a
 * time and last in a run: it resets the database and moves the RTT. A reset drops sessions, so each one signs in again.
 */
export async function sitePass({ app, v, site, server, browser, samples, out, say = () => {} }) {
  const { db } = site,
    [low, high] = app.db.rtt,
    got = {},
    push = (path, k, x) => ((got[path] ??= {})[k] ??= []).push(x)
  const fresh = async () => {
    await db.reset()
    await site.login()
    return site.cookies()
  }
  await calibrateRtt({ app, v, db, out })
  const race = {}
  for (let i = 0; i < samples; i++) {
    for (const p of app.pages)
      await measureSitePage({ p, server, site, db, out, push, high, low, v, say, browser, fresh })
    if (app.race) {
      const r = await raceOnce({
        browser,
        url: server.url,
        race: app.race,
        fresh,
        rows: () => db.rows(app.race.state),
      })
      tallyRace(race, r)
    }
  }
  await fresh()
  summarizeSite({ app, v, out, got, race })
  out.db.peakConnections = (await db.proxy.stats()).peak
}

async function calibrateRtt({ app, v, db, out }) {
  const [low, high] = app.db.rtt
  out.db = { name: db.name, pool: app.db.pool, rtt: {} }
  for (const rtt of [high, low]) {
    await db.rtt(rtt)
    const m = (out.db.rtt[rtt] = await db.measureRtt())
    if (Math.abs(m.added - rtt) > Math.max(2, rtt / 2))
      throw new Error(`${v.name}: the proxy added ${m.added.toFixed(1)} ms for a ${rtt} ms RTT`)
  }
}

function tallyRace(race, r) {
  for (const [k, x] of Object.entries(r))
    ((race[k] ??= { passes: 0, of: 0, failures: [] }),
      race[k].of++,
      x.pass ? race[k].passes++ : race[k].failures.push(x.detail))
}

function summarizeSite({ app, v, out, got, race }) {
  for (const p of app.pages) {
    const m = out.pages[p.path].metrics
    for (const k of SITE_METRICS) m[k] = spread(got[p.path]?.[k] ?? [])
    const label = freshness(p, v.name)
    out.pages[p.path].canary = {
      label,
      checked: label === 'live' ? out.pages[p.path].fresh.samples : 0,
    }
  }
  if (app.race)
    out.race = Object.fromEntries(
      Object.entries(race).map(([k, x]) => [k, { ...x, pass: x.passes === x.of }]),
    )
}

async function dbCost({ p, url, cookie, db, out, push }) {
  const get = () =>
    fetch(url, { headers: { cookie: cookie ?? '' }, redirect: 'manual' }).then((r) =>
      r.arrayBuffer(),
    )
  await get()
  const n = await db.counted(async () => {
    for (let j = 0; j < 3; j++) await get()
  })
  out.db.queries = n.source
  push(p.path, 'db.queries', n.queries / 3)
  if (n.rows !== null) push(p.path, 'db.rows', n.rows / 3)
}

async function ttfbMetrics({ p, url, cookie, db, push, high, low, v, say }) {
  const loaded = await ttfbPass(url, { cookie, seconds: 1 })
  // One connection for the slope: at ten, queueing moves TTFB more than the RTT does.
  const near = await ttfbPass(url, { cookie, seconds: 0.5, connections: 1 })
  await db.rtt(high)
  const far = await ttfbPass(url, { cookie, seconds: 0.5, connections: 1 })
  await db.rtt(low)
  for (const k of ['p50', 'p95', 'p99']) push(p.path, `server.ttfb.${k}`, loaded[k])
  push(p.path, 'server.flush.head', loaded.head)
  if (loaded.errors + near.errors + far.errors)
    say(
      `  ${v.name} ${p.path}: ${loaded.errors + near.errors + far.errors} failed requests timing first bytes`,
    )
  if (near.p50 !== null && far.p50 !== null)
    push(p.path, 'db.roundTrips', (far.p50 - near.p50) / (high - low))
}

async function flowMetrics({ p, url, site, db, browser, fresh, push }) {
  if (p.nav) {
    const r = await navPass(browser, url, p.nav, { db, cookies: site.cookies() })
    for (const visit of ['cold', 'second'])
      for (const k of ['url', 'paint', 'data']) push(p.path, `flow.nav.${k}.${visit}`, r[visit][k])
  }
  if (p.streaming)
    push(
      p.path,
      'flow.interaction.streaming',
      await streamingPass(browser, url, p.streaming, { cookies: site.cookies() }),
    )
  if (p.interact) {
    const r = await interactionPass(browser, url, p.interact, { cookies: await fresh() })
    push(p.path, 'flow.interaction.worst', r.worst)
    push(p.path, 'flow.interaction.p75', r.p75)
  }
  if (p.mutate) {
    const r = await mutatePass(browser, url, p.mutate, { cookies: await fresh() })
    for (const k of ['optimistic', 'confirmed', 'requests']) push(p.path, `flow.mutate.${k}`, r[k])
  }
}

async function rowBytes({ p, url, db, fresh, push }) {
  for (const [size, sql] of Object.entries(p.rows ?? {})) {
    const cookies = await fresh()
    await db.sql(sql)
    const r = await htmlPass(url, { cookie: cookieHeader(cookies) })
    for (const part of ['html', 'data'])
      for (const c of ['raw', 'br']) push(p.path, `bytes.${part}.${size}.${c}`, r[part][c])
  }
}

async function measureSitePage(c) {
  const { p, server, site } = c
  const ctx = { ...c, url: server.url + p.path, cookie: cookieHeader(site.cookies(p)) }
  await dbCost(ctx)
  await ttfbMetrics(ctx)
  await flowMetrics(ctx)
  await rowBytes(ctx)
}
