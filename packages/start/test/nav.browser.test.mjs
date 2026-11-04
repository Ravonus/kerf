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

async function open(path, ctx = browser, desktop = false) {
  const page = await ctx.newPage()
  if (desktop) await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }))
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(url + path)
  await settle(page)
  return { page, errors }
}

/** Replies to matching requests wait until the returned function is called. */
async function hold(page, match) {
  let release
  const gate = new Promise(ok => { release = ok })
  await page.route(match, async r => {
    const reply = await r.fetch()
    await gate
    await r.fulfill({ response: reply }).catch(() => {})
  })
  return release
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
  await page.waitForTimeout(100) // the server has answered: only the reply is late
  // Another tab writes while this one is on its way: the data it's waiting for is older than that.
  const other = await open('/todos', ctx)
  await other.page.click('button.add')
  await other.page.waitForFunction(k => document.title.startsWith(`Todos (${k + 1})`), count)
  data()
  await page.waitForFunction(k => document.title.startsWith(`Todos (${k + 1})`), count)
  await ctx.close()
})

test('tags a stopped refresh was reading are still owed to the page', async () => {
  const ctx = await browser.newContext()
  const { page } = await open('/about', ctx)
  await link(page, '/todos')
  await page.waitForFunction(() => document.title.startsWith('Todos ('))
  const count = await page.evaluate(() => +/\((\d+)\)/.exec(document.title)[1])
  await page.route('**/_weft/data/todos*', () => {}) // the refresh goes out and never answers
  await page.route('**/_weft/data/users*', () => {})
  const other = await open('/todos', ctx)
  await other.page.click('button.add')
  await other.page.waitForFunction(k => document.title.startsWith(`Todos (${k + 1})`), count)
  await page.waitForTimeout(100)
  await link(page, '/users') // stops the refresh
  await page.waitForTimeout(50)
  await page.unroute('**/_weft/data/todos*')
  await page.evaluate(() => history.back())
  await page.waitForFunction(() => location.pathname === '/about')
  await page.evaluate(() => history.forward()) // the page showing was never left, and nothing has told it
  await page.waitForFunction(() => location.pathname === '/todos')
  await page.waitForFunction(k => document.title.startsWith(`Todos (${k + 1})`), count)
  await ctx.close()
})

test('a navigation\'s cache entries older than a write in this tab do not land', async () => {
  const { page } = await open('/todos?from=1')
  const was = await page.$$eval('ul.todos li', l => l.length)
  let first = true, open_
  const gate = new Promise(ok => { open_ = ok })
  await page.route('**/_weft/data/todos*', async r => {
    if (!first) return // what the write owes: left unanswered, so only the older reply is left to land
    first = false
    const reply = await r.fetch()
    await gate
    await r.fulfill({ response: reply }).catch(() => {})
  })
  await link(page, '/todos?from=2')
  await page.waitForTimeout(100)
  await page.click('button.add')
  await page.waitForFunction(n => document.querySelectorAll('ul.todos li').length === n + 1, was)
  open_()
  await page.waitForFunction(() => location.search === '?from=2')
  await page.waitForTimeout(100)
  expect(await page.$$eval('ul.todos li', l => l.length)).toBe(was + 1)
  await page.close()
})

test('a pressed link whose preloaded reply comes after the user moved on does not take over', async () => {
  const { page, errors } = await open('/')
  const data = await hold(page, '**/_weft/data/old')
  await page.evaluate(() => {
    const a = Object.assign(document.createElement('a'), { href: '/old', id: 'moved', textContent: 'Moved' })
    a.style.cssText = 'position:fixed;top:0;left:0;width:100px;height:100px;z-index:9'
    document.body.append(a)
  })
  await page.hover('#moved')
  await page.waitForTimeout(150) // the preload is out
  await page.click('#moved')
  await link(page, '/about')
  await page.waitForFunction(() => location.pathname === '/about')
  data()
  await page.waitForTimeout(300)
  expect(new URL(page.url()).pathname).toBe('/about')
  expect(errors).toEqual([])
  await page.close()
})

test('a click captured before hydration goes through the router, not a page load', async () => {
  const page = await browser.newPage()
  let release
  const gate = new Promise(ok => { release = ok })
  await page.route('**/*', async r => {
    if (r.request().resourceType() === 'script') await gate
    await r.continue()
  })
  await page.goto(url + '/users/1', { waitUntil: 'commit' })
  await page.waitForSelector('a[href="/users/2"]')
  await page.evaluate(() => { window.__same = 1 })
  await page.click('a[href="/users/2"]', { noWaitAfter: true })
  release()
  await page.waitForFunction(() => document.querySelector('.detail h2')?.textContent === 'Grace Hopper' && location.pathname === '/users/2', null, { timeout: 15_000 })
  expect(await page.evaluate(() => window.__same)).toBe(1)
  await page.close()
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

/** A fade running over the page, with a link in the corner holding `html`. */
async function fading(html) {
  const { page, errors } = await open('/', browser, true)
  await page.addStyleTag({ content: '::view-transition-group(root){animation-duration:3s}' })
  await link(page, '/about')
  await page.waitForFunction(() => location.pathname === '/about')
  await page.evaluate(body => {
    const a = Object.assign(document.createElement('a'), { href: '/users', id: 'on', innerHTML: body })
    a.style.cssText = 'position:fixed;top:0;left:0;width:200px;height:200px;z-index:9'
    document.body.append(a)
  }, html)
  // A navigation in the page's first two frames doesn't fade (run.tsx): those have passed once two more have.
  await page.evaluate(() => new Promise(ok => { requestAnimationFrame(() => requestAnimationFrame(ok)) }))
  await page.evaluate(() => history.back())
  await page.waitForFunction(() => location.pathname === '/' && document.activeViewTransition)
  return { page, errors }
}

test('a click during a fade reaches the page, not the fade', async () => {
  const { page, errors } = await fading('Users')
  await page.mouse.click(100, 100)
  await page.waitForFunction(() => location.pathname === '/users')
  expect(errors).toEqual([])
  await page.close()
})

test('a click on an icon in a link during a fade follows the link', async () => {
  const { page, errors } = await fading('<svg width="200" height="200"><rect width="200" height="200" fill="red"/></svg>')
  await page.mouse.click(100, 100)
  await page.waitForFunction(() => location.pathname === '/users')
  expect(errors).toEqual([])
  await page.close()
})

test('a cmd-click during a fade keeps this tab where it is', async () => {
  const { page, errors } = await fading('Users')
  const opened = page.context().waitForEvent('page', { timeout: 3000 }).catch(() => null)
  const key = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.down(key)
  await page.mouse.click(100, 100)
  await page.keyboard.up(key)
  const tab = await opened
  expect(new URL(page.url()).pathname).toBe('/')
  expect(tab && new URL(tab.url()).pathname).toBe('/users')
  expect(errors).toEqual([])
  await page.context().close().catch(() => {})
})

test('a press on the bare page after a fade has ended is one click', async () => {
  const { page } = await open('/')
  await link(page, '/about')
  await page.waitForFunction(() => location.pathname === '/about')
  await page.waitForFunction(() => !document.activeViewTransition)
  await page.waitForTimeout(100)
  await page.evaluate(() => {
    document.documentElement.style.minHeight = '100vh'
    document.body.style.cssText = 'margin:0;height:10px;overflow:hidden'
    window.__n = 0
    document.addEventListener('click', () => window.__n++)
  })
  await page.mouse.click(700, 500)
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => [window.__n, document.elementFromPoint(700, 500).tagName])).toEqual([1, 'HTML'])
  await page.close()
})

test('a drag from the bare page onto a control after a fade has ended does not click it', async () => {
  const { page } = await open('/')
  await link(page, '/about')
  await page.waitForFunction(() => location.pathname === '/about')
  await page.waitForFunction(() => !document.activeViewTransition)
  await page.waitForTimeout(100)
  await page.evaluate(() => {
    document.documentElement.style.minHeight = '100vh'
    document.body.style.cssText = 'margin:0;height:10px;overflow:hidden'
    window.__n = 0
    const b = Object.assign(document.createElement('button'), { onclick: () => window.__n++ })
    b.style.cssText = 'position:fixed;top:300px;left:300px;width:100px;height:100px'
    document.documentElement.append(b)
  })
  await page.mouse.move(700, 500)
  await page.mouse.down()
  await page.mouse.move(350, 350)
  await page.mouse.up()
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => window.__n)).toBe(0)
  await page.close()
})

test('a press on the bare page during a fade is one click too', async () => {
  const { page } = await fading('Users')
  await page.evaluate(() => {
    document.documentElement.style.minHeight = '100vh'
    document.body.style.cssText = 'margin:0;height:10px;overflow:hidden'
    window.__n = 0
    document.addEventListener('click', () => window.__n++)
  })
  await page.mouse.click(700, 500)
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => window.__n)).toBe(1)
  await page.close()
})

test('a hidden tab reads nothing for a write until it shows, then once', async () => {
  const ctx = await browser.newContext()
  const a = await open('/todos', ctx), b = await open('/todos', ctx)
  const was = await b.page.$$eval('ul.todos li', l => l.length)
  const reads = []
  b.page.on('request', r => { if (r.url().includes('/_weft/fn/listTodos')) reads.push(r.url()) })
  const shown = v => b.page.evaluate(h => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h })
    document.dispatchEvent(new Event('visibilitychange'))
  }, v)
  await shown(true)
  await a.page.click('button.add')
  await a.page.waitForFunction(n => document.querySelectorAll('ul.todos li').length === n + 1, was)
  await b.page.waitForTimeout(300)
  expect(reads).toEqual([])
  await shown(false)
  await b.page.waitForFunction(n => document.querySelectorAll('ul.todos li').length === n + 1, was)
  expect(reads.length).toBe(1)
  await ctx.close()
})

test('a sign-out in one tab leaves no rows in the others, shown or hidden', async () => {
  const ctx = await browser.newContext()
  const a = await open('/todos', ctx), shown = await open('/todos', ctx), hidden = await open('/about', ctx)
  await hidden.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }) })
  for (const t of [shown, hidden]) await t.page.evaluate(() => { window.__same = 1 })
  // What the server answers a mutation that changed the session: a redirect, and a full load.
  await a.page.route('**/_weft/fn/toggleTodo*', r => r.fulfill({ json: { r: '/about', x: 1 } }))
  await a.page.click('ul.todos li:nth-child(1) .toggle')
  await a.page.waitForURL('**/about')
  for (const t of [shown, hidden]) await t.page.waitForFunction(() => window.__same === undefined)
  await ctx.close()
})

test('a route refresh that fails leaves the page and goes again by itself', async () => {
  const ctx = await browser.newContext()
  const { page } = await open('/todos', ctx)
  const count = await page.evaluate(() => +/\((\d+)\)/.exec(document.title)[1])
  await page.route('**/_weft/data/todos*', r => r.abort('failed'))
  const other = await open('/todos', ctx)
  await other.page.click('button.add')
  await other.page.waitForFunction(k => document.title.startsWith(`Todos (${k + 1})`), count)
  await page.waitForTimeout(200)
  expect(await page.title()).toContain(`(${count})`)
  await page.unroute('**/_weft/data/todos*')
  await page.waitForFunction(k => document.title.startsWith(`Todos (${k + 1})`), count)
  await ctx.close()
})
