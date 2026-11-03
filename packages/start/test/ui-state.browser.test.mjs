// Research 45: shared UI state in a real browser. Real pointer, real tabs, real sockets, real locks.
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { inject } from 'vitest'

const url = inject('url')
const engines = createRequire(import.meta.url)('playwright-core')
const engine = process.env.UI_STATE_BROWSER ?? 'chromium'
const onlyChromium = engine === 'chromium' ? test : test.skip // CDP
const shots = process.env.UI_STATE_SHOTS
let browser
beforeAll(async () => {
  browser = await engines[engine].launch()
  if (shots) mkdirSync(shots, { recursive: true })
})
afterAll(async () => { await browser?.close() })
// A failed test mustn't leave a client hovering: the server and the keys are shared.
afterEach(async () => {
  await Promise.all(browser.contexts().map(c => c.close().catch(() => {})))
  await sleep(100)
})

const sleep = ms => new Promise(ok => { setTimeout(ok, ms) })

async function open(context, path = '/ui-state', init) {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => {
    const Real = window.WebSocket
    window.__sockets = []
    window.WebSocket = class extends Real { constructor(u, ...a) { super(u, ...a); if (String(u).includes('/_weft/ws')) window.__sockets.push(this) } }
  })
  if (init) await page.addInitScript(init)
  await page.goto(url + path)
  await page.waitForFunction(() => window.__weft?.hydrated, null, { timeout: 15_000 })
  page.errors = errors
  return page
}

const person = (page, pane, name) => page.getByTestId(`${pane}-${name}`)
const box = (page, pane, name) => person(page, pane, name).locator('label[data-scope="checkbox"]')
const hold = l => l.evaluate(el => el.hasAttribute('data-hold'))
const lit = async (l, on = true) => { await expect.poll(() => hold(l), { timeout: 5000, interval: 10 }).toBe(on) }
const remote = async (l, on = true) => { await expect.poll(() => l.evaluate(el => el.hasAttribute('data-remote')), { timeout: 5000, interval: 10 }).toBe(on) }
const stats = page => page.evaluate(() => ({ ...window.__share }))
const leaderOf = async pages => { for (const p of pages) if ((await stats(p)).role === 'leader') return p }
const settled = async (page, n = 1) => { await expect.poll(async () => (await stats(page)).conn ? 1 : 0, { timeout: 10_000 }).toBe(n) }
const away = page => page.mouse.move(2, 2)
const shot = async (page, name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }) }

test('same page: one box, both panes, no socket message for it to work', async () => {
  const ctx = await browser.newContext()
  const a = await open(ctx, '/ui-state?unshared')
  await a.waitForTimeout(50)
  await box(a, 'left', 'Ana').hover()
  // unshared rows are separate boxes per Row, so only the hovered pane lights
  await lit(box(a, 'left', 'Ana'))
  await lit(box(a, 'right', 'Ana'), false)
  await away(a)
  await lit(box(a, 'left', 'Ana'), false)

  const b = await open(ctx)
  await box(b, 'left', 'Ana').hover()
  await lit(box(b, 'right', 'Ana'))                    // hovering either lights both
  await lit(person(b, 'right', 'Ana').locator('button'))
  await expect.poll(() => person(b, 'right', 'Ana').locator('output').textContent()).toBe('hovering here')
  expect(await box(b, 'right', 'Ana').evaluate(el => el.hasAttribute('data-remote'))).toBe(false)
  await shot(b, '1-same-page')
  await away(b)
  await lit(box(b, 'right', 'Ana'), false)
  expect([...a.errors, ...b.errors]).toEqual([])
  await ctx.close()
})

test('across tabs: a sibling lights, marked remote, through one socket', async () => {
  const ctx = await browser.newContext()
  const pages = [await open(ctx), await open(ctx), await open(ctx), await open(ctx)]
  await expect.poll(async () => (await Promise.all(pages.map(stats))).filter(s => s.role === 'leader').length, { timeout: 10_000 }).toBe(1)
  const all = await Promise.all(pages.map(p => p.evaluate(() => window.__sockets.length)))
  expect(all.reduce((a, b) => a + b, 0)).toBe(1)
  await box(pages[1], 'left', 'Ben').hover()
  for (const p of [pages[0], pages[2], pages[3]]) {
    await lit(box(p, 'left', 'Ben'))
    await remote(box(p, 'right', 'Ben'))
  }
  await shot(pages[0], '2-across-tabs')
  await away(pages[1])
  for (const p of pages) await lit(box(p, 'left', 'Ben'), false)
  await ctx.close()
})

test('across clients: a real socket; a late joiner gets the snapshot; a refused key joins nothing', async () => {
  const one = await browser.newContext(), two = await browser.newContext()
  const a = await open(one), b = await open(two)
  await settled(a)
  await settled(b)
  await box(a, 'right', 'Ana').hover()
  await lit(box(b, 'left', 'Ana'))
  await remote(box(b, 'left', 'Ana'))
  await expect.poll(() => person(b, 'left', 'Ana').locator('output').textContent()).toBe('1 elsewhere')
  expect(await person(a, 'left', 'Ana').locator('output').textContent()).toBe('hovering here')
  await sleep(1100)                                    // the sweep has drawn
  const button = person(b, 'left', 'Ana').locator('button'), control = box(b, 'left', 'Ana').locator('[data-part="control"]')
  const active = l => l.evaluate(el => getComputedStyle(el).getPropertyValue('--_a').trim())
  expect(await active(button)).toBe('1')                // warp's own switch: the sweep is drawn with no pointer here
  expect(await active(control)).toBe('1')
  expect(await active(person(b, 'left', 'Ben').locator('button'))).toBe('0')
  await shot(b, '3-across-clients')
  const three = await browser.newContext()
  const c = await open(three)
  await lit(box(c, 'left', 'Ana'))                     // snapshot: asked, and a holder answered
  await box(c, 'left', 'Ana').hover()
  await expect.poll(() => person(b, 'left', 'Ana').locator('output').textContent()).toBe('2 elsewhere')
  await away(a)
  await away(c)
  await lit(box(b, 'left', 'Ana'), false)
  await one.close()
  await two.close()
  await three.close()
})

test('a closed leader hands over: one new socket, nothing flashes, and it clears when it should', async () => {
  const one = await browser.newContext(), two = await browser.newContext()
  const a1 = await open(one), a2 = await open(one), a3 = await open(one), b = await open(two)
  await settled(b)
  await expect.poll(async () => !!(await leaderOf([a1, a2, a3]))).toBe(true)
  const leader = await leaderOf([a1, a2, a3])
  await settled(leader)
  const rest = [a1, a2, a3].filter(p => p !== leader)
  await box(b, 'left', 'Ben').hover()
  for (const p of rest) await lit(box(p, 'left', 'Ben'))
  // Watch for any drop of the remote hover in a surviving tab, from before the close.
  for (const p of rest) await box(p, 'left', 'Ben').evaluate(el => {
    window.__flash = 0
    new MutationObserver(() => { if (!el.hasAttribute('data-hold')) window.__flash++ }).observe(el, { attributes: true, attributeFilter: ['data-hold'] })
  })
  await leader.close()
  await expect.poll(async () => !!(await leaderOf(rest)), { timeout: 5000, interval: 5 }).toBe(true)
  const next = await leaderOf(rest)
  await settled(next)
  await sleep(2000)                                    // past GRACE: stale entries would have dropped by now
  for (const p of rest) {
    expect(await p.evaluate(() => window.__flash)).toBe(0)
    await lit(box(p, 'left', 'Ben'))
  }
  expect(await Promise.all(rest.map(p => p.evaluate(() => window.__sockets.filter(s => s.readyState === 1).length)))).toEqual(expect.arrayContaining([1, 0]))
  // and upstream works through the new leader
  const follower = rest.find(p => p !== next)
  await away(b)
  await box(follower, 'left', 'Ana').hover()
  await lit(box(b, 'left', 'Ana'))
  await away(follower)
  await lit(box(b, 'left', 'Ana'), false)
  await one.close()
  await two.close()
})

onlyChromium('killing the leader mid-hover: no stuck hover anywhere', async () => {
  const one = await browser.newContext(), two = await browser.newContext()
  const a1 = await open(one), a2 = await open(one), b = await open(two)
  await settled(b)
  await expect.poll(async () => !!(await leaderOf([a1, a2]))).toBe(true)
  const leader = await leaderOf([a1, a2])
  await settled(leader)
  const other = leader === a1 ? a2 : a1
  await box(leader, 'left', 'Ana').hover()
  await lit(box(other, 'left', 'Ana'))
  await lit(box(b, 'left', 'Ana'))
  const cdp = await one.newCDPSession(leader)
  const t0 = Date.now()
  cdp.send('Page.crash').catch(() => {})
  await lit(box(other, 'left', 'Ana'), false)
  await lit(box(b, 'left', 'Ana'), false)
  console.log(`crash to clear: ${Date.now() - t0} ms`)
  await expect.poll(async () => (await stats(other)).role, { timeout: 5000 }).toBe('leader')
  await one.close()
  await two.close()
})

test('a follower that dies mid-hover clears too', async () => {
  const one = await browser.newContext(), two = await browser.newContext()
  const a1 = await open(one), a2 = await open(one), b = await open(two)
  await settled(b)
  await expect.poll(async () => !!(await leaderOf([a1, a2]))).toBe(true)
  const leader = await leaderOf([a1, a2])
  await settled(leader)
  const follower = leader === a1 ? a2 : a1
  await box(follower, 'left', 'Ben').hover()
  await lit(box(leader, 'left', 'Ben'))
  await lit(box(b, 'left', 'Ben'))
  await follower.close({ runBeforeUnload: false })
  await lit(box(leader, 'left', 'Ben'), false)
  await lit(box(b, 'left', 'Ben'), false)
  await one.close()
  await two.close()
})

test('an element removed under the pointer lets go', async () => {
  const one = await browser.newContext(), two = await browser.newContext()
  const a = await open(one), b = await open(two)
  await settled(a)
  await settled(b)
  await box(a, 'gone', 'Row 7').hover()
  await lit(box(b, 'gone', 'Row 7'))
  await a.getByLabel('remove row').evaluate(el => el.click())  // the pointer hasn't moved: no pointerleave will come
  await expect.poll(() => a.getByTestId('gone-Row 7').count()).toBe(0)
  await lit(box(b, 'gone', 'Row 7'), false)
  await one.close()
  await two.close()
})

test('a navigation away mid-hover clears the row for everyone else', async () => {
  const one = await browser.newContext(), two = await browser.newContext()
  const a = await open(one), b = await open(two)
  await settled(a)
  await settled(b)
  await box(a, 'left', 'Ana').hover()
  await lit(box(b, 'left', 'Ana'))
  await a.goto(url + '/about')
  await lit(box(b, 'left', 'Ana'), false)
  await one.close()
  await two.close()
})

test('no echo: one hover in, one hover out, and the wire goes quiet', async () => {
  const ctxs = await Promise.all([1, 2, 3].map(() => browser.newContext()))
  const pages = await Promise.all(ctxs.map(c => open(c)))
  for (const p of pages) await settled(p)
  await sleep(300)
  const before = await Promise.all(pages.map(stats))
  await box(pages[0], 'left', 'Ana').hover()
  await lit(box(pages[2], 'left', 'Ana'))
  await away(pages[0])
  await lit(box(pages[2], 'left', 'Ana'), false)
  await sleep(1000)
  const after = await Promise.all(pages.map(stats))
  const sent = after.map((s, i) => s.frames - before[i].frames)
  console.log('echo check, frames sent per client', sent)
  expect(sent).toEqual([2, 0, 0])                      // in and out, from the one who moved; nobody answers
  await Promise.all(ctxs.map(c => c.close()))
})

test('a local effect never runs for a remote hover', async () => {
  const one = await browser.newContext(), two = await browser.newContext()
  const a = await open(one), b = await open(two)
  await settled(a)
  await settled(b)
  await box(a, 'left', 'Ana').hover()
  await lit(box(b, 'left', 'Ana'))
  await sleep(200)
  expect(await person(b, 'left', 'Ana').locator('output').textContent()).toBe('1 elsewhere')
  expect(await b.evaluate(() => window.__localHover ?? 0)).toBe(0)
  expect(await a.evaluate(() => window.__localHover)).toBe(2)  // one watch in each pane's Row, on the one box
  await one.close()
  await two.close()
})

test('touch: a tap leaves hover false, here and everywhere', async () => {
  const phone = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 700 } }), two = await browser.newContext()
  const a = await open(phone), b = await open(two)
  await settled(a)
  await settled(b)
  const seen = box(b, 'left', 'Ana')
  await seen.evaluate(el => { window.__lit = 0; new MutationObserver(() => { if (el.hasAttribute('data-hold')) window.__lit++ }).observe(el, { attributes: true }) })
  await person(a, 'left', 'Ana').locator('button').tap()
  await sleep(600)
  expect(await person(a, 'left', 'Ana').locator('output').textContent()).toBe('idle')
  expect(await a.evaluate(() => window.__localHover ?? 0)).toBe(0)
  await expect.poll(() => seen.evaluate(el => !el.hasAttribute('data-hold'))).toBe(true) // a tap presses, then lets go
  await phone.close()
  await two.close()
})

// Playwright's WebKit keeps `navigator.onLine` true under `setOffline` and lets a new socket straight back in, so there
// the network never really goes. This goes offline the way a phone does in every engine: `onLine` false, an `offline`
// event, and a socket whose close event doesn't come, which is what WebKit's do.
test('offline, with a close event that never comes: clears past the grace, and comes back with the link', async () => {
  const one = await browser.newContext(), two = await browser.newContext()
  const a = await open(one), b = await open(two)
  await settled(a)
  await settled(b)
  await box(a, 'left', 'Ana').hover()
  await lit(box(b, 'left', 'Ana'))
  await b.evaluate(() => {
    // oxlint-disable-next-line typescript/unbound-method -- kept to be called with a socket as `this`
    window.__close = WebSocket.prototype.close
    WebSocket.prototype.close = function () {}
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    window.dispatchEvent(new Event('offline'))
  })
  await lit(box(b, 'left', 'Ana'), false)
  expect(await b.evaluate(() => window.__sockets.length)).toBe(1) // and nothing dials while offline
  await b.evaluate(() => {
    WebSocket.prototype.close = window.__close
    for (const s of window.__sockets) s.close()
    delete navigator.onLine
    window.dispatchEvent(new Event('online'))
  })
  await lit(box(b, 'left', 'Ana'))
  await one.close()
  await two.close()
})

onlyChromium('offline, by the browser itself', async () => {
  const one = await browser.newContext(), two = await browser.newContext()
  const a = await open(one), b = await open(two)
  await settled(a)
  await settled(b)
  await box(a, 'left', 'Ana').hover()
  await lit(box(b, 'left', 'Ana'))
  await two.setOffline(true)
  await b.evaluate(() => { window.dispatchEvent(new Event('offline')) })
  await lit(box(b, 'left', 'Ana'), false)
  await two.setOffline(false)
  await b.evaluate(() => { window.dispatchEvent(new Event('online')) })
  await settled(b)
  await lit(box(b, 'left', 'Ana'))
  await one.close()
  await two.close()
})

test('no Web Locks: one socket per tab, and a sibling still counts once', async () => {
  const noLocks = () => Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined })
  const one = await browser.newContext()
  const a = await open(one, '/ui-state', noLocks), b = await open(one, '/ui-state', noLocks)
  await settled(a)
  await settled(b)
  expect((await stats(a)).role).toBe('leader')
  expect((await stats(b)).role).toBe('leader')
  await sleep(200)
  await box(a, 'left', 'Ana').hover()
  await lit(box(b, 'left', 'Ana'))
  await sleep(300)
  expect(await person(b, 'left', 'Ana').locator('output').textContent()).toBe('1 elsewhere')
  await away(a)
  await lit(box(b, 'left', 'Ana'), false)
  await one.close()
})

// CDP's frozen state doesn't take on a visible headless page, so this leader's main thread is simply stuck: same symptom.
test('a stuck leader: a tab that gets no pong steals it, and hover flows again', async () => {
  const one = await browser.newContext(), two = await browser.newContext()
  const a1 = await open(one), a2 = await open(one), b = await open(two)
  await settled(b)
  await expect.poll(async () => !!(await leaderOf([a1, a2]))).toBe(true)
  const leader = await leaderOf([a1, a2])
  await settled(leader)
  const other = leader === a1 ? a2 : a1
  leader.evaluate(() => { const end = Date.now() + 5000; while (Date.now() < end); }).catch(() => {})
  await sleep(100)
  const t0 = Date.now()
  await box(other, 'left', 'Ana').hover()
  await expect.poll(async () => (await stats(other)).role, { timeout: 8000, interval: 20 }).toBe('leader')
  await settled(other)
  await lit(box(b, 'left', 'Ana'))
  console.log(`stuck to remote hover: ${Date.now() - t0} ms`)
  expect((await stats(other)).steals).toBe(1)
  await expect.poll(async () => (await stats(leader)).role, { timeout: 5000 }).toBe('follower')
  await expect.poll(() => leader.evaluate(() => window.__sockets.filter(s => s.readyState === 1).length), { timeout: 5000 }).toBe(0)
  await one.close()
  await two.close()
})

test('a sweep across 40 rows stays under the socket limit', async () => {
  const one = await browser.newContext({ viewport: { width: 900, height: 2400 } }), two = await browser.newContext()
  const a = await open(one, '/ui-state?rows=40'), b = await open(two, '/ui-state?rows=40')
  await settled(a)
  await settled(b)
  await sleep(500)
  const first = await box(a, 'left', 'Ana').boundingBox()
  for (let i = 0; i < 300; i++) await a.mouse.move(first.x + 10, first.y + (i * 7) % 1900)
  await away(a)
  await sleep(1000)
  expect(await a.evaluate(() => window.__sockets.length)).toBe(1)
  expect(await a.evaluate(() => window.__sockets[0].readyState)).toBe(1)
  await expect.poll(() => b.locator('[data-remote]').count(), { timeout: 5000 }).toBe(0)
  await one.close()
  await two.close()
})

// Playwright turns bfcache off, so this browser turns it back on. Whether Chrome keeps a page is logged, not asserted:
// on a dev server it also depends on the HMR socket.
onlyChromium('bfcache: back to a page that left comes back live', async () => {
  const cached = await engines.chromium.launch({ ignoreDefaultArgs: ['--disable-back-forward-cache'], args: ['--enable-features=BackForwardCache'] })
  const ctx = await cached.newContext(), two = await browser.newContext()
  const a = await open(ctx), b = await open(two)
  await settled(a)
  await settled(b)
  await a.evaluate(() => { window.__mark = 1; addEventListener('pageshow', e => { window.__restored = e.persisted }) })
  await a.goto(url + '/about')
  await sleep(300)
  await a.goBack()
  await a.waitForFunction(() => window.__weft?.hydrated)
  console.log('bfcache restored:', await a.evaluate(() => window.__restored ?? false), JSON.stringify(await a.evaluate(() => performance.getEntriesByType('navigation')[0].notRestoredReasons?.reasons)))
  await settled(a)
  await box(a, 'left', 'Ana').hover()
  await lit(box(b, 'left', 'Ana'))
  await cached.close()
})

test('a 200-row join is a frame, not a flood, and every row still works', async () => {
  const one = await browser.newContext(), two = await browser.newContext()
  const a = await open(one, '/ui-state?rows=200'), b = await open(two, '/ui-state?rows=200')
  await settled(a)
  await settled(b)
  await sleep(400)
  const frames = await a.evaluate(() => window.__share.frames)
  expect(frames).toBeLessThan(5)                       // the prototype took 400, paced over 24 seconds
  expect(await a.evaluate(() => window.__sockets[0].readyState)).toBe(1)
  await box(a, 'left', 'Row 150').hover()
  await lit(box(b, 'left', 'Row 150'))
  await remote(box(b, 'right', 'Row 150'))
  const c = await browser.newContext().then(x => open(x, '/ui-state?rows=200'))
  await lit(box(c, 'left', 'Row 150'))                 // a joiner's snapshot, for one key of 200
  await away(a)
  await lit(box(b, 'left', 'Row 150'), false)
  await one.close()
  await two.close()
  await c.context().close()
})

test('a key the server refuses stays in this browser', async () => {
  const one = await browser.newContext(), two = await browser.newContext()
  const a1 = await open(one), a2 = await open(one), b = await open(two)
  await settled(b)
  await expect.poll(async () => !!(await leaderOf([a1, a2]))).toBe(true)
  await settled(await leaderOf([a1, a2]))
  await sleep(200)
  await box(a1, 'left', 'Secret').hover()
  await lit(box(a2, 'left', 'Secret'))                 // tabs need no server
  await box(a1, 'left', 'Ana').hover()
  await lit(box(b, 'left', 'Ana'))                     // and the socket is fine
  await box(a1, 'left', 'Secret').hover()
  await sleep(300)
  await lit(box(b, 'left', 'Secret'), false)
  await one.close()
  await two.close()
})

test('a killed socket reconnects: state comes back in both directions', async () => {
  const one = await browser.newContext(), two = await browser.newContext()
  const a = await open(one), b = await open(two)
  await settled(a)
  await settled(b)
  await box(a, 'left', 'Ana').hover()
  await lit(box(b, 'left', 'Ana'))
  await b.evaluate(() => window.__sockets.at(-1).close())
  await expect.poll(() => b.evaluate(() => window.__sockets.filter(s => s.readyState === 1).length), { timeout: 10_000 }).toBe(1)
  await lit(box(b, 'left', 'Ana'))                     // a's bit, from the new socket's snapshot
  await sleep(1800)                                    // past GRACE: nothing stale dropped it
  await lit(box(b, 'left', 'Ana'))
  await a.evaluate(() => window.__sockets.at(-1).close())
  await expect.poll(() => a.evaluate(() => window.__sockets.filter(s => s.readyState === 1).length), { timeout: 10_000 }).toBe(1)
  await sleep(300)
  await lit(box(b, 'left', 'Ana'))                     // re-said by the holder on its new connection
  await away(a)
  await lit(box(b, 'left', 'Ana'), false)
  await one.close()
  await two.close()
})

test('no rows left, no socket; rows again, a socket', async () => {
  const one = await browser.newContext()
  const a = await open(one, '/ui-state?rows=0')
  await settled(a)
  await a.getByLabel('remove row').evaluate(el => el.click())
  await expect.poll(() => a.evaluate(() => window.__sockets.filter(s => s.readyState === 1).length), { timeout: 8000 }).toBe(0)
  await one.close()
})

test('a tab opened late sees what the socket already knows', async () => {
  const one = await browser.newContext(), two = await browser.newContext()
  const a = await open(one), b = await open(two)
  await settled(a)
  await settled(b)
  await box(b, 'left', 'Ben').hover()
  await lit(box(a, 'left', 'Ben'))
  const a2 = await open(one)
  await lit(box(a2, 'left', 'Ben'))
  await one.close()
  await two.close()
})

test('high-frequency hover: throttled, latest value kept', async () => {
  const one = await browser.newContext(), two = await browser.newContext()
  const a = await open(one), b = await open(two)
  await settled(a)
  await settled(b)
  await sleep(300)
  const before = (await stats(a)).frames
  await a.evaluate(async () => {
    const el = document.querySelector('[data-testid="left-Ana"] label')
    const over = n => el.dispatchEvent(new PointerEvent(n, { pointerType: 'mouse' }))
    for (let i = 0; i < 400; i++) { over('pointerenter'); over('pointerleave'); if (i % 8 === 0) await new Promise(ok => { setTimeout(ok, 1) }) }
    over('pointerenter')                               // ends on
  })
  await lit(box(b, 'left', 'Ana'))
  await sleep(200)
  expect((await stats(a)).frames - before).toBeLessThanOrEqual(20)
  expect(await a.evaluate(() => window.__sockets[0].readyState)).toBe(1)
  await a.evaluate(() => document.querySelector('[data-testid="left-Ana"] label').dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' })))
  await lit(box(b, 'left', 'Ana'), false)
  await one.close()
  await two.close()
})

// ---- measurements: `UI_STATE_MEASURE=<file>` -----------------------------------------------------------------------

// Date.now on both sides: it is the one clock two renderers share, to 1 ms. `timeOrigin` differs per process.
const arm = (from, to, name = 'Ana') => Promise.all([
  from.evaluate(() => {
    window.__t0 = []
    if (window.__armed) return
    window.__armed = true
    document.addEventListener('pointerover', e => { if (e.target.closest?.('[data-testid="left-Ana"] label')) window.__t0.push(Date.now()) }, { capture: true })
  }),
  to.evaluate(n => {
    window.__t1 = []
    if (window.__watching) return
    window.__watching = true
    const el = document.querySelector(`[data-testid="right-${n}"] label`)
    new MutationObserver(() => { if (el.hasAttribute('data-hold')) window.__t1.push(Date.now()) }).observe(el, { attributes: true, attributeFilter: ['data-hold'] })
  }, name),
])

async function measure(from, to, runs = 40) {
  await arm(from, to)
  const at = await box(from, 'left', 'Ana').boundingBox()
  const out = []
  for (let i = 0; i < runs; i++) {
    await from.mouse.move(at.x + 8, at.y + 8)
    await lit(box(to, 'right', 'Ana'))
    await sleep(120)
    await from.mouse.move(2, 2)
    await lit(box(to, 'right', 'Ana'), false)
    await sleep(120)
  }
  const a = await from.evaluate(() => window.__t0), b = await to.evaluate(() => window.__t1)
  for (let i = 0; i < Math.min(a.length, b.length); i++) out.push(b[i] - a[i])
  return out.sort((x, y) => x - y)
}
const q = (v, p) => +v[Math.min(v.length - 1, Math.floor(v.length * p))].toFixed(2)

test.runIf(process.env.UI_STATE_MEASURE)('latency per route, and sockets per client', async () => {
  const one = await browser.newContext(), two = await browser.newContext()
  const out = {}
  const a = await open(one), b = await open(two)
  await settled(a)
  await settled(b)
  const samePage = await measure(a, a)
  await a.close()
  const a1 = await open(one), a2 = await open(one)
  await expect.poll(async () => !!(await leaderOf([a1, a2]))).toBe(true)
  const leader = await leaderOf([a1, a2])
  await settled(leader)
  const follower = leader === a1 ? a2 : a1
  const tabs = await measure(a1, a2)
  await sleep(200)
  const net = await measure(leader, b)
  const relayed = await measure(follower, b)
  for (const [k, v] of Object.entries({ samePage, tabs, net, relayed })) out[k] = { n: v.length, p50: q(v, 0.5), p95: q(v, 0.95), max: q(v, 1) }

  const sockets = {}
  for (const n of [1, 2, 4, 8]) {
    const c = await browser.newContext()
    const pages = []
    for (let i = 0; i < n; i++) pages.push(await open(c))
    await sleep(800)
    sockets[n] = (await Promise.all(pages.map(p => p.evaluate(() => window.__sockets.filter(s => s.readyState === 1).length)))).reduce((x, y) => x + y, 0)
    await c.close()
  }
  out.sockets = sockets
  const hand = []
  for (let i = 0; i < 10; i++) {
    const c = await browser.newContext()
    const p1 = await open(c), p2 = await open(c)
    await expect.poll(async () => !!(await leaderOf([p1, p2]))).toBe(true)
    const l = await leaderOf([p1, p2])
    await settled(l)
    const o = l === p1 ? p2 : p1
    // Both stamps on the survivor's clock: the leader's goodbye arriving, and the first frame of its own socket.
    await o.evaluate(() => {
      window.__bye = window.__hello = 0
      new BroadcastChannel('weft:ui:1').onmessage = e => { if (e.data.t === 'bye') window.__bye ||= performance.now() }
      const Real = window.WebSocket
      window.WebSocket = class extends Real { constructor(...args) { super(...args); this.addEventListener('message', () => { window.__hello ||= performance.now() }) } }
    })
    await l.close()
    await o.waitForFunction(() => window.__hello && window.__bye, null, { timeout: 5000 })
    hand.push(await o.evaluate(() => window.__hello - window.__bye))
    await c.close()
  }
  hand.sort((x, y) => x - y)
  out.handover = { n: hand.length, p50: q(hand, 0.5), max: q(hand, 1) }
  writeFileSync(process.env.UI_STATE_MEASURE, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out))
  await one.close()
  await two.close()
}, 300_000)

// ---- one browser, one socket: share, channel and live on the leader's link ---------------------------------------------

const label = (page, name) => page.getByLabel(name, { exact: true })
const socketsOpen = pages => Promise.all(pages.map(p => p.evaluate(() => window.__sockets.filter(s => s.readyState === 1).length))).then(n => n.reduce((a, b) => a + b, 0))
async function together(ctx, n) {
  const pages = []
  for (let i = 0; i < n; i++) pages.push(await open(ctx, '/together'))
  await Promise.all(pages.map(async p => {
    await expect.poll(() => label(p, 'status').textContent(), { timeout: 15_000 }).toBe('live')
    await expect.poll(() => label(p, 'chat').textContent(), { timeout: 15_000 }).toBe('open')
  }))
  return pages
}
const hitsOf = async p => +(await label(p, 'hits').textContent())
const say = async (p, text) => {
  await label(p, 'draft').fill(text)
  await p.getByRole('button', { name: 'send', exact: true }).click()
}
const heard = async (p, text) => { await expect.poll(() => label(p, 'said').textContent(), { timeout: 10_000 }).toContain(text) }

test('8 tabs with share, channel and live: one socket, and all three work from every tab', async () => {
  const ctx = await browser.newContext()
  const pages = await together(ctx, 8)
  await expect.poll(() => socketsOpen(pages), { timeout: 8000 }).toBe(1)
  // Every tab's own traffic crosses it, each as itself.
  const before = await hitsOf(pages[7])
  await pages[7].getByRole('button', { name: 'bump', exact: true }).click()
  for (const p of pages) await expect.poll(() => hitsOf(p), { timeout: 8000 }).toBe(before + 1)
  await say(pages[5], 'from five')
  for (const p of pages) await heard(p, 'from five')
  await pages[3].getByRole('button', { name: 'Ana' }).hover()
  await expect.poll(() => label(pages[6], 'remote').textContent(), { timeout: 5000 }).not.toBe('')
  expect(await socketsOpen(pages)).toBe(1)
  for (const p of pages) expect(p.errors).toEqual([])
}, 90_000)

test('the leader closes: one new socket, and channel and live carry on in every tab', async () => {
  const ctx = await browser.newContext()
  const pages = await together(ctx, 4)
  await expect.poll(() => socketsOpen(pages), { timeout: 8000 }).toBe(1)
  const owner = []
  for (const p of pages) if (await p.evaluate(() => window.__sockets.some(s => s.readyState === 1))) owner.push(p)
  await owner[0].close({ runBeforeUnload: false })
  const rest = pages.filter(p => p !== owner[0])
  const start = Date.now()
  await expect.poll(() => socketsOpen(rest), { timeout: 8000 }).toBe(1)
  for (const p of rest) {
    await expect.poll(() => label(p, 'status').textContent(), { timeout: 10_000 }).toBe('live')
    await expect.poll(() => label(p, 'chat').textContent(), { timeout: 10_000 }).toBe('open')
  }
  // Handing over isn't an outage: no backoff to sit through.
  expect(Date.now() - start).toBeLessThan(3000)
  const before = await hitsOf(rest[0])
  await rest[1].getByRole('button', { name: 'bump', exact: true }).click()
  await expect.poll(() => hitsOf(rest[0]), { timeout: 8000 }).toBe(before + 1)
  await say(rest[2], 'still here')
  await heard(rest[0], 'still here')
}, 60_000)

test('the socket dies: channel and live reconnect on one new socket', async () => {
  const ctx = await browser.newContext()
  const pages = await together(ctx, 3)
  await expect.poll(() => socketsOpen(pages), { timeout: 8000 }).toBe(1)
  for (const p of pages) await p.evaluate(() => { for (const s of window.__sockets) s.close() })
  await expect.poll(() => socketsOpen(pages), { timeout: 15_000 }).toBe(1)
  for (const p of pages) {
    await expect.poll(() => label(p, 'status').textContent(), { timeout: 15_000 }).toBe('live')
    await expect.poll(() => label(p, 'chat').textContent(), { timeout: 15_000 }).toBe('open')
  }
  await say(pages[1], 'after the cut')
  await heard(pages[2], 'after the cut')
}, 60_000)

test('a tab that closes takes its lines with it: others keep theirs, nobody leaks a member', async () => {
  const ctx = await browser.newContext()
  const pages = await together(ctx, 3)
  await expect.poll(() => socketsOpen(pages), { timeout: 8000 }).toBe(1)
  const follower = []
  for (const p of pages) if (!(await p.evaluate(() => window.__sockets.some(s => s.readyState === 1)))) follower.push(p)
  await follower[0].close()
  const rest = pages.filter(p => p !== follower[0])
  await say(rest[1], 'two left')
  await heard(rest[0], 'two left')
  expect(await socketsOpen(rest)).toBe(1)
}, 40_000)

test('a tab hidden past the park limit gives its line back, and shown again takes one', async () => {
  // Parking is per line, so the socket follows: no lines from anyone, and it goes.
  const ctx = await browser.newContext()
  const page = await open(ctx, '/together', () => {
    const Real = window.setTimeout
    window.setTimeout = (f, ms, ...a) => Real(f, ms >= 60_000 ? 50 : ms, ...a)
    Object.defineProperty(document, 'hidden', { get: () => window.__hide === true })
    Object.defineProperty(document, 'visibilityState', { get: () => (window.__hide ? 'hidden' : 'visible') })
  })
  await expect.poll(() => label(page, 'chat').textContent(), { timeout: 15_000 }).toBe('open')
  await page.evaluate(() => { window.__hide = true; document.dispatchEvent(new Event('visibilitychange')) })
  await expect.poll(() => label(page, 'chat').textContent(), { timeout: 8000 }).not.toBe('open')
  await page.evaluate(() => { window.__hide = false; document.dispatchEvent(new Event('visibilitychange')) })
  await expect.poll(() => label(page, 'chat').textContent(), { timeout: 8000 }).toBe('open')
}, 40_000)

test('a tab signs in after the socket opened: the leader dials again, as the new user', async () => {
  const ctx = await browser.newContext()
  const a = await together(ctx, 1)
  await ctx.addCookies([{ name: 'who', value: 'someone-else', url }])
  const dialled = (await a[0].evaluate(() => window.__sockets.length))
  const b = await open(ctx, '/together')
  await expect.poll(() => a[0].evaluate(() => window.__sockets.length), { timeout: 8000 }).toBe(dialled + 1)
  await expect.poll(() => label(b, 'status').textContent(), { timeout: 10_000 }).toBe('live')
  expect(await socketsOpen([a[0], b])).toBe(1)
}, 40_000)

const measuring = process.env.TOGETHER_MEASURE ? test : test.skip
measuring('latency of live and channel, sender and receiver leader or follower', async () => {
  const ctx = await browser.newContext()
  // Before the link, a seventh tab can't even load: HTTP/1 gives a browser six connections and each SSE held one.
  const pages = await together(ctx, +(process.env.TOGETHER_TABS ?? 8))
  await sleep(1000)
  let leader
  for (const p of pages) if (await p.evaluate(() => window.__sockets.some(s => s.readyState === 1))) leader = leader ?? p
  const followers = pages.filter(p => p !== leader)
  const pct = (list, at) => [...list].sort((x, y) => x - y)[Math.floor(list.length * at)]
  const out = { sockets: await socketsOpen(pages) }
  const watch = (p, name) => p.evaluate(n => {
    const el = document.querySelector(`[aria-label="${n}"]`)
    window.__stop?.()
    const o = new MutationObserver(() => { window.__at = performance.timeOrigin + performance.now() })
    o.observe(el, { childList: true, subtree: true, characterData: true })
    window.__stop = () => o.disconnect()
  }, name)
  const fire = (p, what, n) => p.evaluate(([kind, i]) => {
    const input = document.querySelector('[aria-label="draft"]')
    if (kind === 'chat') { input.value = `m${i}`; input.dispatchEvent(new Event('input', { bubbles: true })) }
    const t = performance.timeOrigin + performance.now()
    ;[...document.querySelectorAll('button')].find(b => b.textContent === (kind === 'chat' ? 'send' : 'bump')).click()
    return t
  }, [what, n])
  for (const [kind, name] of [['live', 'hits'], ['chat', 'said']]) {
    for (const [route, from, to] of [['l-f', leader, followers[0]], ['f-l', followers[0], leader], ['f-f', followers[1], followers[2]]]) {
      await watch(to, name)
      const times = []
      for (let i = 0; i < 40; i++) {
        await to.evaluate(() => { window.__at = 0 })
        const t = await fire(from, kind, `${route}${i}`)
        await expect.poll(() => to.evaluate(() => window.__at), { timeout: 5000, interval: 2 }).toBeGreaterThan(0)
        times.push(await to.evaluate(() => window.__at) - t)
        await sleep(30)
      }
      out[`${kind} ${route}`] = { p50: +pct(times, 0.5).toFixed(1), p95: +pct(times, 0.95).toFixed(1), max: +Math.max(...times).toFixed(1) }
    }
  }
  writeFileSync(process.env.TOGETHER_MEASURE, JSON.stringify(out, null, 1))
}, 200_000)
