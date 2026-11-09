import { sleep } from '../../../scripts/lib/helpers.mjs'
import { centre, press, target, trustedClick } from '../flow/page.mjs'

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

const box = (page, race) => target(page, `checkbox:${race.toggle}`)

export const PROBES = {
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
