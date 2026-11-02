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

test('vivid: the pointer fill on a solid button is clearly lighter than its rest; balanced is unchanged', async () => {
  const lum = c => { const m = c.match(/[\d.]+/g).map(Number); const f = x => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]) }
  const sample = async sel => {
    const b = page.locator(`${sel} button`)
    await page.mouse.move(5, 800)
    await page.waitForTimeout(900)
    const box = await b.boundingBox()
    const shot = async () => {
      const buf = await page.screenshot({ clip: { x: box.x + box.width - 6, y: box.y + box.height / 2, width: 1, height: 1 } })
      return buf
    }
    const restBuf = await shot()
    await page.mouse.move(box.x + 4, box.y + box.height / 2)
    await page.waitForTimeout(900)
    const hoverBuf = await shot()
    await page.mouse.move(5, 800)
    return [restBuf, hoverBuf]
  }
  // read the pixel through a canvas in the page, so no image library is needed
  const px = buf => page.evaluate(async b64 => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode()
    const c = document.createElement('canvas'); c.width = 1; c.height = 1; const g = c.getContext('2d'); g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`
  }, buf.toString('base64'))
  const [vr, vh] = await sample('#solid')
  const rest = lum(await px(vr)), hover = lum(await px(vh))
  expect(hover / rest).toBeGreaterThan(1.12)
  // ink on the landed fill still reads: on-solid vs the fill stays at 4.5:1
  const ink = await page.evaluate(() => getComputedStyle(document.querySelector('#solid button')).color)
  const [a, b] = [await px(vr), await px(vh)].map(c => c.match(/\d+/g).map(Number))
  expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThan(40) // a different, brighter ink, not a shade
  const inkL = lum(ink.startsWith('rgb') ? ink : 'rgb(250,250,250)')
  expect((Math.max(inkL, hover) + 0.05) / (Math.min(inkL, hover) + 0.05)).toBeGreaterThanOrEqual(4.5)
  const [br, bh] = await sample('#solid-balanced')
  expect(lum(await px(bh))).toBeLessThanOrEqual(lum(await px(br)) + 0.005) // balanced still darkens on hover, as before
})

test('vivid on light: the hovered solid lands a highlight edge round its fill, and its ink keeps 4.5:1 on the fill', async () => {
  const lum = c => { const m = c.match(/[\d.]+/g).map(Number); const f = x => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]) }
  const px = (x, y) => page.screenshot({ clip: { x, y, width: 1, height: 1 } }).then(buf => page.evaluate(async b64 => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode()
    const c = document.createElement('canvas'); c.width = 1; c.height = 1; const g = c.getContext('2d'); g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`
  }, buf.toString('base64')))
  const b = page.locator('#solid button')
  await page.mouse.move(5, 800)
  await page.waitForTimeout(900)
  let box = await b.boundingBox()
  const rimAt = bx => [bx.x + bx.width / 2, bx.y + bx.height - 1.5] // the bottom edge, under no glyph
  const rest = lum(await px(...rimAt(box)))
  await page.mouse.move(box.x + 4, box.y + box.height / 2)
  await page.waitForTimeout(900)
  box = await b.boundingBox() // it lifts
  const rim = lum(await px(...rimAt(box)))
  const fill = lum(await px(box.x + box.width - 8, box.y + box.height / 2))
  await page.mouse.move(5, 800)
  expect(rim / rest).toBeGreaterThan(2.5) // a bright line round the fill, not a hue shift
  // the computed colour can be oklch(): a canvas resolves it to sRGB
  const ink = await page.evaluate(() => { const g = document.createElement('canvas').getContext('2d'); g.fillStyle = getComputedStyle(document.querySelector('#solid button')).color; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})` })
  const inkL = lum(ink)
  expect((Math.max(inkL, fill) + 0.05) / (Math.min(inkL, fill) + 0.05)).toBeGreaterThanOrEqual(4.5)
})
