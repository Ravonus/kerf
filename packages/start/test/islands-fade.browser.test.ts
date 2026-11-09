// A route change asks the browser for a fade only where the CPU can afford one.
import { createRequire } from 'node:module'
import { inject } from 'vitest'
import type * as Playwright from 'playwright-core'

declare global {
  interface Window {
    __fades: number
    __link: HTMLAnchorElement
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

async function open(path: string, desktop = false) {
  const page = await browser.newPage()
  if (desktop)
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }),
    )
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) =>
    m.type() === 'error' || m.type() === 'warning' ? errors.push(m.text()) : undefined,
  )
  await page.goto(url + path)
  await page.waitForFunction(() => window.__weft?.hydrated, null, { timeout: 15_000 })
  return { page, errors }
}

test('a route change on a phone-sized CPU does not ask for a fade at all', async () => {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 })
    window.__fades = 0
    ;(
      document as unknown as { startViewTransition: (fn: () => void) => unknown }
    ).startViewTransition = (fn) => {
      window.__fades++
      const done = Promise.resolve().then(fn)
      return { ready: done, updateCallbackDone: done, finished: done }
    }
  })
  const page = await context.newPage()
  await page.goto(url + '/about')
  await page.waitForFunction(() => window.__weft?.hydrated, null, { timeout: 15_000 })
  await page.evaluate(() => {
    const a = Object.assign(document.createElement('a'), { href: '/islands' })
    document.body.append(a)
    a.click()
  })
  await page.waitForURL('**/islands')
  expect(await page.evaluate(() => window.__fades)).toBe(0)
  await context.close()
})

test('a route fade that was slow to start is not asked for again', async () => {
  const { page, errors } = await open('/about', true)
  await page.evaluate(() => {
    window.__fades = 0
    ;(
      document as unknown as { startViewTransition: (fn: () => void) => unknown }
    ).startViewTransition = (fn) => {
      window.__fades++
      const done = Promise.resolve().then(fn)
      return {
        ready: done.then(
          () =>
            new Promise((r) => {
              setTimeout(r, 150)
            }),
        ),
        updateCallbackDone: done,
        finished: done,
      }
    }
  })
  const go = async (href: string) => {
    await page.evaluate((h) => {
      window.__link = Object.assign(document.createElement('a'), { href: h })
      document.body.append(window.__link)
      window.__link.click()
    }, href)
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
