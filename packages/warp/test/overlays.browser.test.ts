// @vitest-environment node
// What jsdom can't see, in all three engines and warp's real CSS: where a panel lands, what scrolls, who Escape closes.
// Built with the production CSS purge, so a rule the purge would drop (the scroll lock) fails here rather than in an app.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type * as Playwright from 'playwright-core'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import weft from '@weft-js/core/vite'
import { overlayCases, toastCasesFor } from './overlays.browser-cases'

declare global {
  interface Window {
    seen: number[]
    api: {
      undone: number
      raise: (opts?: Record<string, unknown>) => void
      modal: { value: boolean }
      submitted: { value: number }
      [key: string]: unknown
    }
  }
}
export type OverlayTools = ReturnType<typeof overlayHarness> & ReturnType<typeof toastTools>

const pw = createRequire(import.meta.url)('playwright-core') as typeof Playwright
vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 })

const types: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
}
let dist: string
let server: Server
let url: string

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'warp-overlays-'))
  await build({
    root: fileURLToPath(new URL('./overlays', import.meta.url)),
    base: './',
    logLevel: 'silent',
    plugins: [weft()],
    build: { outDir: dist, emptyOutDir: true },
  })
  server = createServer((q, r) => {
    let p = join(dist, q.url!.split('?')[0]!)
    if (p.endsWith('/')) p += 'index.html'
    if (!existsSync(p)) {
      r.statusCode = 404
      r.end()
      return
    }
    r.setHeader('content-type', types[extname(p)] ?? 'application/octet-stream')
    r.end(readFileSync(p))
  }).listen(0)
  await new Promise<void>((r) => {
    server.once('listening', r)
  })
  url = `http://localhost:${(server.address() as AddressInfo).port}/`
})
afterAll(() => {
  server?.close()
  rmSync(dist, { recursive: true, force: true })
})

/**
 * Where an element comes to rest: on a loaded machine a toast's slide-in can outlast a fixed wait. Its timer keeps
 * animating, so the test is the element holding still for a few frames.
 */
const atRest = (el: Playwright.Locator) =>
  el.evaluate(
    (node) =>
      new Promise<void>((done) => {
        let last = '',
          still = 0
        const look = () => {
          const r = node.getBoundingClientRect(),
            now = `${r.x},${r.y}`
          still = now === last ? still + 1 : 0
          last = now
          if (still >= 3) done()
          else requestAnimationFrame(look)
        }
        requestAnimationFrame(look)
      }),
  )

function toastTools() {
  const region = '[data-scope="toast"][data-part="region"]'
  const where = (page: Playwright.Page) =>
    page.evaluate((r) => {
      const el = document.querySelector(r)!,
        d = el.closest('dialog')
      return {
        dialog: d ? (d.querySelector('[data-part="title"]')?.textContent ?? d.dataset.scope) : null,
        popover: el.hasAttribute('popover'),
        top: el.matches(':popover-open'),
      }
    }, region)
  // what the pointer would hit at the middle of Undo, and that it works
  const undo = async (page: Playwright.Page) => {
    const button = page.getByRole('button', { name: 'Undo' }).first()
    await atRest(button)
    const box = (await button.boundingBox())!
    if (box.x + box.width > 1100 || box.y + box.height > 700) {
      const evidence = await page.evaluate((selector) => {
        const regionNode = document.querySelector(selector)
        const buttonNode = regionNode?.querySelector('[data-act]')
        const nodes = [
          regionNode,
          buttonNode,
          regionNode?.closest('dialog'),
          regionNode?.parentElement,
        ]
        return nodes.map(
          (el) =>
            el && {
              tag: el.tagName,
              id: el.id,
              part: el.getAttribute('data-part'),
              title: el.querySelector('[data-part="title"]')?.textContent?.slice(0, 100),
              rect: el.getBoundingClientRect().toJSON(),
              popover: el.getAttribute('popover'),
              open: el.matches(':popover-open'),
              transform: getComputedStyle(el).transform,
              translate: getComputedStyle(el).translate,
              animations: el
                .getAnimations()
                .slice(0, 10)
                .map((a) => ({
                  state: a.playState,
                  time: a.currentTime,
                })),
            },
        )
      }, region)
      console.error('toast Undo geometry:', JSON.stringify(evidence))
    }
    expect(box.x + box.width).toBeLessThanOrEqual(1100)
    expect(box.y + box.height).toBeLessThanOrEqual(700)
    const hit = await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-act]'),
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    )
    expect(hit).toBe(true)
    const was = await page.evaluate(() => window.api.undone)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(100)
    expect(await page.evaluate(() => window.api.undone)).toBe(was + 1)
  }
  const raise = (page: Playwright.Page, opts?: Record<string, unknown>) =>
    page.evaluate((o) => window.api.raise(o), opts)
  const set = (page: Playwright.Page, field: string, to: boolean) =>
    page.evaluate(
      ([n, v]) => {
        ;(window.api[n] as { value: boolean }).value = v
      },
      [field, to] as [string, boolean],
    )
  return { region, where, undo, raise, set }
}

function overlayHarness(getBrowser: () => Playwright.Browser) {
  async function fresh() {
    const page = await getBrowser().newPage({ viewport: { width: 1100, height: 700 } })
    await page.goto(url)
    await page.waitForFunction(() => window.api)
    await page.waitForTimeout(100)
    return page
  }
  const opened = async (page: Playwright.Page, label: string) => {
    await page.getByRole('button', { name: label }).click()
    await page.waitForTimeout(300)
  }
  const boxes = (page: Playwright.Page, id: string) =>
    page.evaluate((host) => {
      const m = document.querySelector<HTMLElement>(`#${host} [role="menu"]`)!
      const r = m.getBoundingClientRect(),
        t = document.querySelector(`#${host} button`)!.getBoundingClientRect()
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        tLeft: t.left,
        tRight: t.right,
        tTop: t.top,
        tBottom: t.bottom,
        vw: innerWidth,
        vh: innerHeight,
        side: m.dataset.side,
        origin: m.style.getPropertyValue('--warp-origin'),
      }
    }, id)
  return { fresh, opened, boxes }
}

// WebKit runs with WEFT_WEBKIT=1 (the release gate): on a Mac without a display session it only times out.
const engines = process.env.WEFT_WEBKIT
  ? (['chromium', 'webkit', 'firefox'] as const)
  : (['chromium', 'firefox'] as const)
describe.each(engines)('%s', (name) => {
  let browser: Playwright.Browser
  beforeAll(async () => {
    browser = await pw[name].launch()
  })
  afterAll(async () => {
    await browser?.close()
  })

  const { fresh, opened, boxes } = overlayHarness(() => browser)
  const cases = overlayCases({ fresh, opened, boxes })
  test('a menu low on the screen flips above its trigger, on-screen', cases.low)

  test('a menu at the right edge stays on-screen', cases.edge)

  test('align="end" lines up the ends, align="center" the middles', cases.align)

  test('in RTL align="start" lines up the right edges', cases.rtlMenu)

  test('a slider arrow in RTL goes the way it points', cases.rtlKeys)

  test('a menu follows its trigger through a scroll', cases.scroll)

  test('the last row of a long menu is reachable by keyboard, inside the panel', cases.keyboard)

  test('a menu item with href navigates, by click and by Enter', cases.link)

  test.each([
    ['modal', 'Open modal'],
    ['drawer', 'Open drawer'],
  ])('the page behind a %s stays put, then scrolls again', cases.pageLock)

  test('the lock keeps the scroll position', cases.lockPosition)

  test(
    'Escape in a combobox inside a modal closes the list, keeps the text, keeps the modal',
    cases.escape,
  )

  test('a click outside closes the combobox list only', cases.outside)

  test('a slider click in RTL lands where the pointer is', cases.rtlSlider)

  describe('toasts and modals', () => {
    const { region, where, undo, raise, set } = toastTools()
    const toastCases = toastCasesFor({ fresh, opened, region, where, undo, raise, set })

    test('Undo works when the toast is raised during a modal, and the modal stays', toastCases.undo)

    test('the toast sits at the viewport corner, not in the dialog box', toastCases.corner)

    test(
      'one already showing moves in without replaying, its timer running; back out on close',
      toastCases.move,
    )

    test('stacked modals: the top one holds it, closing returns it to the next', toastCases.stack)

    test.each([['drawer'], ['sheet']])('works over a %s', toastCases.surfaces)

    test('a timer ends inside the modal; hover still pauses it', toastCases.timer)

    test('a paused toast stays paused through the move', toastCases.pause)

    test(
      'focus stays put: on the modal when a toast arrives, on the toast through a stacked close',
      toastCases.focus,
    )

    test(
      'the live regions go with it and get the text (DOM only: no screen reader in this)',
      toastCases.live,
    )
  })

  test(
    'a required DateField stops the submit, says why, and lets it through once filled',
    cases.date,
  )
})

test('a classic scrollbar keeps its room when a modal opens (Chromium)', async () => {
  const browser = await pw.chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] })
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } })
  await page.goto(url)
  await page.waitForFunction(() => window.api)
  const width = () => page.evaluate(() => document.body.offsetWidth) // clientWidth reports the gutter's room as its own
  const before = await width()
  await page.evaluate(() => {
    window.api.modal.value = true
  })
  await page.waitForTimeout(300)
  expect(await width()).toBe(before)
  await browser.close()
})
