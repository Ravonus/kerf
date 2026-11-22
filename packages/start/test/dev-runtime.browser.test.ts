import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium, type Browser } from 'playwright-core'
import { expect, test, vi } from 'vitest'
import { freePort } from '../../../scripts/lib/helpers.mjs'
import { dev } from '../src/app.mjs'

const ROUTE = `import { z } from 'zod'
import { Counter } from '../counter'
import './home.css'

const Schema = z.object({ label: z.string() })
export const load = () => Schema.parse({ label: 'ready-v1' })

export default function Home(props: { data: { label: string } }) {
  return (
    <main class="home">
      <h1>{Schema.parse(props.data).label}</h1>
      <Counter />
    </main>
  )
}
`

const UPDATED =
  "import { base64url } from 'jose'\n" +
  ROUTE.replace('class="home"', 'class="home" data-marker={base64url.encode("v2")}').replace(
    'ready-v1',
    'ready-v2',
  )

async function fixture(root: string) {
  await mkdir(join(root, 'src/routes'), { recursive: true })
  await Promise.all([
    writeFile(join(root, 'package.json'), '{"type":"module"}'),
    writeFile(join(root, 'src/routes/index.tsx'), ROUTE),
    writeFile(join(root, 'src/routes/home.css'), '.home { color: rgb(12, 34, 56) }'),
    writeFile(
      join(root, 'src/counter.tsx'),
      `import { state } from '@kerf-js/core'
/* @kerf client */
export function Counter() {
  const count = state(0)
  return <button onClick={() => count.value++}>Clicks: {count.value}</button>
}
`,
    ),
    writeFile(
      join(root, 'vite.config.mjs'),
      `export default {
  envDir: false,
  optimizeDeps: { include: ['zod'] },
  server: { host: '0.0.0.0' },
  plugins: [{
    name: 'fixture:slow-client-build-start',
    async buildStart() {
      // Leave time for Nitro's real worker to reach the CSS crawl before the client optimizer starts.
      await new Promise((resolve) => setTimeout(resolve, 1000))
    },
  }],
}
`,
    ),
  ])
}

const deadline = () => AbortSignal.timeout(40_000)

/** Probe the port until it binds. Every HTTP response goes directly to the assertions. */
async function page(url: string, signal: AbortSignal, connecting: boolean) {
  for (;;) {
    let response
    try {
      response = await fetch(url, {
        signal,
        headers: { accept: 'text/html', connection: 'close' },
      })
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code
      if (!connecting || code !== 'ECONNREFUSED') throw error
      await delay(25, undefined, { signal })
      continue
    }
    const html = await response.text()
    expect(response.status, html.slice(0, 300)).toBe(200)
    expect(html).toContain('class="home"')
    expect(html).toContain('href="/src/routes/home.css"')
    return html
  }
}

function burst(url: string, signal: AbortSignal, connecting = false) {
  return Promise.all(Array.from({ length: 16 }, () => page(url, signal, connecting)))
}

async function start(root: string) {
  const port = await freePort()
  const url = `http://127.0.0.1:${port}/`
  const signal = deadline()
  const [server, pages] = await Promise.allSettled([
    dev({ root, port, logLevel: 'error' }),
    burst(url, signal, true),
  ])
  if (server.status === 'rejected') throw server.reason
  try {
    if (pages.status === 'rejected') throw pages.reason
    for (const html of pages.value) expect(html).toContain('ready-v1')
    return { url, server: server.value }
  } catch (error) {
    await server.value.close()
    throw error
  }
}

async function updatedPages(url: string) {
  const signal = deadline()
  for (;;) {
    const pages = await burst(url, signal)
    if (pages.every((html) => html.includes('ready-v2'))) return
    await delay(25, undefined, { signal })
  }
}

async function assertIsland(browser: Browser, url: string) {
  const tab = await browser.newPage()
  const errors: Error[] = []
  tab.on('pageerror', (error) => errors.push(error))
  try {
    expect((await tab.goto(url))?.status()).toBe(200)
    await tab.waitForFunction(() => {
      const counter = document.querySelector('button')
      if (counter?.textContent === 'Clicks: 0') counter.click()
      return counter?.textContent === 'Clicks: 1'
    })
    expect(errors).toEqual([])
  } finally {
    await tab.close()
  }
}

test('kerf dev renders concurrent requests on cold boot, cached boot and forced re-optimization', async () => {
  const root = await mkdtemp(join(import.meta.dirname, 'fixtures', 'ssr-ready-'))
  let server: Awaited<ReturnType<typeof dev>> | undefined
  let browser: Browser | undefined
  try {
    await fixture(root)
    const cold = await start(root)
    server = cold.server
    browser = await chromium.launch()
    await assertIsland(browser, cold.url)
    await server.close()
    server = undefined

    const cached = await start(root)
    server = cached.server
    const { url } = cached
    expect(server.environments.client.depsOptimizer?.metadata.optimized.zod).toBeDefined()

    const route = join(root, 'src/routes/index.tsx')
    await writeFile(route, UPDATED)
    await updatedPages(url)
    const oldOptimizer = server.environments.client.depsOptimizer
    await vi.waitFor(() => expect(oldOptimizer?.metadata.optimized.jose).toBeDefined(), 10_000)

    await server.restart(true)
    const optimizer = server.environments.client.depsOptimizer
    expect(optimizer).not.toBe(oldOptimizer)
    expect(optimizer?.options.force).toBe(true)
    await updatedPages(url)
    await assertIsland(browser, url)

    await writeFile(route, 'export default function Home() { return <main> }')
    await vi.waitFor(async () => {
      const error = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
        headers: { accept: 'application/json' },
      })
      expect(error.status).toBe(500)
      await error.body?.cancel()
    }, 10_000)
  } finally {
    try {
      await Promise.all([browser?.close(), server?.close()])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
}, 100_000)
