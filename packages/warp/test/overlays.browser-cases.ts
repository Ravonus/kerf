import type { OverlayTools } from './overlays.browser.test'

function overlayAMenuLowOnThe({
  fresh,
  opened,
  boxes,
}: Pick<OverlayTools, 'fresh' | 'opened' | 'boxes'>) {
  return async () => {
    const page = await fresh()
    await opened(page, 'LowMenu')
    const b = await boxes(page, 'low')
    expect(b.side).toBe('top')
    expect(b.bottom).toBeLessThanOrEqual(b.tTop)
    expect(b.top).toBeGreaterThanOrEqual(8)
    expect(b.origin).not.toBe('0px 0px')
    await page.close()
  }
}

function overlayAMenuAtTheRight({
  fresh,
  opened,
  boxes,
}: Pick<OverlayTools, 'fresh' | 'opened' | 'boxes'>) {
  return async () => {
    const page = await fresh()
    await opened(page, 'EdgeMenu')
    const b = await boxes(page, 'edge')
    expect(b.right).toBeLessThanOrEqual(b.vw - 8 + 0.5)
    await page.close()
  }
}

function overlayAlignEndLinesUpThe({
  fresh,
  opened,
  boxes,
}: Pick<OverlayTools, 'fresh' | 'opened' | 'boxes'>) {
  return async () => {
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
  }
}

function overlayInRTLAlignStartLines({
  fresh,
  opened,
  boxes,
}: Pick<OverlayTools, 'fresh' | 'opened' | 'boxes'>) {
  return async () => {
    const page = await fresh()
    await opened(page, 'RtlMenu')
    const b = await boxes(page, 'rtlmenu')
    expect(Math.abs(b.right - b.tRight)).toBeLessThanOrEqual(2)
    await page.close()
  }
}

function overlayASliderArrowInRTL({ fresh }: Pick<OverlayTools, 'fresh'>) {
  return async () => {
    const page = await fresh()
    await page.locator('#rtl [data-part="thumb"]').focus()
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(100)
    expect(await page.locator('#rtl [data-part="thumb"]').getAttribute('aria-valuenow')).toBe('51')
    await page.close()
  }
}

function overlayAMenuFollowsItsTrigger({
  fresh,
  opened,
  boxes,
}: Pick<OverlayTools, 'fresh' | 'opened' | 'boxes'>) {
  return async () => {
    const page = await fresh()
    await page.getByRole('button', { name: 'ScrollMenu' }).scrollIntoViewIfNeeded()
    await opened(page, 'ScrollMenu')
    const a = await boxes(page, 'scrolled')
    await page.evaluate(() => scrollBy({ top: 40, behavior: 'instant' })) // instant: the page scrolls smoothly by default
    // It moves on the next frame, which a busy machine delays: wait for it rather than a fixed time.
    let b = a
    await expect
      .poll(
        async () => {
          b = await boxes(page, 'scrolled')
          return Math.abs(b.top - b.tBottom - (a.top - a.tBottom))
        },
        { timeout: 2000 },
      )
      .toBeLessThanOrEqual(2) // place() rounds
    expect(b.tTop).not.toBe(a.tTop)
    await page.close()
  }
}

function overlayTheLastRowOfA({ fresh, opened }: Pick<OverlayTools, 'fresh' | 'opened'>) {
  return async () => {
    const page = await fresh()
    await opened(page, 'TallMenu')
    await page.keyboard.press('End')
    await page.waitForTimeout(150)
    const r = await page.evaluate(() => {
      const m = document.querySelector('#tall [role="menu"]')!,
        a = document.activeElement!.getBoundingClientRect(),
        b = m.getBoundingClientRect()
      return {
        text: document.activeElement!.textContent,
        top: a.top,
        bottom: a.bottom,
        boxTop: b.top,
        boxBottom: b.bottom,
        scrollTop: m.scrollTop,
        vh: innerHeight,
      }
    })
    expect(r.text).toBe('Row 59')
    expect(r.scrollTop).toBeGreaterThan(0)
    expect(r.bottom).toBeLessThanOrEqual(r.boxBottom)
    expect(r.boxBottom).toBeLessThanOrEqual(r.vh)
    await page.close()
  }
}

function overlayAMenuItemWithHref({ fresh, opened }: Pick<OverlayTools, 'fresh' | 'opened'>) {
  return async () => {
    const page = await fresh()
    await opened(page, 'LinkMenu')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    expect(new URL(page.url()).hash).toBe('#there')
    await page.close()
  }
}

function overlayThePageBehindAS({ fresh, opened }: Pick<OverlayTools, 'fresh' | 'opened'>) {
  return async (_: unknown, label: string) => {
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
  }
}

function overlayTheLockKeepsTheScroll({ fresh }: Pick<OverlayTools, 'fresh'>) {
  return async () => {
    const page = await fresh()
    await page.evaluate(() => scrollTo({ top: 300, behavior: 'instant' }))
    await page.evaluate(() => {
      window.api.modal.value = true
    })
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => scrollY)).toBe(300)
    await page.close()
  }
}

function overlayEscapeInAComboboxInside({ fresh, opened }: Pick<OverlayTools, 'fresh' | 'opened'>) {
  return async () => {
    const page = await fresh()
    await opened(page, 'Open modal')
    await page.getByRole('combobox', { name: 'Fruit' }).fill('a')
    await page.waitForSelector('[data-kind="combo"]:popover-open')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    const after = () =>
      page.evaluate(() => ({
        list: !!document.querySelector('[data-kind="combo"]:popover-open'),
        modal: document.querySelector<HTMLDialogElement>('dialog[data-scope="dialog"]')!.open,
        text: document.querySelector<HTMLInputElement>('[role="combobox"]')!.value,
      }))
    expect(await after()).toEqual({ list: false, modal: true, text: 'a' })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
    expect((await after()).modal).toBe(false)
    await page.close()
  }
}

function overlayAClickOutsideClosesThe({ fresh, opened }: Pick<OverlayTools, 'fresh' | 'opened'>) {
  return async () => {
    const page = await fresh()
    await opened(page, 'Open modal')
    await page.getByRole('combobox', { name: 'Fruit' }).fill('a')
    await page.waitForSelector('[data-kind="combo"]:popover-open')
    await page.getByRole('heading', { name: 'One' }).click()
    await page.waitForTimeout(200)
    expect(
      await page.evaluate(() => [
        !!document.querySelector('[data-kind="combo"]:popover-open'),
        document.querySelector<HTMLDialogElement>('dialog[data-scope="dialog"]')!.open,
      ]),
    ).toEqual([false, true])
    await page.close()
  }
}

function overlayASliderClickInRTL({ fresh }: Pick<OverlayTools, 'fresh'>) {
  return async () => {
    const page = await fresh()
    const t = await page.evaluate(() => {
      const r = document.querySelector('#rtl [data-part="track"]')!
      r.scrollIntoView({ block: 'center', behavior: 'instant' })
      const b = r.getBoundingClientRect()
      return { l: b.left, w: b.width, y: b.top + b.height / 2 }
    })
    await page.mouse.click(t.l + t.w * 0.1, t.y)
    await page.waitForTimeout(100)
    const r = await page.evaluate(() => {
      const th = document.querySelector('#rtl [data-part="thumb"]')!,
        b = th.getBoundingClientRect()
      return { now: th.getAttribute('aria-valuenow'), at: b.left + b.width / 2 }
    })
    expect(r.now).toBe('90')
    expect(Math.abs(r.at - (t.l + t.w * 0.1))).toBeLessThanOrEqual(20) // the thumb travels inset from the track's ends
    await page.close()
  }
}

function overlayUndoWorksWhenTheToast({
  fresh,
  opened,
  where,
  undo,
  raise,
}: Pick<OverlayTools, 'fresh' | 'opened' | 'where' | 'undo' | 'raise'>) {
  return async () => {
    const page = await fresh()
    await opened(page, 'Open modal')
    await raise(page)
    await page.waitForTimeout(300)
    expect(await where(page)).toEqual({ dialog: 'One', popover: true, top: true })
    await undo(page)
    expect(
      await page.evaluate(
        () => document.querySelector<HTMLDialogElement>('dialog[data-scope="dialog"]')!.open,
      ),
    ).toBe(true)
    await page.close()
  }
}

function overlayTheToastSitsAtThe({
  fresh,
  opened,
  region,
  raise,
}: Pick<OverlayTools, 'fresh' | 'opened' | 'region' | 'raise'>) {
  return async () => {
    const page = await fresh()
    const settle = () =>
      page
        .locator(`${region} [data-part="root"]`)
        .first()
        .evaluate(async (el) => {
          await new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          })
          await Promise.all(
            el.getAnimations().map((animation) => animation.finished.catch(() => {})),
          )
        })
    await raise(page)
    await settle()
    const rect = () =>
      page.evaluate(() => {
        const r = document
          .querySelector('[data-scope="toast"][data-part="root"]')!
          .getBoundingClientRect()
        return [Math.round(r.right), Math.round(r.bottom)]
      })
    const before = await rect()
    await opened(page, 'Open modal')
    await settle()
    expect(await rect()).toEqual(before)
    await page.close()
  }
}

function overlayOneAlreadyShowingMovesIn({
  fresh,
  where,
  undo,
  raise,
}: Pick<OverlayTools, 'fresh' | 'where' | 'undo' | 'raise'>) {
  return async () => {
    const page = await fresh()
    await raise(page, { duration: 60000 })
    await page.waitForTimeout(500)
    const time = () =>
      page.evaluate(
        () => document.querySelector('[data-part="progress"]')!.getAnimations()[0]?.currentTime,
      )
    const t0 = (await time()) as number
    await page.evaluate(() => {
      window.api.modal.value = true
      window.seen = []
      const root = document.querySelector('[data-scope="toast"][data-part="root"]')!
      const look = () => {
        window.seen.push(
          new DOMMatrix(
            getComputedStyle(root).translate === 'none'
              ? undefined
              : `translate(${getComputedStyle(root).translate.split(' ').join(',')})`,
          ).m42,
        )
        if (window.seen.length < 20) requestAnimationFrame(look)
      }
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
    // back on the page: the region is a popover everywhere, so it stays in the top layer
    expect(await where(page)).toEqual({ dialog: null, popover: true, top: true })
    await undo(page)
    await page.close()
  }
}

function overlayStackedModalsTheTopOne({
  fresh,
  opened,
  where,
  undo,
  raise,
  set,
}: Pick<OverlayTools, 'fresh' | 'opened' | 'where' | 'undo' | 'raise' | 'set'>) {
  return async () => {
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
  }
}

function overlayWorksOverAS({
  fresh,
  where,
  undo,
  raise,
  set,
}: Pick<OverlayTools, 'fresh' | 'where' | 'undo' | 'raise' | 'set'>) {
  return async (kind: string) => {
    const page = await fresh()
    await set(page, kind, true)
    await page.waitForTimeout(350)
    await raise(page, { duration: 60000 })
    await page.waitForTimeout(300)
    expect((await where(page)).top).toBe(true)
    await undo(page)
    await page.close()
  }
}

function overlayATimerEndsInsideThe({
  fresh,
  opened,
  raise,
}: Pick<OverlayTools, 'fresh' | 'opened' | 'raise'>) {
  return async () => {
    const page = await fresh()
    await opened(page, 'Open modal')
    await raise(page, { duration: 60000 })
    await page.waitForTimeout(300)
    const state = () =>
      page.evaluate(
        () => document.querySelector('[data-part="progress"]')!.getAnimations()[0]?.playState,
      )
    expect(await state()).toBe('running')
    const box = (await page.getByRole('button', { name: 'Undo' }).first().boundingBox())!
    // polled, not a fixed wait: a loaded gate's Firefox can take longer than 150 ms to deliver the hover
    await page.mouse.move(box.x + 2, box.y + 2)
    await expect.poll(state, { timeout: 3000 }).toBe('paused')
    await page.mouse.move(5, 5)
    await expect.poll(state, { timeout: 3000 }).toBe('running')
    await raise(page, { title: 'Brief', duration: 200, action: undefined })
    await expect
      .poll(() => page.locator('[data-part="root"]', { hasText: 'Brief' }).count(), {
        timeout: 3000,
      })
      .toBe(0)
    await page.close()
  }
}

function overlayAPausedToastStaysPaused({
  fresh,
  raise,
  set,
}: Pick<OverlayTools, 'fresh' | 'raise' | 'set'>) {
  return async () => {
    const page = await fresh()
    await raise(page, { duration: 60000 })
    await page.waitForTimeout(300)
    const box = (await page.getByRole('button', { name: 'Undo' }).first().boundingBox())!
    await page.mouse.move(box.x + 2, box.y + 2)
    await page.waitForTimeout(150)
    const state = () =>
      page.evaluate(
        () => document.querySelector('[data-part="progress"]')!.getAnimations()[0]?.playState,
      )
    expect(await state()).toBe('paused')
    await set(page, 'modal', true)
    // every frame for a second, not one late look: WebKit's own hover check lands about 300 ms after the move
    const seen = await page.evaluate(
      () =>
        new Promise((done) => {
          const states = new Set(),
            end = performance.now() + 1000
          const look = () => {
            states.add(
              document.querySelector('[data-part="progress"]')!.getAnimations()[0]?.playState,
            )
            if (performance.now() < end) requestAnimationFrame(look)
            else done([...states])
          }
          look()
        }),
    )
    expect(seen).toEqual(['paused'])
    await page.mouse.move(box.x + 3, box.y + 3)
    await page.waitForTimeout(150)
    expect(await state()).toBe('paused')
    await page.mouse.move(5, 5)
    await expect.poll(state, { timeout: 2000 }).toBe('running')
    await page.close()
  }
}

function overlayFocusStaysPutOnThe({
  fresh,
  opened,
  raise,
  set,
}: Pick<OverlayTools, 'fresh' | 'opened' | 'raise' | 'set'>) {
  return async () => {
    const page = await fresh()
    await opened(page, 'Open modal')
    const before = await page.evaluate(() => document.activeElement!.outerHTML)
    await raise(page, { duration: 60000 })
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => document.activeElement!.outerHTML)).toBe(before)
    await page.keyboard.press('F8')
    expect(
      await page.evaluate(() => !!document.activeElement!.closest('[data-scope="toast"]')),
    ).toBe(true)
    await set(page, 'modal2', true)
    await page.waitForTimeout(300)
    await page.evaluate(() => document.querySelector<HTMLElement>('[data-act]')!.focus())
    await set(page, 'modal2', false)
    await page.waitForTimeout(300)
    expect(
      await page.evaluate(
        () =>
          !!document.activeElement!.closest('[data-scope="toast"]') ||
          document.activeElement!.tagName,
      ),
    ).not.toBe('BODY')
    await page.close()
  }
}

function overlayTheLiveRegionsGoWith({
  fresh,
  opened,
  raise,
}: Pick<OverlayTools, 'fresh' | 'opened' | 'raise'>) {
  return async () => {
    const page = await fresh()
    await opened(page, 'Open modal')
    await raise(page, { title: 'Announced', duration: 60000 })
    await page.waitForTimeout(250)
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll('[data-scope="announcer"]')].map((n) => [
          !!n.closest('dialog'),
          n.textContent,
        ]),
      ),
    ).toEqual([
      [true, 'Announced'],
      [true, ''],
    ])
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    expect(
      await page.evaluate(() =>
        [...document.querySelectorAll('[data-scope="announcer"]')].every(
          (n) => !n.closest('dialog'),
        ),
      ),
    ).toBe(true)
    await page.close()
  }
}

function overlayARequiredDateFieldStopsThe({ fresh }: Pick<OverlayTools, 'fresh'>) {
  return async () => {
    const page = await fresh()
    await page.click('#send')
    await page.waitForTimeout(150)
    expect(await page.evaluate(() => window.api.submitted.value)).toBe(0)
    expect(await page.locator('#form [data-part="error"]').textContent()).not.toBe('')
    expect(await page.evaluate(() => document.activeElement!.getAttribute('role'))).toBe(
      'spinbutton',
    )
    await page.keyboard.type('02032026')
    await page.waitForTimeout(100)
    await page.click('#send')
    await page.waitForTimeout(150)
    expect(await page.evaluate(() => window.api.submitted.value)).toBe(1)
    expect(await page.locator('#form [data-part="error"]').count()).toBe(0)
    await page.close()
  }
}

export function overlayCases({
  fresh,
  opened,
  boxes,
}: Pick<OverlayTools, 'fresh' | 'opened' | 'boxes'>) {
  return {
    get low() {
      return overlayAMenuLowOnThe({ fresh, opened, boxes })
    },
    get edge() {
      return overlayAMenuAtTheRight({ fresh, opened, boxes })
    },
    get align() {
      return overlayAlignEndLinesUpThe({ fresh, opened, boxes })
    },
    get rtlMenu() {
      return overlayInRTLAlignStartLines({ fresh, opened, boxes })
    },
    get rtlKeys() {
      return overlayASliderArrowInRTL({ fresh })
    },
    get scroll() {
      return overlayAMenuFollowsItsTrigger({ fresh, opened, boxes })
    },
    get keyboard() {
      return overlayTheLastRowOfA({ fresh, opened })
    },
    get link() {
      return overlayAMenuItemWithHref({ fresh, opened })
    },
    get pageLock() {
      return overlayThePageBehindAS({ fresh, opened })
    },
    get lockPosition() {
      return overlayTheLockKeepsTheScroll({ fresh })
    },
    get escape() {
      return overlayEscapeInAComboboxInside({ fresh, opened })
    },
    get outside() {
      return overlayAClickOutsideClosesThe({ fresh, opened })
    },
    get rtlSlider() {
      return overlayASliderClickInRTL({ fresh })
    },
    get date() {
      return overlayARequiredDateFieldStopsThe({ fresh })
    },
  }
}

export function toastCasesFor({
  fresh,
  opened,
  region,
  where,
  undo,
  raise,
  set,
}: Pick<OverlayTools, 'fresh' | 'opened' | 'region' | 'where' | 'undo' | 'raise' | 'set'>) {
  return {
    get undo() {
      return overlayUndoWorksWhenTheToast({ fresh, opened, where, undo, raise })
    },
    get corner() {
      return overlayTheToastSitsAtThe({ fresh, opened, region, raise })
    },
    get move() {
      return overlayOneAlreadyShowingMovesIn({ fresh, where, undo, raise })
    },
    get stack() {
      return overlayStackedModalsTheTopOne({ fresh, opened, where, undo, raise, set })
    },
    get surfaces() {
      return overlayWorksOverAS({ fresh, where, undo, raise, set })
    },
    get timer() {
      return overlayATimerEndsInsideThe({ fresh, opened, raise })
    },
    get pause() {
      return overlayAPausedToastStaysPaused({ fresh, raise, set })
    },
    get focus() {
      return overlayFocusStaysPutOnThe({ fresh, opened, raise, set })
    },
    get live() {
      return overlayTheLiveRegionsGoWith({ fresh, opened, raise })
    },
  }
}
