// @vitest-environment node
// What the judge saw that jsdom can't: real sizes, a real chevron in a narrow select, a table that scrolls, and a
// pressed toggle's stroke after release, in Chromium.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import weft from 'weft/vite'

const { chromium } = createRequire(import.meta.url)('playwright-core')
vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 })

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
let dist, server, browser, page
const errors = []

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'warp-polish-'))
  await build({ root: fileURLToPath(new URL('./polish-browser', import.meta.url)), base: './', logLevel: 'silent', plugins: [weft()], build: { outDir: dist, emptyOutDir: true } })
  server = createServer((q, r) => {
    let p = join(dist, q.url.split('?')[0])
    if (p.endsWith('/')) p += 'index.html'
    if (!existsSync(p)) { r.statusCode = 404; return r.end() }
    r.setHeader('content-type', types[extname(p)] ?? 'application/octet-stream')
    r.end(readFileSync(p))
  }).listen(0)
  await new Promise(r => server.once('listening', r))
  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`http://localhost:${server.address().port}/`)
  await page.waitForSelector('#toggles button')
  await page.waitForTimeout(300)
})
afterAll(async () => { await browser?.close(); server?.close(); if (dist) rmSync(dist, { recursive: true, force: true }) })
afterEach(() => { expect(errors.splice(0)).toEqual([]) })

test('Toggle sizes differ: sm is shorter than md, lg taller', async () => {
  const h = await page.$$eval('#toggles button', bs => bs.map(b => b.getBoundingClientRect().height))
  expect(h[0]).toBeLessThan(h[1])
  expect(h[2]).toBeGreaterThan(h[1])
})

test('a toggle released from pressed keeps no stroke once the pointer leaves', async () => {
  const t = page.locator('#toggles button').nth(1)
  await t.click()
  expect(await t.getAttribute('aria-pressed')).toBe('false')
  await page.mouse.move(5, 800)
  await page.waitForTimeout(60) // well inside the sweep's own exit, which would still be drawing a bracket
  const left = await t.evaluate(b => { const s = getComputedStyle(b.querySelector('[data-part="sweep"]')); return { clip: s.clipPath, sl: s.getPropertyValue('--_sl'), sr: s.getPropertyValue('--_sr') } })
  expect(left.sl.trim()).toBe('100%')
  expect(left.sr.trim()).toBe('100%')
  await t.click() // pressed again: the stroke is held as before
  await page.mouse.move(5, 800)
  await page.waitForTimeout(700)
  expect(await t.evaluate(b => getComputedStyle(b.querySelector('[data-part="sweep"]')).getPropertyValue('--_sr').trim())).toBe('0%')
})

const clearOfChevron = sel => page.evaluate(sel => {
  const f = document.querySelector(sel)
  const v = f.querySelector('[data-part="value"]'), i = f.querySelector('[data-part="indicator"]')
  const r = document.createRange(); r.selectNodeContents(v)
  return { text: v.textContent, textEnd: r.getBoundingClientRect().right, chevron: i.getBoundingClientRect().left, clipped: v.scrollWidth > v.clientWidth + 0.5 }
}, sel)

test('a narrow select keeps its value clear of the chevron (sort bar, pager size)', async () => {
  for (const sel of ['#sortbar [data-part="sortbar"] [data-scope="field"]', '#pager [data-scope="field"]']) {
    const m = await clearOfChevron(sel)
    expect(m.text.length).toBeGreaterThan(0)
    expect(m.textEnd).toBeLessThanOrEqual(m.chevron)
    expect(m.clipped).toBe(false)
  }
})

test('a table wider than its box scrolls and shows an edge shadow on the side with more', async () => {
  const look = () => page.evaluate(() => {
    const t = document.querySelector('#wide [data-scope="table"]'), v = t.querySelector('[data-part="viewport"]')
    return { overflow: t.dataset.overflow ?? '', start: getComputedStyle(t, '::before').opacity, end: getComputedStyle(t, '::after').opacity, sw: v.scrollWidth, cw: v.clientWidth, x: v.scrollLeft }
  })
  const rest = await look()
  expect(rest.sw).toBeGreaterThan(rest.cw)
  expect(rest.overflow).toBe('end')
  await page.waitForTimeout(250)
  expect((await look()).end).toBe('1')
  expect((await look()).start).toBe('0')
  await page.evaluate(() => { const v = document.querySelector('#wide [data-part="viewport"]'); v.scrollLeft = v.scrollWidth })
  await page.waitForTimeout(250)
  const far = await look()
  expect(far.x).toBeGreaterThan(0)
  expect(far.overflow).toBe('start')
  expect(far.start).toBe('1')
  expect(far.end).toBe('0')
  // a table that fits says nothing
  expect(await page.evaluate(() => document.querySelector('#sortbar [data-scope="table"]').dataset.overflow ?? '')).toBe('')
})
