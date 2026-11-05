import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { checkRenderedBlocks, settleBlock } from './rendered-readiness.mjs'

const { chromium } = createRequire(new URL('../../../packages/warp/package.json', import.meta.url))(
  'playwright-core',
)
const css = [
  '../../../packages/warp-core/styles/warp.css',
  '../../src/styles/site.css',
  '../../src/styles/example.css',
]
  .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
  .join('\n')

await test('home flow makes scrolled code measurable at each viewport', async () => {
  const browser = await chromium.launch()
  try {
    for (const width of [390, 1024, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      await page.setContent(`<!doctype html><style>${css}
        :root { --warp-space-group:16px; --warp-ref-flow-reach:20%;
          --warp-ref-flow-out:280px; --warp-ref-flow-ease:linear }
        body { margin:0 } pre { font:13px/22px monospace }
        </style><main><div style="height:3000px"></div><section data-site="example">
        <div data-part="pair" data-flow="card"><div data-part="run">example</div>
        <div data-scope="codeblock" data-bare><div data-part="source"><pre><code>
        <span data-part="line" style="--indent:0ch">const example = 1</span>
        </code></pre></div></div></div></section></main>`)
      await page.evaluate(() => document.documentElement.setAttribute('data-flow-armed', ''))
      const block = page.locator('pre')
      await page.waitForFunction(() => {
        const card = document.querySelector('[data-flow="card"]')
        return getComputedStyle(card).opacity === '0' && card.getAnimations().length > 0
      })
      let settled = false
      const readiness = settleBlock(block).then((value) => {
        settled = true
        return value
      })
      await page.evaluate(() => new Promise(requestAnimationFrame))
      assert.equal(settled, false, `off-screen flow stays pending at ${width}`)
      await block.scrollIntoViewIfNeeded()
      assert.equal(await readiness, true, `scrolled flow becomes visible at ${width}`)
      await checkRenderedBlocks(page, width === 390)
      await block.evaluate((el) => {
        el.style.width = '8ch'
        el.querySelector('[data-part="line"]').textContent = 'alpha beta gamma delta'
      })
      await assert.rejects(checkRenderedBlocks(page, false), /wraps to/)
      await block.evaluate((el) => {
        el.style.width = ''
      })
      await page.locator('[data-flow="card"]').evaluate((el) => {
        el.style.setProperty('animation', 'none', 'important')
        el.style.setProperty('opacity', '0', 'important')
      })
      await assert.rejects(checkRenderedBlocks(page, false), /no visible highlighted source lines/)
      await page.locator('[data-flow="card"]').evaluate((el) => {
        el.style.removeProperty('opacity')
        el.querySelector('code').textContent = ''
      })
      await assert.rejects(checkRenderedBlocks(page, false), /no visible highlighted source lines/)
      await page.close()
    }
  } finally {
    await browser.close()
  }
})
