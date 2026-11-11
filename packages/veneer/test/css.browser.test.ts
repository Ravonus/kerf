// @vitest-environment node
// Layout and controls in Chrome, from veneer's real stylesheets: what jsdom can't compute.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type * as Playwright from 'playwright-core'

const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

const read = (f: string) =>
  readFileSync(new URL(`../../veneer-core/styles/${f}`, import.meta.url), 'utf8')
const css = [
  'veneer.css',
  'layout/tokens.css',
  'layout/split.css',
  'inputs/field.css',
  'inputs/choice.css',
  'components/button.css',
  'data/table.css',
]
  .map(read)
  .join('\n')
let browser: Playwright.Browser
beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(() => browser?.close())

async function page(html: string, width = 1320) {
  const p = await browser.newPage({ viewport: { width, height: 800 } })
  await p.setContent(`<!doctype html><style>${css}</style>${html}`)
  return p
}
const columns = (p: Playwright.Page, id: string) =>
  p.$eval(id, (n) => getComputedStyle(n).gridTemplateColumns.split(' ').length)
const SPLIT = '<div id="s" data-scope="split"><div>a</div><div>b</div></div>'

test('Split splits with no container around it, and a narrow container still stacks it', async () => {
  const free = await page(SPLIT)
  expect(await columns(free, '#s')).toBe(2)
  const phone = await page(SPLIT, 400)
  expect(await columns(phone, '#s')).toBe(1)
  const held = await page(
    `<div style="container-type:inline-size;inline-size:400px">${SPLIT}</div>`,
  )
  expect(await columns(held, '#s')).toBe(1)
})

test('a checkbox input takes the click itself, so role-based tools reach it', async () => {
  const p = await page(
    '<label data-scope="checkbox"><input type="checkbox" aria-label="Pick"><span data-part="control" data-sweep><span data-part="sweep"></span></span></label>',
  )
  await p.getByRole('checkbox', { name: 'Pick' }).check({ timeout: 3000 })
  expect(await p.getByRole('checkbox').isChecked()).toBe(true)
})

test("the phone sort bar shows at a phone width of the table's container and no wider", async () => {
  // the table isn't a container itself (each nested one costs the page a style pass), so it follows the one it's in
  const shown = async (width: number) =>
    (
      await page(
        `<div style="container-type:inline-size;inline-size:${width}px"><div data-scope="table" data-phone="cards"><div id="b" data-part="sortbar">x</div></div></div>`,
      )
    ).$eval('#b', (n) => getComputedStyle(n).display)
  expect(await shown(800)).toBe('none')
  expect(await shown(400)).toBe('flex')
})

test('a table row checkbox is reachable by role', async () => {
  const p = await page(
    '<table data-scope="table"><tbody><tr><td data-part="select"><label data-scope="checkbox"><input type="checkbox" aria-label="Select row"><span data-part="control"></span></label></td></tr></tbody></table>',
  )
  await p.getByRole('checkbox', { name: 'Select row' }).check({ timeout: 3000 })
  expect(await p.getByRole('checkbox').isChecked()).toBe(true)
})

describe.each([
  [
    'checkbox',
    '<input type="checkbox" aria-label="Pick"><span data-part="control" data-sweep></span>',
    'checkbox',
  ],
  [
    'radio',
    '<input type="radio" aria-label="Pick"><span data-part="control" data-sweep></span>',
    'radio',
  ],
  [
    'switch',
    '<input type="checkbox" role="switch" aria-label="Pick"><span data-part="track" data-sweep></span>',
    'switch',
  ],
])('a %s', (scope, parts, role) => {
  for (const placement of scope === 'switch' ? ['start', 'end'] : [undefined]) {
    const mark = placement ? ` data-placement="${placement}"` : ''
    const control = scope === 'switch' ? 'track' : 'control'
    const html = `<div style="width:500px"><label data-scope="${scope}"${mark}>${parts}<span data-part="label">I agree to the <a id="l" href="#terms">terms</a></span><span data-part="hint">Read the <a id="h" href="#hint">hint</a></span></label></div>`

    test(`takes a click on its control, by role, and leaves its links alone${mark}`, async () => {
      const p = await page(html)
      const under = (id: string) =>
        p.$eval(id, (n) => {
          const r = n.getBoundingClientRect()
          return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)!.id
        })
      expect(await under('#l')).toBe('l')
      expect(await under('#h')).toBe('h')
      await p.click('#l')
      expect(new URL(p.url()).hash).toBe('#terms')
      await p.click('#h')
      expect(new URL(p.url()).hash).toBe('#hint')
      expect(await p.getByRole(role as 'checkbox' | 'radio' | 'switch').isChecked()).toBe(false)
      await p
        .getByRole(role as 'checkbox' | 'radio' | 'switch', { name: 'Pick' })
        .check({ timeout: 3000 })
      expect(await p.getByRole(role as 'checkbox' | 'radio' | 'switch').isChecked()).toBe(true)
      const box = await p.$eval(`[data-part="${control}"]`, (n) => {
        const r = n.getBoundingClientRect()
        return [r.x + r.width / 2, r.y + r.height / 2] as [number, number]
      })
      expect(await p.evaluate(([x, y]) => document.elementFromPoint(x, y)!.tagName, box)).toBe(
        'INPUT',
      )
      if (role === 'radio') return
      await p.getByText('I agree to the').click({ position: { x: 2, y: 2 } })
      expect(await p.getByRole(role as 'checkbox' | 'radio' | 'switch').isChecked()).toBe(false)
    })
  }
})

test('the checkbox box keeps the mark radius in its sweep at radius round', async () => {
  const p = await page(
    `<style>:root{--veneer-radius-control:14px;--veneer-radius-mark:6px}</style><label data-scope="checkbox"><input type="checkbox"><span id="c" data-part="control" data-sweep></span></label>`,
  )
  expect(
    await p.$eval('#c', (n) =>
      getComputedStyle(n).getPropertyValue('--veneer-sweep-radius').trim(),
    ),
  ).toBe('6px')
})

test("a button's tone channels set its fill and its hover layer", async () => {
  const p = await page(
    `<style>#b{--veneer-tone-fill:#000000;--veneer-tone-ink:#ffffff;--veneer-tone-layer:#333333}</style><button id="b" data-scope="button">Go</button>`,
  )
  expect(await p.$eval('#b', (n) => getComputedStyle(n).backgroundColor)).toBe('rgb(0, 0, 0)')
  expect(await p.$eval('#b', (n) => getComputedStyle(n).color)).toBe('rgb(255, 255, 255)')
  // the layer is a color-mix (veneer's pointer fill), so it computes in oklab: read it back as the pixel it paints
  const layer = await p.$eval('#b', (n) => {
    const c = document.createElement('canvas').getContext('2d')!
    c.fillStyle = getComputedStyle(n, '::before').backgroundColor
    c.fillRect(0, 0, 1, 1)
    return [...c.getImageData(0, 0, 1, 1).data]
  })
  expect(layer).toEqual([51, 51, 51, 255])
})

test('a closed accordion panel takes no height, whichever order the sheets come in', async () => {
  const held = ['components/accordion.css', 'components/base.css']
  for (const sheets of [held, [...held].reverse()]) {
    const p = await browser.newPage()
    await p.setContent(
      `<!doctype html><style>${read('veneer.css')}${sheets.map(read).join('\n')}</style><div data-scope="accordion"><div id="c" data-part="content" style="padding:0"><div><div>Hidden text that has a height of its own</div></div></div></div>`,
    )
    expect(
      await p.$eval('#c', (n) => [getComputedStyle(n).display, n.getBoundingClientRect().height]),
    ).toEqual(['grid', 0])
  }
})
