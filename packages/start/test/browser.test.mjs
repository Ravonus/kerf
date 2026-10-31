// The fixture app in Chrome (playwright-core, headless): hydration of a plain and a streamed page, and client
// navigation, which keeps shared layouts and writes only what changed. The fixture's src/entry.client.ts records the
// DOM writes and key misses around start() in `window.__weft`.
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { inject } from 'vitest'
import { fixture } from './dev-server.setup.mjs'

const url = inject('url')
const { chromium } = createRequire(import.meta.url)('playwright-core')
let browser
beforeAll(async () => { browser = await chromium.launch() })
afterAll(async () => { await browser?.close() })

async function open(path) {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => m.type() === 'error' || m.type() === 'warning' ? errors.push(m.text()) : undefined)
  await page.goto(url + path)
  await page.waitForFunction(() => window.__weft?.hydrated, null, { timeout: 15_000 })
  return { page, errors }
}

/** Start recording DOM writes under #app; `take()` returns them as `type:node` strings. */
async function record(page) {
  await page.evaluate(() => {
    window.__writes = []
    window.__mo = new MutationObserver(r => window.__writes.push(...r.map(x => `${x.type}:${x.target.nodeName}${x.attributeName ? '.' + x.attributeName : ''}`)))
    window.__mo.observe(document.getElementById('app'), { subtree: true, childList: true, characterData: true, attributes: true })
  })
  return () => page.evaluate(() => { window.__writes.push(...window.__mo.takeRecords().map(x => `${x.type}:${x.target.nodeName}`)); return window.__writes.splice(0) })
}

test('a server-rendered page hydrates with 0 key misses and 0 DOM writes', async () => {
  const { page, errors } = await open('/users/1')
  expect(await page.evaluate(() => window.__weft)).toEqual({ misses: 0, writes: 0, hydrated: true })
  expect(errors).toEqual([])
  await page.close()
})

test('a streamed page: Boundaries swapped in before hydration, then 0/0, and no refetch', async () => {
  const { page, errors } = await open('/slow')
  expect(await page.evaluate(() => window.__weft)).toEqual({ misses: 0, writes: 0, hydrated: true })
  expect(await page.textContent('.stock')).toBe('In stock: 7')
  expect(await page.$$eval('.reviews li', l => l.map(e => e.textContent))).toEqual(['Great', 'Fine'])
  expect(await page.$('.skeleton')).toBeNull()
  const markers = await page.evaluate(() => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT)
    const out = []
    for (let n; (n = w.nextNode()); ) if (/^\/?wb:/.test(n.data)) out.push(n.data)
    return out
  })
  expect(markers).toEqual([])
  expect(errors).toEqual([])
  await page.close()
})

test('navigating between users keeps both layouts and writes only what changed', async () => {
  const { page, errors } = await open('/users/1')
  const section = await page.$('section.users')
  // A string, so vitest doesn't rewrite the import(); the module is the one the page already loaded.
  const mounts = () => page.evaluate("import('/src/routes/users/_layout.tsx').then(m => m.mounts.value)")
  expect(await mounts()).toBe(1)
  const take = await record(page)
  await page.click('a[href="/users/2"]')
  await page.waitForFunction(() => document.querySelector('h2')?.textContent === 'Grace Hopper')
  // The detail route is static, so the server's HTML replaces it; aria-current moves from one link to the other; nothing else.
  expect((await take()).sort()).toEqual(['attributes:A.aria-current', 'attributes:A.aria-current', 'childList:DIV', 'childList:DIV'])
  expect(await section.evaluate(e => e.isConnected)).toBe(true)
  expect(await mounts()).toBe(1)
  expect(page.url()).toBe(url + '/users/2')
  // The head is the server's merged metadata for the new route (setHead), for the tab title and history.
  expect(await page.title()).toBe('Grace Hopper · Acme')
  expect(await page.getAttribute('meta[name=description]', 'content')).toBe('Compilers, COBOL and nanoseconds.')
  expect(await page.getAttribute('link[rel=canonical]', 'href')).toBe('https://acme.dev/users/2')
  expect(await page.getAttribute('meta[property="og:image"]', 'content')).toMatch(/\/_weft\/og\/users\/2\.png\?v=/)
  expect(await page.$$eval('head [data-wm]', l => l.length)).toBe(15)
  expect(errors).toEqual([])
  await page.close()
})

test('leaving the users layout replaces it; back and forward restore', async () => {
  const { page, errors } = await open('/users/1')
  await page.click('a[href="/about"]')
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'About us')
  expect(await page.$('section.users')).toBeNull()
  expect(await page.title()).toBe('About · Acme')
  expect(await page.getAttribute('a[href="/about"]', 'aria-current')).toBe('page')
  await page.goBack()
  await page.waitForFunction(() => document.querySelector('h2')?.textContent === 'Ada Lovelace')
  expect(await page.title()).toBe('Ada Lovelace · Acme')
  await page.goForward()
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'About us')
  expect(errors).toEqual([])
  await page.close()
})

test('client navigation to a missing page shows the 404 route', async () => {
  const { page } = await open('/')
  await page.evaluate(() => {
    const a = Object.assign(document.createElement('a'), { href: '/users/999', textContent: 'gone' })
    document.body.append(a)
    a.click()
  })
  await page.waitForSelector('h1.not-found')
  expect(await page.textContent('h1.not-found')).toBe('Lost? /users/999')
  expect(await page.title()).toBe('Page not found · Acme')
  await page.close()
})

test('a streamed page reached by client navigation shows its deferred data', async () => {
  const { page, errors } = await open('/')
  await page.evaluate(() => {
    const a = Object.assign(document.createElement('a'), { href: '/slow' })
    document.body.append(a)
    a.click()
  })
  await page.waitForFunction(() => document.querySelector('.stock')?.textContent === 'In stock: 7')
  await page.waitForFunction(() => document.querySelectorAll('.reviews li').length === 2)
  expect(await page.title()).toBe('Slow page · Acme')
  expect(errors).toEqual([])
  await page.close()
})

test('dev: with JS off the first paint has every stylesheet of the route, and only its own', async () => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const page = await context.newPage()
    await page.goto(url + '/styled')
    const color = selector => page.locator(selector).first().evaluate(e => getComputedStyle(e).color)
    expect(await color('html')).toBe('rgb(13, 14, 15)') // src/entry.client.ts's import
    expect(await color('.root')).toBe('rgb(7, 8, 9)')
    expect(await color('.styled')).toBe('rgb(1, 2, 3)')
    expect(await color('.badge')).toBe('rgb(4, 5, 6)')
    for (const href of await page.locator('link[rel="stylesheet"]').evaluateAll(l => l.map(e => e.href))) {
      const res = await fetch(href, { headers: { accept: 'text/css' } })
      expect([href, res.status, res.headers.get('content-type')]).toEqual([href, 200, expect.stringContaining('text/css')])
    }
    expect(await page.locator('link[href^="/@weft-sheet/"]').count()).toBe(1) // a virtual sheet links too
    await page.goto(url + '/about')
    expect(await page.locator('link[href*="styled.css"]').count()).toBe(0)
    await page.goto(url + '/nowhere')
    expect(await color('.not-found')).toBe('rgb(10, 11, 12)')
  } finally {
    await context.close()
  }
})

test('dev: the client adds no second copy of a linked sheet, and HMR updates the link', async () => {
  const file = join(fixture, 'src/routes/styled.css')
  const before = readFileSync(file, 'utf8')
  const { page, errors } = await open('/styled')
  const copies = () => page.evaluate(() => [...document.styleSheets].filter(s => { try { return [...s.cssRules].some(r => r.selectorText === '.styled') } catch { return false } }).length)
  try {
    expect(await copies()).toBe(1)
    expect(await page.locator('style[data-vite-dev-id]').count()).toBe(0)
    writeFileSync(file, before.replace('rgb(1, 2, 3)', 'rgb(21, 22, 23)'))
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.styled')).color === 'rgb(21, 22, 23)', null, { timeout: 10_000 })
    await page.waitForFunction(() => document.querySelectorAll('link[href*="styled.css"]').length === 1)
    expect(await copies()).toBe(1)
    expect(errors).toEqual([])
  } finally {
    writeFileSync(file, before)
    await page.close()
  }
})

