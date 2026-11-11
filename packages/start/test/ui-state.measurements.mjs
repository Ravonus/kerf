import { writeFileSync } from 'node:fs'
import { leaderOf, settled, sleep } from './ui-state.helpers.mjs'

async function measureLatency(getBrowser, open, measure, q) {
  const one = await getBrowser().newContext(),
    two = await getBrowser().newContext()
  const out = {}
  const a = await open(one),
    b = await open(two)
  await settled(a)
  await settled(b)
  const samePage = await measure(a, a)
  await a.close()
  const a1 = await open(one),
    a2 = await open(one)
  await expect.poll(async () => !!(await leaderOf([a1, a2]))).toBe(true)
  const leader = await leaderOf([a1, a2])
  await settled(leader)
  const follower = leader === a1 ? a2 : a1
  const tabs = await measure(a1, a2)
  await sleep(200)
  const net = await measure(leader, b)
  const relayed = await measure(follower, b)
  for (const [k, v] of Object.entries({ samePage, tabs, net, relayed }))
    out[k] = { n: v.length, p50: q(v, 0.5), p95: q(v, 0.95), max: q(v, 1) }

  const sockets = {}
  for (const n of [1, 2, 4, 8]) {
    const c = await getBrowser().newContext()
    const pages = []
    for (let i = 0; i < n; i++) pages.push(await open(c))
    await sleep(800)
    sockets[n] = (
      await Promise.all(
        pages.map((p) =>
          p.evaluate(() => window.__sockets.filter((s) => s.readyState === 1).length),
        ),
      )
    ).reduce((x, y) => x + y, 0)
    await c.close()
  }
  out.sockets = sockets
  const hand = []
  for (let i = 0; i < 10; i++) {
    const c = await getBrowser().newContext()
    const p1 = await open(c),
      p2 = await open(c)
    await expect.poll(async () => !!(await leaderOf([p1, p2]))).toBe(true)
    const l = await leaderOf([p1, p2])
    await settled(l)
    const o = l === p1 ? p2 : p1
    // Both stamps on the survivor's clock: the leader's goodbye arriving, and the first frame of its own socket.
    await o.evaluate(() => {
      window.__bye = window.__hello = 0
      new BroadcastChannel('kerf:ui:1').onmessage = (e) => {
        if (e.data.t === 'bye') window.__bye ||= performance.now()
      }
      const Real = window.WebSocket
      window.WebSocket = class extends Real {
        constructor(...args) {
          super(...args)
          this.addEventListener('message', () => {
            window.__hello ||= performance.now()
          })
        }
      }
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
}

export function registerLatencyPerRouteAndSocketsPerClient(getBrowser, open, measure, q) {
  test.runIf(process.env.UI_STATE_MEASURE)(
    'latency per route, and sockets per client',
    () => measureLatency(getBrowser, open, measure, q),
    300_000,
  )
}

export function registerTabsWithShareChannelAndLiveOne(getBrowser, helpers) {
  const { together, label, socketsOpen, hitsOf, say, heard } = helpers
  test('8 tabs with share, channel and live: one socket, and all three work from every tab', async () => {
    const ctx = await getBrowser().newContext()
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
}

export function registerTheLeaderClosesOneNewSocketAnd(getBrowser, helpers) {
  const { together, label, socketsOpen, hitsOf, say, heard } = helpers
  test('the leader closes: one new socket, and channel and live carry on in every tab', async () => {
    const ctx = await getBrowser().newContext()
    const pages = await together(ctx, 4)
    await expect.poll(() => socketsOpen(pages), { timeout: 8000 }).toBe(1)
    const owner = []
    for (const p of pages)
      if (await p.evaluate(() => window.__sockets.some((s) => s.readyState === 1))) owner.push(p)
    await owner[0].close({ runBeforeUnload: false })
    const rest = pages.filter((p) => p !== owner[0])
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
}

export function registerTheSocketDiesChannelAndLiveReconnect(getBrowser, helpers) {
  const { together, label, socketsOpen, say, heard } = helpers
  test('the socket dies: channel and live reconnect on one new socket', async () => {
    const ctx = await getBrowser().newContext()
    const pages = await together(ctx, 3)
    await expect.poll(() => socketsOpen(pages), { timeout: 8000 }).toBe(1)
    for (const p of pages)
      await p.evaluate(() => {
        for (const s of window.__sockets) s.close()
      })
    await expect.poll(() => socketsOpen(pages), { timeout: 15_000 }).toBe(1)
    for (const p of pages) {
      await expect.poll(() => label(p, 'status').textContent(), { timeout: 15_000 }).toBe('live')
      await expect.poll(() => label(p, 'chat').textContent(), { timeout: 15_000 }).toBe('open')
    }
    await say(pages[1], 'after the cut')
    await heard(pages[2], 'after the cut')
  }, 60_000)
}

export function registerATabThatClosesTakesItsLines(getBrowser, together, socketsOpen, say, heard) {
  test('a tab that closes takes its lines with it: others keep theirs, nobody leaks a member', async () => {
    const ctx = await getBrowser().newContext()
    const pages = await together(ctx, 3)
    await expect.poll(() => socketsOpen(pages), { timeout: 8000 }).toBe(1)
    const follower = []
    for (const p of pages)
      if (!(await p.evaluate(() => window.__sockets.some((s) => s.readyState === 1))))
        follower.push(p)
    await follower[0].close()
    const rest = pages.filter((p) => p !== follower[0])
    await say(rest[1], 'two left')
    await heard(rest[0], 'two left')
    expect(await socketsOpen(rest)).toBe(1)
  }, 40_000)
}

export function registerATabHiddenPastTheParkLimit(getBrowser, open, label) {
  test('a tab hidden past the park limit gives its line back, and shown again takes one', async () => {
    // Parking is per line, so the socket follows: no lines from anyone, and it goes.
    const ctx = await getBrowser().newContext()
    const page = await open(ctx, '/together', () => {
      const Real = window.setTimeout
      window.setTimeout = (f, ms, ...a) => Real(f, ms >= 60_000 ? 50 : ms, ...a)
      Object.defineProperty(document, 'hidden', { get: () => window.__hide === true })
      Object.defineProperty(document, 'visibilityState', {
        get: () => (window.__hide ? 'hidden' : 'visible'),
      })
    })
    await expect.poll(() => label(page, 'chat').textContent(), { timeout: 15_000 }).toBe('open')
    await page.evaluate(() => {
      window.__hide = true
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect.poll(() => label(page, 'chat').textContent(), { timeout: 8000 }).not.toBe('open')
    await page.evaluate(() => {
      window.__hide = false
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect.poll(() => label(page, 'chat').textContent(), { timeout: 8000 }).toBe('open')
  }, 40_000)
}

export function registerATabSignsInAfterTheSocket(getBrowser, helpers) {
  const { open, together, label, socketsOpen, url } = helpers
  test('a tab signs in after the socket opened: the leader dials again, as the new user', async () => {
    const ctx = await getBrowser().newContext()
    const a = await together(ctx, 1)
    await ctx.addCookies([{ name: 'who', value: 'someone-else', url }])
    const dialled = await a[0].evaluate(() => window.__sockets.length)
    const b = await open(ctx, '/together')
    await expect
      .poll(() => a[0].evaluate(() => window.__sockets.length), { timeout: 8000 })
      .toBe(dialled + 1)
    await expect.poll(() => label(b, 'status').textContent(), { timeout: 10_000 }).toBe('live')
    expect(await socketsOpen([a[0], b])).toBe(1)
  }, 40_000)
}

export function registerLatencyOfLiveAndChannelSenderAnd(
  getBrowser,
  together,
  socketsOpen,
  measuring,
) {
  measuring(
    'latency of live and channel, sender and receiver leader or follower',
    async () => {
      const ctx = await getBrowser().newContext()
      // Before the link, a seventh tab can't even load: HTTP/1 gives a browser six connections and each SSE held one.
      const pages = await together(ctx, +(process.env.TOGETHER_TABS ?? 8))
      await sleep(1000)
      let leader
      for (const p of pages)
        if (await p.evaluate(() => window.__sockets.some((s) => s.readyState === 1)))
          leader = leader ?? p
      const followers = pages.filter((p) => p !== leader)
      const pct = (list, at) => [...list].sort((x, y) => x - y)[Math.floor(list.length * at)]
      const out = { sockets: await socketsOpen(pages) }
      const watch = (p, name) =>
        p.evaluate((n) => {
          const el = document.querySelector(`[aria-label="${n}"]`)
          window.__stop?.()
          const o = new MutationObserver(() => {
            window.__at = performance.timeOrigin + performance.now()
          })
          o.observe(el, { childList: true, subtree: true, characterData: true })
          window.__stop = () => o.disconnect()
        }, name)
      const fire = (p, what, n) =>
        p.evaluate(
          ([kind, i]) => {
            const input = document.querySelector('[aria-label="draft"]')
            if (kind === 'chat') {
              input.value = `m${i}`
              input.dispatchEvent(new Event('input', { bubbles: true }))
            }
            const t = performance.timeOrigin + performance.now()
            ;[...document.querySelectorAll('button')]
              .find((b) => b.textContent === (kind === 'chat' ? 'send' : 'bump'))
              .click()
            return t
          },
          [what, n],
        )
      for (const [kind, name] of [
        ['live', 'hits'],
        ['chat', 'said'],
      ]) {
        for (const [route, from, to] of [
          ['l-f', leader, followers[0]],
          ['f-l', followers[0], leader],
          ['f-f', followers[1], followers[2]],
        ]) {
          await watch(to, name)
          const times = []
          for (let i = 0; i < 40; i++) {
            await to.evaluate(() => {
              window.__at = 0
            })
            const t = await fire(from, kind, `${route}${i}`)
            await expect
              .poll(() => to.evaluate(() => window.__at), { timeout: 5000, interval: 2 })
              .toBeGreaterThan(0)
            times.push((await to.evaluate(() => window.__at)) - t)
            await sleep(30)
          }
          out[`${kind} ${route}`] = {
            p50: +pct(times, 0.5).toFixed(1),
            p95: +pct(times, 0.95).toFixed(1),
            max: +Math.max(...times).toFixed(1),
          }
        }
      }
      writeFileSync(process.env.TOGETHER_MEASURE, JSON.stringify(out, null, 1))
    },
    200_000,
  )
}
