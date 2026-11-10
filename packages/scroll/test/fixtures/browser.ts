// The browser suites' harness: the package bundled from source with its stylesheet, a page per case in each browser,
// and the helpers the cases share.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { rolldown } from 'rolldown'
import type * as Playwright from 'playwright-core'
import type * as Scroll from '../../src/index'
import type * as Canvas from '../../src/canvas'
import type * as Virtual from '../../../warp-core/src/virtual'

declare global {
  interface Window {
    scroll_: typeof Scroll & typeof Canvas & typeof Virtual
    s: Scroll.Scroller
    log: Scroll.ScrollState[]
  }
}

const pw = createRequire(import.meta.url)('playwright-core') as typeof Playwright

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const css = readFileSync(at('../../styles/scroll.css'), 'utf8')
let bundle = ''
async function load() {
  if (bundle) return
  const entry = at('./browser-entry.ts')
  const build = await rolldown({ input: entry })
  bundle = (await build.generate({ format: 'iife', name: 'scroll_' })).output[0].code
}

export const rows = (n: number, tag = 'p') =>
  Array.from(
    { length: n },
    (_, i) => `<${tag} style="margin:0;height:40px">Row ${i}</${tag}>`,
  ).join('')
export const AREA = (inner: string, style = 'width:300px;height:200px') =>
  `<div id="root" style="${style}"><div data-part="viewport"><div data-part="content">${inner}</div></div></div>`

export async function open(
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
export const top = (page: Playwright.Page, sel = '#root [data-part="viewport"]') =>
  page.$eval(sel, (el) => el.scrollTop)
export const settle = (page: Playwright.Page, ms = 450) => page.waitForTimeout(ms)

export const engines = process.env.WEFT_WEBKIT
  ? (['chromium', 'firefox', 'webkit'] as const)
  : (['chromium', 'firefox'] as const)

export type Case = (page: Playwright.Page) => Promise<void>

/** Run each case on a fresh page in each browser. */
export function run(cases: Record<string, Case>) {
  vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })
  describe.each(engines)('%s', (name) => {
    let browser: Playwright.Browser
    let page: Playwright.Page
    beforeAll(async () => {
      await load()
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
}
