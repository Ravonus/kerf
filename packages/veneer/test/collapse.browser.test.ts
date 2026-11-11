// @vitest-environment node
// Button's `collapse`, from veneer's real stylesheets in Chrome: on a phone only the icon shows, the button is square even
// when the app widens it for the wide look, and the text is still what a screen reader announces.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type * as Playwright from 'playwright-core'

const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

const styles = fileURLToPath(new URL('../../veneer-core/styles', import.meta.url))
const css = ['veneer.css', 'components/base.css', 'components/button.css']
  .map((f) => readFileSync(join(styles, f), 'utf8'))
  .join('\n')
// the site's own rule for its wide search field: unlayered, so it beats veneer's layers unless collapse holds the square
const app = '.search { inline-size: 240px; justify-content: flex-start }'
const button = (collapse: string) =>
  `<button type="button" class="search" data-scope="button" data-emphasis="outline" data-size="sm" data-collapse="${collapse}"><svg data-icon aria-hidden="true" width="16" height="16"></svg><span data-part="collapse"><span>Search</span><span aria-hidden="true">⌘K</span></span></button>`

let browser: Playwright.Browser
beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(async () => {
  await browser?.close()
})

async function at(width: number, collapse: string) {
  const context = await browser.newContext({ viewport: { width, height: 700 } })
  const page = await context.newPage()
  await page.setContent(
    `<!doctype html><html><style>${css}</style><style>${app}</style><body>${button(collapse)}`,
  )
  const box = await page.locator('button').boundingBox()
  const named = await page.getByRole('button', { name: 'Search', exact: true }).count()
  const shown = await page.locator('[data-part="collapse"]').boundingBox()
  await context.close()
  return { width: Math.round(box!.width), named, textWidth: Math.round(shown!.width) }
}

test('tablet: an icon on a phone and a tablet, the whole field on a desktop; named Search at every width', async () => {
  const phone = await at(390, 'tablet')
  const tablet = await at(800, 'tablet')
  const desktop = await at(1280, 'tablet')
  expect([phone.width < 48, phone.textWidth, phone.named]).toEqual([true, 1, 1])
  expect([tablet.width < 48, tablet.textWidth, tablet.named]).toEqual([true, 1, 1])
  expect([desktop.width, desktop.named]).toEqual([240, 1])
  expect(desktop.textWidth).toBeGreaterThan(40)
})

test('phone: collapses on a phone only', async () => {
  expect((await at(390, 'phone')).width).toBeLessThan(48)
  expect((await at(800, 'phone')).width).toBe(240)
})
