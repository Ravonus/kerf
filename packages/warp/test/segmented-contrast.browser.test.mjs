// @vitest-environment node
// Segmented's selection, from warp's real stylesheets in Chrome and checked by axe: its ink is light because the accent
// indicator slides under it, and the indicator only has a size once the shuttle measures it. Before the island loads
// (lazy hydration), without JS, or in an audit, the selection must still read at AA.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright-core')
const axe = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

const styles = fileURLToPath(new URL('../../warp-core/styles', import.meta.url))
const css = ['warp.css', 'components/base.css', 'inputs/base.css', 'inputs/choice.css']
  .map((f) => readFileSync(join(styles, f), 'utf8'))
  .join('\n')
const option = (v, on) =>
  `<label><input type="radio" name="layout" value="${v}"${on ? ' checked' : ''}><span data-part="item">${v}</span></label>`
// what the server sends: the indicator with no geometry yet
const group = `<div data-scope="segmented" role="radiogroup" aria-label="Layout" data-size="sm"><span data-part="indicator" aria-hidden="true" data-instant=""></span>${option('Grouped', true)}${option('Stacked')}</div>`

let browser
beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(async () => {
  await browser?.close()
})

async function contrast(place, flip) {
  const page = await browser.newPage()
  await page.setContent(
    `<!doctype html><html lang="en"><title>t</title><style>${css}</style><body><main>${group}</main>`,
  )
  // hydration moving the selection (the server rendered a default, the client holds another): the indicator is instant
  if (flip)
    await page.evaluate(() => {
      document.querySelector('input[value="Stacked"]').checked = true
    })
  if (place)
    await page.evaluate(() => {
      const label = document.querySelector('label:has(input:checked)')
      document.querySelector('[data-part="indicator"]').style.cssText =
        `--warp-a:${label.offsetLeft}px;--warp-b:${label.offsetLeft + label.offsetWidth}px`
    })
  await page.addScriptTag({ content: axe })
  const found = await page.evaluate(
    async () => (await axe.run(document, { runOnly: ['color-contrast'] })).violations,
  )
  await page.close()
  return found.flatMap((v) => v.nodes.map((n) => n.any[0]?.message ?? v.id))
}

test('the selection reads at AA before the indicator is placed', async () => {
  expect(await contrast(false)).toEqual([])
})

test('and once the shuttle has placed it', async () => {
  expect(await contrast(true)).toEqual([])
})

test('and when hydration moves the selection, the ink snaps with the instant indicator instead of fading in', async () => {
  expect(await contrast(true, true)).toEqual([])
})
