// @vitest-environment node
// What jsdom can't see, in all three engines and warp's real CSS: where a panel lands, what scrolls, who Escape closes.
// Built with the production CSS purge, so a rule the purge would drop (the scroll lock) fails here rather than in an app.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import weft from 'weft/vite'

const pw = createRequire(import.meta.url)('playwright-core')
vi.setConfig({ testTimeout: 60_000, hookTimeout: 180_000 })

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
let dist, server, url

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'warp-overlays-'))
  await build({ root: fileURLToPath(new URL('./overlays', import.meta.url)), base: './', logLevel: 'silent', plugins: [weft()], build: { outDir: dist, emptyOutDir: true } })
  server = createServer((q, r) => {
    let p = join(dist, q.url.split('?')[0])
    if (p.endsWith('/')) p += 'index.html'
    if (!existsSync(p)) { r.statusCode = 404; return r.end() }
    r.setHeader('content-type', types[extname(p)] ?? 'application/octet-stream')
    r.end(readFileSync(p))
  }).listen(0)
  await new Promise(r => server.once('listening', r))
  url = `http://localhost:${server.address().port}/`
})
afterAll(() => { server?.close(); rmSync(dist, { recursive: true, force: true }) })

describe.each(['chromium', 'webkit', 'firefox'])('%s', name => {
  let browser
  beforeAll(async () => { browser = await pw[name].launch() })
  afterAll(async () => { await browser?.close() })

  async function fresh() {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } })
    await page.goto(url)
    await page.waitForFunction(() => window.api)
    await page.waitForTimeout(100)
    return page
  }
  const opened = async (page, label) => { await page.getByRole('button', { name: label }).click(); await page.waitForTimeout(300) }
  const boxes = (page, id) => page.evaluate(id => {
    const m = document.querySelector(`#${id} [role="menu"]`)
    const r = m.getBoundingClientRect(), t = document.querySelector(`#${id} button`).getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, tLeft: t.left, tRight: t.right, tTop: t.top, tBottom: t.bottom, vw: innerWidth, vh: innerHeight, side: m.dataset.side, origin: m.style.getPropertyValue('--warp-origin') }
  }, id)

  test('a menu low on the screen flips above its trigger, on-screen', async () => {
    const page = await fresh()
    await opened(page, 'LowMenu')
    const b = await boxes(page, 'low')
    expect(b.side).toBe('top')
    expect(b.bottom).toBeLessThanOrEqual(b.tTop)
    expect(b.top).toBeGreaterThanOrEqual(8)
    expect(b.origin).not.toBe('0px 0px')
    await page.close()
  })

  test('a menu at the right edge stays on-screen', async () => {
    const page = await fresh()
    await opened(page, 'EdgeMenu')
    const b = await boxes(page, 'edge')
    expect(b.right).toBeLessThanOrEqual(b.vw - 8 + 0.5)
    await page.close()
  })

  test('align="end" lines up the ends, align="center" the middles', async () => {
    const page = await fresh()
    await opened(page, 'EndMenu')
    const e = await boxes(page, 'end')
    expect(Math.abs(e.right - e.tRight)).toBeLessThanOrEqual(2) // place() rounds
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
    await opened(page, 'CenterMenu')
    const c = await boxes(page, 'center')
    expect(Math.abs((c.left + c.right) / 2 - (c.tLeft + c.tRight) / 2)).toBeLessThanOrEqual(2)
    await page.close()
  })

  test('a menu follows its trigger through a scroll', async () => {
    const page = await fresh()
    await page.getByRole('button', { name: 'ScrollMenu' }).scrollIntoViewIfNeeded()
    await opened(page, 'ScrollMenu')
    const a = await boxes(page, 'scrolled')
    await page.evaluate(() => scrollBy(0, 40))
    await page.waitForTimeout(150)
    const b = await boxes(page, 'scrolled')
    expect(b.tTop).not.toBe(a.tTop)
    expect(Math.abs((b.top - b.tBottom) - (a.top - a.tBottom))).toBeLessThanOrEqual(2) // place() rounds
    await page.close()
  })

  test('the last row of a long menu is reachable by keyboard, inside the panel', async () => {
    const page = await fresh()
    await opened(page, 'TallMenu')
    await page.keyboard.press('End')
    await page.waitForTimeout(150)
    const r = await page.evaluate(() => {
      const m = document.querySelector('#tall [role="menu"]'), a = document.activeElement.getBoundingClientRect(), b = m.getBoundingClientRect()
      return { text: document.activeElement.textContent, top: a.top, bottom: a.bottom, boxTop: b.top, boxBottom: b.bottom, scrollTop: m.scrollTop, vh: innerHeight }
    })
    expect(r.text).toBe('Row 59')
    expect(r.scrollTop).toBeGreaterThan(0)
    expect(r.bottom).toBeLessThanOrEqual(r.boxBottom)
    expect(r.boxBottom).toBeLessThanOrEqual(r.vh)
    await page.close()
  })

  test('a menu item with href navigates, by click and by Enter', async () => {
    const page = await fresh()
    await opened(page, 'LinkMenu')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    expect(new URL(page.url()).hash).toBe('#there')
    await page.close()
  })

  test.each([['modal', 'Open modal'], ['drawer', 'Open drawer']])('the page behind a %s stays put, then scrolls again', async (_, label) => {
    const page = await fresh()
    await opened(page, label)
    await page.mouse.move(20, 300)
    await page.mouse.wheel(0, 500)
    await page.waitForTimeout(250)
    expect(await page.evaluate(() => scrollY)).toBe(0)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await page.mouse.move(20, 300)
    await page.mouse.wheel(0, 500)
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0)
    await page.close()
  })

  test('the lock keeps the scroll position', async () => {
    const page = await fresh()
    await page.evaluate(() => scrollTo(0, 300))
    await page.evaluate(() => { window.api.modal.value = true })
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => scrollY)).toBe(300)
    await page.close()
  })

  test('Escape in a combobox inside a modal closes the list, keeps the text, keeps the modal', async () => {
    const page = await fresh()
    await opened(page, 'Open modal')
    await page.getByRole('combobox', { name: 'Fruit' }).fill('a')
    await page.waitForSelector('[data-kind="combo"]:popover-open')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    const after = () => page.evaluate(() => ({ list: !!document.querySelector('[data-kind="combo"]:popover-open'), modal: document.querySelector('dialog[data-scope="dialog"]').open, text: document.querySelector('[role="combobox"]').value }))
    expect(await after()).toEqual({ list: false, modal: true, text: 'a' })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
    expect((await after()).modal).toBe(false)
    await page.close()
  })

  test('a click outside closes the combobox list only', async () => {
    const page = await fresh()
    await opened(page, 'Open modal')
    await page.getByRole('combobox', { name: 'Fruit' }).fill('a')
    await page.waitForSelector('[data-kind="combo"]:popover-open')
    await page.getByRole('heading', { name: 'One' }).click()
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => [!!document.querySelector('[data-kind="combo"]:popover-open'), document.querySelector('dialog[data-scope="dialog"]').open])).toEqual([false, true])
    await page.close()
  })

  test('a slider click in RTL lands where the pointer is', async () => {
    const page = await fresh()
    const t = await page.evaluate(() => { const r = document.querySelector('#rtl [data-part="track"]'); r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); return { l: b.left, w: b.width, y: b.top + b.height / 2 } })
    await page.mouse.click(t.l + t.w * 0.1, t.y)
    await page.waitForTimeout(100)
    const r = await page.evaluate(() => { const th = document.querySelector('#rtl [data-part="thumb"]'), b = th.getBoundingClientRect(); return { now: th.getAttribute('aria-valuenow'), at: b.left + b.width / 2 } })
    expect(r.now).toBe('90')
    expect(Math.abs(r.at - (t.l + t.w * 0.1))).toBeLessThanOrEqual(20) // the thumb travels inset from the track's ends
    await page.close()
  })

  test('a required DateField stops the submit, says why, and lets it through once filled', async () => {
    const page = await fresh()
    await page.click('#send')
    await page.waitForTimeout(150)
    expect(await page.evaluate(() => window.api.submitted.value)).toBe(0)
    expect(await page.locator('#form [data-part="error"]').textContent()).not.toBe('')
    expect(await page.evaluate(() => document.activeElement.getAttribute('role'))).toBe('spinbutton')
    await page.keyboard.type('02032026')
    await page.waitForTimeout(100)
    await page.click('#send')
    await page.waitForTimeout(150)
    expect(await page.evaluate(() => window.api.submitted.value)).toBe(1)
    expect(await page.locator('#form [data-part="error"]').count()).toBe(0)
    await page.close()
  })
})

test('a classic scrollbar keeps its room when a modal opens (Chromium)', async () => {
  const browser = await pw.chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] })
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } })
  await page.goto(url)
  await page.waitForFunction(() => window.api)
  const width = () => page.evaluate(() => document.documentElement.clientWidth)
  const before = await width()
  await page.evaluate(() => { window.api.modal.value = true })
  await page.waitForTimeout(300)
  expect(await width()).toBe(before)
  await browser.close()
})
