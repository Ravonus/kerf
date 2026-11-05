import { sleep } from '../../scripts/lib/helpers.mjs'
// race.*: does the page end up telling the truth? Each probe resets the database, drives a real browser, holds or shuffles the
// replies with Playwright route interception (the server does the work in order; only the answers are late), and then compares
// the list on screen with Postgres. Pass or fail, nothing else, and a fail outranks any millisecond (rule 7).
import { centre, press, target, tracker, trustedClick } from './flow.mjs'

/** The same seed, the same order of replies: a failure can be replayed. */
export function shuffled(n, seed) {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

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

const box = (page, race) => target(page, `checkbox:${race.toggle}`)

const PROBES = {
  async doubleSubmit({ page, cdp, race, rules, value }) {
    rules.writes = (n) => 150 * (1 - (n % 2))
    await target(page, `textbox:${race.input}`).fill(value)
    const at = await centre(target(page, `button:${race.submit}`))
    await press(cdp, at)
    await press(cdp, at)
    return { added: value }
  },
  async toggles({ page, cdp, race, rules, seed }) {
    // Five toggles end on the opposite of four, so the replies that can lie are the even ones. The second write's reply comes after the
    // fifth's, for stacks that answer a write with data, and the read after the fourth lands last of all, for stacks that read again.
    const order = shuffled(16, seed)
    let writes = 0,
      reads = 0
    rules.writes = (n) => (writes++ === 1 ? 800 : order[n % 16] * 5)
    rules.reads = (n) => (reads++ === 2 ? 1200 : order[n % 16] * 20)
    const at = await centre(box(page, race))
    for (let i = 0; i < 5; i++) {
      await press(cdp, at)
      await sleep(120)
    }
    return { order: order.slice(0, 5) }
  },
  async rollback({ page, cdp, race, rules, track }) {
    rules.writes = 'fail'
    await trustedClick(cdp, box(page, race))
    await track.quiet()
    rules.writes = null
  },
  async navigateDuring({ page, cdp, race, rules }) {
    rules.writes = () => 400
    await trustedClick(cdp, box(page, race))
    await sleep(50)
    await trustedClick(cdp, target(page, `link:${race.away.link}`))
    return { keep: race.away.keep }
  },
  async invalidateDuring({ page, cdp, race, rules }) {
    rules.reads = () => 700
    const at = await centre(box(page, race))
    await trustedClick(cdp, target(page, `link:${race.away.link}`))
    await sleep(100)
    await press(cdp, at)
    return { keep: race.away.keep }
  },
  async twoTabs({ page, cdp, race, ctx, url, track }) {
    const other = await ctx.newPage()
    await other.goto(url)
    await other.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})
    await page.bringToFront()
    await trustedClick(cdp, box(page, race))
    await track.quiet()
    // Playwright keeps every page "focused", so coming back to a tab has to be told to the page. What a tab gets on real focus, no more.
    const back = tracker(other)
    await other.bringToFront()
    await other.evaluate(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await back.quiet(1000, 3000)
    return { read: other }
  },
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
      out[name] = {
        pass: !wrong,
        detail: wrong ? { name, seed, ...wrong } : null,
        ...(did.added && { copies: db.filter((r) => r.title === did.added).length }),
      }
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
