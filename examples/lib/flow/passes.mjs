import { centre, fill, press, randomValue, settled, target } from './page.mjs'
import { tracker } from './tracker.mjs'

// Installed in every document, so a hard navigation is timed the same as a soft one. Date.now because a hard one has a new clock.
const WATCH = ({ url, see }) => {
  const f = (window.__flow = {
    url: null,
    paint: null,
    data: null,
    mutated: false,
    rearm() {
      f.url = f.paint = f.data = null
      f.mutated = false
    },
  })
  new MutationObserver(() => {
    f.mutated = true
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true })
  const after = (fn) => {
    const c = new MessageChannel()
    c.port1.onmessage = fn
    c.port2.postMessage(0)
  }
  const tick = () => {
    requestAnimationFrame(tick)
    if (f.url === null && location.href.includes(url)) f.url = Date.now()
    if (f.paint === null && f.mutated)
      after(() => {
        if (f.mutated) f.paint ??= Date.now()
      })
    if (f.url !== null && f.data === null && see && document.body?.innerText.includes(see))
      f.data = Date.now()
  }
  requestAnimationFrame(tick)
}

const marks = async (page, t0) => {
  await page
    .waitForFunction(() => window.__flow.url !== null && window.__flow.paint !== null, null, {
      timeout: 10000,
    })
    .catch(() => {})
  await page
    .waitForFunction(() => window.__flow.data !== null, null, { timeout: 10000 })
    .catch(() => {})
  const f = await page.evaluate(() => {
    const { url, paint, data } = window.__flow
    return { url, paint, data }
  })
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === null ? null : v - t0]))
}

export async function browserPage(browser, cookies, init, cpu = 1) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await ctx.addCookies(cookies)
  const page = await ctx.newPage(),
    cdp = await ctx.newCDPSession(page)
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
      const link = target(page, nav.click),
        at = await centre(link)
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
  } finally {
    await ctx.close()
  }
}

/** `mutate`: input to the DOM showing it (optimistic, if it beats the reply), to the last reply done (confirmed), and requests it took. */
export async function mutatePass(browser, url, mutate, { cookies = [] }) {
  const value = randomValue(),
    put = (s) => s.replaceAll('$value', value),
    see = put(mutate.see)
  const { ctx, page, cdp } = await browserPage(browser, cookies, [[WATCH, { url: '', see }]])
  try {
    await page.goto(url)
    await settled(page)
    for (const [field, text] of Object.entries(mutate.fill ?? {}))
      await target(page, field).fill(put(text))
    const button = target(page, mutate.click),
      at = await centre(button),
      t = tracker(page)
    await page.evaluate(() => window.__flow.rearm())
    const t0 = Date.now()
    await press(cdp, at)
    await page.waitForFunction(() => window.__flow.data !== null, null, { timeout: 10000 })
    const shown = await page.evaluate(() => window.__flow.data)
    await t.quiet()
    return { optimistic: shown - t0, confirmed: Math.max(shown, t.last) - t0, requests: t.sent }
  } finally {
    await ctx.close()
  }
}
