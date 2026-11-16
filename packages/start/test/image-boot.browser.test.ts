// Exercise the emitted bootstrap in a real browser with an intentionally held artwork response.
import { createRequire } from 'node:module'
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest'
import type * as Playwright from 'playwright-core'
import { entryScript } from '../src/server/image-boot'
import { capture } from '../src/capture'
const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
let browser: Playwright.Browser
beforeAll(async () => {
  browser = await chromium.launch(
    process.env.KERF_CHROME ? { executablePath: process.env.KERF_CHROME } : {},
  )
})
afterEach(async () => {
  await Promise.all(browser.contexts().map((c) => c.close()))
})
afterAll(async () => {
  await browser.close()
})
async function open() {
  const page = await browser.newPage()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('https://media.test/**', async (route) => {
    const url = route.request().url()
    if (url.endsWith('/art.svg')) {
      await gate
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="pink"/></svg>',
      })
    } else if (url.endsWith('/entry.js')) {
      await route.fulfill({
        contentType: 'application/javascript',
        body: 'window.__mediaBoot={complete:document.querySelector("img").complete};',
      })
    } else {
      await route.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><head><link rel="modulepreload" href="/entry.js"><script>${capture(true)}</script>${entryScript('/entry.js', true)}</head><body><h1>Artwork</h1><img src="/art.svg" width="100" height="100" fetchpriority="high"><button>Open menu</button></body></html>`,
      })
    }
  })
  const fetched = page.waitForResponse('https://media.test/entry.js')
  await page.goto('https://media.test/', { waitUntil: 'commit' })
  await fetched
  await page.getByRole('heading', { name: 'Artwork' }).waitFor()
  return { page, release }
}
test('prefetches code but lets the priority artwork decode and paint before startup', async () => {
  const { page, release } = await open()
  expect(await page.evaluate(() => Object.hasOwn(window, '__mediaBoot'))).toBe(false)
  release()
  await page.waitForFunction(() => Object.hasOwn(window, '__mediaBoot'))
  expect(await page.evaluate(() => Reflect.get(window, '__mediaBoot').complete)).toBe(true)
})
test('starts immediately on intent while the artwork is still pending', async () => {
  const { page, release } = await open()
  await page.getByRole('button', { name: 'Open menu' }).click()
  await page.waitForFunction(() => Object.hasOwn(window, '__mediaBoot'))
  expect(await page.evaluate(() => Reflect.get(window, '__mediaBoot').complete)).toBe(false)
  release()
})

test('scroll intent starts the viewport lifecycle before a pending opening image', async () => {
  const { page, release } = await open()
  await page.mouse.wheel(0, 400)
  await page.waitForFunction(() => Object.hasOwn(window, '__mediaBoot'))
  expect(await page.evaluate(() => Reflect.get(window, '__mediaBoot').complete)).toBe(false)
  release()
})
