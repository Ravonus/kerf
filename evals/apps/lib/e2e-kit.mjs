// What an app's e2e.test.mjs gets: a browser, the running site, its database, each test on a fresh copy of it. e2e.mjs sets
// BENCH_E2E; a test file means nothing outside it. Roles and names from the contract only, the same in every stack.
import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach } from 'node:test'
import { signIn } from './flow.mjs'
import { launchBrowser } from './measure.mjs'
import { benchUser, clone, psql, rows } from '../shared/pg/env.mjs'

const env = JSON.parse(process.env.BENCH_E2E ?? 'null')
if (!env) throw new Error('run this through e2e.mjs: node evals/apps/e2e.mjs <site> <variant>')
let browser
const open = []
before(async () => { browser = await launchBrowser() })
after(() => browser.close())
beforeEach(() => (env.db ? clone(env.db) : undefined))
afterEach(async () => { for (const c of open.splice(0)) await c.close() })

export const user = benchUser
export const site = {
  url: env.url,
  sql: q => psql(env.db, q),
  rows: q => rows(env.db, q),
  /** A new browser context, signed in as the bench user if asked, JavaScript off if asked. */
  async open({ signedIn = false, js = true } = {}) {
    const ctx = await browser.newContext({ javaScriptEnabled: js })
    open.push(ctx)
    if (signedIn) await ctx.addCookies(await signIn(browser, env.url, env.login))
    return ctx.newPage()
  },
  /** A page that's loaded and has had its chance to hydrate. */
  async go(page, path) {
    const r = await page.goto(env.url + path)
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})
    return r
  },
  path: page => new URL(page.url()).pathname,
  query: (page, k) => new URL(page.url()).searchParams.get(k),
}

export const see = (locator, timeout = 10000) => locator.first().waitFor({ state: 'visible', timeout })
export const gone = (locator, timeout = 10000) => locator.first().waitFor({ state: 'hidden', timeout })
export const name = (role, text) => [role, { name: text, exact: true }]

/** Retries an assertion: the database and the page each catch up in their own time. */
export async function eventually(fn, ms = 8000) {
  const end = Date.now() + ms
  for (;;) {
    try { return await fn() } catch (e) { if (Date.now() > end) throw e; await new Promise(r => setTimeout(r, 100)) }
  }
}

/** Contract "select": a native one, or a stack's listbox built on a button. */
export async function choose(locator, option) {
  if (await locator.evaluate(e => e.tagName === 'SELECT')) return locator.selectOption({ label: option })
  await locator.click()
  await locator.page().getByRole('option', { name: option, exact: true }).click()
}

export { assert }
