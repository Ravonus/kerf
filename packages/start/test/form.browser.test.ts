// `<Form>` and cookie state in Chrome (research 29): a form hydrates 0/0, a submit stays in the page with its pending
// state and focus on the first invalid field, a 422 page hydrates as it was rendered, and it works with JS off. A
// cookie box renders on the server, hydrates 0/0 and the choice survives a reload.
import { createRequire } from 'node:module'
import { inject } from 'vitest'
import type * as Playwright from 'playwright-core'

declare global {
  interface Window {
    __same: boolean
  }
}

const url = inject('url')
const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
let browser: Playwright.Browser
beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(async () => {
  await browser?.close()
})

async function open(path: string, options?: Parameters<Playwright.Browser['newContext']>[0]) {
  const context = await browser.newContext(options)
  const page = await context.newPage()
  const errors: string[] = []
  const posts: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : undefined))
  page.on('request', (r) =>
    r.method() === 'POST'
      ? posts.push(new URL(r.url()).pathname.replace(/\.[0-9a-f]{6}$/, ''))
      : undefined,
  )
  await page.goto(url + path)
  if (!!options?.javaScriptEnabled || options?.javaScriptEnabled !== false)
    await page.waitForFunction(() => window.__kerf?.hydrated, null, { timeout: 15_000 })
  return { page, errors, posts, context }
}

const unique = (name: string) => `${name} ${Math.random().toString(36).slice(2, 8)}`

test('a page with a form hydrates 0/0', async () => {
  const { page, errors, context } = await open('/notes')
  expect(await page.evaluate(() => window.__kerf)).toEqual({ misses: 0, writes: 0, hydrated: true })
  expect(errors).toEqual([])
  await context.close()
})

test('a submit stays in the page: pending, the refreshed list, the reset fields, no page load', async () => {
  const { page, errors, posts, context } = await open('/notes')
  await page.evaluate(() => (window.__same = true))
  await page.route('**/_kerf/fn/**', async (r) => {
    await new Promise((ok) => {
      setTimeout(ok, 200)
    })
    await r.continue()
  })
  const title = unique('Typed')
  await page.fill('input[name=title]', title)
  await page.fill('input[name=qty]', '4')
  await page.click('.note-form button')
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLButtonElement>('.note-form button')!.disabled &&
      document.querySelector('.note-form')!.getAttribute('aria-busy') === 'true',
  )
  expect(await page.textContent('.note-form button')).toBe('Saving')
  await page.waitForFunction(
    (t) => document.querySelector('ul.notes')!.textContent.includes(t),
    title,
  )
  expect(await page.textContent('ul.notes')).toContain(`${title} × 4`)
  await page.waitForFunction(
    () => !document.querySelector<HTMLButtonElement>('.note-form button')!.disabled,
  )
  expect(await page.inputValue('input[name=title]')).toBe('')
  expect(await page.evaluate(() => window.__same)).toBe(true)
  expect(posts).toEqual(['/_kerf/fn/addNote'])
  expect(await page.textContent('.note-form output')).toMatch(/^\d+$/)
  expect(errors).toEqual([])
  await context.close()
})

test('field errors show in place, the first invalid field takes focus, and the text stays', async () => {
  const { page, errors, context } = await open('/notes')
  await page.fill('input[name=title]', 'x')
  await page.fill('input[name=qty]', '2')
  await page.click('.note-form button')
  await page.waitForSelector('input[name=title][aria-invalid=true]')
  expect(await page.textContent('.title-error')).toBe('Title is too short')
  expect(await page.textContent('.qty-error')).toBe('')
  expect(await page.evaluate(() => (document.activeElement as HTMLInputElement).name)).toBe('title')
  expect(await page.inputValue('input[name=title]')).toBe('x')
  await page.fill('input[name=title]', 'taken')
  await page.click('.note-form button')
  await page.waitForFunction(
    () => document.querySelector('.title-error')!.textContent === 'Already taken',
  )
  await page.fill('input[name=title]', 'Fine now')
  await page.click('.note-form button')
  await page.waitForFunction(
    () => !document.querySelector('input[name=title]')!.hasAttribute('aria-invalid'),
  )
  expect(await page.textContent('.title-error')).toBe('')
  expect(errors.filter((e) => !/422/.test(e))).toEqual([]) // the browser logs the failed fetch
  await context.close()
})

test('a failed submit with no field keeps the form usable, with the message', async () => {
  const { page, context } = await open('/notes')
  await page.fill('input[name=title]', 'boom')
  await page.fill('input[name=qty]', '2')
  await page.click('.note-form button')
  await page.waitForFunction(() => document.querySelector('.message')!.textContent !== '')
  expect(await page.textContent('.message')).toContain('kaboom')
  await context.close()
})

test('the 422 page hydrates as it was rendered, then submits in place', async () => {
  const { page, errors, posts, context } = await open('/notes')
  // Submit before the client takes over: a native POST, as a page that hasn't hydrated yet sends.
  await page.evaluate(() => {
    const f = document.querySelector<HTMLFormElement>('.note-form')!
    f.querySelector<HTMLInputElement>('[name=title]')!.value = 'x'
    f.querySelector<HTMLInputElement>('[name=qty]')!.value = '1'
    HTMLFormElement.prototype.submit.call(f)
  })
  await page.waitForFunction(
    () => document.querySelector('.title-error')?.textContent && window.__kerf?.hydrated,
    null,
    { timeout: 15_000 },
  )
  expect(await page.evaluate(() => window.__kerf)).toEqual({ misses: 0, writes: 0, hydrated: true })
  expect(await page.inputValue('input[name=title]')).toBe('x')
  expect(await page.$('#kerf-form')).toBeNull()
  posts.length = 0
  await page.fill('input[name=title]', unique('Recovered'))
  await page.click('.note-form button')
  await page.waitForFunction(() => document.querySelector('.title-error')!.textContent === '')
  expect(posts).toEqual(['/_kerf/fn/addNote'])
  expect(errors.filter((e) => !/422/.test(e))).toEqual([])
  await context.close()
})

test('with JS off, the whole form works', async () => {
  const { page, context } = await open('/notes', { javaScriptEnabled: false })
  await page.fill('input[name=title]', 'x')
  await page.fill('input[name=qty]', '1')
  await Promise.all([page.waitForNavigation(), page.click('.note-form button')])
  expect(await page.textContent('.title-error')).toBe('Title is too short')
  expect(await page.inputValue('input[name=title]')).toBe('x')
  const title = unique('NoJS')
  await page.fill('input[name=title]', title)
  await Promise.all([page.waitForNavigation(), page.click('.note-form button')])
  expect(await page.textContent('ul.notes')).toContain(title)
  expect(await page.inputValue('input[name=title]')).toBe('')
  await context.close()
})

test('a cookie box: server-rendered, hydrated 0/0, and it survives a reload', async () => {
  const { page, errors, context } = await open('/prefs')
  expect(await page.textContent('.theme')).toBe('light')
  await page.click('.theme')
  await page.waitForFunction(() => document.querySelector('.theme')!.textContent === 'dark')
  await page.waitForFunction(() => document.cookie.includes('kerf.app.prefs.theme'))
  const raw = await (await context.request.get(`${url}/prefs`)).text() // as a crawler with the cookie sees it
  expect(raw).toContain('data-theme="dark"')
  await page.reload()
  await page.waitForFunction(() => window.__kerf?.hydrated)
  expect(await page.evaluate(() => window.__kerf)).toEqual({ misses: 0, writes: 0, hydrated: true })
  expect(await page.textContent('.theme')).toBe('dark')
  expect(errors).toEqual([])
  await context.close()
})

test('an upload with JS stays in the page, over multipart, and hydrates 0/0', async () => {
  const sharp = createRequire(new URL('../../plugin-media/package.json', import.meta.url))('sharp')
  const bytes = await sharp({
    create: { width: 200, height: 100, channels: 3, background: { r: 20, g: 90, b: 180 } },
  })
    .png()
    .toBuffer()
  const { page, errors, posts, context } = await open('/cover')
  expect(await page.evaluate(() => window.__kerf)).toEqual({ misses: 0, writes: 0, hydrated: true })
  await page.evaluate(() => {
    window.__same = true
  })
  await page.setInputFiles('.cover-form input[type=file]', {
    name: 'blue.png',
    mimeType: 'image/png',
    buffer: bytes,
  })
  await page.click('.cover-form button')
  await page.waitForFunction(() =>
    document.querySelector('main img')?.getAttribute('srcset')?.includes('/_kerf/m/'),
  )
  expect(await page.evaluate(() => window.__same)).toBe(true)
  expect(posts.at(-1)).toMatch(/^\/_kerf\/fn\//)
  expect(errors).toEqual([])
  await context.close()
})

test('a refused upload shows its field error, in the page', async () => {
  const { page, context } = await open('/cover')
  await page.setInputFiles('.cover-form input[type=file]', {
    name: 'x.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  })
  await page.click('.cover-form button')
  await page.waitForFunction(() =>
    document.querySelector('.cover-form')?.textContent.includes("isn't an image"),
  )
  await context.close()
})
