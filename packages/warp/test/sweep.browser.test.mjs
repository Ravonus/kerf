// @vitest-environment node
// The sweep in Chrome, from warp's real stylesheet. jsdom can't evaluate :hover, :has or registered properties, so this is
// where the behaviour of the old phase machine's session lives now: every host kind, every way in and out, in one trace.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { pixelContrast } from '../scripts/a11y.mjs'

const { chromium } = createRequire(import.meta.url)('playwright-core')
// a real browser on a busy machine: vitest's 5 s suits jsdom, not this
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

const css = readFileSync(new URL('../../ui-core/styles/warp.css', import.meta.url), 'utf8')

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

const ids = ['soft', 'frame', 'pressed', 'menu', 'cb-host', 'sw-host', 'field-host', 'card', 'inner', 'pop', 'heading']
const active = page => page.evaluate(list => list.filter(id => {
  const n = document.getElementById(id)
  return n && getComputedStyle(n).getPropertyValue('--_a').trim() === '1'
}), ids)
const set = (page, id, name, value) => page.evaluate(([i, n, v]) => {
  const e = document.getElementById(i)
  v === null ? e.removeAttribute(n) : e.setAttribute(n, v)
}, [id, name, value])
const away = page => page.hover('#far')
const part = (id, name) => `#${id} > [data-part="${name}"]`
const running = (page, selector) => page.locator(selector).evaluate(n => n.getAnimations().length)
const clip = (page, selector) => page.locator(selector).evaluate(n => getComputedStyle(n).clipPath)
const finished = (page, selector) => page.locator(selector).evaluate(n => Promise.all(n.getAnimations().map(a => a.finished)))

let browser
beforeAll(async () => { browser = await chromium.launch() })
afterAll(async () => { await browser?.close() })

async function open(options) {
  const context = await browser.newContext({ viewport: { width: 800, height: 700 }, ...options })
  const page = await context.newPage()
  await page.setContent(`<!doctype html><html data-expression="balanced"><style>${css}</style><body>${HOSTS}`)
  await away(page).catch(() => {})
  return { page, close: () => context.close() }
}

test('every host kind goes active and lets go', async () => {
  const { page, close } = await open()
  const trace = []
  const step = async (label, act) => { await act(); trace.push(`${label}: ${(await active(page)).join(' ')}`) }

  await step('install', () => {})
  await step('hover soft', () => page.hover('#soft'))
  await step('move within soft', () => page.hover('#soft-in'))
  await step('leave soft', () => away(page))
  await step('hover frame', () => page.hover('#frame'))
  await step('leave frame', () => away(page))
  await step('expand menu', () => set(page, 'menu', 'aria-expanded', 'true'))
  await step('collapse menu', () => set(page, 'menu', 'aria-expanded', 'false'))
  await step('unpress', () => set(page, 'pressed', 'aria-pressed', 'false'))
  await step('press again', () => set(page, 'pressed', 'aria-pressed', 'true'))
  await step('hover checkbox label', () => page.hover('#cb-label'))
  await step('hover switch label', () => page.hover('#sw-label'))
  await step('leave labels', () => away(page))
  await step('focus field', () => page.focus('#in'))
  await step('blur field', () => page.evaluate(() => document.activeElement.blur()))
  await step('field data-open', () => set(page, 'field', 'data-open', ''))
  await step('field closed', () => set(page, 'field', 'data-open', null))
  await step('hover inner of a surface', () => page.hover('#inner'))
  await step('leave surface', () => away(page))
  await step('popover data-state', () => set(page, 'pop', 'data-state', 'open'))
  await step('popover closed', () => set(page, 'pop', 'data-state', null))
  await step('accordion child expanded', () => set(page, 'acc', 'aria-expanded', 'true'))
  await step('accordion collapsed', () => set(page, 'acc', 'aria-expanded', 'false'))
  await step('pin', () => set(page, 'soft', 'data-pin', ''))
  await step('unpin', () => set(page, 'soft', 'data-pin', null))
  await step('confirm', () => set(page, 'soft', 'data-confirm', ''))
  await step('confirm over', () => set(page, 'soft', 'data-confirm', null))
  await step('invalid', () => set(page, 'soft', 'data-invalid', ''))
  await step('valid', () => set(page, 'soft', 'data-invalid', null))
  await step('host added later', () => page.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<button id="late" data-sweep aria-pressed="true"><span data-part="sweep"></span>L</button>')
  }))
  ids.push('late')
  await step('late host seen', () => {})
  await step('late host removed', () => page.evaluate(() => document.getElementById('late').remove()))
  ids.pop()
  expect(trace).toMatchSnapshot()
  await close()
})

test('nothing above a host is written: no phase, no inline state', async () => {
  const { page, close } = await open()
  const before = await page.locator('#soft').evaluate(n => n.outerHTML)
  await page.hover('#soft')
  await away(page)
  expect(await page.locator('#soft').evaluate(n => n.outerHTML)).toBe(before)
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
  expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true)
  const stroke = part('soft', 'sweep')
  const on = () => page.locator(stroke).evaluate(n => getComputedStyle(n).getPropertyValue('--_a').trim())
  const box = await page.locator('#soft').boundingBox()
  await page.mouse.move(box.x + 4, box.y + 4)
  expect(await on()).toBe('0')
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  await expect.poll(on).toBe('1')
  await page.waitForTimeout(150) // long after :active has gone
  expect(await page.locator('#soft').evaluate(n => n.matches(':active'))).toBe(false)
  expect(await on()).toBe('1')
  await expect.poll(on, { timeout: 3000 }).toBe('0')
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
  await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', `<dialog id="pal" data-scope="palette">
    <div id="pal-row" data-part="input-row" data-sweep=""><span data-part="sweep"></span></div>
    <div data-part="list"><span id="face" data-part="shuttle"></span><div id="opt" aria-selected="false">One</div></div></dialog>`))
  const held = () => page.locator('#pal-row').evaluate(n => getComputedStyle(n).getPropertyValue('--_a').trim())
  const seen = () => page.locator('#face').evaluate(n => getComputedStyle(n).opacity)
  expect(await held()).toBe('0')
  await page.evaluate(() => document.getElementById('pal').showModal())
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
  expect((await pixelContrast(page, 1)).ok).toBe(false)
  expect((await pixelContrast(page, 2)).ok).toBe(false)
  await page.close()
})

// when a mask goes in, between the box being read and the screenshot being taken: the race a timed banner ran
const whenMasked = move => `new MutationObserver(() => (${move})()).observe(document.head, { childList: true })`
const banner = `<!doctype html><body style="background:#fff;margin:0;height:100vh;display:flex;flex-direction:column">
  <div id="banner" style="height:57px;background:#fff"></div>
  <button data-a11y-px="0" style="all:unset;align-self:start;padding:8px 16px;background:#176;color:#fff">Create project</button>`

test('the contrast measurer reads text where it is, not where it was', async () => {
  const page = await browser.newPage()
  await page.setContent(banner)
  await page.evaluate(whenMasked("() => document.getElementById('banner')?.remove()"))
  expect((await pixelContrast(page, 0)).ok).toBe(true)
  await page.close()
})

test('the contrast measurer fails text that never holds still', async () => {
  const page = await browser.newPage()
  await page.setContent(banner)
  await page.evaluate(whenMasked("() => { document.getElementById('banner').style.height = Math.random() * 300 + 'px' }"))
  await expect(pixelContrast(page, 0)).rejects.toThrow('kept moving')
  await page.close()
})
