// Zero layout shift, measured in Chrome (research 31 §9): a phone-width 20-row feed under `<Boundary pending="shape">`.
// CLS is the browser's own layout-shift entries; `moved` is how far the element after the feed went at the swap.
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer as listen, type AddressInfo } from 'node:net'
import type * as Playwright from 'playwright-core'

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dev } from '../src/app.mjs'

declare global {
  interface Window {
    __cls: number
    __rec: MutationRecord[]
  }
}

const { chromium } = createRequire(import.meta.url)('playwright-core') as typeof Playwright
const root = fileURLToPath(new URL('./fixtures/shapes', import.meta.url))
let browser: Playwright.Browser
let server: Awaited<ReturnType<typeof dev>>
let url: string
beforeAll(async () => {
  server = await dev({
    root,
    site: { name: 'Shapes', url: 'https://shapes.dev' },
    port: 0,
    logLevel: 'error',
  })
  url = server.resolvedUrls!.local[0]!.replace(/\/$/, '')
  browser = await chromium.launch()
})
afterAll(async () => {
  await browser?.close()
  await server?.close()
})

async function open(path: string) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const logs: string[] = []
  page.on('pageerror', (e) => logs.push(e.message))
  page.on('console', (m) =>
    ['error', 'warning'].includes(m.type()) ? logs.push(m.text()) : undefined,
  )
  await page.route('**/_kerf/fn/**', async (r) => {
    await new Promise((ok) => {
      setTimeout(ok, 400)
    })
    await r.continue()
  })
  await page.goto(url + path)
  await page.waitForFunction(() => window.__kerf?.hydrated, null, { timeout: 30_000 })
  await page.evaluate(() => {
    window.__cls = 0
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        window.__cls += (e as PerformanceEntry & { value: number }).value
    }).observe({ type: 'layout-shift' })
  })
  return { page, logs }
}

/** Click, wait for the pending view, then the content: the shift, how far `#after` moved, and the DOM writes. */
async function swap(page: Playwright.Page, button: string, pendingSelector: string) {
  await page.click(button)
  await page.waitForTimeout(60) // the click's own mount: not a shift, and the browser doesn't count it as one
  await page.evaluate(() => {
    window.__cls = 0
  })
  await page.waitForFunction((s) => {
    const e = document.querySelector(s)
    return e && getComputedStyle(e).visibility === 'visible'
  }, pendingSelector)
  await page.waitForTimeout(50) // layout-shift entries arrive a frame late
  const before = await page.evaluate(() => {
    const shown = window.__cls
    window.__cls = 0
    window.__rec = []
    window.__mo?.disconnect()
    window.__mo = new MutationObserver((r) => window.__rec.push(...r))
    window.__mo.observe(document.querySelector('main')!, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    })
    return { shown, top: document.getElementById('after')!.getBoundingClientRect().top }
  })
  await page.waitForFunction(
    () => document.querySelector('.post') && !document.querySelector('[data-skeleton], .bars'),
    null,
    { timeout: 15_000 },
  )
  await page.waitForTimeout(100)
  const after = await page.evaluate(() => ({
    cls: window.__cls,
    top: document.getElementById('after')!.getBoundingClientRect().top,
    writes: window.__rec.length + window.__mo.takeRecords().length,
  }))
  return {
    cls: after.cls,
    moved: Math.abs(after.top - before.top),
    writes: after.writes,
    shownCls: before.shown,
  }
}

const pendingShape = '[data-scope="skeleton-scope"] [data-skeleton]'
const clear = async (page: Playwright.Page) => {
  await page.click('#off')
  await page.waitForFunction(() => !document.querySelector('.feed'))
}

test('naive bars shift the page: the baseline', async () => {
  const { page } = await open('/naive')
  const r = await swap(page, '#one', '.bars')
  process.stdout.write(`shape: naive ${JSON.stringify(r)}\n`)
  expect(r.moved).toBeGreaterThan(100)
  // Showing the bars and then the content both shift; on a busy machine the bars' entry can land before the count
  // starts, so the baseline counts the whole swap.
  expect(r.shownCls + r.cls).toBeGreaterThan(0)
  await page.close()
})

test('nothing seen: the schema skeleton swaps with no layout shift in the viewport', async () => {
  const { page, logs } = await open('/')
  const r = await swap(page, '#one', pendingShape)
  process.stdout.write(`shape: schema ${JSON.stringify(r)}\n`)
  expect(r.cls).toBe(0)
  expect(r.shownCls).toBe(0)
  expect(await page.$$eval('.post', (l) => l.length)).toBe(20)
  expect(logs.filter((l) => /X03[26]/.test(l))).toEqual([])
  await page.close()
})

test('last seen, same payload: nothing moves, and the swap is one replacement', async () => {
  const { page, logs } = await open('/')
  await swap(page, '#one', pendingShape)
  await clear(page)
  const r = await swap(page, '#same', pendingShape)
  process.stdout.write(`shape: last-seen ${JSON.stringify(r)}\n`)
  expect(r.cls).toBe(0)
  expect(r.shownCls).toBe(0)
  expect(r.moved).toBe(0)
  expect(r.writes).toBe(2) // the skeleton out, the feed in
  expect(logs.filter((l) => /X031/.test(l)).length).toBeLessThanOrEqual(1) // the schema's first pass, not the last-seen one
  await page.close()
})

test('last seen, another payload: the viewport still holds', async () => {
  const { page } = await open('/')
  await swap(page, '#one', pendingShape)
  await clear(page)
  const r = await swap(page, '#other', pendingShape)
  process.stdout.write(`shape: other payload ${JSON.stringify(r)}\n`)
  expect(r.cls).toBe(0)
  await page.close()
})

test('a streamed fallback is the variant, and it hydrates with no misses or writes', async () => {
  const html = await (await fetch(url + '/streamed')).text()
  expect(html).toContain('data-skeleton') // the fallback went first…
  expect(html).toContain('skeleton-scope')
  const { page, logs } = await open('/streamed')
  expect(await page.evaluate(() => window.__kerf)).toMatchObject({
    misses: 0,
    writes: 0,
    hydrated: true,
  })
  await page.waitForFunction(
    () => document.querySelector('.post') && !document.querySelector('[data-skeleton]'),
  ) // …and the content replaced it
  expect(await page.$$eval('[data-skeleton]', (l) => l.length)).toBe(0)
  expect(await page.$$eval('.post', (l) => l.length)).toBe(3)
  expect(logs).toEqual([])
  await page.close()
})

test('a production build: the schema stays on the server, the stub carries its shape, and nothing moves', async () => {
  const output = join(root, '.output-test')
  const opts = JSON.stringify({
    root,
    site: { name: 'Shapes', url: 'https://shapes.dev' },
    preset: 'node',
    nitro: { output: { dir: output } },
    logLevel: 'error',
  })
  const r = spawnSync(process.execPath, [join(import.meta.dirname, 'build-app.mjs'), opts], {
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production', KERF_BUILD: '1' },
  })
  expect(r.status, r.stderr).toBe(0)
  const public_ = join(output, 'public')
  const js = readdirSync(public_, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.js'))
    .map((f) => readFileSync(join(public_, f), 'utf8'))
    .join('\n')
  expect(js).toContain('$of')
  expect(js).not.toContain('ZodError')

  const port = await new Promise<number>((ok) => {
    const s = listen().listen(0, () => {
      const free = (s.address() as AddressInfo).port
      s.close(() => ok(free))
    })
  })
  const child = spawn(process.execPath, [join(output, 'server/index.mjs')], {
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port) },
    stdio: 'ignore',
  })
  try {
    for (
      const t0 = Date.now();
      !(await fetch(`http://localhost:${port}/`).then(
        () => true,
        () => false,
      ));
      await new Promise((ok) => {
        setTimeout(ok, 100)
      })
    )
      if (Date.now() - t0 > 20_000) throw new Error('the server did not listen')
    const was = url
    url = `http://localhost:${port}`
    const { page, logs } = await open('/')
    url = was
    const first = await swap(page, '#one', pendingShape)
    await clear(page)
    const again = await swap(page, '#same', pendingShape)
    process.stdout.write(`shape: production ${JSON.stringify({ first, again })}\n`)
    expect([first.cls, first.shownCls, again.cls, again.shownCls, again.moved]).toEqual([
      0, 0, 0, 0, 0,
    ])
    expect(logs).toEqual([])
    await page.close()
  } finally {
    child.kill()
    rmSync(output, { recursive: true, force: true })
  }
}, 120_000)
