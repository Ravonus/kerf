// @vitest-environment node
// The sweep in Chrome, from veneer's real stylesheet. jsdom can't evaluate :hover, :has or registered properties, so this is
// where the behaviour of the old phase machine's session lives now: every host kind, every way in and out, in one trace.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type * as Playwright from 'playwright-core'

import { pixelContrast } from '../scripts/a11y.mjs'

const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
// a real browser on a busy machine: vitest's 5 s suits jsdom, not this
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

const css = readFileSync(new URL('../../veneer-core/styles/veneer.css', import.meta.url), 'utf8')

const HOSTS = `
  <button id="soft" data-sweep><span data-part="sweep-base"></span><span data-part="sweep"></span><i id="soft-in">Soft</i></button>
  <button id="frame" data-sweep><span data-part="sweep-outline"><i></i><i></i><i></i><i></i><i></i><i></i></span><span data-part="sweep-label">Frame</span><span data-part="sweep-content" aria-hidden="true">Frame</span></button>
  <button id="pressed" data-sweep aria-pressed="true"><span data-part="sweep"></span>On</button>
  <button id="menu" data-sweep aria-expanded="false"><span data-part="sweep"></span>Menu</button>
  <label data-scope="checkbox" id="cb-label"><input type="checkbox" id="cb"><span id="cb-host" data-part="control" data-sweep><span data-part="sweep"></span></span>Check</label>
  <label data-scope="switch" id="sw-label"><input type="checkbox" id="sw"><span id="sw-host" data-part="track" data-sweep><span data-part="sweep"></span></span>Switch</label>
  <div data-scope="field" id="field"><div id="field-host" data-part="control" data-sweep><span data-part="sweep"></span><input id="in"></div></div>
  <div id="card" data-sweep="surface" style="padding:24px"><span data-part="sweep"></span><button id="inner" data-sweep>x</button></div>
  <div id="pop" data-sweep><span data-part="sweep"></span>Pop</div>
  <div id="heading" data-sweep><div data-part="heading"><button id="acc" aria-expanded="false">Q</button></div><span data-part="sweep"></span></div>
  <div id="far" style="block-size:40px">away</div>`

const ids = [
  'soft',
  'frame',
  'pressed',
  'menu',
  'cb-host',
  'sw-host',
  'field-host',
  'card',
  'inner',
  'pop',
  'heading',
]
const active = (page: Playwright.Page) =>
  page.evaluate(
    (list) =>
      list.filter((id) => {
        const n = document.getElementById(id)
        return n && getComputedStyle(n).getPropertyValue('--_a').trim() === '1'
      }),
    ids,
  )
const set = (page: Playwright.Page, id: string, name: string, value: string | null) =>
  page.evaluate(
    ([i, n, v]) => {
      const e = document.getElementById(i)!
      v === null ? e.removeAttribute(n) : e.setAttribute(n, v)
    },
    [id, name, value] as [string, string, string | null],
  )
const away = (page: Playwright.Page) => page.hover('#far')
const part = (id: string, name: string) => `#${id} > [data-part="${name}"]`
const running = (page: Playwright.Page, selector: string) =>
  page.locator(selector).evaluate((n) => n.getAnimations().length)
const clip = (page: Playwright.Page, selector: string) =>
  page.locator(selector).evaluate((n) => getComputedStyle(n).clipPath)
const finished = (page: Playwright.Page, selector: string) =>
  page.locator(selector).evaluate((n) => Promise.all(n.getAnimations().map((a) => a.finished)))
// Freeze new transitions before input, then advance the part by ms. Time between input and sampling cannot escape.
const freeze = async (page: Playwright.Page) => {
  const session = await page.context().newCDPSession(page)
  await session.send('Animation.setPlaybackRate', { playbackRate: 0 })
}
const step = (page: Playwright.Page, selector: string, ms: number) =>
  page.locator(selector).evaluate((n, by) => {
    for (const a of n.getAnimations()) {
      a.pause()
      a.currentTime = ((a.currentTime ?? 0) as number) + by
    }
    const g = getComputedStyle(n)
    return {
      sl: parseFloat(g.getPropertyValue('--_sl')),
      sr: parseFloat(g.getPropertyValue('--_sr')),
    }
  }, ms)
// how much of the stroke shows, in %: what lies between the left edge and the right
const cover = (e: { sl: number; sr: number }) => Math.max(0, 100 - e.sl - e.sr)
const run = async (page: Playwright.Page, selector: string, ms: number, every = 8) => {
  const out = []
  for (let t = 0; t < ms; t += every) out.push(await step(page, selector, every))
  return out
}
const SWEEP = 620 // balanced

let browser: Playwright.Browser
beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(async () => {
  await browser?.close()
})

async function open(options?: Parameters<Playwright.Browser['newContext']>[0]) {
  const context = await browser.newContext({ viewport: { width: 800, height: 700 }, ...options })
  const page = await context.newPage()
  await page.setContent(
    `<!doctype html><html data-expression="balanced"><style>${css}</style><body>${HOSTS}`,
  )
  await away(page).catch(() => {})
  return { page, close: () => context.close() }
}

test('every host kind goes active and lets go', async () => {
  const { page, close } = await open()
  const trace: string[] = []
  const at = async (label: string, act: () => unknown) => {
    await act()
    trace.push(`${label}: ${(await active(page)).join(' ')}`)
  }

  await at('install', () => {})
  await at('hover soft', () => page.hover('#soft'))
  await at('move within soft', () => page.hover('#soft-in'))
  await at('leave soft', () => away(page))
  await at('hover frame', () => page.hover('#frame'))
  await at('leave frame', () => away(page))
  await at('expand menu', () => set(page, 'menu', 'aria-expanded', 'true'))
  await at('collapse menu', () => set(page, 'menu', 'aria-expanded', 'false'))
  await at('unpress', () => set(page, 'pressed', 'aria-pressed', 'false'))
  await at('press again', () => set(page, 'pressed', 'aria-pressed', 'true'))
  await at('hover checkbox label', () => page.hover('#cb-label'))
  await at('hover switch label', () => page.hover('#sw-label'))
  await at('leave labels', () => away(page))
  await at('focus field', () => page.focus('#in'))
  await at('blur field', () => page.evaluate(() => (document.activeElement as HTMLElement).blur()))
  await at('field data-open', () => set(page, 'field', 'data-open', ''))
  await at('field closed', () => set(page, 'field', 'data-open', null))
  await at('hover inner of a surface', () => page.hover('#inner'))
  await at('leave surface', () => away(page))
  await at('popover data-state', () => set(page, 'pop', 'data-state', 'open'))
  await at('popover closed', () => set(page, 'pop', 'data-state', null))
  await at('accordion child expanded', () => set(page, 'acc', 'aria-expanded', 'true'))
  await at('accordion collapsed', () => set(page, 'acc', 'aria-expanded', 'false'))
  await at('pin', () => set(page, 'soft', 'data-pin', ''))
  await at('unpin', () => set(page, 'soft', 'data-pin', null))
  await at('confirm', () => set(page, 'soft', 'data-confirm', ''))
  await at('confirm over', () => set(page, 'soft', 'data-confirm', null))
  await at('invalid', () => set(page, 'soft', 'data-invalid', ''))
  await at('valid', () => set(page, 'soft', 'data-invalid', null))
  await at('host added later', () =>
    page.evaluate(() => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<button id="late" data-sweep aria-pressed="true"><span data-part="sweep"></span>L</button>',
      )
    }),
  )
  ids.push('late')
  await at('late host seen', () => {})
  await at('late host removed', () =>
    page.evaluate(() => document.getElementById('late')!.remove()),
  )
  ids.pop()
  expect(trace).toMatchSnapshot()
  await close()
})

test('nothing above a host is written: no phase, no inline state', async () => {
  const { page, close } = await open()
  const before = await page.locator('#soft').evaluate((n) => n.outerHTML)
  await page.hover('#soft')
  await away(page)
  expect(await page.locator('#soft').evaluate((n) => n.outerHTML)).toBe(before)
  await close()
})

test('a sweep draws in, holds whole, draws out, and comes to rest hidden', async () => {
  const { page, close } = await open()
  const stroke = part('soft', 'sweep')
  const rest = await clip(page, stroke)
  await page.hover('#soft')
  expect(await running(page, stroke)).toBeGreaterThan(0)
  await finished(page, stroke)
  const whole = await clip(page, stroke)
  expect(whole).not.toBe(rest)
  await away(page)
  expect(await running(page, stroke)).toBeGreaterThan(0)
  await finished(page, stroke)
  expect(await clip(page, stroke)).toBe(rest)
  await close()
})

test('re-entering during the exit shows the stroke whole (SIGNATURE §1.4)', async () => {
  const { page, close } = await open()
  const stroke = part('soft', 'sweep')
  await page.hover('#soft')
  await finished(page, stroke)
  const whole = await clip(page, stroke)
  await away(page)
  await page.hover('#soft')
  await finished(page, stroke)
  expect(await clip(page, stroke)).toBe(whole)
  await close()
})

test('a 50 ms hover draws the stroke all the way round, then it leaves L→R (SIGNATURE §1.4)', async () => {
  const { page, close } = await open()
  await freeze(page)
  const stroke = part('soft', 'sweep')
  expect(cover(await step(page, stroke, 0))).toBe(0)
  await page.hover('#soft')
  await step(page, stroke, 50)
  await away(page)
  const trace = await run(page, stroke, 3 * SWEEP)
  const top = trace.findIndex((e) => cover(e) > 99.5)
  expect(top).toBeGreaterThan(0) // it got all the way round...
  expect(Math.max(...trace.slice(0, top).map((e) => e.sl))).toBeLessThan(0.5) // ...before the tail moved
  for (let i = 1; i < trace.length; i++) {
    if (cover(trace[i]!) === 0) continue // gone: at rest both edges go back to the right
    expect(trace[i]!.sr).toBeLessThanOrEqual(trace[i - 1]!.sr + 0.01) // the head never goes back
    expect(trace[i]!.sl).toBeGreaterThanOrEqual(trace[i - 1]!.sl - 0.01) // nor the tail: it leaves L→R
  }
  expect(trace.at(-1)).toEqual({ sl: 100, sr: 100 })
  expect(cover(trace.at(-1)!)).toBe(0)
  await close()
})

test('a long hover leaves at once; re-entering mid-exit draws the tail back with no jump', async () => {
  const { page, close } = await open()
  const stroke = part('soft', 'sweep')
  await freeze(page)
  await page.hover('#soft')
  await run(page, stroke, 2 * SWEEP, 40)
  expect(cover(await step(page, stroke, 0))).toBeGreaterThan(99.5)
  await away(page)
  const out = await run(page, stroke, SWEEP / 2)
  expect(out[2]!.sl).toBeGreaterThan(0) // the exit starts at once
  const mid = cover(out.at(-1)!)
  expect(mid).toBeGreaterThan(5)
  expect(mid).toBeLessThan(95)
  await page.hover('#soft')
  await page.waitForTimeout(150) // delayed sampling must not advance the new transition
  const back = [out.at(-1)!, ...(await run(page, stroke, SWEEP))]
  // a draw moves at most ~2.5% of the stroke per 8 ms; a jump would be the whole gap in one step
  for (let i = 1; i < back.length; i++)
    expect(Math.abs(cover(back[i]!) - cover(back[i - 1]!))).toBeLessThan(6)
  expect(cover(back.at(-1)!)).toBeGreaterThan(99.5)
  await close()
})

test('the frame outline also draws all the way round after a brief hover', async () => {
  const { page, close } = await open()
  await freeze(page)
  const outline = part('frame', 'sweep-outline')
  const read = () =>
    page.locator(outline).evaluate((n) => {
      const g = getComputedStyle(n)
      return [
        +g.getPropertyValue('--veneer-frame-head'),
        +g.getPropertyValue('--veneer-frame-tail'),
      ]
    })
  await page.hover('#frame')
  await step(page, outline, 50)
  await away(page)
  let peak = 0,
    tailBeforePeak = 0
  for (let t = 0; t < 3 * 760; t += 16) {
    await step(page, outline, 16)
    const [head, tail] = await read()
    if (peak < 0.995) tailBeforePeak = Math.max(tailBeforePeak, tail!)
    peak = Math.max(peak, head!)
  }
  expect(peak).toBeGreaterThan(0.995)
  expect(tailBeforePeak).toBeLessThan(0.005)
  expect((await read())[1]).toBeGreaterThan(0.995)
  await close()
})

test('the label gives way to its copy, and is back at once', async () => {
  const { page, close } = await open()
  const label = part('frame', 'sweep-label')
  const rest = await clip(page, label)
  await page.hover('#frame')
  await finished(page, part('frame', 'sweep-content'))
  await finished(page, label)
  expect(await clip(page, label)).toContain('300%')
  await away(page)
  await finished(page, label)
  expect(await clip(page, label)).toBe(rest)
  await close()
})

test('reduced motion: the same end states, with nothing running', async () => {
  const { page, close } = await open({ reducedMotion: 'reduce' })
  const stroke = part('soft', 'sweep')
  const rest = await clip(page, stroke)
  await page.hover('#soft')
  expect(await active(page)).toContain('soft')
  expect(await running(page, stroke)).toBe(0)
  expect(await clip(page, stroke)).not.toBe(rest)
  await away(page)
  expect(await running(page, stroke)).toBe(0)
  expect(await clip(page, stroke)).toBe(rest)
  await close()
})

test('touch: hover never counts, and a tap draws one whole sweep, then exits', async () => {
  const { page, close } = await open({ hasTouch: true, isMobile: true })
  await freeze(page)
  expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true)
  const stroke = part('soft', 'sweep')
  const on = () =>
    page.locator('#soft').evaluate((n) => getComputedStyle(n).getPropertyValue('--_a').trim())
  const box = (await page.locator('#soft').boundingBox())!
  await page.mouse.move(box.x + 4, box.y + 4)
  expect(await on()).toBe('0')
  expect(cover(await step(page, stroke, 0))).toBe(0)
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  await expect.poll(on).toBe('0') // :active is over in a blink...
  await step(page, stroke, 0)
  const trace = await run(page, stroke, 3 * SWEEP)
  expect(Math.max(...trace.map(cover))).toBeGreaterThan(99.5) // ...and the stroke still went all the way round
  expect(cover(trace.at(-1)!)).toBe(0)
  await close()
})

test('forced colours drop the copy, so the label stays whole', async () => {
  const { page, close } = await open({ forcedColors: 'active' })
  await page.hover('#frame')
  await finished(page, part('frame', 'sweep-label'))
  expect(await clip(page, part('frame', 'sweep-label'))).toBe('none')
  await close()
})

test('an open palette holds its sweep and shows its shuttle, with nothing written', async () => {
  const { page, close } = await open()
  await page.evaluate(() =>
    document.body.insertAdjacentHTML(
      'beforeend',
      `<dialog id="pal" data-scope="palette">
    <div id="pal-row" data-part="input-row" data-sweep=""><span data-part="sweep"></span></div>
    <div data-part="list"><span id="face" data-part="shuttle"></span><div id="opt" aria-selected="false">One</div></div></dialog>`,
    ),
  )
  const held = () =>
    page.locator('#pal-row').evaluate((n) => getComputedStyle(n).getPropertyValue('--_a').trim())
  const seen = () => page.locator('#face').evaluate((n) => getComputedStyle(n).opacity)
  expect(await held()).toBe('0')
  await page.evaluate(() => (document.getElementById('pal') as HTMLDialogElement).showModal())
  expect(await held()).toBe('1')
  expect(await seen()).toBe('0')
  await set(page, 'opt', 'aria-selected', 'true')
  await expect.poll(seen).toBe('1')
  await close()
})

test('the contrast measurer skips text clipped out of sight, and only that', async () => {
  const page = await browser.newPage()
  await page.setContent(`<!doctype html><body style="background:#fff;margin:40px">
    <p data-a11y-px="0" style="color:#eee;clip-path:inset(0 100% 0 0)">Clipped away</p>
    <p data-a11y-px="1" style="color:#fff;clip-path:inset(0)">The colour of the page</p>
    <p data-a11y-px="2" style="color:#eee">Faint, with no clip</p>`)
  expect(await pixelContrast(page, 0)).toBeNull()
  expect((await pixelContrast(page, 1))!.ok).toBe(false)
  expect((await pixelContrast(page, 2))!.ok).toBe(false)
  await page.close()
})

// when a mask goes in, between the box being read and the screenshot being taken: the race a timed banner ran
const whenMasked = (move: string) =>
  `new MutationObserver(() => (${move})()).observe(document.head, { childList: true })`
const banner = `<!doctype html><body style="background:#fff;margin:0;height:100vh;display:flex;flex-direction:column">
  <div id="banner" style="height:57px;background:#fff"></div>
  <button data-a11y-px="0" style="all:unset;align-self:start;padding:8px 16px;background:#176;color:#fff">Create project</button>`

test('the contrast measurer reads text where it is, not where it was', async () => {
  const page = await browser.newPage()
  await page.setContent(banner)
  await page.evaluate(whenMasked("() => document.getElementById('banner')?.remove()"))
  expect((await pixelContrast(page, 0))!.ok).toBe(true)
  await page.close()
})

test('the contrast measurer fails text that never holds still', async () => {
  const page = await browser.newPage()
  await page.setContent(banner)
  await page.evaluate(
    whenMasked(
      "() => { document.getElementById('banner').style.height = Math.random() * 300 + 'px' }",
    ),
  )
  await expect(pixelContrast(page, 0)).rejects.toThrow('kept moving')
  await page.close()
})
