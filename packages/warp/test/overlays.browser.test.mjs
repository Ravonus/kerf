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
import weft from '@weft-js/core/vite'

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

  test('in RTL align="start" lines up the right edges', async () => {
    const page = await fresh()
    await opened(page, 'RtlMenu')
    const b = await boxes(page, 'rtlmenu')
    expect(Math.abs(b.right - b.tRight)).toBeLessThanOrEqual(2)
    await page.close()
  })

  test('a slider arrow in RTL goes the way it points', async () => {
    const page = await fresh()
    await page.locator('#rtl [data-part="thumb"]').focus()
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(100)
    expect(await page.locator('#rtl [data-part="thumb"]').getAttribute('aria-valuenow')).toBe('51')
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

  describe('toasts and modals', () => {
    const region = '[data-scope="toast"][data-part="region"]'
    const where = page => page.evaluate(r => {
      const el = document.querySelector(r), d = el.closest('dialog')
      return { dialog: d ? d.querySelector('[data-part="title"]')?.textContent ?? d.dataset.scope : null, popover: el.hasAttribute('popover'), top: el.matches(':popover-open') }
    }, region)
    // what the pointer would hit at the middle of Undo, and that it works
    const undo = async page => {
      const button = page.getByRole('button', { name: 'Undo' }).first()
      const box = await button.boundingBox()
      expect(box.x + box.width).toBeLessThanOrEqual(1100)
      expect(box.y + box.height).toBeLessThanOrEqual(700)
      const hit = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-act]'), { x: box.x + box.width / 2, y: box.y + box.height / 2 })
      expect(hit).toBe(true)
      const was = await page.evaluate(() => window.api.undone)
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.waitForTimeout(100)
      expect(await page.evaluate(() => window.api.undone)).toBe(was + 1)
    }
    const raise = (page, o) => page.evaluate(o => window.api.raise(o), o)
    const set = (page, name, v) => page.evaluate(([n, v]) => { window.api[n].value = v }, [name, v])

    test('Undo works when the toast is raised during a modal, and the modal stays', async () => {
      const page = await fresh()
      await opened(page, 'Open modal')
      await raise(page)
      await page.waitForTimeout(300)
      expect(await where(page)).toEqual({ dialog: 'One', popover: true, top: true })
      await undo(page)
      expect(await page.evaluate(() => document.querySelector('dialog[data-scope="dialog"]').open)).toBe(true)
      await page.close()
    })

    test('the toast sits at the viewport corner, not in the dialog box', async () => {
      const page = await fresh()
      await raise(page)
      await page.waitForTimeout(400)
      const rect = () => page.evaluate(() => { const r = document.querySelector('[data-scope="toast"][data-part="root"]').getBoundingClientRect(); return [Math.round(r.right), Math.round(r.bottom)] })
      const before = await rect()
      await opened(page, 'Open modal')
      await page.waitForTimeout(200)
      expect(await rect()).toEqual(before)
      await page.close()
    })

    test('one already showing moves in without replaying, its timer running; back out on close', async () => {
      const page = await fresh()
      await raise(page, { duration: 60000 })
      await page.waitForTimeout(500)
      const time = () => page.evaluate(() => document.querySelector('[data-part="progress"]').getAnimations()[0]?.currentTime)
      const t0 = await time()
      await page.evaluate(() => {
        window.api.modal.value = true
        window.seen = []
        const root = document.querySelector('[data-scope="toast"][data-part="root"]')
        const look = () => { window.seen.push(new DOMMatrix(getComputedStyle(root).translate === 'none' ? undefined : `translate(${getComputedStyle(root).translate.split(' ').join(',')})`).m42); if (window.seen.length < 20) requestAnimationFrame(look) }
        requestAnimationFrame(look)
      })
      await page.waitForTimeout(500)
      expect(await where(page)).toMatchObject({ dialog: 'One', top: true })
      expect(Math.max(...(await page.evaluate(() => window.seen)).map(Math.abs))).toBeLessThan(2) // no slide-up from below
      expect(await time()).toBeGreaterThan(t0)
      await undo(page)
      await raise(page, { duration: 60000 })
      await page.waitForTimeout(200)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      expect(await where(page)).toEqual({ dialog: null, popover: false, top: false })
      await undo(page)
      await page.close()
    })

    test('stacked modals: the top one holds it, closing returns it to the next', async () => {
      const page = await fresh()
      await opened(page, 'Open modal')
      await raise(page, { duration: 60000 })
      await set(page, 'modal2', true)
      await page.waitForTimeout(300)
      expect((await where(page)).dialog).toBe('Two')
      await undo(page)
      await raise(page, { duration: 60000 })
      await set(page, 'modal2', false)
      await page.waitForTimeout(300)
      expect(await where(page)).toMatchObject({ dialog: 'One', top: true })
      await undo(page)
      await raise(page, { duration: 60000 })
      await set(page, 'modal', false)
      await page.waitForTimeout(300)
      expect((await where(page)).dialog).toBe(null)
      await undo(page)
      await page.close()
    })

    test.each([['drawer'], ['sheet']])('works over a %s', async kind => {
      const page = await fresh()
      await set(page, kind, true)
      await page.waitForTimeout(350)
      await raise(page, { duration: 60000 })
      await page.waitForTimeout(300)
      expect((await where(page)).top).toBe(true)
      await undo(page)
      await page.close()
    })

    test('a timer ends inside the modal; hover still pauses it', async () => {
      const page = await fresh()
      await opened(page, 'Open modal')
      await raise(page, { duration: 60000 })
      await page.waitForTimeout(300)
      const state = () => page.evaluate(() => document.querySelector('[data-part="progress"]').getAnimations()[0]?.playState)
      expect(await state()).toBe('running')
      const box = await page.getByRole('button', { name: 'Undo' }).first().boundingBox()
      await page.mouse.move(box.x + 2, box.y + 2)
      await page.waitForTimeout(150)
      expect(await state()).toBe('paused')
      await page.mouse.move(5, 5)
      await page.waitForTimeout(150)
      expect(await state()).toBe('running')
      await raise(page, { title: 'Brief', duration: 200, action: undefined })
      await expect.poll(() => page.locator('[data-part="root"]', { hasText: 'Brief' }).count(), { timeout: 3000 }).toBe(0)
      await page.close()
    })

    test('a paused toast stays paused through the move', async () => {
      const page = await fresh()
      await raise(page, { duration: 60000 })
      await page.waitForTimeout(300)
      const box = await page.getByRole('button', { name: 'Undo' }).first().boundingBox()
      await page.mouse.move(box.x + 2, box.y + 2)
      await page.waitForTimeout(150)
      const state = () => page.evaluate(() => document.querySelector('[data-part="progress"]').getAnimations()[0]?.playState)
      expect(await state()).toBe('paused')
      await set(page, 'modal', true)
      // every frame for a second, not one late look: WebKit's own hover check lands about 300 ms after the move
      const seen = await page.evaluate(() => new Promise(done => {
        const seen = new Set(), end = performance.now() + 1000
        const look = () => {
          seen.add(document.querySelector('[data-part="progress"]').getAnimations()[0]?.playState)
          if (performance.now() < end) requestAnimationFrame(look)
          else done([...seen])
        }
        look()
      }))
      expect(seen).toEqual(['paused'])
      await page.mouse.move(box.x + 3, box.y + 3)
      await page.waitForTimeout(150)
      expect(await state()).toBe('paused')
      await page.mouse.move(5, 5)
      await expect.poll(state, { timeout: 2000 }).toBe('running')
      await page.close()
    })

    test('focus stays put: on the modal when a toast arrives, on the toast through a stacked close', async () => {
      const page = await fresh()
      await opened(page, 'Open modal')
      const before = await page.evaluate(() => document.activeElement.outerHTML)
      await raise(page, { duration: 60000 })
      await page.waitForTimeout(200)
      expect(await page.evaluate(() => document.activeElement.outerHTML)).toBe(before)
      await page.keyboard.press('F8')
      expect(await page.evaluate(() => !!document.activeElement.closest('[data-scope="toast"]'))).toBe(true)
      await set(page, 'modal2', true)
      await page.waitForTimeout(300)
      await page.evaluate(() => document.querySelector('[data-act]').focus())
      await set(page, 'modal2', false)
      await page.waitForTimeout(300)
      expect(await page.evaluate(() => !!document.activeElement.closest('[data-scope="toast"]') || document.activeElement.tagName)).not.toBe('BODY')
      await page.close()
    })

    test('the live regions go with it and get the text (DOM only: no screen reader in this)', async () => {
      const page = await fresh()
      await opened(page, 'Open modal')
      await raise(page, { title: 'Announced', duration: 60000 })
      await page.waitForTimeout(250)
      expect(await page.evaluate(() => [...document.querySelectorAll('[data-scope="announcer"]')].map(n => [!!n.closest('dialog'), n.textContent]))).toEqual([[true, 'Announced'], [true, '']])
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      expect(await page.evaluate(() => [...document.querySelectorAll('[data-scope="announcer"]')].every(n => !n.closest('dialog')))).toBe(true)
      await page.close()
    })
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
  const width = () => page.evaluate(() => document.body.offsetWidth) // clientWidth reports the gutter's room as its own
  const before = await width()
  await page.evaluate(() => { window.api.modal.value = true })
  await page.waitForTimeout(300)
  expect(await width()).toBe(before)
  await browser.close()
})
