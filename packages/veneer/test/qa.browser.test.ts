// @vitest-environment node
// QA defects jsdom can't show: real container queries, a real resize, real typing and a real hover, in Chromium.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type * as Playwright from 'playwright-core'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import kerf from '@kerf-js/core/vite'

const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 })

const types: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
}
let dist: string
let server: Server
let browser: Playwright.Browser
let page: Playwright.Page
const errors: string[] = []

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'veneer-qa-'))
  await build({
    root: fileURLToPath(new URL('./qa-browser', import.meta.url)),
    base: './',
    logLevel: 'silent',
    plugins: [kerf()],
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
  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`http://localhost:${(server.address() as AddressInfo).port}/`)
  await page.waitForSelector('#spark svg')
  await page.waitForTimeout(200)
})
afterAll(async () => {
  await browser?.close()
  server?.close()
  if (dist) rmSync(dist, { recursive: true, force: true })
})
afterEach(() => {
  expect(errors.splice(0)).toEqual([])
})

test('a 598px table has headers to press; a 342px one is cards', async () => {
  const look = (id: string) =>
    page.evaluate((which) => {
      const t = document.querySelector<HTMLElement>(`#${which} [data-scope="table"]`)!
      return {
        phone: t.dataset.phone,
        head: getComputedStyle(t.querySelector('thead')!).display,
        sort: t.querySelector('thead [data-part="sort"]')!.getBoundingClientRect().width,
        bar: !!t.querySelector('[data-part="sortbar"]'),
      }
    }, id)
  const wide = await look('desktop')
  expect(wide).toMatchObject({ phone: 'columns', head: 'table-header-group', bar: false })
  expect(wide.sort).toBeGreaterThan(0)
  expect(await look('narrow')).toMatchObject({ phone: 'cards', head: 'none', bar: true })
})

test('a resize with a Select open throws nothing', async () => {
  const select = page.locator('#pick button[role="combobox"]')
  await select.focus()
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(100)
  expect(await select.getAttribute('aria-expanded')).toBe('true')
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.waitForTimeout(100)
  await page.keyboard.press('Escape')
})

test('typing into an empty editor throws nothing', async () => {
  await page.click('#edit [contenteditable]')
  await page.keyboard.type('hello there')
  await page.keyboard.press('Enter')
  await page.keyboard.type('# heading')
  expect(await page.textContent('#edit [contenteditable]')).toContain('heading')
})

test('hovering a sparkline moves its dot and says the value', async () => {
  const dot = () =>
    page.evaluate(() => {
      const d = document.querySelector('#spark .dot')!
      return [d.getAttribute('cx'), d.getAttribute('cy')]
    })
  const home = await dot()
  const r = (await page.locator('#spark svg').boundingBox())!
  await page.mouse.move(r.x + 70, r.y + 18)
  await page.waitForTimeout(50)
  expect(await page.textContent('#spark text')).toBe('30')
  expect(await dot()).not.toEqual(home)
  await page.mouse.move(r.x + 70, r.y + 200)
  await page.waitForTimeout(50)
  expect(await page.locator('#spark text').count()).toBe(0)
  expect(await dot()).toEqual(home)
})
