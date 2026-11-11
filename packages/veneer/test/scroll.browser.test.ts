// @vitest-environment node
// Smooth scrolling is veneer's default for the page, and only when nobody asked for less motion; in-page anchors land
// below the sticky top bar (--veneer-scroll-offset).
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type * as Playwright from 'playwright-core'

const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
const css = readFileSync(new URL('../../veneer-core/styles/veneer.css', import.meta.url), 'utf8')

let browser: Playwright.Browser
beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(() => browser?.close())
vi.setConfig({ testTimeout: 30_000 })

async function root(reducedMotion: 'reduce' | 'no-preference', attrs = '', style = '') {
  const page = await browser.newPage()
  await page.emulateMedia({ reducedMotion })
  await page.setContent(
    `<!doctype html><html ${attrs} style="${style}"><style>${css}</style><body><h2 id="t">x</h2></body></html>`,
  )
  const out = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement)
    const t = getComputedStyle(document.getElementById('t')!)
    return { behavior: s.scrollBehavior, margin: t.scrollMarginTop, padding: s.scrollPaddingTop }
  })
  await page.close()
  return out
}

test('the page scrolls smoothly by default', async () => {
  expect((await root('no-preference')).behavior).toBe('smooth')
})

test('not under the reduced-motion setting, nor data-motion="reduce"', async () => {
  expect((await root('reduce')).behavior).toBe('auto')
  expect((await root('no-preference', 'data-motion="reduce"')).behavior).toBe('auto')
})

test('an app that chose data-motion="full" keeps it', async () => {
  expect((await root('reduce', 'data-motion="full"')).behavior).toBe('smooth')
})

test('anchors land below the top bar, and a page sets its own offset', async () => {
  expect(parseFloat((await root('no-preference')).margin)).toBeGreaterThanOrEqual(48)
  expect((await root('no-preference', '', '--veneer-scroll-offset: 0px')).margin).toBe('0px')
  // never the root's scroll-padding: a view() timeline insets by it, and every flow exit would move
  expect((await root('no-preference')).padding).toBe('auto')
})
