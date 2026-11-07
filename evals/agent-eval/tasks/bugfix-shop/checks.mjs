import { same, until } from '../helpers.mjs'
const button = (page, name) => page.getByRole('button', { name, exact: true })
const cart = (page) => page.getByRole('list', { name: 'Cart' })
const line = (page, name) => cart(page).getByRole('listitem').filter({ hasText: name })
const shown = (page, value) => page.getByText(value, { exact: true }).first().waitFor()

export const bugTests = [
  {
    title: 'search and return preserve product identity',
    run: async ({ page, base }) => {
      await page.goto(base)
      await page.getByLabel('Search').fill('banana')
      await button(page, 'Add Banana').click()
      await button(page, 'Cart (1)').click()
      await line(page, 'Banana').getByText('$0.25', { exact: true }).waitFor()
      await shown(page, 'Total: $0.25')
      await button(page, 'Products').click()
      await page.getByLabel('Search').fill('')
      await page.getByLabel('Sort').selectOption({ label: 'Price: high to low' })
      await button(page, 'Add Milk').click()
      await button(page, 'Cart (2)').click()
      await line(page, 'Banana').getByText('$0.25', { exact: true }).waitFor()
      await line(page, 'Milk').getByText('$1.10', { exact: true }).waitFor()
      same(await cart(page).getByRole('listitem').count(), 2, 'distinct products')
      await shown(page, 'Total: $1.35')
    },
  },
  {
    title: 'cart totals follow each quantity change',
    run: async ({ page, base }) => {
      await page.goto(base)
      await button(page, 'Add Apple').click()
      await button(page, 'Add Apple').click()
      await button(page, 'Add Banana').click()
      await button(page, 'Cart (3)').click()
      await line(page, 'Apple').getByText('2', { exact: true }).waitFor()
      await line(page, 'Apple').getByText('$1.00', { exact: true }).waitFor()
      await line(page, 'Banana').getByText('$0.25', { exact: true }).waitFor()
      await shown(page, 'Total: $1.25')
      await button(page, 'Increase Banana').click()
      await line(page, 'Banana').getByText('2', { exact: true }).waitFor()
      await line(page, 'Banana').getByText('$0.50', { exact: true }).waitFor()
      await shown(page, 'Total: $1.50')
      await button(page, 'Decrease Apple').click()
      await line(page, 'Apple').getByText('$0.50', { exact: true }).waitFor()
      await shown(page, 'Total: $1.00')
      await button(page, 'Decrease Apple').click()
      await until('apple removed', async () => (await line(page, 'Apple').count()) === 0)
      await shown(page, 'Total: $0.50')
      await button(page, 'Decrease Banana').click()
      await button(page, 'Decrease Banana').click()
      await shown(page, 'Your cart is empty')
      await shown(page, 'Total: $0.00')
    },
  },
]
