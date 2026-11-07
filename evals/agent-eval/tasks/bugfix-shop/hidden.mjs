// The search-to-cart regression and the cart total are checked together.
import { same } from '../helpers.mjs'

export const tests = [
  {
    title: 'search adds the matched product and totals its price',
    run: async ({ page, base }) => {
      await page.goto(base)
      await page.getByLabel('Search').fill('banana')
      await page.getByRole('button', { name: 'Add Banana', exact: true }).click()
      await page.getByRole('button', { name: 'Cart (1)', exact: true }).click()
      const cart = page.getByRole('list', { name: 'Cart' })
      await cart.getByText('Banana', { exact: true }).waitFor()
      same(await page.getByText('Total: $0.25', { exact: true }).count(), 1, 'total')
    },
  },
]

// The shared grader currently reads `tests`; calibration must explicitly select this full suite.
export { tests as calibrationTests } from './full-checks.mjs'
