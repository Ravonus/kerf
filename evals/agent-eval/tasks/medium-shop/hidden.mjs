// A first cart check; task.json remains ungradeable until the full spec is covered.
import { same } from '../helpers.mjs'

export const tests = [
  {
    title: 'adding Apple shows its quantity and total in the cart',
    run: async ({ page, base }) => {
      await page.goto(base)
      await page.getByRole('button', { name: 'Add Apple', exact: true }).click()
      await page.getByRole('button', { name: 'Cart (1)', exact: true }).click()
      const cart = page.getByRole('list', { name: 'Cart' })
      await cart.getByText('Apple', { exact: true }).waitFor()
      same(await page.getByText('Total: $0.50', { exact: true }).count(), 1, 'total')
    },
  },
]
