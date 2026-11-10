// @vitest-environment node
// Smooth scrolling is warp's default for the page, and only when nobody asked for less motion; in-page anchors land
// below the sticky top bar (--warp-scroll-offset).
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type * as Playwright from 'playwright-core'

const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
const css = readFileSync(new URL('../../warp-core/styles/warp.css', import.meta.url), 'utf8')

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
    `<!doctype html><html ${attrs} style="${style}"><style>${css}</style><body><p>x</p></body></html>`,
  )
  const out = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement)
    return { behavior: s.scrollBehavior, padding: s.scrollPaddingTop }
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
  expect(parseFloat((await root('no-preference')).padding)).toBeGreaterThanOrEqual(48)
  expect((await root('no-preference', '', '--warp-scroll-offset: 0px')).padding).toBe('0px')
})
