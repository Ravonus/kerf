// @vitest-environment node
// Native mode, the default, in real browsers: the browser scrolls the viewport with its own bar hidden, and the bars,
// the API and snapping follow. Where CSS scroll timelines exist the thumb runs on one, off the main thread.
import type * as Playwright from 'playwright-core'
import { AREA, open, rows, run, settle, top, type Case } from './fixtures/browser'

const thumbAt = (page: Playwright.Page, orientation = 'vertical') =>
  page.$eval(`[data-orientation="${orientation}"] [data-part="thumb"]`, (t) =>
    t.getBoundingClientRect(),
  )

const cases: Record<string, Case> = {
  'the browser scrolls it, its own bar takes no room, and the thumb follows': async (page) => {
    await open(page, AREA(rows(50)))
    const vp = await page.$eval('#root [data-part="viewport"]', (el: HTMLElement) => ({
      widths: [el.offsetWidth, el.clientWidth],
      overflow: getComputedStyle(el).overflowY,
      mode: el.parentElement!.dataset.mode,
    }))
    expect(vp.widths[0]).toBe(vp.widths[1])
    expect(vp.overflow).toBe('auto')
    expect(vp.mode).toBe('native')
    const before = await thumbAt(page)
    await page.mouse.move(100, 100)
    await page.mouse.wheel(0, 300)
    await settle(page)
    // The browser's own wheel step: Firefox's is shorter than Chromium's.
    expect(await top(page)).toBeGreaterThan(100)
    expect((await thumbAt(page)).y).toBeGreaterThan(before.y + 10)
    const st = await page.evaluate(() => ({
      y: window.s.state().y,
      heard: window.log.length,
      visible: document.querySelector('[data-orientation="vertical"]')!.hasAttribute('data-visible'),
    }))
    expect(st.y).toBe(await top(page))
    expect(st.heard).toBeGreaterThan(0)
    expect(st.visible).toBe(true)
  },

  'where scroll timelines exist, the thumb runs on one': async (page) => {
    await open(page, AREA(rows(50)))
    const tl = await page.evaluate(() => {
      const thumb = document.querySelector('[data-orientation="vertical"] [data-part="thumb"]')!
      return {
        supported: CSS.supports('animation-timeline: --a') && CSS.supports('timeline-scope: --a'),
        on: document.getElementById('root')!.hasAttribute('data-timeline'),
        animations: thumb
          .getAnimations()
          .map((a) => a.timeline?.constructor.name ?? 'none'),
      }
    })
    expect(tl.on).toBe(tl.supported)
    if (tl.supported) expect(tl.animations).toContain('ScrollTimeline')
    else expect(tl.animations).toEqual([])
  },

  'keys scroll it once it is clicked, the same in every browser': async (page) => {
    await open(page, AREA(rows(50)))
    await page.mouse.click(100, 100)
    await page.keyboard.press('ArrowDown')
    await settle(page)
    expect(await top(page)).toBe(40)
    await page.keyboard.press('End')
    await settle(page, 900)
    expect(await top(page)).toBe(2000 - 200)
    await page.keyboard.press('Home')
    await settle(page, 900)
    expect(await top(page)).toBe(0)
  },

  'dragging the thumb and pressing the track still move it': async (page) => {
    await open(page, AREA(rows(50)), { bar: { show: 'always' } })
    const r = await thumbAt(page)
    const box = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    await page.mouse.move(box.x, box.y)
    await page.mouse.down()
    await page.mouse.move(box.x, box.y + 50, { steps: 5 })
    await page.mouse.up()
    await settle(page, 100)
    expect(await top(page)).toBeGreaterThan(400)
    const before = await top(page)
    await page.mouse.click(box.x, 195)
    await settle(page)
    expect(await top(page)).toBe(before + 175)
  },

  'with snap points it comes to rest on one after the browser stops': async (page) => {
    await open(page, AREA(rows(50)), { snap: { points: [0, 400, 800, 1200], type: 'mandatory' } })
    await page.$eval('#root [data-part="viewport"]', (el) => {
      el.scrollTop = 260
    })
    await settle(page, 700)
    expect(await top(page)).toBe(400)
  },

  'right-to-left: the thumb starts on the right and moves left': async (page) => {
    const wide = `<div style="width:1200px;height:50px">wide</div>`
    await open(page, AREA(wide), { axes: 'x', bar: { show: 'always' } }, 'rtl')
    const area = await page.$eval('#root', (r) => r.getBoundingClientRect())
    const start = await thumbAt(page, 'horizontal')
    expect(area.right - start.right).toBeLessThan(10)
    await page.evaluate(() => window.s.scrollTo({ left: -900 }))
    await settle(page, 100)
    const end = await thumbAt(page, 'horizontal')
    expect(end.x - area.x).toBeLessThan(10)
  },

  'update switches between native and engine mode': async (page) => {
    await open(page, AREA(rows(50)))
    const read = () =>
      page.$eval('#root [data-part="viewport"]', (el) => ({
        overflow: getComputedStyle(el).overflowY,
        timeline: el.parentElement!.hasAttribute('data-timeline'),
      }))
    await page.evaluate(() => window.s.update({ mode: 'engine' }))
    expect(await read()).toEqual({ overflow: 'hidden', timeline: false })
    await page.mouse.move(100, 100)
    await page.mouse.wheel(0, 120)
    await settle(page)
    expect(await top(page)).toBe(120)
    await page.evaluate(() => window.s.update({ mode: 'native' }))
    expect((await read()).overflow).toBe('auto')
  },
}

run(cases)
