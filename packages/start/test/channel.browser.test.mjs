// Channels and tabs in Chrome (research 32): the browser's own WebSocket and BroadcastChannel, which everything else
// fakes. Two pages share a room; a socket killed under one reconnects and catches up; two tabs of one context share a
// box by key.
import { createRequire } from 'node:module'
import { inject } from 'vitest'

const url = inject('url')
const { chromium } = createRequire(import.meta.url)('playwright-core')
let browser
beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(async () => {
  await browser?.close()
})

async function open(context, path) {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript(() => {
    const Real = window.WebSocket
    window.__sockets = []
    window.WebSocket = class extends Real {
      constructor(u, ...a) {
        super(u, ...a)
        if (String(u).includes('/_weft/ws')) window.__sockets.push(this)
      }
    }
  })
  page.on('console', (m) => process.env.DEBUG_B && console.log(m.type(), m.text()))
  await page.goto(url + path)
  await page
    .waitForFunction(() => window.__weft?.hydrated, null, { timeout: 15_000 })
    .catch((e) => {
      throw new Error(`${e.message}: ${errors.join('\n')}`)
    })
  return { page, errors }
}

const open_ = (page) =>
  page.getByLabel('status').filter({ hasText: 'open' }).waitFor({ timeout: 10_000 })
const say = async (page, text) => {
  await page.getByLabel('draft').fill(text)
  await page.getByRole('button', { name: 'send' }).click()
}
const said = (page, text) =>
  page.getByRole('listitem').filter({ hasText: text }).waitFor({ timeout: 10_000 })

test('two pages share a room over a real socket', async () => {
  const ctx = await browser.newContext()
  const a = await open(ctx, '/chat'),
    b = await open(ctx, '/chat')
  await open_(a.page)
  await open_(b.page)
  await say(a.page, 'hello from a')
  await said(b.page, 'hello from a')
  await said(a.page, 'hello from a')
  expect([...a.errors, ...b.errors]).toEqual([])
  await ctx.close()
})

test('a killed socket reconnects and catches up, with nothing doubled', async () => {
  // Two browsers: tabs of one share a socket, and these two must each have their own to lose.
  const ctx = await browser.newContext(),
    other = await browser.newContext()
  const a = await open(ctx, '/chat'),
    b = await open(other, '/chat')
  await open_(a.page)
  await open_(b.page)
  await say(a.page, 'before')
  await said(b.page, 'before')
  await b.page.evaluate(() => window.__sockets.at(-1).close())
  await say(a.page, 'during')
  await said(b.page, 'during')
  await open_(b.page)
  await say(b.page, 'after')
  await said(a.page, 'after')
  const items = await b.page.getByRole('listitem').allTextContents()
  expect(items.filter((t) => t === 'before')).toEqual(['before'])
  expect(items.filter((t) => t === 'during')).toEqual(['during'])
  expect(await b.page.evaluate(() => window.__sockets.length)).toBe(2)
  await ctx.close()
  await other.close()
})

test('a page offline for a moment comes back by itself', async () => {
  const ctx = await browser.newContext(),
    other = await browser.newContext()
  const a = await open(ctx, '/chat'),
    b = await open(other, '/chat')
  await open_(a.page)
  await open_(b.page)
  await other.setOffline(true)
  await b.page.evaluate(() => window.__sockets.at(-1).close())
  await other.setOffline(false)
  await open_(b.page)
  await say(b.page, 'back')
  await said(a.page, 'back')
  await ctx.close()
  await other.close()
})

test('`tabs.channel` and `sync: tabs` cross real tabs; a late tab starts from storage', async () => {
  const ctx = await browser.newContext()
  const a = await open(ctx, '/tabs'),
    b = await open(ctx, '/tabs')
  await a.page.getByLabel('ping').click()
  await b.page.getByLabel('seen').filter({ hasText: '7' }).waitFor({ timeout: 5000 })
  expect(await a.page.getByLabel('seen').textContent()).toBe('0')
  await a.page.getByLabel('a', { exact: true }).click()
  await b.page.getByLabel('lines').filter({ hasText: '"a":1' }).waitFor({ timeout: 5000 })
  await b.page.getByLabel('b', { exact: true }).click()
  await a.page.getByLabel('lines').filter({ hasText: '"b":2' }).waitFor({ timeout: 5000 })
  expect(JSON.parse(await a.page.getByLabel('lines').textContent())).toEqual({ a: 1, b: 2 })
  const c = await open(ctx, '/tabs')
  await c.page.getByLabel('lines').filter({ hasText: '"b":2' }).waitFor({ timeout: 5000 })
  expect([...a.errors, ...b.errors, ...c.errors]).toEqual([])
  await ctx.close()
})
