// @vitest-environment node
// Joined groups (SIGNATURE §1.8), in Chrome from warp's real stylesheets: in a row of items with shared edges the stroke
// draws only an item's outer edges. First: start, top, bottom; middle: top, bottom; last: end, top, bottom. Logical, so
// RTL flips; a vertical group does the same with top and bottom.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)('playwright-core')
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

const css = ['warp.css', 'components/base.css', 'components/button.css', 'components/button-group.css', 'components/toggle-button.css', 'inputs/base.css', 'inputs/field.css', 'inputs/choice.css']
  .map(f => readFileSync(new URL(`../../warp-core/styles/${f}`, import.meta.url), 'utf8')).join('\n')

const seg = (id, items) => `<div data-scope="segmented" role="radiogroup" id="${id}"><span data-part="indicator" aria-hidden="true"></span>${items.map((t, i) =>
  `<label data-sweep id="${id}-${t}"><span data-part="sweep" aria-hidden="true"></span><input type="radio" name="${id}" ${i === 0 ? 'checked' : ''}><span data-part="item">${t}</span></label>`).join('')}</div>`
const toggles = (id, items, extra = '') => `<div data-scope="toggle-group" role="group" id="${id}" ${extra}>${items.map(t =>
  `<button data-scope="toggle" aria-pressed="false" data-sweep id="${id}-${t}"><span data-part="sweep-base"></span><span data-part="sweep"></span>${t}</button>`).join('')}</div>`
const PAGE = `
  ${seg('size', ['sm', 'md', 'lg'])}
  <div dir="rtl">${seg('rtl', ['a', 'b', 'c'])}</div>
  ${seg('one', ['only'])}
  ${toggles('tg', ['b', 'i', 'u'])}
  ${toggles('vt', ['top', 'mid', 'end'], 'aria-orientation="vertical" style="flex-direction:column"')}
  <div data-scope="button-group" data-attached id="bg"><button data-scope="button" data-emphasis="outline" data-sweep id="bg-1"><span data-part="sweep-base"></span><span data-part="sweep"></span>Undo</button><button data-scope="button" data-emphasis="outline" data-sweep id="bg-2"><span data-part="sweep-base"></span><span data-part="sweep"></span>Redo</button></div>
  <div data-joined id="any"><span data-sweep id="any-1"><span data-part="sweep"></span>x</span><span data-sweep id="any-2"><span data-part="sweep"></span>y</span></div>
  <div id="far" style="block-size:40px">away</div>`

let browser, page
beforeAll(async () => {
  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 900, height: 700 } })
  await page.setContent(`<!doctype html><html data-expression="balanced"><style>${css}</style><body style="padding:24px;display:grid;gap:16px;justify-items:start">${PAGE}`)
})
afterAll(async () => { await browser?.close() })

// which physical edges the stroke draws, and which corners stay round
const edges = id => page.locator(`#${id} > [data-part="sweep"]`).evaluate(n => {
  const g = getComputedStyle(n)
  const on = s => parseFloat(g[`border${s}Width`]) > 0
  const round = c => parseFloat(g[`border${c}Radius`]) > 0
  return {
    drawn: ['Left', 'Top', 'Right', 'Bottom'].filter(on).join(' '),
    round: ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].filter(round).join(' '),
  }
})

test('segmented: first draws start, top, bottom; middle top and bottom; last end, top, bottom', async () => {
  expect(await edges('size-sm')).toEqual({ drawn: 'Left Top Bottom', round: 'TopLeft BottomLeft' })
  expect(await edges('size-md')).toEqual({ drawn: 'Top Bottom', round: '' })
  expect(await edges('size-lg')).toEqual({ drawn: 'Top Right Bottom', round: 'TopRight BottomRight' })
  expect(await edges('one-only')).toEqual({ drawn: 'Left Top Right Bottom', round: 'TopLeft TopRight BottomRight BottomLeft' })
})

test('the edges are logical: in RTL the first item draws its right edge', async () => {
  expect(await edges('rtl-a')).toEqual({ drawn: 'Top Right Bottom', round: 'TopRight BottomRight' })
  expect(await edges('rtl-b')).toEqual({ drawn: 'Top Bottom', round: '' })
  expect(await edges('rtl-c')).toEqual({ drawn: 'Left Top Bottom', round: 'TopLeft BottomLeft' })
  // the clip's corners follow, physically
  const round = id => page.locator(`#${id} > [data-part="sweep"]`).evaluate(n => getComputedStyle(n).clipPath.split(' round ')[1])
  expect(await round('rtl-a')).toMatch(/^0px [1-9]\S* [1-9]\S* 0px\)$/)
  expect(await round('size-sm')).toMatch(/^[1-9]\S* 0px 0px [1-9]\S*\)$/)
})

test('toggle group, attached button group and any [data-joined] row join the same way', async () => {
  expect((await edges('tg-b')).drawn).toBe('Left Top Bottom')
  expect((await edges('tg-i')).drawn).toBe('Top Bottom')
  expect((await edges('tg-u')).drawn).toBe('Top Right Bottom')
  expect((await edges('bg-1')).drawn).toBe('Left Top Bottom')
  expect((await edges('bg-2')).drawn).toBe('Top Right Bottom')
  expect((await edges('any-1')).drawn).toBe('Left Top Bottom')
  expect((await edges('any-2')).drawn).toBe('Top Right Bottom')
  // the base border joins with the stroke
  const base = await page.locator('#tg-i > [data-part="sweep-base"]').evaluate(n => getComputedStyle(n).borderLeftWidth)
  expect(base).toBe('0px')
})

test('a vertical group joins top to bottom', async () => {
  expect(await edges('vt-top')).toEqual({ drawn: 'Left Top Right', round: 'TopLeft TopRight' })
  expect(await edges('vt-mid')).toEqual({ drawn: 'Left Right', round: '' })
  expect(await edges('vt-end')).toEqual({ drawn: 'Left Right Bottom', round: 'BottomRight BottomLeft' })
})

test('a hovered middle segment paints no side edges once drawn', async () => {
  const host = page.locator('#size-md')
  await host.hover()
  const stroke = page.locator('#size-md > [data-part="sweep"]')
  await stroke.evaluate(n => Promise.all(n.getAnimations().map(a => { a.finish(); return a.finished })))
  const box = await stroke.boundingBox()
  const shot = await page.screenshot({ clip: box })
  const { width, height, px } = await page.evaluate(async b64 => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode()
    const c = new OffscreenCanvas(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0)
    return { width: img.width, height: img.height, px: Array.from(x.getImageData(0, 0, img.width, img.height).data) }
  }, shot.toString('base64'))
  const at = (x, y) => px.slice((y * width + x) * 4, (y * width + x) * 4 + 3)
  const diff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])))
  const mid = Math.floor(height / 2), inside = at(Math.floor(width * 0.1), mid)
  expect(diff(at(Math.floor(width / 2), 0), inside)).toBeGreaterThan(40)  // the top edge is drawn
  expect(diff(at(0, mid), inside)).toBeLessThan(12)                       // the start edge is not
  expect(diff(at(width - 1, mid), inside)).toBeLessThan(12)               // nor the end
  await page.hover('#far')
})
