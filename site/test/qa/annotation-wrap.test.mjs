import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { measureBlock, checkBlock } from './rendered-rows.mjs'

const { chromium } = createRequire(new URL('../../../packages/warp/package.json', import.meta.url))(
  'playwright-core',
)
const site = readFileSync(new URL('../../src/styles/site.css', import.meta.url), 'utf8')
const example = readFileSync(new URL('../../src/styles/example.css', import.meta.url), 'utf8')

test('annotated wrapped lines keep their gutter and hanging indent', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } })
    await page.setContent(`<!doctype html><style>${site}\n${example}
      :root { --warp-space-group: 16px; --warp-color-accent-text: rgb(0, 128, 64);
        --warp-color-accent-soft: rgb(210, 240, 220); }
      pre { width: 22ch; font: 16px/24px monospace; margin: 0 16px; }
    </style><main data-site="example"></main>`)
    for (const spaces of [0, 2, 4]) {
      const source = `${' '.repeat(spaces)}alpha beta gamma delta epsilon zeta`
      await page.locator('main').evaluate(
        (main, { source: text, spaces: indent }) => {
          main.innerHTML = [false, true]
            .map(
              (marked) => `<pre><code><span data-part="line" ${marked ? 'data-new' : ''}
            style="--indent:${indent}ch">${text}</span></code></pre>`,
            )
            .join('')
        },
        { source, spaces },
      )
      const blocks = page.locator('pre')
      const plain = await blocks.nth(0).evaluate(measureBlock)
      const marked = await blocks.nth(1).evaluate(measureBlock)
      const line = marked.lines[0]
      assert.ok(line.rows.length > 1, `indent ${spaces}: fixture wraps`)
      checkBlock(marked, true, `annotated indent ${spaces}`)
      assert.ok(
        Math.abs(line.rows[0].left - plain.lines[0].rows[0].left) < 1,
        'first text position',
      )
      const style = await blocks
        .nth(1)
        .locator('[data-new]')
        .evaluate((el) => {
          const s = getComputedStyle(el)
          return {
            margin: s.marginInlineStart,
            border: s.borderInlineStartWidth,
            borderColor: s.borderInlineStartColor,
            background: s.backgroundColor,
          }
        })
      assert.deepEqual(style, {
        margin: '-16px',
        border: '3px',
        borderColor: 'rgb(0, 128, 64)',
        background: 'rgb(210, 240, 220)',
      })
    }
  } finally {
    await browser.close()
  }
})
