import { same, until } from '../helpers.mjs'
const names = ['Apple', 'Bagel', 'Banana', 'Brioche', 'Milk', 'Yogurt']
const prices = ['$0.50', '$1.20', '$0.25', '$3.50', '$1.10', '$0.90']
const rows = (page) => page.getByRole('list', { name: 'Products' }).getByRole('listitem')
const button = (page, name) => page.getByRole('button', { name, exact: true })
const ordered = async (page) =>
  Promise.all(
    (await rows(page).all()).map(async (row) => {
      const text = await row.innerText()
      return names.find((name) => text.includes(name))
    }),
  )
const expectOrder = (page, wanted) =>
  until('product order', async () => JSON.stringify(await ordered(page)) === JSON.stringify(wanted))

export const productTests = [
  {
    title: 'products show names, prices, stock and default order',
    run: async ({ page, base }) => {
      await page.goto(base)
      await expectOrder(page, names)
      for (const [i, name] of names.entries()) {
        const row = rows(page).nth(i)
        same(await row.getByText(prices[i], { exact: true }).count(), 1, `${name} price`)
        same(
          await row.getByRole('button', { name: `Add ${name}`, exact: true }).count(),
          1,
          `${name} button`,
        )
      }
      await page.getByText('Only 3 left', { exact: true }).waitFor()
      await page.getByText('Only 1 left', { exact: true }).waitFor()
      await page.getByText('Out of stock', { exact: true }).waitFor()
      same(await button(page, 'Add Yogurt').isDisabled(), true, 'out of stock disabled')
      await page.getByText('6 products', { exact: true }).waitFor()
    },
  },
  {
    title: 'search and category filter, count and sort products',
    run: async ({ page, base }) => {
      await page.goto(base)
      await page.getByLabel('Search').fill('AN')
      await expectOrder(page, ['Banana'])
      await page.getByText('1 product', { exact: true }).waitFor()
      await page.getByLabel('Search').fill('')
      await page.getByLabel('Category').selectOption({ label: 'bakery' })
      await expectOrder(page, ['Bagel', 'Brioche'])
      await page.getByLabel('Category').selectOption({ label: 'All' })
      await page.getByLabel('Sort').selectOption({ label: 'Price: low to high' })
      await expectOrder(page, ['Banana', 'Apple', 'Yogurt', 'Milk', 'Bagel', 'Brioche'])
      await page.getByLabel('Sort').selectOption({ label: 'Price: high to low' })
      await expectOrder(page, ['Brioche', 'Bagel', 'Milk', 'Yogurt', 'Apple', 'Banana'])
      await page.getByLabel('Category').selectOption({ label: 'fruit' })
      await expectOrder(page, ['Apple', 'Banana'])
      await page.getByLabel('Category').selectOption({ label: 'dairy' })
      await expectOrder(page, ['Milk', 'Yogurt'])
    },
  },
  {
    title: 'switching tabs preserves filters and cart',
    run: async ({ page, base }) => {
      await page.goto(base)
      await button(page, 'Add Banana').click()
      await page.getByLabel('Search').fill('an')
      await page.getByLabel('Category').selectOption({ label: 'fruit' })
      await page.getByLabel('Sort').selectOption({ label: 'Price: high to low' })
      await button(page, 'Cart (1)').click()
      await button(page, 'Products').click()
      same(await page.getByLabel('Search').inputValue(), 'an', 'search kept')
      same(await page.getByLabel('Category').inputValue(), 'fruit', 'category kept')
      same(await page.getByLabel('Sort').inputValue(), 'Price: high to low', 'sort kept')
      await expectOrder(page, ['Banana'])
      await button(page, 'Cart (1)').waitFor()
    },
  },
]
