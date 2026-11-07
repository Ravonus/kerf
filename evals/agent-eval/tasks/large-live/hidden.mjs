// Only the unauthenticated route is checked here; server and live behavior remain open.
export const tests = [
  {
    title: 'an anonymous visitor is redirected to sign in',
    run: async ({ page, base }) => {
      await page.goto(base)
      await page.waitForURL((url) => url.pathname === '/signin')
      await page.getByLabel('Email').waitFor()
      await page.getByLabel('Password').waitFor()
      await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor()
    },
  },
]
