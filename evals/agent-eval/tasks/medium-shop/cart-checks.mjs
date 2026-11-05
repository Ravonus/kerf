import { same, until } from '../helpers.mjs'
const button = (page, name) => page.getByRole('button', { name, exact: true })
const text = (page, value) => page.getByText(value, { exact: true }).first().waitFor()

export const cartTests = [
  {
    title: 'cart quantities, totals and removal follow stock',
    run: async ({ page, base }) => {
      await page.goto(base)
      await button(page, 'Add Banana').click()
      await text(page, 'Only 2 left')
      await button(page, 'Add Banana').click()
      await text(page, 'Only 1 left')
      await button(page, 'Add Banana').click()
      same(await button(page, 'Add Banana').isDisabled(), true, 'no more bananas')
      await button(page, 'Add Apple').click()
      await button(page, 'Cart (4)').click()
      await text(page, 'Total: $1.25')
      same(await button(page, 'Increase Banana').isDisabled(), true, 'stock limit')
      const banana = page.getByRole('listitem').filter({ hasText: 'Banana' })
      await banana.getByText('$0.75', { exact: true }).waitFor()
      await button(page, 'Decrease Banana').click()
      await text(page, 'Total: $1.00')
      await button(page, 'Increase Apple').click()
      await text(page, 'Total: $1.50')
      await button(page, 'Decrease Banana').click()
      await button(page, 'Decrease Banana').click()
      await until('removed banana', async () => (await banana.count()) === 0)
      await button(page, 'Decrease Apple').click()
      await button(page, 'Decrease Apple').click()
      await text(page, 'Your cart is empty')
      same(await page.getByRole('list', { name: 'Cart' }).count(), 0, 'empty list absent')
      await text(page, 'Total: $0.00')
    },
  },
]
