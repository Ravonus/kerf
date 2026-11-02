// @vitest-environment node
// Layout and controls in Chrome, from warp's real stylesheets: what jsdom can't compute.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)('playwright-core')
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

const read = f => readFileSync(new URL(`../../ui-core/styles/${f}`, import.meta.url), 'utf8')
const css = ['warp.css', 'layout/tokens.css', 'layout/split.css', 'inputs/field.css', 'inputs/choice.css', 'components/button.css', 'data/table.css'].map(read).join('\n')
let browser
beforeAll(async () => { browser = await chromium.launch() })
afterAll(() => browser?.close())

async function page(html, width = 1320) {
  const p = await browser.newPage({ viewport: { width, height: 800 } })
  await p.setContent(`<!doctype html><style>${css}</style>${html}`)
  return p
}
const columns = (p, id) => p.$eval(id, n => getComputedStyle(n).gridTemplateColumns.split(' ').length)
const SPLIT = '<div id="s" data-scope="split"><div>a</div><div>b</div></div>'

test('Split splits with no container around it, and a narrow container still stacks it', async () => {
  const free = await page(SPLIT)
  expect(await columns(free, '#s')).toBe(2)
  const phone = await page(SPLIT, 400)
  expect(await columns(phone, '#s')).toBe(1)
  const held = await page(`<div style="container-type:inline-size;inline-size:400px">${SPLIT}</div>`)
  expect(await columns(held, '#s')).toBe(1)
})

test('a checkbox input takes the click itself, so role-based tools reach it', async () => {
  const p = await page('<label data-scope="checkbox"><input type="checkbox" aria-label="Pick"><span data-part="control" data-sweep><span data-part="sweep"></span></span></label>')
  await p.getByRole('checkbox', { name: 'Pick' }).check({ timeout: 3000 })
  expect(await p.getByRole('checkbox').isChecked()).toBe(true)
})

test('a table row checkbox is reachable by role', async () => {
  const p = await page('<table data-scope="table"><tbody><tr><td data-part="select"><label data-scope="checkbox"><input type="checkbox" aria-label="Select row"><span data-part="control"></span></label></td></tr></tbody></table>')
  await p.getByRole('checkbox', { name: 'Select row' }).check({ timeout: 3000 })
  expect(await p.getByRole('checkbox').isChecked()).toBe(true)
})

test('the checkbox box keeps the mark radius in its sweep at radius round', async () => {
  const p = await page(`<style>:root{--warp-radius-control:14px;--warp-radius-mark:6px}</style><label data-scope="checkbox"><input type="checkbox"><span id="c" data-part="control" data-sweep></span></label>`)
  expect(await p.$eval('#c', n => getComputedStyle(n).getPropertyValue('--warp-sweep-radius').trim())).toBe('6px')
})

test('a button\'s tone channels set its fill and its hover layer', async () => {
  const p = await page(`<style>#b{--warp-tone-fill:#000000;--warp-tone-ink:#ffffff;--warp-tone-layer:#333333}</style><button id="b" data-scope="button">Go</button>`)
  expect(await p.$eval('#b', n => getComputedStyle(n).backgroundColor)).toBe('rgb(0, 0, 0)')
  expect(await p.$eval('#b', n => getComputedStyle(n).color)).toBe('rgb(255, 255, 255)')
  expect(await p.$eval('#b', n => getComputedStyle(n, '::before').backgroundColor)).toBe('rgb(51, 51, 51)')
})
