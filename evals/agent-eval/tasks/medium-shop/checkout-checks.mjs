import { same, until } from '../helpers.mjs'
const button = (page, name) => page.getByRole('button', { name, exact: true })
const labels = ['Name', 'Email', 'Card number']

async function invalid(page, index) {
  const field = page.getByLabel(labels[index])
  await until('invalid field', async () => (await field.getAttribute('aria-invalid')) === 'true')
  const id = await field.getAttribute('aria-describedby')
  if (!id) throw new Error(`${labels[index]} has no error description`)
  const error = page.locator('[id]').filter({ hasText: /./ })
  same(
    await error.evaluateAll((nodes, wanted) => nodes.some((node) => node.id === wanted), id),
    true,
    'linked error',
  )
  await until('first invalid field focused', () =>
    field.evaluate((node) => node === document.activeElement),
  )
}

export const checkoutTests = [
  {
    title: 'checkout reports invalid fields and preserves inputs',
    run: async ({ page, base }) => {
      await page.goto(base)
      await button(page, 'Cart (0)').click()
      await button(page, 'Place order').click()
      await invalid(page, 0)
      await page.getByLabel('Name').fill('Ada')
      await page.getByLabel('Email').fill('invalid')
      await page.getByLabel('Card number').fill('1234')
      await button(page, 'Place order').click()
      await invalid(page, 1)
      same(await page.getByLabel('Name').inputValue(), 'Ada', 'name kept')
      same(await page.getByLabel('Email').inputValue(), 'invalid', 'email kept')
      same(await page.getByLabel('Card number').inputValue(), '1234', 'card kept')
      await page.getByLabel('Email').fill('ada@example.com')
      await button(page, 'Place order').click()
      await invalid(page, 2)
      await page.getByLabel('Card number').fill('12345678901234567')
      await button(page, 'Place order').click()
      await invalid(page, 2)
    },
  },
  {
    title: 'valid checkout accepts spaces, empties cart and thanks buyer',
    run: async ({ page, base }) => {
      await page.goto(base)
      await button(page, 'Add Apple').click()
      await button(page, 'Cart (1)').click()
      await page.getByLabel('Name').fill('Ada')
      await page.getByLabel('Email').fill('ada@example.com')
      await page.getByLabel('Card number').fill('1234 5678 9012 3456')
      await button(page, 'Place order').click()
      await page.getByText('Thanks, Ada!', { exact: true }).waitFor()
      await page.getByText('Your cart is empty', { exact: true }).waitFor()
      await button(page, 'Cart (0)').waitFor()
    },
  },
]
