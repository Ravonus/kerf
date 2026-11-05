// A persistence check; live prices and the remaining shop spec still need coverage.
import { same } from '../helpers.mjs'

export const tests = [
  {
    title: 'favourite state survives reload',
    run: async ({ page, base }) => {
      await page.goto(base)
      const fav = page.getByRole('button', { name: 'Favourite Apple', exact: true })
      await fav.click()
      same(await fav.getAttribute('aria-pressed'), 'true', 'favourite selected')
      await page.reload()
      same(await fav.getAttribute('aria-pressed'), 'true', 'favourite persisted')
    },
  },
]
