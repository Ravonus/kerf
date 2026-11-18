import { randomUUID } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { out, type serve } from './build.setup'

function diagnostics(chunks: string[]) {
  return chunks
    .join('')
    .split('\n')
    .filter((line) => line.startsWith('{') && line.endsWith('}'))
    .map((line) => JSON.parse(line))
}

export function registerProductionRecovery(getServer: () => Awaited<ReturnType<typeof serve>>) {
  test('a built error page has the response and log reference and recovers without private details', async () => {
    const server = getServer()
    const browser = await chromium.launch()
    try {
      const tab = await browser.newPage({ reducedMotion: 'reduce' })
      const path = '/recover/loader?token=' + randomUUID()
      const response = (await tab.goto(server.url + path))!
      expect(response.status()).toBe(500)
      const header = await response.headerValue('x-kerf-error')
      expect(header).toMatch(/^[a-f0-9]{24}$/)
      expect(await tab.locator('#error-reference').textContent()).toBe(header)
      const records = diagnostics(server.logs)
      expect(records.filter((d) => d.reference === header)).toEqual([
        expect.objectContaining({
          code: 'E_ROUTE',
          message: expect.stringContaining('internal recovery fixture fault'),
        }),
      ])
      const html = await response.text()
      expect(html).not.toContain('internal recovery fixture fault')
      expect(html).not.toContain('"stack"')
      await tab.waitForFunction(() => window.__kerf?.hydrated)
      await tab.locator('#recovery-count').click()
      await tab.locator('#retry-route').click()
      await tab.getByRole('heading', { name: 'Ready 2' }).waitFor()
      expect(await tab.locator('#recovery-count').textContent()).toBe('Count 1')
    } finally {
      await browser.close()
    }
  })

  test('a built route chunk retries through the emitted module URL', async () => {
    const browser = await chromium.launch()
    try {
      const tab = await browser.newPage({ reducedMotion: 'reduce' })
      const server = getServer()
      const assets = join(out('node'), 'public/assets')
      const chunk = readdirSync(assets).find(
        (file) =>
          file.endsWith('.js') && readFileSync(join(assets, file), 'utf8').includes('reload-data'),
      )
      expect(chunk).toBeTruthy()
      const target = '/recover/chunk?token=' + randomUUID()
      let fresh = false
      await tab.route(
        (url) => decodeURIComponent(url.pathname) === '/assets/' + chunk,
        (route) => {
          if (new URL(route.request().url()).searchParams.has('kerf-retry')) {
            fresh = true
            return route.continue()
          }
          return route.abort()
        },
      )
      await tab.goto(server.url + '/')
      await tab.waitForFunction(() => window.__kerf?.hydrated)
      await tab.evaluate(() => {
        document.body.dataset.sameDocument = 'yes'
      })
      await tab.evaluate((path) => {
        const a = document.createElement('a')
        a.href = path
        document.body.append(a)
        a.click()
        a.remove()
      }, target)
      await tab.locator('#error-reference').waitFor()
      await tab.locator('#retry-route').click()
      await tab.getByRole('heading', { name: 'Ready 2', exact: true }).waitFor()
      expect(fresh).toBe(true)
      expect(await tab.locator('body').getAttribute('data-same-document')).toBe('yes')
    } finally {
      await browser.close()
    }
  })
}
