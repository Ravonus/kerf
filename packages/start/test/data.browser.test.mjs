// Server functions in Chrome (research 27): a page whose data comes from queries hydrates with 0 key misses, 0 DOM
// writes and no fetch (the cache starts from #weft-cache); an optimistic toggle writes one attribute and the
// mutation's response carries the refreshed list; a failing mutation rolls back; the route's own data (its `meta`)
// follows the invalidation; and a loader's redirect works in the client router. The dev server's todos are shared
// with fn.test.mjs, so counts here are relative.
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

async function open(path) {
  const page = await browser.newPage()
  const errors = []
  const calls = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) =>
    m.type() === 'error' || m.type() === 'warning' ? errors.push(m.text()) : undefined,
  )
  page.on('request', (r) =>
    r.url().includes('/_weft/')
      ? calls.push(`${r.method()} ${new URL(r.url()).pathname.replace(/\.[0-9a-f]{6}$/, '')}`)
      : undefined,
  )
  await page.goto(url + path)
  await page.waitForFunction(() => window.__weft?.hydrated, null, { timeout: 15_000 })
  return { page, errors, calls }
}

async function record(page) {
  await page.evaluate(() => {
    window.__writes = []
    window.__mo = new MutationObserver((r) =>
      window.__writes.push(
        ...r.map(
          (x) => `${x.type}:${x.target.nodeName}${x.attributeName ? '.' + x.attributeName : ''}`,
        ),
      ),
    )
    window.__mo.observe(document.getElementById('app'), {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    })
  })
  return () =>
    page.evaluate(() => {
      window.__writes.push(
        ...window.__mo.takeRecords().map((x) => `${x.type}:${x.target.nodeName}`),
      )
      return window.__writes.splice(0)
    })
}

const items = (page) =>
  page.$$eval('ul.todos li', (l) => l.map((li) => `${li.className}:${li.textContent}`))
const slow = (page) =>
  page.route('**/_weft/fn/**', async (r) => {
    await new Promise((ok) => {
      setTimeout(ok, 300)
    })
    await r.continue()
  })

test('a page reading queries hydrates 0/0 and fetches nothing', async () => {
  const { page, errors, calls } = await open('/todos')
  expect(await page.evaluate(() => window.__weft)).toEqual({ misses: 0, writes: 0, hydrated: true })
  expect((await items(page)).length).toBeGreaterThanOrEqual(3)
  expect(calls).toEqual([])
  expect(errors).toEqual([])
  await page.close()
})

test('an optimistic toggle writes one attribute, before the response, which carries the refreshed list', async () => {
  const { page, errors, calls } = await open('/todos')
  await slow(page)
  const before = await items(page)
  const take = await record(page)
  const answered = page.waitForResponse((r) => r.request().method() === 'POST')
  await page.click('ul.todos li:nth-child(2) .toggle')
  await page.waitForFunction(
    (was) => document.querySelector('ul.todos li:nth-child(2)').className !== was,
    before[1].split(':')[0],
  )
  await answered
  await page.waitForTimeout(100)
  expect(await take()).toEqual(['attributes:LI.class']) // the server's list changed nothing more
  // The list came back in the mutation's response; the route's own data (its load read `todos`) is refetched.
  expect(calls).toEqual(['POST /_weft/fn/toggleTodo', 'GET /_weft/data/todos'])
  expect((await items(page))[1]).not.toBe(before[1])
  expect(errors).toEqual([])
  await page.close()
})

test('adding shows the row at once; the route data (its title) follows the invalidation', async () => {
  const { page, errors } = await open('/todos')
  await slow(page)
  const n = (await items(page)).length
  expect(await page.title()).toBe(`Todos (${n}) · Acme`)
  await page.click('button.add')
  await page.waitForFunction((k) => document.querySelectorAll('ul.todos li').length === k + 1, n)
  expect(await page.getAttribute('button.add', 'disabled')).toBe('') // addTodo.pending
  await page.waitForFunction((k) => document.title.startsWith(`Todos (${k + 1})`), n)
  expect((await items(page)).at(-1)).toBe('open:New')
  expect(await page.getAttribute('button.add', 'disabled')).toBeNull()
  expect(errors).toEqual([])
  await page.close()
})

test('a failing mutation rolls its row back', async () => {
  const { page } = await open('/todos')
  await slow(page)
  const before = await items(page)
  await page.click('button.add-fail')
  await page.waitForFunction(
    (k) => document.querySelectorAll('ul.todos li').length === k + 1,
    before.length,
  )
  await page.waitForFunction(
    (k) => document.querySelectorAll('ul.todos li').length === k,
    before.length,
  )
  expect(await items(page)).toEqual(before)
  await page.close()
})

test('client navigation to a redirecting route lands on its target, with one history entry', async () => {
  const { page, errors } = await open('/')
  await page.evaluate(() => {
    const a = Object.assign(document.createElement('a'), { href: '/old' })
    document.body.append(a)
    a.click()
  })
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Todos')
  expect(page.url()).toBe(url + '/todos')
  await page.goBack()
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Welcome')
  expect(errors).toEqual([])
  await page.close()
})

// Realtime in Chrome (research 30): the same page in two tabs, a real reader on a real connection.
const text = (page, label) => page.getByLabel(label).textContent()

test('a live query and a stream hydrate 0/0, then update in place from another tab', async () => {
  const a = await open('/live')
  const b = await open('/live')
  await a.page.waitForFunction(
    () => document.querySelector('[aria-label=status]').textContent === 'live',
    null,
    { timeout: 10_000 },
  )
  await b.page.waitForFunction(
    () => document.querySelector('[aria-label=status]').textContent === 'live',
    null,
    { timeout: 10_000 },
  )
  const hits = Number(await text(a.page, 'hits'))
  const writes = await record(a.page)
  await b.page.getByRole('button', { name: 'bump' }).click()
  await a.page.waitForFunction(
    (n) => document.querySelector('[aria-label=hits]').textContent === String(n),
    hits + 1,
    { timeout: 10_000 },
  )
  expect(await writes()).toEqual(['characterData:#text'])
  await b.page.getByRole('button', { name: 'post' }).click()
  await a.page.waitForFunction(
    () => document.querySelector('[aria-label=notes]').textContent.endsWith('hi'),
    null,
    { timeout: 10_000 },
  )
  expect(a.errors).toEqual([])
  expect(b.errors).toEqual([])
  await a.page.close()
  await b.page.close()
})

test('cut off and back: status follows, and what was published meanwhile arrives', async () => {
  const a = await open('/live')
  const b = await open('/live')
  await a.page.waitForFunction(
    () => document.querySelector('[aria-label=status]').textContent === 'live',
    null,
    { timeout: 10_000 },
  )
  const hits = Number(await text(a.page, 'hits'))
  await a.page.context().setOffline(true) // shared context: each `newPage` has its own
  // Headless Chrome cuts the network and leaves `navigator.onLine` true: the connection dropping is what shows.
  await a.page.waitForFunction(
    () => document.querySelector('[aria-label=status]').textContent !== 'live',
    null,
    { timeout: 10_000 },
  )
  await b.page.getByRole('button', { name: 'bump' }).click()
  await a.page.context().setOffline(false)
  await a.page.waitForFunction(
    (n) => document.querySelector('[aria-label=hits]').textContent === String(n),
    hits + 1,
    { timeout: 15_000 },
  )
  expect(await text(a.page, 'status')).toBe('live')
  await a.page.close()
  await b.page.close()
})
