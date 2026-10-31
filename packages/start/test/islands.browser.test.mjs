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
  expect(plan.files.find(f => f.file === 'src/components/islands.tsx').nodes.find(n => n.name === 'Counter').client).toMatch(/onClick/)
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
