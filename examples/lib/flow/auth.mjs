import { benchUser } from '../../shared/pg/env.mjs'
import { fill, randomValue, settled } from './page.mjs'

/** Signs in through the page's own form, roles only, so the cookie is whatever that stack really sets. */
export async function signIn(browser, url, login, user = benchUser) {
  const ctx = await browser.newContext(),
    page = await ctx.newPage()
  await page.goto(url + login.path)
  await settled(page)
  await page.getByRole('textbox', { name: login.email, exact: true }).fill(user.email)
  await page.getByRole('textbox', { name: login.password, exact: true }).fill(user.password)
  await page.getByRole('button', { name: login.submit, exact: true }).click()
  await page.waitForURL((u) => !u.pathname.startsWith(login.path), { timeout: 15000 })
  const cookies = await ctx.cookies()
  await ctx.close()
  return cookies
}

/** Writes a value into a row the page shows, and the page has to show it, or it wasn't read for this sample. */
export async function canaryPass(browser, url, canary, { db, cookies = [] }) {
  const value = randomValue()
  await db.sql(fill(canary.sql, value))
  const ctx = await browser.newContext()
  await ctx.addCookies(cookies)
  const page = await ctx.newPage()
  try {
    await page.goto(url)
    await page
      .getByText(value)
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
      .catch(() => {
        throw new Error(
          `CANARY: ${url} doesn't show the value just written, so it wasn't read for this sample. If that's by design, label the page "freshness": "cached".`,
        )
      })
  } finally {
    await ctx.close()
  }
  return true
}
