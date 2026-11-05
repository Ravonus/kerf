import { check } from './context.mjs'
import { prepareCode, checkPageOverflow, checkRenderedBlocks } from './rendered-readiness.mjs'
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
        await checkRenderedBlocks(page, width === 390)
        if (width === 390) {
          await checkPageOverflow(page)
          await checkCopies(page)
        }
      },
      { width, height: 900 },
    )
  }
}
