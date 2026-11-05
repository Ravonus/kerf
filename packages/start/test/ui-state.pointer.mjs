import {
  away,
  box,
  lit,
  person,
  remote,
  stats,
  settled,
  sleep,
  leaderOf,
} from './ui-state.helpers.mjs'

export function registerSamePageOneBoxBothPanesNo(getBrowser, open, shot) {
  test('same page: one box, both panes, no socket message for it to work', async () => {
    const ctx = await getBrowser().newContext()
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
    await lit(box(b, 'right', 'Ana')) // hovering either lights both
    await lit(person(b, 'right', 'Ana').locator('button'))
    await expect
      .poll(() => person(b, 'right', 'Ana').locator('output').textContent())
      .toBe('hovering here')
    expect(await box(b, 'right', 'Ana').evaluate((el) => el.hasAttribute('data-remote'))).toBe(
      false,
    )
    await shot(b, '1-same-page')
    await away(b)
    await lit(box(b, 'right', 'Ana'), false)
    expect([...a.errors, ...b.errors]).toEqual([])
    await ctx.close()
  })
}

export function registerAcrossTabsASiblingLightsMarkedRemote(getBrowser, open, shot) {
  test('across tabs: a sibling lights, marked remote, through one socket', async () => {
    const ctx = await getBrowser().newContext()
    const pages = [await open(ctx), await open(ctx), await open(ctx), await open(ctx)]
    await expect
      .poll(
        async () => (await Promise.all(pages.map(stats))).filter((s) => s.role === 'leader').length,
        { timeout: 10_000 },
      )
      .toBe(1)
    const all = await Promise.all(pages.map((p) => p.evaluate(() => window.__sockets.length)))
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
}

export function registerAcrossClientsARealSocketALate(getBrowser, open, shot) {
  test('across clients: a real socket; a late joiner gets the snapshot; a refused key joins nothing', async () => {
    const one = await getBrowser().newContext(),
      two = await getBrowser().newContext()
    const a = await open(one),
      b = await open(two)
    await settled(a)
    await settled(b)
    await box(a, 'right', 'Ana').hover()
    await lit(box(b, 'left', 'Ana'))
    await remote(box(b, 'left', 'Ana'))
    await expect
      .poll(() => person(b, 'left', 'Ana').locator('output').textContent())
      .toBe('1 elsewhere')
    expect(await person(a, 'left', 'Ana').locator('output').textContent()).toBe('hovering here')
    await sleep(1100) // the sweep has drawn
    const button = person(b, 'left', 'Ana').locator('button'),
      control = box(b, 'left', 'Ana').locator('[data-part="control"]')
    const active = (l) => l.evaluate((el) => getComputedStyle(el).getPropertyValue('--_a').trim())
    expect(await active(button)).toBe('1') // warp's own switch: the sweep is drawn with no pointer here
    expect(await active(control)).toBe('1')
    expect(await active(person(b, 'left', 'Ben').locator('button'))).toBe('0')
    await shot(b, '3-across-clients')
    const three = await getBrowser().newContext()
    const c = await open(three)
    await lit(box(c, 'left', 'Ana')) // snapshot: asked, and a holder answered
    await box(c, 'left', 'Ana').hover()
    await expect
      .poll(() => person(b, 'left', 'Ana').locator('output').textContent())
      .toBe('2 elsewhere')
    await away(a)
    await away(c)
    await lit(box(b, 'left', 'Ana'), false)
    await one.close()
    await two.close()
    await three.close()
  })
}

export function registerAClosedLeaderHandsOverOneNew(getBrowser, open) {
  test('a closed leader hands over: one new socket, nothing flashes, and it clears when it should', async () => {
    const one = await getBrowser().newContext(),
      two = await getBrowser().newContext()
    const a1 = await open(one),
      a2 = await open(one),
      a3 = await open(one),
      b = await open(two)
    await settled(b)
    await expect.poll(async () => !!(await leaderOf([a1, a2, a3]))).toBe(true)
    const leader = await leaderOf([a1, a2, a3])
    await settled(leader)
    const rest = [a1, a2, a3].filter((p) => p !== leader)
    await box(b, 'left', 'Ben').hover()
    for (const p of rest) await lit(box(p, 'left', 'Ben'))
    // Watch for any drop of the remote hover in a surviving tab, from before the close.
    for (const p of rest)
      await box(p, 'left', 'Ben').evaluate((el) => {
        window.__flash = 0
        new MutationObserver(() => {
          if (!el.hasAttribute('data-hold')) window.__flash++
        }).observe(el, { attributes: true, attributeFilter: ['data-hold'] })
      })
    await leader.close()
    await expect
      .poll(async () => !!(await leaderOf(rest)), { timeout: 5000, interval: 5 })
      .toBe(true)
    const next = await leaderOf(rest)
    await settled(next)
    await sleep(2000) // past GRACE: stale entries would have dropped by now
    for (const p of rest) {
      expect(await p.evaluate(() => window.__flash)).toBe(0)
      await lit(box(p, 'left', 'Ben'))
    }
    expect(
      await Promise.all(
        rest.map((p) =>
          p.evaluate(() => window.__sockets.filter((s) => s.readyState === 1).length),
        ),
      ),
    ).toEqual(expect.arrayContaining([1, 0]))
    // and upstream works through the new leader
    const follower = rest.find((p) => p !== next)
    await away(b)
    await box(follower, 'left', 'Ana').hover()
    await lit(box(b, 'left', 'Ana'))
    await away(follower)
    await lit(box(b, 'left', 'Ana'), false)
    await one.close()
    await two.close()
  })
}

export function registerKillingTheLeaderMidHoverNoStuck(getBrowser, open, onlyChromium) {
  onlyChromium('killing the leader mid-hover: no stuck hover anywhere', async () => {
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
    // A round trip proves both clients joined the key before the leader is killed.
    await box(b, 'left', 'Ana').hover()
    await remote(box(leader, 'left', 'Ana'))
    await remote(box(other, 'left', 'Ana'))
    await away(b)
    await lit(box(leader, 'left', 'Ana'), false)
    await lit(box(other, 'left', 'Ana'), false)
    await box(leader, 'left', 'Ana').hover()
    await lit(box(leader, 'left', 'Ana'))
    await remote(box(other, 'left', 'Ana'))
    await remote(box(b, 'left', 'Ana'))
    const cdp = await one.newCDPSession(leader)
    const crashed = leader.waitForEvent('crash')
    cdp.send('Page.crash').catch(() => {})
    await crashed
    await expect.poll(async () => (await stats(other)).role, { timeout: 5000 }).toBe('leader')
    await settled(other)
    await lit(box(other, 'left', 'Ana'), false)
    await lit(box(b, 'left', 'Ana'), false)
    await one.close()
    await two.close()
  })
}

export function registerAFollowerThatDiesMidHoverClears(getBrowser, open) {
  test('a follower that dies mid-hover clears too', async () => {
    const one = await getBrowser().newContext(),
      two = await getBrowser().newContext()
    const a1 = await open(one),
      a2 = await open(one),
      b = await open(two)
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
}

export function registerAnElementRemovedUnderThePointerLets(getBrowser, open) {
  test('an element removed under the pointer lets go', async () => {
    const one = await getBrowser().newContext(),
      two = await getBrowser().newContext()
    const a = await open(one),
      b = await open(two)
    await settled(a)
    await settled(b)
    await box(a, 'gone', 'Row 7').hover()
    await lit(box(b, 'gone', 'Row 7'))
    await a.getByLabel('remove row').evaluate((el) => el.click()) // the pointer hasn't moved: no pointerleave will come
    await expect.poll(() => a.getByTestId('gone-Row 7').count()).toBe(0)
    await lit(box(b, 'gone', 'Row 7'), false)
    await one.close()
    await two.close()
  })
}

export function registerANavigationAwayMidHoverClearsThe(getBrowser, open, url) {
  test('a navigation away mid-hover clears the row for everyone else', async () => {
    const one = await getBrowser().newContext(),
      two = await getBrowser().newContext()
    const a = await open(one),
      b = await open(two)
    await settled(a)
    await settled(b)
    await box(a, 'left', 'Ana').hover()
    await lit(box(b, 'left', 'Ana'))
    await a.goto(url + '/about')
    await lit(box(b, 'left', 'Ana'), false)
    await one.close()
    await two.close()
  })
}

export function registerNoEchoOneHoverInOneHover(getBrowser, open) {
  test('no echo: one hover in, one hover out, and the wire goes quiet', async () => {
    const ctxs = await Promise.all([1, 2, 3].map(() => getBrowser().newContext()))
    const pages = await Promise.all(ctxs.map((c) => open(c)))
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
    expect(sent).toEqual([2, 0, 0]) // in and out, from the one who moved; nobody answers
    await Promise.all(ctxs.map((c) => c.close()))
  })
}

export function registerALocalEffectNeverRunsForA(getBrowser, open) {
  test('a local effect never runs for a remote hover', async () => {
    const one = await getBrowser().newContext(),
      two = await getBrowser().newContext()
    const a = await open(one),
      b = await open(two)
    await settled(a)
    await settled(b)
    await box(a, 'left', 'Ana').hover()
    await lit(box(b, 'left', 'Ana'))
    await sleep(200)
    expect(await person(b, 'left', 'Ana').locator('output').textContent()).toBe('1 elsewhere')
    expect(await b.evaluate(() => window.__localHover ?? 0)).toBe(0)
    expect(await a.evaluate(() => window.__localHover)).toBe(2) // one watch in each pane's Row, on the one box
    await one.close()
    await two.close()
  })
}

export function registerTouchATapLeavesHoverFalseHere(getBrowser, open) {
  test('touch: a tap leaves hover false, here and everywhere', async () => {
    const phone = await getBrowser().newContext({
        hasTouch: true,
        isMobile: true,
        viewport: { width: 390, height: 700 },
      }),
      two = await getBrowser().newContext()
    const a = await open(phone),
      b = await open(two)
    await settled(a)
    await settled(b)
    const seen = box(b, 'left', 'Ana')
    await seen.evaluate((el) => {
      window.__lit = 0
      new MutationObserver(() => {
        if (el.hasAttribute('data-hold')) window.__lit++
      }).observe(el, { attributes: true })
    })
    await person(a, 'left', 'Ana').locator('button').tap()
    await sleep(600)
    expect(await person(a, 'left', 'Ana').locator('output').textContent()).toBe('idle')
    expect(await a.evaluate(() => window.__localHover ?? 0)).toBe(0)
    await expect.poll(() => seen.evaluate((el) => !el.hasAttribute('data-hold'))).toBe(true) // a tap presses, then lets go
    await phone.close()
    await two.close()
  })
}

export function registerOfflineWithACloseEventThatNever(getBrowser, open) {
  test('offline, with a close event that never comes: clears past the grace, and comes back with the link', async () => {
    const one = await getBrowser().newContext(),
      two = await getBrowser().newContext()
    const a = await open(one),
      b = await open(two)
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
}
