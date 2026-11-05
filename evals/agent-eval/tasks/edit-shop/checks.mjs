import { same, until } from '../helpers.mjs'
const button = (page, name) => page.getByRole('button', { name, exact: true })
const row = (page, list, name) =>
  page.getByRole('list', { name: list }).getByRole('listitem').filter({ hasText: name })
const update = (page, id, price) =>
  page.evaluate(
    async (detail) => {
      const at = performance.now()
      window.dispatchEvent(new CustomEvent('weft-price-update', { detail }))
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      })
      return at
    },
    { id, price },
  )

export const editTests = [
  {
    title: 'live prices update products, cart lines and totals',
    run: async ({ page, base }) => {
      await page.goto(base)
      await button(page, 'Add Apple').click()
      await button(page, 'Add Apple').click()
      await update(page, 'apple', 175)
      await row(page, 'Products', 'Apple').getByText('$1.75', { exact: true }).waitFor()
      await button(page, 'Cart (2)').click()
      await row(page, 'Cart', 'Apple').getByText('$3.50', { exact: true }).waitFor()
      await page.getByText('Total: $3.50', { exact: true }).waitFor()
      await row(page, 'Cart', 'Apple').getByText('Price went up', { exact: true }).waitFor()
    },
  },
  {
    title: 'price flash expires and a later update starts it again',
    run: async ({ page, base }) => {
      await page.goto(base)
      await button(page, 'Add Apple').waitFor()
      const apple = row(page, 'Products', 'Apple')
      await update(page, 'apple', 50)
      same((await apple.getAttribute('data-flash')) === 'true', false, 'unchanged price')
      const started = await update(page, 'apple', 75)
      await until('flash begins', async () => (await apple.getAttribute('data-flash')) === 'true')
      const early = await apple.evaluate(async (node, at) => {
        await new Promise((resolve) => {
          setTimeout(resolve, 400)
        })
        return { elapsed: performance.now() - at, flag: node.getAttribute('data-flash') }
      }, started)
      if (early.elapsed < 900) same(early.flag, 'true', 'flash persists before one second')
      await until(
        'flash expires',
        async () => (await apple.getAttribute('data-flash')) !== 'true',
        3000,
      )
      await update(page, 'apple', 100)
      await until('flash returns', async () => (await apple.getAttribute('data-flash')) === 'true')
    },
  },
  {
    title: 'favourites toggle, filter and survive reload',
    run: async ({ page, base }) => {
      await page.goto(base)
      const apple = button(page, 'Favourite Apple')
      same(await apple.getAttribute('aria-pressed'), 'false', 'initial favourite')
      await apple.click()
      await until(
        'favourite selected',
        async () => (await apple.getAttribute('aria-pressed')) === 'true',
      )
      await page.getByLabel('Favourites only').check()
      same(
        await page.getByRole('list', { name: 'Products' }).getByRole('listitem').count(),
        1,
        'filter',
      )
      await page.reload()
      await until(
        'favourite persisted',
        async () => (await apple.getAttribute('aria-pressed')) === 'true',
      )
      await page.getByLabel('Favourites only').check()
      same(
        await page.getByRole('list', { name: 'Products' }).getByRole('listitem').count(),
        1,
        'persisted filter',
      )
      await apple.click()
      await until(
        'favourite removed',
        async () =>
          (await page.getByRole('list', { name: 'Products' }).getByRole('listitem').count()) === 0,
      )
      await page.getByLabel('Favourites only').uncheck()
      same(await apple.getAttribute('aria-pressed'), 'false', 'favourite unselected')
    },
  },
  {
    title: 'price increase compares with the price at first add',
    run: async ({ page, base }) => {
      await page.goto(base)
      await button(page, 'Add Apple').click()
      await update(page, 'apple', 40)
      await button(page, 'Cart (1)').click()
      same(
        await row(page, 'Cart', 'Apple').getByText('Price went up', { exact: true }).count(),
        0,
        'decrease',
      )
      await update(page, 'apple', 60)
      await row(page, 'Cart', 'Apple').getByText('Price went up', { exact: true }).waitFor()
      await button(page, 'Decrease Apple').click()
      await button(page, 'Products').click()
      await button(page, 'Add Apple').click()
      await button(page, 'Cart (1)').click()
      same(
        await row(page, 'Cart', 'Apple').getByText('Price went up', { exact: true }).count(),
        0,
        'new baseline',
      )
    },
  },
  {
    title: 'price sorting follows live updates',
    run: async ({ page, base }) => {
      await page.goto(base)
      await page.getByLabel('Sort').selectOption({ label: 'Price: low to high' })
      await update(page, 'apple', 1)
      await until('updated order', async () =>
        (
          await page
            .getByRole('list', { name: 'Products' })
            .getByRole('listitem')
            .first()
            .innerText()
        ).includes('Apple'),
      )
    },
  },
]
