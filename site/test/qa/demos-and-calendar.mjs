import { base, check, same, mount, PHONE } from './context.mjs'

for (const path of ['/learn/state', '/components/button']) {
  await check(`side nav folds on a desktop ${path}`, path, async (page) => {
    const nav = page.locator('[data-site="docs"] > [data-scope="sidenav"]')
    const bar = nav.locator('[data-part="bar"]')
    const tracks = () =>
      page.evaluate(() =>
        getComputedStyle(document.querySelector('[data-site="docs"]'))
          .gridTemplateColumns.split(' ')
          .map(parseFloat),
      )
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-scope="sidenav"] [data-part="bar"]')
          ?.getAttribute('aria-expanded') === 'true',
    )
    const [side0, page0] = await tracks()
    if (side0 < 200) throw new Error(`the rail is ${side0}px before folding`)
    same(
      await nav.locator('nav a[aria-current="page"]').isVisible(),
      true,
      'the current link shows',
    )
    await bar.click()
    await page.waitForTimeout(600)
    same(await bar.getAttribute('aria-expanded'), 'false', 'aria-expanded when folded')
    const [side1, page1] = await tracks()
    if (side1 > 40) throw new Error(`the folded rail is ${side1}px`)
    if (page1 - page0 < side0 - side1 - 1)
      throw new Error(`the page grew ${page1 - page0}px of ${side0 - side1}`)
    same(await nav.locator('nav a[aria-current="page"]').isVisible(), false, 'the links hide')
    same(
      await page.evaluate(() => document.activeElement?.getAttribute('data-part')),
      'bar',
      'focus stays on the bar',
    )
    same(
      await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)),
      0,
      'page overflow',
    )
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(600)
    same(await bar.getAttribute('aria-expanded'), 'false', 'folded after a reload')
    same(Math.round((await tracks())[0]), Math.round(side1), 'the rail width after a reload')
    await bar.click()
    await page.waitForTimeout(600)
    same(await bar.getAttribute('aria-expanded'), 'true', 'unfolded by the bar')
    same(Math.round((await tracks())[0]), Math.round(side0), 'the rail width unfolded')
    same(
      await nav.locator('nav a[aria-current="page"]').isVisible(),
      true,
      'the current link shows again',
    )
  })
}
// The Forecast demo shows its wait: the Boundary's fallback on the first load, then the old forecast dimmed with a
// spinner while the next one loads, and quick presses cancel the requests before them.
await check('learn forecast shows it is waiting', '/learn/async-and-loading', async (page) => {
  await mount(page)
  const run = page
    .locator('[data-site="example"] [data-part="run"]')
    .filter({ hasText: 'Forecast' })
    .first()
  const next = run.getByRole('button', { name: 'Next day' })
  await next.click()
  await run.getByText('Loading…').waitFor({ timeout: 2000 })
  await run.getByText(/Day 1:/).waitFor({ timeout: 3000 })
  await next.click()
  await run.locator('p[aria-busy="true"]').waitFor({ timeout: 1000 })
  same(
    await run.getByText(/Day 1:/).isVisible(),
    true,
    'the old forecast stays while the next loads',
  )
  await next.click()
  await next.click()
  await run.getByText(/Day 4:/).waitFor({ timeout: 3000 })
  await run.getByText(/2 earlier requests cancelled/).waitFor({ timeout: 1000 })
})
// A Learn page that was split answers its old address with a permanent redirect, `.md` twin included.
for (const [from, to] of [
  ['/learn/lists-and-conditions', '/learn/rendering-lists'],
  ['/learn/lists-and-conditions.md', '/learn/rendering-lists.md'],
]) {
  await check(`old ${from} redirects`, '/learn', async (page) => {
    const r = await page.request.get(base + from, { maxRedirects: 0 })
    same(r.status(), 308, 'status')
    same(new URL(r.headers().location, base).pathname, to, 'location')
    same((await page.request.get(base + to)).status(), 200, 'the new page')
  })
}
// Every old /docs address answers a permanent redirect to its new home, `.md` twins included.
for (const [from, to] of [
  ['/docs', '/learn'],
  ['/docs/getting-started', '/learn/installation'],
  ['/docs/rules', '/reference/rules'],
  ['/docs/codes/W001', '/reference/codes/W001'],
  ['/docs/props.md', '/reference/props.md'],
]) {
  await check(`old ${from} redirects`, '/learn', async (page) => {
    const r = await page.request.get(base + from, { maxRedirects: 0 })
    same(r.status(), 308, 'status')
    same(new URL(r.headers().location, base).pathname, to, 'location')
    same((await page.request.get(base + to)).status(), 200, 'the new page')
  })
}
// A demo missing from the build shows its notice in a pane its own size, not a tall empty one.
await check('a missing demo closes its pane around the notice', '/examples', async (page) => {
  const sec = page
    .locator('section[data-site="example"]:has([data-part="run"] > [data-part="missing"])')
    .first()
  if (!(await sec.count())) return // the arena is built: nothing missing
  const { run, notice } = await sec.evaluate((s) => ({
    run: s.querySelector('[data-part="run"]').getBoundingClientRect().height,
    notice: s.querySelector('[data-part="missing"]').getBoundingClientRect().height,
  }))
  if (run > notice + 48)
    throw new Error(`a ${Math.round(run)}px pane around a ${Math.round(notice)}px notice`)
})

// The home page's demos start at the top of their pane, however long the code beside them.
await check('home demos start at the top of their pane', '/', async (page) => {
  const gaps = []
  for (const id of ['shop-1', 'shop-2', 'shop-4', 'shop-5']) {
    const run = page
      .locator('[data-site="story"] [data-site="example"] [data-part="run"]')
      .nth(gaps.length)
    await run.evaluate((r) => r.scrollIntoView({ block: 'start' }))
    await page.waitForTimeout(200)
    gaps.push([
      id,
      await run.evaluate((r) =>
        Math.round(r.firstElementChild.getBoundingClientRect().top - r.getBoundingClientRect().top),
      ),
    ])
  }
  same(
    gaps
      .filter(([, gap]) => gap > 64)
      .map(([id, gap]) => `${id} ${gap}px`)
      .join(),
    '',
    'blank above a demo',
  )
})
// The calendar opens on the working day, not midnight, and the rooms timeline shows its bookings' names.
await check('calendar opens on working hours', '/components/calendar', async (page) => {
  await page.waitForSelector('[data-part="scroller"] > [data-part="cols"]', { state: 'attached' })
  await page.waitForTimeout(800)
  const { top, hour } = await page.evaluate(() => {
    const s = document.querySelector('[data-part="scroller"]:has(> [data-part="cols"])')
    return {
      top: s.scrollTop,
      hour: s.querySelector(':scope > [data-part="cols"]').offsetHeight / 24,
    }
  })
  if (top < hour * 6) throw new Error(`scrolled to ${(top / hour).toFixed(1)}h`)
})
await check('timeline names are not cut', '/components/calendar', async (page) => {
  const sec = page.locator('section#CalendarRooms')
  await sec.scrollIntoViewIfNeeded()
  await page.waitForFunction(
    () =>
      document.querySelector('section#CalendarRooms [data-part="lane"] [data-part="event-title"]'),
    null,
    { timeout: 15000 },
  )
  const cut = await sec.evaluate((s) =>
    [...s.querySelectorAll('[data-part="lane"] [data-part="event"]')]
      .filter((e) => {
        const words = document.createRange()
        words.selectNodeContents(e.querySelector('[data-part="event-title"]'))
        const w = words.getBoundingClientRect(),
          box = e.getBoundingClientRect()
        return w.right > box.right + 1 || w.bottom > box.bottom + 1
      })
      .map((e) => e.querySelector('[data-part="event-title"]').textContent),
  )
  same(cut.join(), '', 'cut names')
})
/** Names in a week or day grid (timed or all-day) that don't read whole: past their event's edge, ellipsized, or broken inside a word. */
const cutNames = (sec) =>
  sec.evaluate((s) =>
    [
      ...s.querySelectorAll(
        '[data-part="col"] > [data-part="event"], [data-part="allday"] > [data-part="chip"]',
      ),
    ]
      .filter((e) => {
        const t = e.querySelector('[data-part="event-title"]') ?? e,
          box = e.getBoundingClientRect(),
          r = document.createRange()
        r.selectNodeContents(t)
        const w = r.getBoundingClientRect()
        if (
          w.right > box.right + 1 ||
          w.bottom > box.bottom + 1 ||
          getComputedStyle(t).textOverflow === 'ellipsis'
        )
          return true
        // a word on two lines has two boxes
        const text = [...t.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
        if (!text) return false
        let at = 0
        return text.textContent.split(/(\s+)/).some((word) => {
          const from = at
          at += word.length
          if (!word.trim()) return false
          const wr = document.createRange()
          wr.setStart(text, from)
          wr.setEnd(text, at)
          return wr.getClientRects().length > 1
        })
      })
      .map((e) => (e.querySelector('[data-part="event-title"]') ?? e).textContent),
  )
/** Shows a calendar example in a view (its tab) and waits for it to fit its names. */
export const calendarIn = async (page, id, view) => {
  const sec = page.locator(`section#${id}`)
  await sec.scrollIntoViewIfNeeded()
  await sec.locator('[data-part="col"]').first().waitFor()
  if (view) await sec.locator('[role="tab"]', { hasText: view }).click()
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(600)
  return sec
}
// Day and week views read every name whole too, on a desk and a phone ("Incident re…", "Billing walkthrou…" were cut).
for (const viewport of [{ width: 1280, height: 900 }, PHONE]) {
  for (const [id, view] of [
    ['CalendarBusyDay', 'Day'],
    ['CalendarBusyDay', 'Week'],
    ['preview', 'Week'],
  ]) {
    await check(
      `${view.toLowerCase()} names are not cut ${id} at ${viewport.width}`,
      '/components/calendar',
      async (page) => {
        const sec = await calendarIn(page, id, view)
        same((await cutNames(sec)).join(), '', 'cut names')
      },
      viewport,
    )
  }
}
// A desk's week shows all seven days at once, with nothing to scroll sideways (it showed Monday to Thursday).
await check('desktop week shows seven days', '/components/calendar', async (page) => {
  for (const [id, view] of [
    ['preview', 'Week'],
    ['CalendarBusyDay', 'Week'],
  ]) {
    const sec = await calendarIn(page, id, view)
    const m = await sec.evaluate((s) => {
      const sc = s.querySelector('[data-part="scroller"]:has(> [data-part="cols"])'),
        r = sc.getBoundingClientRect()
      const cols = [...sc.querySelectorAll('[data-part="col"]')].map((c) =>
        c.getBoundingClientRect(),
      )
      return {
        days: cols.length,
        inView: cols.filter((c) => c.left >= r.left - 1 && c.right <= r.right + 1).length,
        wide: sc.scrollWidth - sc.clientWidth,
      }
    })
    same(m.days, 7, `${id} days`)
    same(m.inView, 7, `${id} days in view`)
    if (m.wide > 1) throw new Error(`${id} scrolls ${m.wide}px sideways`)
  }
})
// Out of working hours is one quiet shade at both ends of the day: no picture, no loud colour, no unlabelled slab at 18:00.
