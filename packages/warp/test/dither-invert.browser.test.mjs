// @vitest-environment node
// A dithered image in Chrome, from warp-core's real source. A gradient is ink strength already, so it has no page to
// follow by default, but Invert still has to turn it round. A picture keeps its own rule: invert means light takes the ink.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { rolldown } from 'rolldown'

const { chromium } = createRequire(import.meta.url)('playwright-core')
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

let browser, bundle
beforeAll(async () => {
  const build = await rolldown({ input: fileURLToPath(new URL('../../warp-core/src/dither/index.ts', import.meta.url)) })
  bundle = (await build.generate({ format: 'iife', name: 'dither' })).output[0].code
  browser = await chromium.launch()
})
afterAll(async () => { await browser?.close() })

const PAGE = `<!doctype html><html data-expression="balanced"><body style="margin:0"><div id="host" style="inline-size:120px;block-size:60px"><canvas id="c"></canvas></div>`
const INKS = ['#000', '#fff']

/** Share of white ink in the left and right halves of the painted canvas, after `script` has run in the page. */
async function coverage(script, arg) {
  const page = await browser.newPage()
  await page.setContent(PAGE)
  await page.addScriptTag({ content: bundle })
  await page.evaluate(script, arg)
  await page.waitForFunction(() => document.getElementById('host').getAttribute('data-state') === 'live')
  const shares = await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => {
    const c = document.getElementById('c'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    const half = c.width / 2, sum = [0, 0], all = [0, 0]
    for (let i = 0; i < d.length; i += 4) { const side = (i / 4) % c.width < half ? 0 : 1; all[side]++; if (d[i] > 127) sum[side]++ }
    done(sum.map((n, i) => n / all[i]))
  }))))
  await page.close()
  return shares
}

const gradient = ([ramp, invert]) => { window.action = dither.ditherImage(document.getElementById('c'), { ramp, invert, gradient: { angle: 0 }, algorithm: 'bayer8', cell: 2 }) }

test('Invert turns a gradient round, and off or unset leaves it as drawn', async () => {
  const unset = await coverage(gradient, [INKS])
  const off = await coverage(gradient, [INKS, false])
  const on = await coverage(gradient, [INKS, true])
  expect(unset[1]).toBeGreaterThan(unset[0] + 0.3)
  expect(off).toEqual(unset)
  expect(on[0]).toBeGreaterThan(on[1] + 0.3)
})

test('a live knob change repaints the gradient the other way', async () => {
  const shares = await coverage(([ramp]) => {
    const options = { ramp, gradient: { angle: 0 }, algorithm: 'bayer8', cell: 2 }
    window.action = dither.ditherImage(document.getElementById('c'), options)
    requestAnimationFrame(() => window.action.update({ ...options, invert: true }))
  }, [INKS])
  expect(shares[0]).toBeGreaterThan(shares[1] + 0.3)
})

test('a picture still follows its own rule: invert gives light parts the strongest ink', async () => {
  const picture = ([ramp, invert]) => {
    const source = document.createElement('canvas')
    source.width = 120
    source.height = 60
    const g = source.getContext('2d')
    g.fillStyle = '#000'
    g.fillRect(0, 0, 60, 60)
    g.fillStyle = '#fff'
    g.fillRect(60, 0, 60, 60)
    window.action = dither.ditherImage(document.getElementById('c'), { source, ramp, invert, algorithm: 'bayer8', cell: 2 })
  }
  const on = await coverage(picture, [INKS, true])
  const off = await coverage(picture, [INKS, false])
  expect(on[1]).toBeGreaterThan(on[0] + 0.5)
  expect(off[0]).toBeGreaterThan(off[1] + 0.5)
})
