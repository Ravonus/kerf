// Check wrapping with a fixed sample, independent of the current documentation line lengths.
import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'

const { chromium } = createRequire(new URL('../../packages/warp/package.json', import.meta.url))(
  'playwright-core',
)
const base = process.argv[2] ?? 'http://localhost:3300'
const browser = await chromium.launch()
try {
  for (const width of [1440, 1024, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    await page.goto(`${base}/learn/derived`, { waitUntil: 'load' })
    if (process.env.BAD_WRAP)
      await page.addStyleTag({
        content: 'main pre [data-part="line"] { white-space: pre !important; }',
      })
    const result = await page.evaluate(() => {
      const pre = document.createElement('pre')
      pre.style.cssText = 'width: 18ch; max-width: 80%; font: 16px monospace;'
      pre.innerHTML =
        '<code><span data-part="line" style="--indent:2ch">  alpha beta gamma delta epsilon zeta</span></code>'
      document.querySelector('main').append(pre)
      const line = pre.querySelector('span')
      const text = line.firstChild
      const rect = (offset) => {
        const range = document.createRange()
        range.setStart(text, offset)
        range.setEnd(text, offset + 1)
        const box = range.getBoundingClientRect()
        return { x: box.x, y: box.y }
      }
      const points = Array.from({ length: text.textContent.length }, (_, i) => rect(i))
      const first = points[2]
      const next = points.find((p, i) => i > 2 && p.y > first.y)
      const words = [...text.textContent.matchAll(/\S+/g)]
      const broken = words.some(
        (word) => points[word.index].y !== points[word.index + word[0].length - 1].y,
      )
      const measurement = {
        first,
        next,
        broken,
        ch: points[3].x - points[2].x,
        overflow: Math.max(
          0,
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
        whiteSpace: getComputedStyle(line).whiteSpace,
        wrap: getComputedStyle(line).overflowWrap,
      }
      pre.remove()
      return measurement
    })
    assert.equal(result.overflow, 0, `page overflow at ${width}`)
    assert.equal(result.wrap, 'normal')
    assert.equal(result.broken, false, 'words must stay whole')
    assert.ok(result.next, 'fixture must wrap')
    assert.ok(
      Math.abs((result.next.x - result.first.x) / result.ch - 2) < 0.2,
      'continuation hangs 2ch past the original indent',
    )
    console.log(JSON.stringify({ width, ...result }))
    await page.close()
  }
} finally {
  await browser.close()
}
