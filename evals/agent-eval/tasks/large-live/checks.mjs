import { same, until } from '../helpers.mjs'

const button = (page, name) => page.getByRole('button', { name, exact: true })
const email = (prefix) => `${prefix}-${crypto.randomUUID()}@example.test`

async function credentials(page, base, action, address, password) {
  await page.goto(`${base}/${action === 'Sign up' ? 'signup' : 'signin'}`)
  await page.getByLabel('Email').fill(address)
  await page.getByLabel('Password').fill(password)
  await button(page, action).click()
}

export const preparedTests = [
  {
    title: 'signup, signout, login and duplicate credentials',
    run: async ({ page, base }) => {
      const address = email('auth')
      await credentials(page, base, 'Sign up', address, 'correct-password-123')
      await page.getByText(`Signed in as ${address}`, { exact: true }).waitFor()
      same(
        (await page.context().cookies()).some((cookie) => cookie.httpOnly),
        true,
        'httpOnly session',
      )
      await button(page, 'Sign out').click()
      await credentials(page, base, 'Sign in', address, 'wrong-password-123')
      await page.getByText('Invalid email or password', { exact: true }).waitFor()
      await credentials(page, base, 'Sign up', address, 'correct-password-123')
      await page.getByText('Email already in use', { exact: true }).waitFor()
      await credentials(page, base, 'Sign in', address, 'correct-password-123')
      await page.getByText(`Signed in as ${address}`, { exact: true }).waitFor()
    },
  },
  {
    title: 'messages reject blanks and appear newest first',
    run: async ({ page, base }) => {
      const address = email('messages')
      await credentials(page, base, 'Sign up', address, 'correct-password-123')
      const field = page.getByLabel('Message')
      const list = page.getByRole('list', { name: 'Messages' })
      const before = await list.getByRole('listitem').count()
      await field.fill('   ')
      await button(page, 'Post').click()
      same(await list.getByRole('listitem').count(), before, 'blank message refused')
      for (const text of ['first-message', 'second-message']) {
        await field.fill(text)
        await button(page, 'Post').click()
        await list.getByText(text, { exact: true }).waitFor()
      }
      const first = list.getByRole('listitem').first()
      await first.getByText('second-message', { exact: true }).waitFor()
      await first.getByText(address, { exact: true }).waitFor()
    },
  },
  {
    title: 'other signed-in browsers see posts and deletes without reload',
    run: async ({ page, base }) => {
      const browser = page.context().browser()
      if (!browser) throw new Error('browser context unavailable')
      const otherContext = await browser.newContext()
      try {
        const other = await otherContext.newPage()
        const author = email('author')
        await credentials(page, base, 'Sign up', author, 'correct-password-123')
        await credentials(other, base, 'Sign up', email('reader'), 'correct-password-123')
        await page.getByLabel('Message').fill('live-message')
        await button(page, 'Post').click()
        await other.getByText('live-message', { exact: true }).waitFor({ timeout: 2000 })
        same(await button(other, 'Delete live-message').count(), 0, 'non-author delete control')
        await button(page, 'Delete live-message').click()
        await until(
          'remote deletion',
          async () => (await other.getByText('live-message', { exact: true }).count()) === 0,
          2000,
        )
      } finally {
        await otherContext.close()
      }
    },
  },
]
