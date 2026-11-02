// @vitest-environment node
// A button that is a link, in Chrome, with @weft/icons' CSS loaded first, as it is when a page imports an icon before warp.
// A layer ranks by when the page first names it, so icons.css opening warp.components before warp.css declared the order
// put warp.base above warp.components, and a bare link's accent ink beat the button's: same hue on same hue.
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const { chromium } = createRequire(import.meta.url)('playwright-core')
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

const at = path => fileURLToPath(new URL(path, import.meta.url))
const read = path => readFileSync(at(path), 'utf8')
const icons = ['icons.css', 'tiers.css']
const sheets = [read('../../icons/src/icons.css'), read('../../warp-core/styles/warp.css'), read('../../warp-core/styles/components/base.css'), read('../../warp-core/styles/components/button.css'), read('../src/links.css')]

let browser
beforeAll(async () => { browser = await chromium.launch() })
afterAll(async () => { await browser?.close() })

const luminance = ([r, g, b]) => { const f = c => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }

test.each(['quiet', 'balanced', 'vivid'].flatMap(stop => ['light', 'dark'].map(theme => [stop, theme])))('at %s on %s a solid button link can be read', async (stop, theme) => {
  const page = await browser.newPage({ colorScheme: theme })
  await page.setContent(`<!doctype html><html data-expression="${stop}" data-theme="${theme}">${sheets.map(s => `<style>${s}</style>`).join('')}<body><a id="a" href="/x" data-scope="button">Get started</a>`)
  const [ink, fill] = await page.evaluate(() => {
    const rgb = css => { const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true }); c.fillStyle = css; c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3) }
    const s = getComputedStyle(document.getElementById('a'))
    return [rgb(s.color), rgb(s.backgroundColor)]
  })
  const [hi, lo] = [luminance(ink), luminance(fill)].sort((a, b) => b - a)
  expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThan(4.5)
  await page.close()
})

test('every CSS file that can load first declares warp\'s layer order first', () => {
  const order = read('../../warp-core/styles/warp.css').match(/^@layer [^{;]+;/m)[0]
  for (const file of icons) expect(read(`../../icons/src/${file}`).match(/^@layer [^{;]*[;{]/m)[0]).toBe(order)
  expect(readdirSync(at('../../icons/src'))).toEqual(expect.arrayContaining(icons))
})
