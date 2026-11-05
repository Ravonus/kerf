import { same, until } from '../helpers.mjs'
const button = (page, name) => page.getByRole('button', { name, exact: true })
const labels = ['Name', 'Email', 'Card number']

async function invalid(page, index, focus = true) {
  const field = page.getByLabel(labels[index])
  await until('invalid field', async () => (await field.getAttribute('aria-invalid')) === 'true')
  const linked = await field.evaluate((node) => {
    const ids = (node.getAttribute('aria-describedby') ?? '').trim().split(/\s+/)
    return ids.some((id) => {
      const error = document.getElementById(id)
      if (!error?.textContent?.trim() || error.getClientRects().length === 0) return false
      const style = getComputedStyle(error)
      return style.visibility !== 'hidden' && style.display !== 'none'
    })
  })
  same(linked, true, `${labels[index]} linked error`)
  if (focus)
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
      await invalid(page, 1, false)
      await invalid(page, 2, false)
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
      await page.getByLabel('Card number').fill('abcdefghijklmnop')
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
