// Partial hydration in Chrome (PLAN §11): a route the compiler proved static sends HTML and its islands, and they do
// everything a hydrated page does. `.weft/hydration.json` is what an agent reads to see why.
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

const settled = page => page.waitForTimeout(50) // the sweep is a macrotask after the claim
const count = page => page.evaluate(() => {
  const w = document.createTreeWalker(document.getElementById('app'), 128)
  const left = []
  while (w.nextNode()) left.push(w.currentNode.data.slice(0, 3))
  return { comments: left, wk: document.querySelectorAll('#app [wk]').length }
})

test('the server writes no keys or markers in the static parts, and props as JSON', async () => {
  const html = await (await fetch(url + '/islands')).text()
  expect(html).toContain('<h1>Mostly static</h1>')
  expect(html).toContain('<em class="label">From the server</em>')
  expect(html).toMatch(/<!--wi:\["src\/routes\/islands\.tsx#\d+","[^"]+",\[5\]\]-->/) // the literal label stays in the island's code
  expect(html).toContain('<template><p class="late">From the server</p></template>') // Reveal didn't render its children
  const plan = JSON.parse(readFileSync(join(fixture, '.weft/hydration.json'), 'utf8'))
  expect(plan.islands.filter(i => i.startsWith('src/routes/islands.tsx')).length).toBeGreaterThanOrEqual(5)
  expect(plan.files.find(f => f.file === 'src/routes/islands.tsx').nodes.find(n => n.name === 'Islands').client).toBeNull()
  expect(plan.files.find(f => f.file === 'src/components/islands.tsx').nodes.find(n => n.name === 'Counter').client).toMatch(/@weft client/)
  expect(plan.files.find(f => f.file === 'src/components/lazy.tsx').nodes.find(n => n.name === 'Tap').client).toMatch(/onClick/)
})

test('islands hydrate 0/0, then what only the claim needed goes', async () => {
  const { page, errors } = await open('/islands')
  expect(await page.evaluate(() => window.__weft)).toEqual({ misses: 0, writes: 0, hydrated: true })
  await settled(page)
  const { comments, wk } = await count(page)
  expect(wk).toBe(0)
  expect(comments.filter(c => /^(wi:|wl:|ws|\/ws|\[)/.test(c))).toEqual([])
  expect(comments.filter(c => c === '/wl')).toEqual(['/wl']) // where the next level goes: the one marker a level keeps
  expect(errors).toEqual([])
  await page.close()
})

test('an island that shows its children twice keeps both', async () => {
  const { page, errors } = await open('/islands')
  await settled(page)
  expect(await page.textContent('.twice b')).toBe('both places')
  expect(await page.textContent('.twice i')).toBe('both places')
  expect(errors).toEqual([])
  await page.close()
})

test('props reach an island, and each row of a keyed list keeps its own state', async () => {
  const { page, errors } = await open('/islands')
  expect(await page.textContent('.counter[data-label=solo]')).toBe('solo: 5')
  await page.click('.counter[data-label=solo]')
  await page.click('.counter[data-label=b]')
  await page.click('.counter[data-label=b]')
  expect(await page.textContent('.counter[data-label=solo]')).toBe('solo: 6')
  expect(await page.textContent('.counter[data-label=a]')).toBe('a: 1')
  expect(await page.textContent('.counter[data-label=b]')).toBe('b: 4')
  expect(errors).toEqual([])
  await page.close()
})

test('an island\'s children stay the server\'s: rendered, or waiting until it shows them', async () => {
  const { page, errors } = await open('/islands')
  const kept = await page.$('.kept')
  await page.click('.fold-toggle')
  await page.waitForFunction(() => !document.querySelector('.kept'))
  await page.click('.fold-toggle')
  await page.waitForSelector('.kept')
  expect(await kept.evaluate(e => e.isConnected)).toBe(true) // the same node
  expect(await page.$('.late')).toBeNull()
  await page.click('.reveal')
  expect(await page.textContent('.late')).toBe('From the server')
  expect(errors).toEqual([])
  await page.close()
})

test('a Boundary in an island settles on its value, with no pending state left', async () => {
  const { page, errors } = await open('/islands')
  expect(await page.textContent('.island-stock')).toBe('In stock: 7')
  expect(await page.$('.island-pending')).toBeNull()
  expect(errors).toEqual([])
  await page.close()
})

test('client navigation into a static route: its HTML, with islands running', async () => {
  const { page, errors } = await open('/about')
  await page.evaluate(() => {
    const a = Object.assign(document.createElement('a'), { href: '/islands' })
    document.body.append(a)
    a.click()
  })
  await page.waitForSelector('.islands')
  await page.click('.counter[data-label=a]')
  expect(await page.textContent('.counter[data-label=a]')).toBe('a: 2')
  await page.click('.reveal')
  await page.waitForSelector('.late')
  expect(await page.textContent('.island-stock')).toBe('In stock: 7')
  await settled(page)
  expect((await count(page)).wk).toBe(0)
  await page.goBack()
  await page.waitForFunction(() => !document.querySelector('.islands'))
  await page.goForward()
  await page.waitForSelector('.islands')
  expect(await page.textContent('.counter[data-label=a]')).toBe('a: 1') // a new page, fresh state
  expect(errors).toEqual([])
  await page.close()
})

test('an island at a level\'s top takes its own nodes with it', async () => {
  const { page, errors } = await open('/islands-top')
  await settled(page)
  await page.click('.many-toggle')
  await page.waitForFunction(() => !document.querySelector('.many'))
  await page.click('.many-toggle')
  await page.waitForSelector('.many')
  await page.click('.many-toggle')
  await page.click('.many-toggle') // a node the server never sent
  await page.waitForSelector('.many')
  await page.click('a[href="/about"]')
  await page.waitForFunction(() => !document.querySelector('.top-note'))
  expect(await page.$('.many')).toBeNull()
  expect(await page.$('.many-toggle')).toBeNull()
  expect(errors).toEqual([])
  await page.close()
})

test('a prop JSON can\'t carry fails on the server, and says how to fix it', async () => {
  const res = await fetch(url + '/island-bad')
  expect(res.status).toBe(500)
  expect(await res.text()).toMatch(/H009/)
})

test('dev: editing a static route reloads the page, since no browser holds its code', async () => {
  const { page } = await open('/islands')
  const file = join(fixture, 'src/routes/islands.tsx')
  const before = readFileSync(file, 'utf8')
  try {
    writeFileSync(file, before.replace('Mostly static', 'Edited static'))
    await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Edited static', null, { timeout: 10_000 })
  } finally {
    writeFileSync(file, before)
    await page.close()
  }
})

test('dev: editing an island keeps the page working', async () => {
  const { page, errors } = await open('/islands')
  const file = join(fixture, 'src/components/islands.tsx')
  const before = readFileSync(file, 'utf8')
  try {
    writeFileSync(file, before.replace('>reveal<', '>show<'))
    await page.waitForFunction(() => document.querySelector('.reveal')?.textContent === 'show', null, { timeout: 10_000 })
    await page.click('.counter[data-label=solo]')
    expect(await page.textContent('.counter[data-label=solo]')).toBe('solo: 6')
    expect(errors).toEqual([])
  } finally {
    writeFileSync(file, before)
    await page.close()
  }
})

// ---- lazy islands: nothing runs before it's needed, and nothing done before then is lost -------------------------

const CODE = u => u.pathname.endsWith('/components/lazy.tsx') && !u.search.includes('weft-assets')
/** `/lazy`, with its islands' code stalled until `release`. */
async function stalled(path = '/lazy', options) {
  const context = await browser.newContext(options)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  let release
  const gate = new Promise(ok => (release = ok))
  await page.route(CODE, async r => { await gate; await r.continue() })
  await page.goto(url + path)
  await page.waitForFunction(() => window.__weft?.hydrated, null, { timeout: 15_000 })
  return { page, errors, release, close: () => context.close() }
}
const claimed = (page, sel) => page.$eval(sel, e => !!e.$k || !e.hasAttribute('wk'))

test('a page that\'s only read runs no client at all; the first click brings it, and counts', async () => {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const asked = []
  page.on('request', r => asked.push(new URL(r.url()).pathname))
  await page.goto(url + '/lazy?boot')
  await page.waitForTimeout(300)
  expect(asked.filter(p => /\/run\.tsx|components\/lazy\.tsx/.test(p))).toEqual([])
  expect(await page.evaluate(() => window.__weft)).toBeUndefined()
  await page.click('.tap[data-id=one]')
  await page.click('.tap[data-id=one]')
  await page.waitForFunction(() => document.querySelector('.tap').textContent === 'one: 2')
  expect(asked.filter(p => /\/run\.tsx/.test(p)).length).toBe(1)
  expect(errors).toEqual([])
  await page.close()
})

test('scrolling to an island that wants to run brings the client, and a link is a plain link until then', async () => {
  const page = await browser.newPage()
  await page.goto(url + '/lazy?boot')
  await page.$eval('.seen', e => e.scrollIntoView())
  await page.waitForFunction(() => document.querySelector('.seen').textContent === 'ran')
  await page.close()
  const other = await browser.newPage()
  await other.goto(url + '/lazy?boot')
  await other.evaluate(() => {
    window.stayed = true
    document.body.append(Object.assign(document.createElement('a'), { href: '/about', id: 'plain', textContent: 'plain' }))
  })
  await other.click('#plain')
  await other.waitForURL('**/about')
  expect(await other.evaluate(() => window.stayed)).toBeUndefined()
  await other.close()
})

test('hydration.json says when each island loads and why, and H010 what would let it wait', async () => {
  await fetch(url + '/lazy')
  const plan = JSON.parse(readFileSync(join(fixture, '.weft/hydration.json'), 'utf8'))
  const of = tag => plan.loads.find(l => l.id.startsWith('src/routes/lazy') && l.tag === tag)
  expect(of('Tap')).toMatchObject({ when: 'interaction', why: expect.stringMatching(/handlers only/) })
  expect(of('Named').when).toBe('interaction')
  expect(of('Seen')).toMatchObject({ when: 'visible', why: expect.stringMatching(/onMount.*stays inside/) })
  expect(of('Held')).toMatchObject({ when: 'visible', why: expect.stringMatching(/server data/) })
  expect(of('Auto')).toMatchObject({ when: 'load', why: expect.stringMatching(/autofocus/) })
  expect(of('Titled')).toMatchObject({ when: 'load', why: expect.stringMatching(/document/) })
  expect(plan.loads.find(l => l.tag === 'Counter')).toMatchObject({ when: 'load', why: expect.stringMatching(/@weft client/) })
  expect(plan.diagnostics.find(d => d.line && d.why.includes('Titled'))).toMatchObject({ code: 'H010', file: 'src/routes/lazy-early.tsx', fix: expect.stringMatching(/@weft visible/) })
  expect(plan.diagnostics.some(d => d.why.includes('Auto'))).toBe(false)
})

test('a page of lazy islands hydrates with no complaints about the ones that wait', async () => {
  const { page, errors } = await open('/lazy')
  expect(await page.evaluate(() => window.__weft)).toEqual({ misses: 0, writes: 0, hydrated: true })
  expect(await claimed(page, '.tap')).toBe(false)
  expect(errors).toEqual([])
  await page.close()
})

test('a click before the code arrives counts, once, in order', async () => {
  const { page, errors, release, close } = await stalled()
  await page.click('.tap[data-id=one]')
  await page.click('.tap[data-id=one]')
  expect(await page.textContent('.tap[data-id=one]')).toBe('one: 0')
  release()
  await page.waitForFunction(() => document.querySelector('.tap').textContent === 'one: 2')
  await page.click('.tap[data-id=one]')
  expect(await page.textContent('.tap[data-id=one]')).toBe('one: 3')
  expect(errors).toEqual([])
  await close()
})

test('pointer, focus and keys replay in order across controls, and focus stays put', async () => {
  const { page, errors, release, close } = await stalled()
  await page.click('.log-a')
  await page.keyboard.press('x')
  await page.click('.log-b')
  release()
  await page.waitForFunction(() => document.querySelector('.log-out').textContent.endsWith('b'))
  expect(await page.textContent('.log-out')).toBe('down focus a key:x focus b')
  expect(await page.evaluate(() => document.activeElement.className)).toBe('log-b')
  expect(errors).toEqual([])
  await close()
})

test('the keyboard alone: Tab to a button, Enter clicks it', async () => {
  const { page, release, close } = await stalled()
  await page.focus('.tap[data-id=one]')
  await page.keyboard.press('Enter')
  release()
  await page.waitForFunction(() => document.querySelector('.tap').textContent === 'one: 1')
  await close()
})

test('typing before hydration: the value and the caret stay, and the island catches up', async () => {
  const { page, errors, release, close } = await stalled()
  await page.click('.field-in')
  await page.keyboard.type('hello')
  await page.click('.field-box')
  expect(await page.inputValue('.field-in')).toBe('hello')
  release()
  await page.waitForFunction(() => document.querySelector('.field-out').textContent === 'hello|on')
  expect(await page.inputValue('.field-in')).toBe('hello')
  expect(await page.isChecked('.field-box')).toBe(true)
  expect(errors).toEqual([])
  await close()
})

test('a value no event told anyone about (autofill, a restored form) reaches the island too', async () => {
  const { page, release, close } = await stalled()
  await page.$eval('.field-in', e => { e.value = 'filled' })
  await page.click('.field-box')
  release()
  await page.waitForFunction(() => document.querySelector('.field-out').textContent === 'filled|on')
  await close()
})

test('a form submitted before hydration runs in place, by click and by Enter', async () => {
  for (const how of ['click', 'enter']) {
    const { page, errors, release, close } = await stalled()
    await page.evaluate(() => { window.stayed = true })
    await page.fill('.name-in', 'Ada')
    if (how === 'click') await page.click('.name-go')
    else await page.press('.name-in', 'Enter')
    release()
    await page.waitForSelector('.named')
    expect(await page.textContent('.named')).toBe('Ada')
    expect(await page.evaluate(() => window.stayed)).toBe(true)
    expect(errors).toEqual([])
    await close()
  }
})

test('code that never comes: what was held takes its default, so the page still works', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.route(CODE, r => r.abort())
  await page.goto(url + '/lazy')
  await page.waitForFunction(() => window.__weft?.hydrated)
  await page.fill('.name-in', 'Ada')
  await Promise.all([page.waitForURL('**/lazy'), page.waitForEvent('load'), page.click('.name-go')])
  await page.waitForFunction(() => window.__weft?.hydrated)
  await page.click('.away')
  await page.waitForURL('**/about')
  await context.close()
})

test('a link in an island: its handler runs, then the router takes it', async () => {
  const { page, errors, release, close } = await stalled()
  await page.evaluate(() => { window.stayed = true })
  await page.click('.away')
  release()
  await page.waitForURL('**/about')
  expect(await page.evaluate(() => window.stayed)).toBe(true)
  expect(errors).toEqual([])
  await close()
})

test('client navigation: the page shows before its islands\' code, and leaving drops what waited', async () => {
  const { page, errors, release, close } = await stalled('/about')
  await page.evaluate(() => {
    const a = Object.assign(document.createElement('a'), { href: '/lazy', id: 'go' })
    document.body.append(a)
    a.click()
  })
  await page.waitForSelector('.lazy') // with the code still stalled
  await page.click('.tap[data-id=one]')
  await page.goBack()
  await page.waitForFunction(() => !document.querySelector('.lazy'))
  release()
  await page.waitForTimeout(100)
  expect(await page.evaluate(() => window.__wq?.q.length ?? 0)).toBe(0)
  await page.goForward()
  await page.waitForSelector('.lazy')
  await page.click('.tap[data-id=one]')
  await page.waitForFunction(() => document.querySelector('.tap').textContent === 'one: 1') // a new page: the old click is gone
  expect(errors).toEqual([])
  await close()
})

test('an island\'s slot stays the server\'s when it runs late, and the nodes go with the level', async () => {
  const { page, errors, release, close } = await stalled()
  expect(await page.$('.late')).toBeNull()
  await page.click('.unfold')
  release()
  await page.waitForSelector('.late')
  expect(await page.textContent('.late')).toBe('kept')
  expect(errors).toEqual([])
  await close()
})

test('a Boundary in a lazy island and work of its own run when it comes into view, with no refetch', async () => {
  const { page, errors, release, close } = await stalled()
  release()
  await page.waitForTimeout(200)
  expect(await page.textContent('.seen')).toBe('waiting')
  await page.$eval('.seen', e => e.scrollIntoView())
  await page.waitForFunction(() => document.querySelector('.seen').textContent === 'ran')
  expect(await page.textContent('.lazy-stock')).toBe('In stock: 3')
  expect(errors).toEqual([])
  await close()
})

test('a visitor who asked for less data loads on interaction only', async () => {
  const context = await browser.newContext()
  await context.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }))
  const page = await context.newPage()
  let asked = 0
  page.on('request', r => { if (r.url().includes('components/lazy.tsx')) asked++ })
  await page.goto(url + '/lazy')
  await page.waitForFunction(() => window.__weft?.hydrated)
  await page.$eval('.seen', e => e.scrollIntoView())
  await page.waitForTimeout(200)
  expect(asked).toBe(0)
  expect(await page.textContent('.seen')).toBe('waiting')
  await page.click('.tap[data-id=far]')
  await page.waitForFunction(() => document.querySelector('.tap[data-id=far]').textContent === 'far: 1')
  await context.close()
})

test('running late moves nothing: no layout shift, and the same element under the pointer', async () => {
  const { page, errors, release, close } = await stalled()
  await page.evaluate(() => {
    window.shift = 0
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.shift += e.value }).observe({ type: 'layout-shift', buffered: true })
    window.was = document.querySelector('.tap')
  })
  const before = await page.$eval('.tap', e => JSON.stringify(e.getBoundingClientRect()))
  await page.click('.tap[data-id=one]')
  release()
  await page.waitForFunction(() => document.querySelector('.tap').textContent === 'one: 1')
  await settled(page)
  expect(await page.$eval('.tap', e => JSON.stringify(e.getBoundingClientRect()))).toBe(before)
  expect(await page.evaluate(() => window.was === document.querySelector('.tap'))).toBe(true)
  expect(await page.evaluate(() => window.shift)).toBe(0)
  expect(errors).toEqual([])
  await close()
})

test('what can\'t wait runs with the page, beside what can', async () => {
  const { page } = await open('/lazy-early')
  await page.waitForFunction(() => document.title === 'titled')
  expect(await claimed(page, '.auto')).toBe(true)
  expect(await page.evaluate(() => document.activeElement.className)).toBe('auto')
  expect(await claimed(page, '.tap')).toBe(false)
  await page.click('.tap')
  await page.waitForFunction(() => document.querySelector('.tap').textContent === 'beside: 1')
  await page.close()
})

test('a CSP that blocks the capture script: islands stop waiting, so nothing is left dead', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.route('**/lazy', async r => {
    const res = await r.fetch()
    await r.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': "script-src 'self' 'unsafe-eval'" } })
  })
  await page.goto(url + '/lazy')
  await page.waitForFunction(() => window.__weft?.hydrated, null, { timeout: 15_000 })
  await page.waitForFunction(() => { const t = document.querySelector('.tap'); return !t.hasAttribute('wk') || t.$k })
  await page.click('.tap[data-id=one]')
  expect(await page.textContent('.tap[data-id=one]')).toBe('one: 1')
  await context.close()
})

test('the capture script comes before anything else that runs, and says when a page can\'t wait', async () => {
  const lazy = await (await fetch(url + '/lazy')).text()
  expect(lazy.indexOf('__wq')).toBeGreaterThan(0)
  expect(lazy.indexOf('__wq')).toBeLessThan(lazy.indexOf('type="module"'))
  expect(lazy).toMatch(/\}\)\(0\)<\/script>/)
  expect(await (await fetch(url + '/islands')).text()).toMatch(/\}\)\(1\)<\/script>/)
})

test('an island inside a client page is just a component: its children are claimed, not added', async () => {
  const { page, errors } = await open('/mixed')
  await settled(page)
  expect(await page.$$eval('.mixed-link', a => a.map(x => x.getAttribute('href')))).toEqual(['#one', '#two', '#three'])
  expect(await page.$$eval('.pair-link', a => a.map(x => x.getAttribute('href')))).toEqual(['#alone'])
  expect(await page.$$eval('.pair-b', b => b.length)).toBe(1)
  expect(await page.$$eval('.rail[data-ready]', r => r.length)).toBe(2)
  expect(await page.evaluate(() => window.__weft)).toEqual({ misses: 0, writes: 0, hydrated: true })
  expect((await count(page)).comments.filter(c => /^\/?ws/.test(c))).toEqual([])
  expect(errors).toEqual([])
  await page.close()
})

test('a route change on a phone-sized CPU does not ask for a fade at all', async () => {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 })
    window.__fades = 0
    document.startViewTransition = fn => {
      window.__fades++
      const done = Promise.resolve().then(fn)
      return { ready: done, updateCallbackDone: done }
    }
  })
  const page = await context.newPage()
  await page.goto(url + '/about')
  await page.waitForFunction(() => window.__weft?.hydrated, null, { timeout: 15_000 })
  await page.evaluate(() => { const a = Object.assign(document.createElement('a'), { href: '/islands' }); document.body.append(a); a.click() })
  await page.waitForURL('**/islands')
  expect(await page.evaluate(() => window.__fades)).toBe(0)
  await context.close()
})

test('a route fade that was slow to start is not asked for again', async () => {
  const { page, errors } = await open('/about')
  await page.evaluate(() => {
    window.__fades = 0
    document.startViewTransition = fn => {
      window.__fades++
      const done = Promise.resolve().then(fn)
      return { ready: done.then(() => new Promise(r => setTimeout(r, 150))), updateCallbackDone: done }
    }
  })
  const go = async href => {
    await page.evaluate(h => { window.__link = Object.assign(document.createElement('a'), { href: h }); document.body.append(window.__link); window.__link.click() }, href)
    await page.waitForURL('**' + href)
    await page.waitForTimeout(250)
  }
  await go('/islands')
  await go('/about')
  await go('/islands')
  expect(await page.evaluate(() => window.__fades)).toBe(1)
  expect(errors).toEqual([])
  await page.close()
})
