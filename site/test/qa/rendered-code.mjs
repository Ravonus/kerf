import { check } from './context.mjs'
import { measureBlock, checkBlock } from './rendered-rows.mjs'
import {
  prepareCode,
  checkPageOverflow,
  settleBlock,
  checkCodeScroll,
} from './rendered-readiness.mjs'
import { checkCopies } from './rendered-copy.mjs'

const paths = [
  '/',
  '/examples',
  '/learn/state',
  '/learn/derived',
  '/learn/passing-props',
  '/learn/reacting-to-input',
  '/reference/state',
  '/reference/props',
  '/components/button',
  '/blocks/checkout',
]
for (const path of paths) {
  for (const width of [1440, 1024, 390]) {
    await check(
      `rendered code ${path} ${width}`,
      path,
      async (page) => {
        await prepareCode(page)
        if (path === '/learn/derived') {
          if (!(await page.locator('[data-site="pitfall"] pre [data-part="line"]').count()))
            throw new Error('missing Pitfall code')
          if (
            !(await page
              .locator('[data-site="challenge"] details[open] pre [data-part="line"]')
              .count())
          )
            throw new Error('missing open challenge solution code')
        }
        const blocks = page.locator('main pre')
        let measured = 0
        for (let i = 0; i < (await blocks.count()); i++) {
          const block = blocks.nth(i)
          if (!(await block.isVisible())) continue
          await block.scrollIntoViewIfNeeded()
          await settleBlock(block)
          const visible = await block.evaluate((el) =>
            el.checkVisibility({ visibilityProperty: true, opacityProperty: true }),
          )
          if (!visible) continue
          await block.evaluate((el) => {
            el.scrollLeft = 0
          })
          const result = await block.evaluate(measureBlock)
          checkBlock(result, width === 390, `block ${i + 1}`)
          if (width === 390 && result.scrollable && result.lines.some((line) => line.clippedRight))
            await checkCodeScroll(page, block)
          measured += result.lines.filter((line) => line.rows.length).length
        }
        if (!measured) throw new Error('no visible highlighted source lines')
        if (width === 390) {
          await checkPageOverflow(page)
          await checkCopies(page)
        }
      },
      { width, height: 900 },
    )
  }
}
