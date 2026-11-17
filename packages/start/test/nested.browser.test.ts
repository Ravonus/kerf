// A layout below the root, in Chrome: the level under it changes while the layout stays. The pages are static levels
// with one island at their top, so the island's nodes are the level's own, and a pending shape takes their place
// while the next page loads.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type * as Playwright from 'playwright-core'
import { freePort } from '../../../scripts/lib/helpers.mjs'
import { dev } from '../src/app.mjs'

const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
const root = fileURLToPath(new URL('./fixtures/nested', import.meta.url))
let browser: Playwright.Browser
let server: Awaited<ReturnType<typeof dev>>
let url: string
beforeAll(async () => {
  server = await dev({
    root,
    site: { name: 'Nested', url: 'https://nested.dev' },
    port: await freePort(), // its own: shape.browser.test.ts runs beside it on the default
    logLevel: 'error',
  })
  url = server.resolvedUrls!.local[0]!.replace(/\/$/, '')
  browser = await chromium.launch()
})
afterAll(async () => {
  await browser?.close()
  await server?.close()
})

async function open(path: string) {
  const page = await browser.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(url + path)
  await page.waitForFunction(() => window.__kerf?.hydrated, null, { timeout: 30_000 })
  return { page, errors }
}

const panel = (page: Playwright.Page, text: string) =>
  page.waitForFunction(
    (t) => document.querySelector('.explorer .panel')?.textContent?.trim() === t,
    text,
  )

test('a page under a server-rendered nested layout shows after a client navigation, and going back', async () => {
  const { page, errors } = await open('/explorer')
  await panel(page, 'Network rows 0')
  await page.click('.chrome') // the layout's own state, which has to survive
  await page.click('nav a[href="/explorer/transactions"]')
  await panel(page, 'Transactions rows 0')
  await page.click('.panel')
  await panel(page, 'Transactions rows 1')
  await page.click('nav a[href="/explorer"]')
  await panel(page, 'Network rows 0')
  expect(await page.textContent('.chrome')).toBe('Explorer 1')
  expect(await page.$$eval('.explorer .panel', (all) => all.length)).toBe(1)
  expect(await page.$('[inert][aria-hidden]')).toBeNull()
  expect(errors).toEqual([])
  await page.close()
})

test('the same pages reached by a client navigation run where they were put', async () => {
  const { page, errors } = await open('/')
  await page.click('nav a[href="/explorer"]')
  // The island's Boundary resolves after its level's nodes moved from where they were built into the page.
  await panel(page, 'Network rows 0')
  await page.click('.panel')
  await panel(page, 'Network rows 1')
  await page.click('nav a[href="/explorer/transactions"]')
  await panel(page, 'Transactions rows 0')
  await page.click('nav a[href="/"]')
  await page.waitForSelector('.home')
  expect(await page.$('.explorer')).toBeNull()
  expect(errors).toEqual([])
  await page.close()
})

test('a navigation given up while its shape shows puts the page back as it was, still running', async () => {
  const { page, errors } = await open('/explorer')
  await panel(page, 'Network rows 0')
  await page.click('.panel')
  await panel(page, 'Network rows 1')
  await page.route('**/_kerf/data/explorer/transactions*', () => {}) // never answers
  await page.click('nav a[href="/explorer/transactions"]')
  await page.waitForSelector('.explorer [inert][aria-hidden]')
  expect(await page.$('.explorer > .panel')).toBeNull() // the island's nodes left with their level
  await page.goBack()
  await panel(page, 'Network rows 1')
  expect(await page.$('[inert][aria-hidden]')).toBeNull()
  await page.click('.panel')
  await panel(page, 'Network rows 2')
  expect(errors).toEqual([])
  await page.close()
})
