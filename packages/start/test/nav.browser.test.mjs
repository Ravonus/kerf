// The client router against what real users do mid-flight, in Chrome: a mutation landing during a navigation, Back then Forward
// before anything landed, a deploy taking the chunks away, two tabs, and a refresh racing a click.
import { createRequire } from 'node:module'
import { inject } from 'vitest'

const url = inject('url')
const { chromium } = createRequire(import.meta.url)('playwright-core')
let browser
beforeAll(async () => { browser = await chromium.launch() })
afterAll(async () => { await browser?.close() })

const settle = page => page.waitForFunction(() => window.__weft?.hydrated, null, { timeout: 15_000 })

async function open(path, ctx = browser) {
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(url + path)
  await settle(page)
  return { page, errors }
}

/** Replies to matching requests wait until the returned function is called. */
async function hold(page, match) {
  let open
  const gate = new Promise(ok => (open = ok))
  await page.route(match, async r => {
    const reply = await r.fetch()
    await gate
    await r.fulfill({ response: reply }).catch(() => {})
  })
  return open
}

const link = (page, href) => page.evaluate(h => { const a = Object.assign(document.createElement('a'), { href: h }); document.body.append(a); a.click() }, href)

test('a mutation landing during a navigation does not stop it', async () => {
  const { page, errors } = await open('/todos')
  const write = await hold(page, '**/_weft/fn/toggleTodo*')
  const data = await hold(page, '**/_weft/data/about*')
  await page.click('ul.todos li:nth-child(1) .toggle')
  await link(page, '/about')
  await page.waitForTimeout(100)
  write()
  await page.waitForTimeout(100)
  data()
  await page.waitForFunction(() => location.pathname === '/about')
  await page.waitForFunction(() => document.querySelector('h1')?.textContent !== 'Todos')
  expect(new URL(page.url()).pathname).toBe('/about')
  expect(errors).toEqual([])
  await page.close()
})

test('tags invalidated during a navigation refresh the route it lands on', async () => {
  const ctx = await browser.newContext()
  const { page } = await open('/', ctx)
  const count = await page.evaluate(async () => (await (await fetch('/_weft/data/todos')).json()).m.at(-1).data.count)
  const data = await hold(page, '**/_weft/data/todos*')
  await link(page, '/todos')
  await page.waitForTimeout(50)
  // Another tab writes while this one is on its way: the data it's waiting for is older than that.
  const other = await open('/todos', ctx)
  await other.page.click('button.add')
  await other.page.waitForFunction(k => document.title.startsWith(`Todos (${k + 1})`), count)
  await page.unroute('**/_weft/data/todos*')
  data()
  await page.waitForFunction(k => document.title.startsWith(`Todos (${k + 1})`), count)
  await ctx.close()
})

test('Back then Forward before anything lands stays on the page, and leaves nothing to land', async () => {
  const { page, errors } = await open('/')
  await link(page, '/about')
  await page.waitForFunction(() => location.pathname === '/about')
  await page.waitForFunction(() => document.body.textContent.includes('About'))
  const data = await hold(page, '**/_weft/data')
  await page.evaluate(() => history.back())
  await page.waitForFunction(() => location.pathname === '/')
  await page.evaluate(() => history.forward())
  await page.waitForFunction(() => location.pathname === '/about')
  const before = await page.textContent('#app')
  data()
  await page.waitForTimeout(200)
  expect(await page.textContent('#app')).toBe(before)
  expect(new URL(page.url()).pathname).toBe('/about')
  expect(errors).toEqual([])
  await page.close()
})

test('a chunk the deploy took away falls back to loading the page', async () => {
  const { page } = await open('/')
  await page.evaluate(() => { window.__same = 1 })
  await page.route('**/routes/about.tsx*', r => r.request().resourceType() === 'document' ? r.continue() : r.fulfill({ status: 404, body: 'gone' }))
  await page.route('**/_weft/data/about', r => r.continue())
  await link(page, '/about')
  await page.waitForFunction(() => location.pathname === '/about' && window.__same === undefined, null, { timeout: 10_000 })
  await page.close()
})

test('a write in one tab reaches another at once, with no focus and no connection', async () => {
  const ctx = await browser.newContext()
  const a = await open('/todos', ctx), b = await open('/todos', ctx)
  const was = await b.page.$$eval('ul.todos li', l => l.length)
  await a.page.click('button.add')
  await b.page.waitForFunction(n => document.querySelectorAll('ul.todos li').length === n + 1, was)
  await ctx.close()
})
