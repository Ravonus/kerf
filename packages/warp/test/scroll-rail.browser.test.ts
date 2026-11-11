// @vitest-environment node
// ScrollRail's stylesheet on a phone and on a desktop: the rail is warp's on every device, in place of the native
// page bar. On a touch screen it lets every swipe through except on its thumb, which always takes a finger.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type * as Playwright from 'playwright-core'

const pw = createRequire(import.meta.url)('playwright-core') as typeof Playwright
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const css =
  read('../../warp-core/styles/warp.css') + read('../../warp-core/styles/layout/scroll-rail.css')
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

const page = `<!doctype html><html><head><style>${css}</style></head><body style="margin:0">
  <main id="content" style="height:3000px">content</main>
  <div data-scope="scroll-rail" aria-hidden="true">
    <div data-part="thumb" style="block-size:80px;translate:0 100px"></div>
  </div></body></html>`

async function open(browser: Playwright.Browser, device?: string) {
  const context = await browser.newContext(
    device ? { ...pw.devices[device] } : { viewport: { width: 800, height: 600 } },
  )
  const p = await context.newPage()
  await p.setContent(page)
  return p
}

/** The rail, its thumb, and what a pointer lands on at the thumb's middle and just beside it. */
const read_ = (p: Playwright.Page) =>
  p.evaluate(() => {
    const rail = document.querySelector<HTMLElement>('[data-scope="scroll-rail"]')!
    const thumb = rail.firstElementChild as HTMLElement
    const r = thumb.getBoundingClientRect()
    const at = (x: number) => {
      const el = document.elementFromPoint(x, r.y + r.height / 2)
      return el === thumb ? 'thumb' : el === rail ? 'rail' : (el?.id ?? 'other')
    }
    return {
      native: getComputedStyle(document.documentElement).scrollbarWidth,
      shown: getComputedStyle(rail).display,
      railX: rail.getBoundingClientRect().right,
      width: innerWidth,
      on: at(r.x + r.width / 2),
      beside: at(r.x - 10),
    }
  })
const activate = (p: Playwright.Page) =>
  p.evaluate(() =>
    document.querySelector('[data-scope="scroll-rail"]')!.setAttribute('data-active', ''),
  )

// WebKit runs with WEFT_WEBKIT=1, as the other suites do: the release gate installs it, the merge gate doesn't.
const phones = process.env.WEFT_WEBKIT
  ? ([
      ['webkit', 'iPhone 15'],
      ['chromium', 'Pixel 7'],
    ] as const)
  : ([['chromium', 'Pixel 7']] as const)

describe.each(phones)('%s as %s', (name, device) => {
  let browser: Playwright.Browser
  beforeAll(async () => {
    browser = await pw[name].launch()
  })
  afterAll(() => browser?.close())

  test('the rail is drawn in place of the native page bar', async () => {
    const p = await open(browser, device)
    const r = await read_(p)
    expect(r.native).toBe('none')
    expect(r.shown).toBe('block')
    expect(r.railX).toBeCloseTo(r.width, 0)
  })

  test('the thumb takes a finger at rest as well as while the page moves; the rest of the rail lets it through', async () => {
    // A thumb that only took touches while the page moved left a late finger on the page, which then scrolled the
    // wrong way under it.
    const p = await open(browser, device)
    expect(await read_(p)).toMatchObject({ on: 'thumb', beside: 'thumb' })
    await activate(p)
    expect(await read_(p)).toMatchObject({ on: 'thumb', beside: 'thumb' })
    const below = await p.evaluate(() => {
      const r = document.querySelector('[data-part="thumb"]')!.getBoundingClientRect()
      return document.elementFromPoint(r.x + r.width / 2, r.bottom + 60)?.id
    })
    expect(below).toBe('content')
  })
})

describe('chromium with a mouse', () => {
  let browser: Playwright.Browser
  beforeAll(async () => {
    browser = await pw.chromium.launch()
  })
  afterAll(() => browser?.close())

  test('the rail and its thumb take the pointer at rest, to press and drag', async () => {
    const p = await open(browser)
    expect(await read_(p)).toMatchObject({
      native: 'none',
      shown: 'block',
      on: 'thumb',
      beside: 'content',
    })
  })
})
