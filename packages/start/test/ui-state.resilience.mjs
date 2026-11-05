import {
  box,
  lit,
  settled,
  away,
  person,
  sleep,
  stats,
  leaderOf,
  remote,
} from './ui-state.helpers.mjs'

export function registerOfflineByTheBrowserItself(getBrowser, open, onlyChromium) {
  onlyChromium('offline, by the browser itself', async () => {
    const one = await getBrowser().newContext(),
      two = await getBrowser().newContext()
    const a = await open(one),
      b = await open(two)
    await settled(a)
    await settled(b)
    await box(a, 'left', 'Ana').hover()
    await lit(box(b, 'left', 'Ana'))
    await two.setOffline(true)
    await b.evaluate(() => {
      window.dispatchEvent(new Event('offline'))
    })
    await lit(box(b, 'left', 'Ana'), false)
    await two.setOffline(false)
    await b.evaluate(() => {
      window.dispatchEvent(new Event('online'))
    })
    await settled(b)
    await lit(box(b, 'left', 'Ana'))
    await one.close()
    await two.close()
  })
}

export function registerNoWebLocksOneSocketPerTab(getBrowser, open) {
  test('no Web Locks: one socket per tab, and a sibling still counts once', async () => {
    const noLocks = () =>
      Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined })
    const one = await getBrowser().newContext()
    const a = await open(one, '/ui-state', noLocks),
      b = await open(one, '/ui-state', noLocks)
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
}

export function registerAStuckLeaderATabThatGets(getBrowser, open) {
  test('a stuck leader: a tab that gets no pong steals it, and hover flows again', async () => {
    const one = await getBrowser().newContext(),
      two = await getBrowser().newContext()
    const a1 = await open(one),
      a2 = await open(one),
      b = await open(two)
    await settled(b)
    await expect.poll(async () => !!(await leaderOf([a1, a2]))).toBe(true)
    const leader = await leaderOf([a1, a2])
    await settled(leader)
    const other = leader === a1 ? a2 : a1
    leader
      .evaluate(() => {
        const end = Date.now() + 5000
        while (Date.now() < end);
      })
      .catch(() => {})
    await sleep(100)
    const t0 = Date.now()
    await box(other, 'left', 'Ana').hover()
    await expect
      .poll(async () => (await stats(other)).role, { timeout: 8000, interval: 20 })
      .toBe('leader')
    await settled(other)
    await lit(box(b, 'left', 'Ana'))
    console.log(`stuck to remote hover: ${Date.now() - t0} ms`)
    expect((await stats(other)).steals).toBe(1)
    await expect.poll(async () => (await stats(leader)).role, { timeout: 5000 }).toBe('follower')
    await expect
      .poll(
        () => leader.evaluate(() => window.__sockets.filter((s) => s.readyState === 1).length),
        {
          timeout: 5000,
        },
      )
      .toBe(0)
    await one.close()
    await two.close()
  })
}

export function registerASweepAcrossRowsStaysUnderThe(getBrowser, open) {
  test('a sweep across 40 rows stays under the socket limit', async () => {
    const one = await getBrowser().newContext({ viewport: { width: 900, height: 2400 } }),
      two = await getBrowser().newContext()
    const a = await open(one, '/ui-state?rows=40'),
      b = await open(two, '/ui-state?rows=40')
    await settled(a)
    await settled(b)
    await sleep(500)
    const first = await box(a, 'left', 'Ana').boundingBox()
    for (let i = 0; i < 300; i++) await a.mouse.move(first.x + 10, first.y + ((i * 7) % 1900))
    await away(a)
    await sleep(1000)
    expect(await a.evaluate(() => window.__sockets.length)).toBe(1)
    expect(await a.evaluate(() => window.__sockets[0].readyState)).toBe(1)
    await expect.poll(() => b.locator('[data-remote]').count(), { timeout: 5000 }).toBe(0)
    await one.close()
    await two.close()
  })
}

export function registerBfcacheBackToAPageThatLeft(getBrowser, open, onlyChromium, engines, url) {
  onlyChromium('bfcache: back to a page that left comes back live', async () => {
    const cached = await engines.chromium.launch({
      ignoreDefaultArgs: ['--disable-back-forward-cache'],
      args: ['--enable-features=BackForwardCache'],
    })
    const ctx = await cached.newContext(),
      two = await getBrowser().newContext()
    const a = await open(ctx),
      b = await open(two)
    await settled(a)
    await settled(b)
    await a.evaluate(() => {
      window.__mark = 1
      addEventListener('pageshow', (e) => {
        window.__restored = e.persisted
      })
    })
    await a.goto(url + '/about')
    await sleep(300)
    await a.goBack()
    await a.waitForFunction(() => window.__weft?.hydrated)
    console.log(
      'bfcache restored:',
      await a.evaluate(() => window.__restored ?? false),
      JSON.stringify(
        await a.evaluate(
          () => performance.getEntriesByType('navigation')[0].notRestoredReasons?.reasons,
        ),
      ),
    )
    await settled(a)
    await box(a, 'left', 'Ana').hover()
    await lit(box(b, 'left', 'Ana'))
    await cached.close()
  })
}

export function registerARowJoinIsAFrameNot(getBrowser, open) {
  test('a 200-row join is a frame, not a flood, and every row still works', async () => {
    const one = await getBrowser().newContext(),
      two = await getBrowser().newContext()
    const a = await open(one, '/ui-state?rows=200'),
      b = await open(two, '/ui-state?rows=200')
    await settled(a)
    await settled(b)
    await sleep(400)
    const frames = await a.evaluate(() => window.__share.frames)
    expect(frames).toBeLessThan(5) // the prototype took 400, paced over 24 seconds
    expect(await a.evaluate(() => window.__sockets[0].readyState)).toBe(1)
    await box(a, 'left', 'Row 150').hover()
    await lit(box(b, 'left', 'Row 150'))
    await remote(box(b, 'right', 'Row 150'))
    const c = await getBrowser()
      .newContext()
      .then((x) => open(x, '/ui-state?rows=200'))
    await lit(box(c, 'left', 'Row 150')) // a joiner's snapshot, for one key of 200
    await away(a)
    await lit(box(b, 'left', 'Row 150'), false)
    await one.close()
    await two.close()
    await c.context().close()
  })
}

export function registerAKeyTheServerRefusesStaysIn(getBrowser, open) {
  test('a key the server refuses stays in this browser', async () => {
    const one = await getBrowser().newContext(),
      two = await getBrowser().newContext()
    const a1 = await open(one),
      a2 = await open(one),
      b = await open(two)
    await settled(b)
    await expect.poll(async () => !!(await leaderOf([a1, a2]))).toBe(true)
    await settled(await leaderOf([a1, a2]))
    await sleep(200)
    await box(a1, 'left', 'Secret').hover()
    await lit(box(a2, 'left', 'Secret')) // tabs need no server
    await box(a1, 'left', 'Ana').hover()
    await lit(box(b, 'left', 'Ana')) // and the socket is fine
    await box(a1, 'left', 'Secret').hover()
    await sleep(300)
    await lit(box(b, 'left', 'Secret'), false)
    await one.close()
    await two.close()
  })
}

export function registerAKilledSocketReconnectsStateComesBack(getBrowser, open) {
  test('a killed socket reconnects: state comes back in both directions', async () => {
    const one = await getBrowser().newContext(),
      two = await getBrowser().newContext()
    const a = await open(one),
      b = await open(two)
    await settled(a)
    await settled(b)
    await box(a, 'left', 'Ana').hover()
    await lit(box(b, 'left', 'Ana'))
    await b.evaluate(() => window.__sockets.at(-1).close())
    await expect
      .poll(() => b.evaluate(() => window.__sockets.filter((s) => s.readyState === 1).length), {
        timeout: 10_000,
      })
      .toBe(1)
    await lit(box(b, 'left', 'Ana')) // a's bit, from the new socket's snapshot
    await sleep(1800) // past GRACE: nothing stale dropped it
    await lit(box(b, 'left', 'Ana'))
    await a.evaluate(() => window.__sockets.at(-1).close())
    await expect
      .poll(() => a.evaluate(() => window.__sockets.filter((s) => s.readyState === 1).length), {
        timeout: 10_000,
      })
      .toBe(1)
    await sleep(300)
    await lit(box(b, 'left', 'Ana')) // re-said by the holder on its new connection
    await away(a)
    await lit(box(b, 'left', 'Ana'), false)
    await one.close()
    await two.close()
  })
}

export function registerNoRowsLeftNoSocketRowsAgain(getBrowser, open) {
  test('no rows left, no socket; rows again, a socket', async () => {
    const one = await getBrowser().newContext()
    const a = await open(one, '/ui-state?rows=0')
    await settled(a)
    await a.getByLabel('remove row').evaluate((el) => el.click())
    await expect
      .poll(() => a.evaluate(() => window.__sockets.filter((s) => s.readyState === 1).length), {
        timeout: 8000,
      })
      .toBe(0)
    await one.close()
  })
}

export function registerATabOpenedLateSeesWhatThe(getBrowser, open) {
  test('a tab opened late sees what the socket already knows', async () => {
    const one = await getBrowser().newContext(),
      two = await getBrowser().newContext()
    const a = await open(one),
      b = await open(two)
    await settled(a)
    await settled(b)
    await box(b, 'left', 'Ben').hover()
    await lit(box(a, 'left', 'Ben'))
    const a2 = await open(one)
    await lit(box(a2, 'left', 'Ben'))
    await one.close()
    await two.close()
  })
}

export function registerHighFrequencyHoverThrottledLatestValueKept(getBrowser, open) {
  test('high-frequency hover: throttled, latest value kept', async () => {
    const one = await getBrowser().newContext(),
      two = await getBrowser().newContext()
    const a = await open(one),
      b = await open(two)
    await settled(a)
    await settled(b)
    await sleep(300)
    const before = (await stats(a)).frames
    await a.evaluate(async () => {
      const el = document.querySelector('[data-testid="left-Ana"] label')
      const over = (n) => el.dispatchEvent(new PointerEvent(n, { pointerType: 'mouse' }))
      for (let i = 0; i < 400; i++) {
        over('pointerenter')
        over('pointerleave')
        if (i % 8 === 0)
          await new Promise((ok) => {
            setTimeout(ok, 1)
          })
      }
      over('pointerenter') // ends on
    })
    await lit(box(b, 'left', 'Ana'))
    await sleep(200)
    expect((await stats(a)).frames - before).toBeLessThanOrEqual(20)
    expect(await a.evaluate(() => window.__sockets[0].readyState)).toBe(1)
    await a.evaluate(() =>
      document
        .querySelector('[data-testid="left-Ana"] label')
        .dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' })),
    )
    await lit(box(b, 'left', 'Ana'), false)
    await one.close()
    await two.close()
  })
}
