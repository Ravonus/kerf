// @vitest-environment node
// The scroller in real browsers, from its real source and stylesheet: wheel, keys, focus, the bars, touch, nesting,
// selection autoscroll, right-to-left, reduced motion, accessibility and a 100,000-row virtual list.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { rolldown } from 'rolldown'
import type * as Playwright from 'playwright-core'
import type * as Scroll from '../src/index'
import type * as Canvas from '../src/canvas'
import type * as Virtual from '../../warp-core/src/virtual'

declare global {
  interface Window {
    scroll_: typeof Scroll & typeof Canvas & typeof Virtual
    s: Scroll.Scroller
    log: Scroll.ScrollState[]
  }
}

const pw = createRequire(import.meta.url)('playwright-core') as typeof Playwright
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const css = readFileSync(at('../styles/scroll.css'), 'utf8')
let bundle = ''
beforeAll(async () => {
  const entry = at('./fixtures/browser-entry.ts')
  const build = await rolldown({ input: entry })
  bundle = (await build.generate({ format: 'iife', name: 'scroll_' })).output[0].code
})

const rows = (n: number, tag = 'p') =>
  Array.from(
    { length: n },
    (_, i) => `<${tag} style="margin:0;height:40px">Row ${i}</${tag}>`,
  ).join('')
const AREA = (inner: string, style = 'width:300px;height:200px') =>
  `<div id="root" style="${style}"><div data-part="viewport"><div data-part="content">${inner}</div></div></div>`

async function open(
  page: Playwright.Page,
  body: string,
  options: object = {},
  dir = 'ltr',
  paint = false,
) {
  await page.setContent(
    `<!doctype html><html dir="${dir}"><head><style>body{margin:0;font:16px/1 sans-serif}${css}</style></head><body>${body}</body></html>`,
  )
  await page.addScriptTag({ content: bundle })
  await page.evaluate(
    ([o, canvas]) => {
      window.log = []
      const opts: Scroll.ScrollOptions = { ...o, onScroll: (st) => window.log.push(st) }
      if (canvas) opts.renderer = window.scroll_.canvas()
      window.s = window.scroll_.scroller(document.getElementById('root')!, opts)
    },
    [options, paint] as const,
  )
  await page.evaluate(
    () =>
      new Promise<void>((r) => {
        requestAnimationFrame(() => requestAnimationFrame(() => r()))
      }),
  )
}
const top = (page: Playwright.Page, sel = '#root [data-part="viewport"]') =>
  page.$eval(sel, (el) => el.scrollTop)
const settle = (page: Playwright.Page, ms = 450) => page.waitForTimeout(ms)

const engines = process.env.WEFT_WEBKIT
  ? (['chromium', 'firefox', 'webkit'] as const)
  : (['chromium', 'firefox'] as const)

/** Each case gets a fresh page in each browser. */
const cases: Record<string, (page: Playwright.Page) => Promise<void>> = {
  'no native bar takes room, and the wheel scrolls with the thumb following': async (page) => {
    await open(page, AREA(rows(50)))
    const widths = await page.$eval('#root [data-part="viewport"]', (el: HTMLElement) => [
      el.offsetWidth,
      el.clientWidth,
    ])
    expect(widths[0]).toBe(widths[1])
    await page.mouse.move(100, 100)
    await page.mouse.wheel(0, 300)
    await settle(page)
    expect(await top(page)).toBeGreaterThan(200)
    const thumb = await page.$eval(
      '[data-orientation="vertical"] [data-part="thumb"]',
      (t) => new DOMMatrix(getComputedStyle(t).transform).m42,
    )
    expect(thumb).toBeGreaterThan(0)
    expect(
      await page.$eval('[data-orientation="vertical"]', (b) => b.hasAttribute('data-visible')),
    ).toBe(true)
  },

  'keys scroll once the area is clicked: arrows, Page Down, Space, End and Home': async (page) => {
    await open(page, AREA(rows(50)))
    await page.mouse.click(100, 100)
    await page.keyboard.press('ArrowDown')
    await settle(page)
    expect(await top(page)).toBe(40)
    await page.keyboard.press('PageDown')
    await settle(page)
    expect(await top(page)).toBe(40 + 175)
    await page.keyboard.press('Space')
    await settle(page)
    expect(await top(page)).toBe(40 + 350)
    await page.keyboard.press('End')
    await settle(page)
    expect(await top(page)).toBe(2000 - 200)
    await page.keyboard.press('Home')
    await settle(page)
    expect(await top(page)).toBe(0)
  },

  'focus moving below the fold brings it into view, and the bar follows': async (page) => {
    await open(page, `<button id="a">a</button>${AREA(`${rows(20)}<button id="far">far</button>`)}`)
    await page.focus('#a')
    await page.keyboard.press('Tab')
    await settle(page, 100)
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('far')
    expect(await top(page)).toBeGreaterThan(600)
    expect(await page.evaluate(() => window.s.state().y)).toBe(await top(page))
    expect(
      await page.$eval('[data-orientation="vertical"]', (b) => b.getAttribute('aria-valuenow')),
    ).toBe('100')
  },

  'dragging the thumb moves the content by the track ratio; a track press pages': async (page) => {
    await open(page, AREA(rows(50)), { bar: { show: 'always' } })
    const box = await page.$eval('[data-orientation="vertical"] [data-part="thumb"]', (t) => {
      const r = t.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    await page.mouse.move(box.x, box.y)
    await page.mouse.down()
    await page.mouse.move(box.x, box.y + 50, { steps: 5 })
    await page.mouse.up()
    await settle(page, 100)
    // 200 px of track (less insets) and a 20 px thumb: about 9.9 px of scroll per px.
    expect(await top(page)).toBeGreaterThan(400)
    const before = await top(page)
    await page.mouse.click(box.x, 195)
    await settle(page)
    expect(await top(page)).toBeCloseTo(before + 175, 0)
  },

  'a touch flick coasts on after the finger lifts, and a drag past the edge bounces back': async (
    page,
  ) => {
    await open(page, AREA(rows(200)))
    const moved = await page.evaluate(async () => {
      const vp = document.querySelector<HTMLElement>('#root [data-part="viewport"]')!
      const fire = (type: string, y: number) =>
        vp.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
            pointerType: 'touch',
            isPrimary: true,
            clientX: 100,
            clientY: y,
            bubbles: true,
          }),
        )
      const wait = (ms: number) =>
        new Promise<void>((r) => {
          setTimeout(r, ms)
        })
      fire('pointerdown', 180)
      for (let y = 180; y >= 60; y -= 20) {
        fire('pointermove', y)
        await wait(10)
      }
      fire('pointerup', 60)
      const lifted = vp.scrollTop
      await wait(600)
      return { lifted, after: vp.scrollTop }
    })
    expect(moved.lifted).toBeGreaterThanOrEqual(60)
    expect(moved.after).toBeGreaterThan(moved.lifted + 100)
    await settle(page, 2000)
    const bounce = await page.evaluate(async () => {
      window.s.scrollTo({ top: 0 })
      const vp = document.querySelector<HTMLElement>('#root [data-part="viewport"]')!
      const fire = (type: string, y: number) =>
        vp.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 8,
            pointerType: 'touch',
            isPrimary: true,
            clientX: 100,
            clientY: y,
            bubbles: true,
          }),
        )
      const wait = (ms: number) =>
        new Promise<void>((r) => {
          setTimeout(r, ms)
        })
      fire('pointerdown', 20)
      for (let y = 20; y <= 140; y += 30) {
        fire('pointermove', y)
        await wait(16)
      }
      await wait(50)
      const pulled = window.s.state().overscrollY
      fire('pointerup', 140)
      await wait(900)
      return { pulled, rest: window.s.state().overscrollY, top: vp.scrollTop }
    })
    expect(bounce.pulled).toBeLessThan(-20)
    expect(bounce.rest).toBe(0)
    expect(bounce.top).toBe(0)
  },

  'nested areas: the inner one scrolls first, and a new gesture at its edge moves the outer':
    async (page) => {
      const inner = `<div id="inner" style="width:200px;height:100px"><div data-part="viewport"><div data-part="content">${rows(5)}</div></div></div>`
      await open(page, AREA(`${inner}${rows(30)}`))
      await page.evaluate(() => window.scroll_.scroller(document.getElementById('inner')!))
      await page.mouse.move(50, 50)
      await page.mouse.wheel(0, 500)
      await settle(page)
      expect(await top(page, '#inner [data-part="viewport"]')).toBe(100)
      expect(await top(page)).toBe(0)
      await settle(page, 400)
      await page.mouse.wheel(0, 100)
      await settle(page)
      expect(await top(page)).toBeGreaterThan(0)
    },

  'a held selection dragged below the area scrolls it and grows with it': async (page) => {
    await open(page, AREA(rows(60)))
    await page.mouse.move(20, 10)
    await page.mouse.down()
    await page.mouse.move(40, 260, { steps: 4 })
    await page.waitForTimeout(500)
    const during = await page.evaluate(() => ({
      top: document.querySelector('#root [data-part="viewport"]')!.scrollTop,
      text: getSelection()!.toString(),
    }))
    await page.mouse.up()
    expect(during.top).toBeGreaterThan(80)
    expect(during.text).toContain('Row 6')
  },

  'right-to-left: Home is the right edge and the thumb starts on the right': async (page) => {
    const wide = `<div style="width:1200px;height:50px">wide</div>`
    await open(page, AREA(wide), { axes: 'x', bar: { show: 'always' } }, 'rtl')
    const st = await page.evaluate(() => window.s.state())
    expect(st.maxX).toBe(-900)
    const thumb = await page.$eval('[data-orientation="horizontal"] [data-part="thumb"]', (t) => {
      const r = t.getBoundingClientRect()
      return r.right
    })
    expect(thumb).toBeGreaterThan(280)
    const root = await page.$eval('#root', (r) => r.getBoundingClientRect().x)
    await page.mouse.click(root + 150, 20)
    await page.keyboard.press('ArrowLeft')
    await settle(page)
    expect(await page.$eval('#root [data-part="viewport"]', (el) => el.scrollLeft)).toBe(-40)
  },

  'with reduced motion an arrow key moves at once': async (page) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, AREA(rows(50)))
    await page.mouse.click(100, 100)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(40)
    expect(await top(page)).toBe(40)
  },

  'axe finds nothing wrong, and a screen reader still has every row': async (page) => {
    await open(page, AREA(rows(40)), { label: 'Rows' })
    await page.addScriptTag({ path: createRequire(import.meta.url).resolve('axe-core') })
    const violations = await page.evaluate(async () => {
      const axe = (
        window as unknown as {
          axe: { run: (n: Node) => Promise<{ violations: { id: string }[] }> }
        }
      ).axe
      return (await axe.run(document.getElementById('root')!)).violations.map((v) => v.id)
    })
    expect(violations).toEqual([])
    const hidden = await page.$$eval(
      '#root p',
      (ps) => ps.filter((p) => p.closest('[aria-hidden="true"]')).length,
    )
    expect(hidden).toBe(0)
  },

  'the canvas renderer paints the thumb where the DOM one would be': async (page) => {
    await open(
      page,
      AREA(rows(50)),
      { bar: { show: 'always', color: 'rgb(255,0,0)' } },
      'ltr',
      true,
    )
    await settle(page, 100)
    const alpha = await page.$eval(
      '[data-orientation="vertical"] canvas',
      (c: HTMLCanvasElement) => {
        const ctx = c.getContext('2d')!
        const dpr = devicePixelRatio
        return [
          ctx.getImageData(c.width - 5 * dpr, 6 * dpr, 1, 1).data[3],
          ctx.getImageData(c.width - 5 * dpr, 150 * dpr, 1, 1).data[3],
        ]
      },
    )
    expect(alpha[0]).toBeGreaterThan(0)
    expect(alpha[1]).toBe(0)
  },

  "a 100,000-row virtual list on warp-core's virtualizer scrolls to the end and back": async (
    page,
  ) => {
    await open(page, AREA('<div id="spacer" style="position:relative"></div>'))
    const shown = await page.evaluate(async () => {
      const vp = document.querySelector<HTMLElement>('#root [data-part="viewport"]')!
      const spacer = document.getElementById('spacer')!
      const keys = Array.from({ length: 100_000 }, (_, i) => i)
      const live = new Map<number, HTMLElement>()
      const waiting: [HTMLElement, number][] = []
      const made: { v?: Virtual.Virtualizer } = {}
      made.v = window.scroll_.virtualizer(vp, {
        keys,
        spacer,
        estimate: 30,
        sized: true,
        onRange(indices) {
          for (const [k, el] of live) {
            if (indices.includes(k)) continue
            el.remove()
            live.delete(k)
          }
          for (const i of indices) {
            if (live.has(i)) continue
            const el = document.createElement('div')
            el.textContent = `Item ${i}`
            spacer.append(el)
            live.set(i, el)
            if (made.v) made.v.attach(el, i)
            else waiting.push([el, i])
          }
        },
      })
      for (const [el, i] of waiting) made.v.attach(el, i)
      window.s.refresh()
      vp.focus()
      vp.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }),
      )
      await new Promise<void>((r) => {
        setTimeout(r, 500)
      })
      const end = [...live.keys()].sort((a, b) => a - b).at(-1)
      window.s.scrollTo({ top: 1_500_000 })
      await new Promise<void>((r) => {
        requestAnimationFrame(() => requestAnimationFrame(() => r()))
      })
      return { end, mid: [...live.keys()].includes(50_000), top: vp.scrollTop }
    })
    expect(shown.end).toBe(99_999)
    expect(shown.mid).toBe(true)
  },
}

describe.each(engines)('%s', (name) => {
  let browser: Playwright.Browser
  let page: Playwright.Page
  beforeAll(async () => {
    browser = await pw[name].launch()
  })
  afterAll(async () => {
    await browser?.close()
  })
  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  })
  afterEach(async () => {
    await page.close()
  })
  for (const [title, run] of Object.entries(cases)) test(title, () => run(page))
})
