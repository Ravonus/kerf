// @vitest-environment node
// A dither field in Chrome, from warp-core's real source. Painting resolves its inks through a probe element, so the DOM
// changes on every repaint. A page that re-stamps a dial when the DOM changes must not spin: the stamp is no change, and
// hearing one used to mean a repaint, a probe, another stamp, forever in microtasks, with the tab frozen.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { rolldown } from 'rolldown'

const { chromium } = createRequire(import.meta.url)('playwright-core')
vi.setConfig({ testTimeout: 30_000, hookTimeout: 120_000 })

let browser, bundle
beforeAll(async () => {
  const build = await rolldown({
    input: fileURLToPath(new URL('../../warp-core/src/dither/index.ts', import.meta.url)),
  })
  bundle = (await build.generate({ format: 'iife', name: 'dither' })).output[0].code
  browser = await chromium.launch()
})
afterAll(async () => {
  await browser?.close()
})

const PAGE = `<!doctype html><html data-expression="balanced"><body><main><div id="stage"><div id="host" style="inline-size:200px;block-size:100px"><canvas id="c"></canvas></div></div></main>`

async function open() {
  const page = await browser.newPage()
  await page.setContent(PAGE)
  await page.addScriptTag({ content: bundle })
  await page.evaluate(() => {
    window.probes = 0
    const stage = document.getElementById('stage')
    new MutationObserver((list) => {
      window.probes += list.length
      if (window.probes < 20_000)
        stage.setAttribute('data-expression', stage.getAttribute('data-expression') ?? 'balanced')
    }).observe(document.querySelector('main'), { childList: true, subtree: true })
    window.field = dither.ditherField(document.getElementById('c'), { ramp: ['#000', '#fff'] })
    stage.setAttribute('data-expression', 'balanced')
  })
  return page
}

test('a stamp of the value already there repaints nothing, so the page keeps answering', async () => {
  const page = await open()
  await page.waitForTimeout(300)
  const probes = await page.evaluate(() => window.probes)
  expect(probes).toBeLessThan(20)
  await page.close()
})

test('a real change still repaints', async () => {
  const page = await open()
  const before = await page.evaluate(() => window.probes)
  await page.evaluate(() =>
    document.getElementById('stage').setAttribute('data-expression', 'vivid'),
  )
  await page.waitForTimeout(100)
  expect(await page.evaluate(() => window.probes)).toBeGreaterThan(before)
  await page.close()
})
