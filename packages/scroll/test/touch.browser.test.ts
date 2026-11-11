// @vitest-environment node
// On a phone: WebKit as an iPhone and Chromium as a Pixel, both with touch and a coarse pointer. The bar is this
// package's own, drawn in place of the native one; at rest it lets a swipe at the edge reach the content; while it
// shows, the thumb takes a finger. Without CSS scroll timelines the thumb is still drawn, by script.
import type * as Playwright from 'playwright-core'
import { AREA, open, rows, runOn, settle, top, type Case } from './fixtures/browser'

const thumbAt = (page: Playwright.Page) =>
  page.$eval('[data-orientation="vertical"] [data-part="thumb"]', (t) => {
    const r = t.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
const scrollArea = (page: Playwright.Page, to: number) =>
  page.$eval(
    '#root [data-part="viewport"]',
    (el, y) => {
      el.scrollTop = y
    },
    to,
  )
/** What a finger at (x, y) lands on: the bar's thumb, the bar, or the content. */
const hit = (page: Playwright.Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py)
      if (el?.closest('[data-part="thumb"]')) return 'thumb'
      if (el?.closest('[data-part="scrollbar"]')) return 'bar'
      return el?.closest('[data-part="content"]') ? 'content' : 'other'
    },
    [x, y] as const,
  )

const cases: Record<string, Case> = {
  'our bar shows while the area scrolls, in place of the native one': async (page) => {
    await open(page, AREA(rows(50)), { bar: { hideDelay: 400 } })
    const native = await page.$eval(
      '#root [data-part="viewport"]',
      (el) => getComputedStyle(el).scrollbarWidth,
    )
    expect(native).toBe('none')
    const before = await thumbAt(page)
    await scrollArea(page, 600)
    await settle(page, 100)
    const shown = await page.$eval('[data-orientation="vertical"]', (b) =>
      b.hasAttribute('data-visible'),
    )
    expect(shown).toBe(true)
    expect((await thumbAt(page)).y).toBeGreaterThan(before.y + 30)
  },

  'at rest, a touch at the edge goes to the content, not the bar': async (page) => {
    await open(page, AREA(rows(50)), { bar: { hideDelay: 100 } })
    await scrollArea(page, 400)
    await settle(page, 400)
    const t = await thumbAt(page)
    expect(await hit(page, t.x + t.w / 2, t.y + t.h / 2)).toBe('content')
    await page.touchscreen.tap(t.x + t.w / 2, t.y + t.h + 40)
    await settle(page, 300)
    expect(await top(page)).toBe(400)
  },

  'while it shows, the thumb takes a finger beside it and drags the content': async (page) => {
    await open(page, AREA(rows(50)), { bar: { hideDelay: 5000 } })
    await scrollArea(page, 200)
    await settle(page, 100)
    const t = await thumbAt(page)
    const at = { x: t.x - 10, y: t.y + t.h / 2 }
    expect(await hit(page, at.x, at.y)).toBe('thumb')
    const before = await top(page)
    await page.mouse.move(at.x, at.y)
    await page.mouse.down()
    await page.mouse.move(at.x, at.y + 30, { steps: 4 })
    await page.mouse.up()
    await settle(page, 100)
    expect(await top(page)).toBeGreaterThan(before + 200)
  },

  'without CSS scroll timelines the thumb is drawn by script and follows': async (page) => {
    await open(page, AREA(rows(50)), {}, 'ltr', false, () => {
      const supports = CSS.supports.bind(CSS)
      CSS.supports = (...a: [string, string?]) =>
        a.join(' ').includes('timeline') ? false : supports(...(a as [string]))
    })
    const timeline = await page.$eval('#root', (r) => r.hasAttribute('data-timeline'))
    expect(timeline).toBe(false)
    const before = await thumbAt(page)
    await scrollArea(page, 900)
    await settle(page, 100)
    expect((await thumbAt(page)).y).toBeGreaterThan(before.y + 50)
  },
}

runOn(
  [
    ['webkit', 'iPhone 15'],
    ['chromium', 'Pixel 7'],
  ],
  cases,
)
