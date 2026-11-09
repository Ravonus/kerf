import { sleep } from '../../scripts/lib/helpers.mjs'
// race.*: does the page end up telling the truth? Each probe resets the database, drives a real browser, holds or shuffles the
// replies with Playwright route interception (the server does the work in order; only the answers are late), and then compares
// the list on screen with Postgres. Pass or fail, nothing else, and a fail outranks any millisecond (rule 7).
import { tracker } from './flow/tracker.mjs'
import { PROBES } from './race/probes.mjs'

/** Checkbox rows of the list, by accessible name and state, from the accessibility tree: the same in every stack's markup. */
export function parseList(yaml) {
  return [...yaml.matchAll(/- checkbox "((?:[^"\\]|\\.)*)"([^\n]*)/g)].map((m) => ({
    title: m[1].replace(/\\(.)/g, '$1'),
    done: /\[checked\]/.test(m[2]),
  }))
}

/** null when equal, or what differs: rows only on screen, only in the database, or with another state. */
export function mismatch(dom, db) {
  const key = (r) => `${r.done ? '[x]' : '[ ]'} ${r.title}`,
    a = dom.map(key).sort(),
    b = db.map(key).sort()
  if (a.join('\n') === b.join('\n')) return null
  const only = (x, y) => {
    const left = [...y]
    return x.filter((k) => {
      const i = left.indexOf(k)
      if (i < 0) return true
      left.splice(i, 1)
      return false
    })
  }
  return {
    screen: only(a, b).slice(0, 5),
    database: only(b, a).slice(0, 5),
    rows: [a.length, b.length],
  }
}

const readList = (page, race) =>
  page
    .getByRole('list', { name: race.list, exact: true })
    .ariaSnapshot({ timeout: 3000 })
    .then(parseList, () => [])

/** Replies per rule: reads and writes each pass, fail, or wait `delay(n)` ms after the server has answered. */
async function intercept(page) {
  const rules = { reads: null, writes: null, sent: 0 }
  await page.route('**/*', async (route) => {
    const r = route.request(),
      write = r.method() !== 'GET'
    if (!['fetch', 'xhr'].includes(r.resourceType()) && !(write && r.resourceType() === 'document'))
      return route.continue()
    const rule = write ? rules.writes : rules.reads
    if (!rule) return route.continue()
    if (rule === 'fail') return route.abort('failed')
    const n = rules.sent++,
      reply = await route.fetch({ timeout: 10000 }).catch(() => null)
    if (!reply) return route.abort('failed').catch(() => {})
    await sleep(rule(n))
    await route.fulfill({ response: reply }).catch(() => {})
  })
  return rules
}

async function verdict({ name, probe, ctx, race, where, seed, rows }) {
  const page = await ctx.newPage(),
    cdp = await ctx.newCDPSession(page),
    rules = await intercept(page),
    track = tracker(page)
  await page.goto(where)
  await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})
  const value = `Race ${seed}`,
    did = (await probe({ page, cdp, race, rules, track, ctx, url: where, seed, value })) ?? {}
  await track.quiet(500)
  await sleep(300)
  const dom = await readList(did.read ?? page, race)
  const db = (await rows()).filter((r) =>
    Object.entries(did.keep ?? {}).every(([k, v]) => r[k] === v),
  )
  const wrong = mismatch(dom, db)
  return {
    pass: !wrong,
    detail: wrong ? { name, seed, ...wrong } : null,
    ...(did.added && { copies: db.filter((r) => r.title === did.added).length }),
  }
}

/** Every race probe once. `fresh` resets and returns a session; `rows` reads what the database says now. */
export async function raceOnce({
  browser,
  url,
  race,
  fresh,
  rows,
  seed = Date.now() % 100000,
  only,
}) {
  const out = {},
    where = url + race.path
  for (const [name, probe] of Object.entries(PROBES).filter(([k]) => !only || only.includes(k))) {
    const cookies = await fresh(),
      ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    try {
      await ctx.addCookies(cookies)
      out[name] = await verdict({ name, probe, ctx, race, where, seed, rows })
    } catch (e) {
      out[name] = {
        pass: false,
        detail: { name, seed, error: String(e.message ?? e).slice(0, 200) },
      }
    } finally {
      await ctx.close()
    }
  }
  return out
}
