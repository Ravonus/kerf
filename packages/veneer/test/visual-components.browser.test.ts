// @vitest-environment node
import { createRequire } from 'node:module'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type * as Playwright from 'playwright-core'
import { build } from 'vite'
import kerf from '@kerf-js/core/vite'

const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

let server: Server
let dist: string
let browser: Playwright.Browser
let page: Playwright.Page
let url: string
const errors: string[] = []

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'veneer-visuals-'))
  await build({
    root: fileURLToPath(new URL('./visuals', import.meta.url)),
    base: './',
    configFile: false,
    logLevel: 'silent',
    plugins: [kerf()],
    build: { outDir: dist, emptyOutDir: true },
  })
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
  }
  server = createServer((request, response) => {
    const path = join(
      dist,
      (request.url === '/' ? 'index.html' : (request.url ?? '')).split('?')[0]!,
    )
    try {
      const contents = readFileSync(path)
      response.setHeader('content-type', types[extname(path)] ?? 'application/octet-stream')
      response.end(contents)
    } catch {
      response.writeHead(404).end()
    }
  }).listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => {
    server.once('listening', resolve)
  })
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
  browser = await chromium.launch()
})

beforeEach(async () => {
  errors.length = 0
  page = await browser.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
})
afterEach(async () => {
  await page.close()
  expect(errors).toEqual([])
})
afterAll(async () => {
  await browser?.close()
  server?.close()
  if (dist) rmSync(dist, { recursive: true, force: true })
})

const part = (name: string) => page.locator(`[data-part="${name}"]`)
const button = (name: string | RegExp) => page.getByRole('button', { name })
const focused = () => page.locator(':focus')
const pixels = (canvas: Playwright.Locator) =>
  canvas.evaluate((node) => {
    const el = node as HTMLCanvasElement
    const rgba = el.getContext('2d')!.getImageData(0, 0, el.width, el.height).data
    return rgba.some((alpha, index) => index % 4 === 3 && alpha !== 0) ? el.toDataURL() : ''
  })

test('artwork repairs alpha corners and keeps the accessible fallback after load failure', async () => {
  await page.goto(url)
  await expect.poll(() => page.locator('#scan').textContent()).toBe('transparent-corners')
  expect(
    await part('artwork-image-layer').evaluate((el) => (el as HTMLElement).style.backgroundColor),
  ).not.toBe('')
  expect(await page.getByRole('img', { name: 'Seeded dunes' }).count()).toBe(1)
  await button('Use missing image').click()
  const fallback = page.getByRole('img', { name: 'Rounded artwork' })
  await fallback.waitFor()
  expect(await fallback.getAttribute('data-part')).toBe('artwork-fallback')
})

test('celebration supports Escape, timed dismissal and focus return', async () => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  const opener = button('Celebrate')
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Export complete' })
  await dialog.waitFor()
  expect(await focused().textContent()).toBe('Export complete')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  await expect.poll(() => focused().textContent()).toBe('Celebrate')
  expect(await page.locator('#dismissed').textContent()).toBe('1')
  await button('Timed celebration').click()
  await dialog.waitFor()
  await dialog.waitFor({ state: 'hidden' })
  await expect.poll(() => focused().textContent()).toBe('Timed celebration')
  expect(await page.locator('#dismissed').textContent()).toBe('2')
})

test('scratch cover hides links until native keyboard reveal advances focus', async () => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  const cover = button('Reveal the archive')
  await cover.focus()
  expect(await page.getByRole('link', { name: 'Visit archive' }).count()).toBe(0)
  await page.keyboard.press('Space')
  const link = page.getByRole('link', { name: 'Visit archive' })
  await link.waitFor()
  await expect.poll(() => focused().getAttribute('data-part')).toBe('scratch-result')
  await page.keyboard.press('Tab')
  expect(await focused().textContent()).toBe('Visit archive')
  expect(await page.locator('#reveals').textContent()).toBe('1')
})

test('scratching uses distinct area and unlocks the actual content', async () => {
  await page.goto(url)
  const cover = button('Reveal the archive')
  await cover.scrollIntoViewIfNeeded()
  const box = (await cover.boundingBox())!
  await page.mouse.move(box.x + 10, box.y + 15)
  await page.mouse.down()
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(box.x + box.width - 10, box.y + 15, { steps: 8 })
    await page.mouse.move(box.x + 10, box.y + 15, { steps: 8 })
  }
  await page.mouse.up()
  expect(await page.locator('#reveals').textContent()).toBe('0')
  await page.mouse.move(box.x + 10, box.y + 75)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 10, box.y + 75, { steps: 10 })
  await page.mouse.up()
  await expect.poll(() => page.locator('#reveals').textContent()).toBe('1')
})

test('locked tile gates its control and responds to the theme', async () => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto(url)
  const tile = page.getByRole('group', { name: 'History' })
  const light = await tile.evaluate((el) => getComputedStyle(el).backgroundColor)
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  expect(await tile.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(light)
  expect(await tile.getByRole('link').count()).toBe(0)
  expect(
    await tile.getByRole('progressbar', { name: 'Review progress' }).getAttribute('aria-valuenow'),
  ).toBe('40')
  await button('Unlock history').click()
  await tile.getByRole('link', { name: 'View history' }).waitFor()
  expect(await tile.getByRole('progressbar').count()).toBe(0)
})

test('count and heading fit a phone and their actions retain native keyboard behavior', async () => {
  await page.setViewportSize({ width: 320, height: 760 })
  await page.goto(url)
  const heading = page.getByRole('heading', { name: 'Report index', level: 3 })
  const action = page.getByRole('link', { name: 'Browse reports' })
  expect((await action.boundingBox())!.y).toBeGreaterThan((await heading.boundingBox())!.y)
  const add = button('Add result')
  await add.focus()
  await page.keyboard.press('Enter')
  const count = page.locator('[data-part="results-count"][role="status"]')
  expect(await count.textContent()).toBe('1,201 records')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
})

test('field uses native form data and accordion arrows skip disabled items', async () => {
  await page.goto(url)
  const input = page.getByRole('textbox', { name: 'Identifier' })
  await input.fill('42')
  expect(await input.getAttribute('aria-describedby')).toBe('external-help identifier-msg')
  expect(
    await input.evaluate((el) => new FormData((el as HTMLInputElement).form!).get('identifier')),
  ).toBe('42')
  const first = button(/First New Optional/)
  await first.focus()
  await page.keyboard.press('ArrowDown')
  expect(await focused().textContent()).toBe('Last')
  await page.keyboard.press('Enter')
  expect(await first.getAttribute('aria-expanded')).toBe('true')
  expect(await button('Last').getAttribute('aria-expanded')).toBe('true')
  await page.keyboard.press('Space')
  expect(await page.getByRole('link', { name: 'Last panel link' }).count()).toBe(0)
})

test('particles paint still frames, replay on command, and the streak glow respects reduced motion', async () => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(url)
  const burst = page.getByTestId('burst').locator('canvas')
  const field = page.getByTestId('field').locator('canvas')
  await expect.poll(() => pixels(burst)).not.toBe('')
  await expect.poll(() => pixels(field)).not.toBe('')
  const still = await pixels(field)
  await button('Toggle burst').click()
  expect(await burst.count()).toBe(0)
  await button('Toggle burst').click()
  await expect.poll(() => pixels(burst)).not.toBe('')
  expect(await pixels(field)).toBe(still)
  expect(await part('streak-glow').evaluate((el) => getComputedStyle(el).animationName)).toBe(
    'none',
  )
})

test('particle field pauses in place and a finite burst eventually clears', async () => {
  await page.goto(url)
  const burst = page.getByTestId('burst').locator('canvas')
  const field = page.getByTestId('field').locator('canvas')
  await expect.poll(() => pixels(burst)).not.toBe('')
  await expect.poll(() => pixels(field)).not.toBe('')
  await button('Pause or resume field').click()
  const frozen = await pixels(field)
  await expect.poll(() => pixels(burst), { timeout: 6000 }).toBe('')
  expect(await pixels(field)).toBe(frozen)
  await button('Pause or resume field').click()
  await expect.poll(() => pixels(field)).not.toBe(frozen)
})

test('progressive picture keeps its preview during loading and failure', async () => {
  let release: (() => void) | undefined
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/late-picture.svg', async (route) => {
    await pending
    await route.fulfill({ status: 404 })
  })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  const picture = page.getByRole('img', { name: 'Progressive artwork' })
  const preview = picture.locator('[data-layer="preview"]')
  const main = picture.locator('[data-layer="main"]')
  try {
    await expect.poll(() => preview.getAttribute('data-picture-status')).toBe('ready')
    const before = await picture.boundingBox()
    expect(await picture.getAttribute('data-kerf-shared')).toBe('artwork')
    expect(await main.getAttribute('fetchpriority')).toBe('high')
    release?.()
    await expect.poll(() => main.getAttribute('data-picture-status')).toBe('failed')
    expect(await preview.isVisible()).toBe(true)
    const after = await picture.boundingBox()
    expect(after?.width).toBe(before?.width)
    expect(after?.height).toBe(before?.height)
  } finally {
    release?.()
  }
})
