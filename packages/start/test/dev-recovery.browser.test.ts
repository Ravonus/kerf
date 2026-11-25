import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright-core'
import { expect, test, vi } from 'vitest'
import { prepare } from '../../create-kerf/scripts/hot-checks.mjs'
import { dev } from '../src/app.mjs'

async function fixture(root: string) {
  await mkdir(join(root, 'src/routes'), { recursive: true })
  await mkdir(join(root, 'src/server'))
  await writeFile(join(root, 'package.json'), '{"type":"module"}')
  await writeFile(join(root, 'tsconfig.json'), '{"compilerOptions":{"paths":{"#/*":["./src/*"]}}}')
  await writeFile(
    join(root, 'vite.config.mjs'),
    'export default { envDir: false, server: { host: "127.0.0.1" } }',
  )
  await writeFile(
    join(root, 'src/hooks.server.ts'),
    `export const handle = (request, next) => {
  const url = new URL(request.url)
  if (url.pathname === '/go-hot') return Response.redirect(new URL('/mount/%68ot/?from=%2f', url), 307)
  if (url.pathname !== '/mount/%68ot/') return next()
  url.pathname = '/hot'
  return next(new Request(url, request))
}
`,
  )
  prepare(root)
}

async function prime(tab: Page, address: string, cold = false) {
  tab.setDefaultTimeout(6000)
  // A cold dev server compiles the route and its graph on this first load, alongside the other browser suites; the
  // packed hot-reload gate gives the same first hydration 60 s. Recovery steps below keep the 6 s budget.
  const response = await tab.goto(address, cold ? { timeout: 30_000 } : {})
  expect(response?.status()).toBe(200)
  // Exercise the same counter as the packed gate, since the generated entry has no hydration probe.
  await tab.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>('#c')
    if (button?.textContent === 'one 0') button.click()
    return button?.textContent === 'one 1'
  })
  for (let i = 1; i < 4; i++) await tab.locator('#c').click()
  await tab.locator('#i').fill('hello')
  await tab.locator('#raw').fill('by hand')
  await tab.locator('#i').focus()
  await tab.evaluate(() => {
    document.body.dataset.sameDocument = 'yes'
    document.querySelector<HTMLInputElement>('#i')!.setSelectionRange(2, 2)
    document.querySelector('#box')!.scrollTop = 120
    window.scrollTo({ top: 400, behavior: 'instant' })
  })
  const kept = await stateOf(tab)
  expect(kept).toMatchObject({ counter: 'one 4', typed: 'hello', same: 'yes' })
  return kept
}

const stateOf = (tab: Page) =>
  tab.evaluate(() => ({
    counter: document.querySelector('#c')?.textContent,
    typed: document.querySelector<HTMLInputElement>('#i')?.value,
    raw: document.querySelector<HTMLInputElement>('#raw')?.value,
    focus: document.activeElement?.id,
    caret: document.querySelector<HTMLInputElement>('#i')?.selectionStart,
    box: document.querySelector('#box')?.scrollTop,
    scroll: document.scrollingElement?.scrollTop,
    same: document.body.dataset.sameDocument,
  }))

const renderedAt = (tab: Page) =>
  tab
    .locator('#kerf-route')
    .evaluate((payload) => (JSON.parse(payload.textContent) as { p: string }).p)

test('dev recovers from route syntax errors with the document and its state kept', async () => {
  const root = await mkdtemp(join(import.meta.dirname, 'fixtures', 'hmr-'))
  const connect = Promise.withResolvers<void>()
  let server: Awaited<ReturnType<typeof dev>> | undefined
  let browser: Browser | undefined
  try {
    await fixture(root)
    vi.stubEnv('VITEST', undefined)
    server = await dev({ root, port: 0, logLevel: 'silent' }).finally(() => vi.unstubAllEnvs())
    const local = server.resolvedUrls?.local[0]
    if (!local) throw new Error('The fixture dev server did not bind to loopback')
    const address = new URL('hot', local).href
    browser = await chromium.launch()
    const tab = await browser.newPage()
    const kept = await prime(tab, address, true)
    expect(await renderedAt(tab)).toBe('/hot')
    const file = join(root, 'src/routes/hot.tsx')
    const good = await readFile(file, 'utf8')
    await writeFile(file, good.replace('first', 'second'))
    await tab.getByRole('heading', { name: 'second', exact: true }).waitFor()
    const broken = good.replace('<main>', '<main')
    for (let i = 0; i < 6; i++) {
      await writeFile(file, broken)
      await vi.waitFor(async () => {
        const error = await fetch(address, { headers: { accept: 'application/json' } })
        expect(error.status >= 500 || i % 2).toBeTruthy()
      }, 5000)
      const failing = i === 0 ? await browser.newPage() : undefined
      if (failing) {
        // Start the error page after the repair with all HMR messages missed.
        await failing.routeWebSocket('**', () => {})
        await failing.route('**/@vite/client', async (request) => {
          await connect.promise
          await request.continue()
        })
        const response = await failing.goto(address, { waitUntil: 'commit' })
        expect(response?.status()).toBe(500)
        await failing
          .getByRole('heading', { name: 'This page failed to load' })
          .waitFor({ timeout: 6000 })
        expect(await failing.title()).toBe('This page failed to load')
        expect(await failing.locator('#kerf-route').count()).toBe(0)
      }
      const title = `fixed${i}`
      await writeFile(file, good.replace('first', title))
      await tab.getByRole('heading', { name: title, exact: true }).waitFor()
      await vi.waitFor(
        async () => expect(await (await fetch(address)).text()).toContain(title),
        5000,
      )
      if (failing) {
        connect.resolve()
        await failing.getByRole('heading', { name: title, exact: true }).waitFor({ timeout: 6000 })
        expect(await renderedAt(failing)).toBe('/hot')
        await failing.close()
      }
    }
    expect(await stateOf(tab)).toEqual(kept)

    const rewritten = await browser.newPage()
    const alias = new URL('/mount/%68ot/?from=%2f', address).href
    await prime(rewritten, new URL('/go-hot', address).href)
    expect(rewritten.url()).toBe(alias)
    expect(await renderedAt(rewritten)).toBe('/hot?from=%2f')
    expect(
      await rewritten.evaluate(() => performance.getEntriesByType('navigation')[0]?.name),
    ).toBe(alias)
  } finally {
    connect.resolve()
    try {
      await Promise.all([browser?.close(), server?.close()])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
}, 60_000)
