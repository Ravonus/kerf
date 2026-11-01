import { until } from '../helpers.mjs'
export const tests = [{
  title: 'the button counts clicks',
  run: async ({ page, base }) => {
    await page.goto(base)
    await page.getByRole('heading', { name: 'Hello' }).waitFor()
    await until('hydrated click counts', async () => {
      await page.getByRole('button', { name: /^Count: / }).click()
      return /^Count: [1-9]/.test(await page.getByRole('button', { name: /^Count: / }).textContent())
    })
  },
}]
