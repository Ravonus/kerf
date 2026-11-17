import { randomUUID } from 'node:crypto'
import { chromium, type Browser, type Page } from 'playwright-core'
import { inject } from 'vitest'

const url = inject('url')
let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(async () => {
  await browser?.close()
})

function address(kind: string) {
  return '/recover/' + kind + '?token=' + randomUUID()
}

async function open(path: string, options?: Parameters<Browser['newPage']>[0]) {
  const tab = await browser.newPage({ reducedMotion: 'reduce', ...options })
  tab.setDefaultTimeout(6000)
  const response = await tab.goto(url + path, { waitUntil: 'commit' })
  await tab.waitForFunction(() => window.__kerf?.hydrated)
  return { tab, response: response! }
}

async function reference(tab: Page) {
  const ref = tab.locator('#error-reference')
  await ref.waitFor()
  const value = await ref.textContent()
  expect(value).toMatch(/^[a-f0-9]{24}$/)
  return value
}

async function ready(tab: Page, attempt: number) {
  await tab.getByRole('heading', { name: 'Ready ' + attempt, exact: true }).waitFor()
}

async function follow(tab: Page, href: string) {
  await tab.evaluate((path) => {
    const a = document.createElement('a')
    a.href = path
    document.body.append(a)
    a.click()
    a.remove()
  }, href)
}

test('retries a loader once per click and preserves the document, layout counter and subscription', async () => {
  const path = address('loader') + '&fail=2'
  const { tab, response } = await open(path)
  try {
    const first = await reference(tab)
    expect(first).toBe(await response.headerValue('x-kerf-error'))
    await tab.locator('#recovery-count').click()
    await tab.evaluate(() => {
      document.body.dataset.sameDocument = 'yes'
      window.dispatchEvent(new Event('kerf-test-pulse'))
    })
    let requests = 0
    await tab.route('**/_kerf/data/recover/loader?*', async (route) => {
      requests++
      expect(route.request().headers()['if-none-match']).toBeUndefined()
      await new Promise((resolve) => {
        setTimeout(resolve, 200)
      })
      await route.continue()
    })
    const retry = tab.locator('#retry-route')
    const secondResponse = tab.waitForResponse((r) =>
      r.url().includes('/_kerf/data/recover/loader'),
    )
    await retry.evaluate((button: HTMLButtonElement) => {
      button.click()
      button.click()
    })
    await tab.getByRole('button', { name: 'Recovering' }).waitFor()
    const second = await (await secondResponse).headerValue('x-kerf-error')
    await tab.waitForFunction(
      (ref) => document.querySelector('#error-reference')?.textContent === ref,
      second,
    )
    expect(second).not.toBe(first)
    expect(requests).toBe(1)
    await retry.click()
    await ready(tab, 3)
    await tab.evaluate(() => window.dispatchEvent(new Event('kerf-test-pulse')))
    expect(await tab.locator('#recovery-count').textContent()).toBe('Count 1')
    expect(await tab.locator('#recovery-pulses').textContent()).toBe('2')
    expect(await tab.locator('body').getAttribute('data-same-document')).toBe('yes')
    await tab.locator('#reload-data').click()
    await ready(tab, 4)
    expect(requests).toBe(3)
  } finally {
    await tab.close()
  }
})

test('shows an SSR render failure and recovers the outlet', async () => {
  const path = address('render')
  const { tab, response } = await open(path)
  try {
    expect(response.status()).toBe(500)
    const renderedPath = await tab
      .locator('#kerf-route')
      .evaluate((payload) => (JSON.parse(payload.textContent) as { p: string }).p)
    expect(renderedPath).toBe(path)
    expect(await reference(tab)).toBe(await response.headerValue('x-kerf-error'))
    await tab.locator('#retry-route').click()
    await ready(tab, 2)
  } finally {
    await tab.close()
  }
})

test('shows a failed root without the layout and retries in the document', async () => {
  const tab = await browser.newPage({ reducedMotion: 'reduce' })
  tab.setDefaultTimeout(6000)
  const path = address('root') + '&root-fail'
  await tab.route(url + path, (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-recovery-root': '1' } }),
  )
  try {
    await tab.goto(url + path)
    await tab.waitForFunction(() => window.__kerf?.hydrated)
    await reference(tab)
    expect(await tab.locator('.root').count()).toBe(0)
    await tab.evaluate(() => {
      document.body.dataset.sameDocument = 'yes'
    })
    await tab.locator('#retry-route').click()
    await ready(tab, 2)
    expect(await tab.locator('.root').count()).toBe(1)
    expect(await tab.locator('body').getAttribute('data-same-document')).toBe('yes')
  } finally {
    await tab.close()
  }
})

test('uses the navigation failure reference and keeps client render faults in place', async () => {
  const { tab } = await open(address('ok'))
  try {
    await tab.locator('#recovery-count').click()
    const response = tab.waitForResponse((r) => r.url().includes('/_kerf/data/recover/loader'))
    await follow(tab, address('loader'))
    expect(await reference(tab)).toBe(await (await response).headerValue('x-kerf-error'))
    await follow(tab, address('client'))
    await tab.waitForFunction(() =>
      document.querySelector('.error')?.textContent?.includes('internal recovery fixture fault'),
    )
    expect(await reference(tab)).toMatch(/^[a-f0-9]{24}$/)
    await tab.locator('#retry-route').click()
    await ready(tab, 2)
    expect(await tab.locator('#recovery-count').textContent()).toBe('Count 1')
  } finally {
    await tab.close()
  }
})

test.each(['stream', 'boundary'])(
  'uses the header reference after the %s shell flushed',
  async (kind) => {
    const path = address(kind)
    const { tab, response } = await open(path)
    try {
      expect(response.status()).toBe(200)
      await tab.locator('#waiting-for-failure').waitFor()
      await tab.locator('#recovery-count').click()
      const ref = await response.headerValue('x-kerf-error')
      await fetch(url + path.replace('/' + kind + '?', '/release?'))
      const target = tab.locator(kind === 'stream' ? '#error-reference' : '#boundary-reference')
      await target.waitFor()
      expect(await target.textContent()).toBe(ref)
      if (kind === 'stream') {
        const recovered = tab.waitForResponse((res) =>
          res.url().includes('/_kerf/data/recover/stream'),
        )
        await tab.locator('#retry-route').click()
        const payload = await (await recovered).json()
        expect(payload.m.at(-1)?.data).toMatchObject({ attempt: 2 })
        await ready(tab, 2)
      }
      expect(await tab.locator('#recovery-count').textContent()).toBe('Count 1')
    } finally {
      await tab.close()
    }
  },
)
