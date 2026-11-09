import { sleep } from '../stats.mjs'
import { settled, target, trustedClick } from './page.mjs'
import { browserPage } from './passes.mjs'

const EVENTS = () => {
  window.__events = new Map()
  new PerformanceObserver((l) => {
    for (const e of l.getEntries())
      if (e.interactionId)
        window.__events.set(
          e.interactionId,
          Math.max(window.__events.get(e.interactionId) ?? 0, e.duration),
        )
  }).observe({ type: 'event', durationThreshold: 16, buffered: true })
}

/** `interact`: real clicks at 4x CPU, by Event Timing. It reports nothing under 16 ms, so a click it didn't report counts as 8. Not INP: nobody's field data. */
export async function interactionPass(browser, url, targets, { cookies = [] }) {
  const { ctx, page, cdp } = await browserPage(browser, cookies, [[EVENTS]], 4)
  try {
    await page.goto(url)
    await settled(page)
    for (const t of targets) {
      await trustedClick(cdp, target(page, t))
      await sleep(250)
    }
    await sleep(300)
    const seen = await page.evaluate(() => [...window.__events.values()])
    const all = [...seen, ...Array(Math.max(0, targets.length - seen.length)).fill(8)].sort(
      (a, b) => a - b,
    )
    return { worst: all.at(-1), p75: all[Math.min(all.length - 1, Math.floor(all.length * 0.75))] }
  } finally {
    await ctx.close()
  }
}

/** `streaming`: from navigation start, 4x CPU, the first click on the control that changes its status, while the rest still streams. */
export async function streamingPass(browser, url, { click, status }, { cookies = [] }) {
  const { ctx, page, cdp } = await browserPage(browser, cookies, [], 4)
  try {
    const t0 = Date.now(),
      button = target(page, click),
      shown = page.getByRole('status').filter({ hasText: status })
    await page.goto(url, { waitUntil: 'commit' })
    let before = null
    while (Date.now() - t0 < 10000) {
      if ((await button.count()) && (await shown.count())) {
        before ??= await shown.textContent()
        await trustedClick(cdp, button)
        await sleep(30)
        if ((await shown.textContent()) !== before) return Date.now() - t0
      } else await sleep(10)
    }
    return null
  } finally {
    await ctx.close()
  }
}
