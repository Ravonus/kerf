// `kerf browser` end to end: a Vite dev server with the kerf() plugin, a headless Chrome as a plain host page (no
// automation library), and every command relayed through the dev server to @kerf-js/core/agent in the page.
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer as httpServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger, createServer } from 'vite'
import kerf from '@kerf-js/core/vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { browser, cliParams } from '../src/browser/commands.mjs'
import { findChrome, launch } from '../src/browser/client.mjs'

const evals = fileURLToPath(new URL('../../../evals/', import.meta.url))
const tmpRoot = fileURLToPath(new URL('./.tmp/', import.meta.url))

describe('cli words', () => {
  it('parse targets, actions and expectations', () => {
    expect(cliParams('act', ['button', 'Add Banana', 'click'], {})).toEqual({
      target: { role: 'button', name: 'Add Banana' },
      action: 'click',
      value: undefined,
    })
    expect(cliParams('act', ['@e5', 'fill', 'SAVE10'], {})).toEqual({
      target: '@e5',
      action: 'fill',
      value: 'SAVE10',
    })
    expect(cliParams('act', ['label', 'Coupon', 'type', 'x'], {})).toEqual({
      target: { label: 'Coupon' },
      action: 'type',
      value: 'x',
    })
    expect(cliParams('assert', ['status', '-', 'text', 'Total $4'], {})).toMatchObject({
      target: { role: 'status' },
      expect: { text: 'Total $4' },
    })
    expect(cliParams('assert', ['listitem', '-', 'count', '6'], {})).toMatchObject({
      expect: { count: 6 },
    })
    expect(cliParams('set', ['Cart.qty', '3'], {})).toEqual({ name: 'Cart.qty', value: 3 })
    expect(() => cliParams('act', ['button', 'x', 'smash'], {})).toThrow(/unknown action smash/)
  })
})

// These child fixtures use POSIX shell permissions and syntax.
describe.skipIf(process.platform === 'win32')('browser launch failures', () => {
  it('only accepts known launch options', () => {
    const acceptsWrongOption: 'wrong' extends keyof NonNullable<Parameters<typeof launch>[2]>
      ? true
      : false = false
    expect(acceptsWrongOption).toBe(false)
  })
  it.each([
    ['bad executable', 'not an executable', false, 0, /spawn:/],
    [
      'early exit',
      '#!/bin/sh\necho launch-failed >&2\nexit 7\n',
      true,
      0,
      /exit: 7.*launch-failed/s,
    ],
    // The answer waits for the child to have exited, however slowly the machine spawns it.
    ['exit during request', '#!/bin/sh\ntouch "$0.exited"\nexit 7\n', true, 'exit', /exit: 7/],
  ])(
    '%s reports the child failure and cleans state',
    async (_name, contents, executable, delay, message) => {
      const root = mkdtempSync(join(tmpdir(), 'kerf-launch-'))
      const exe = join(root, 'chrome')
      writeFileSync(exe, contents)
      chmodSync(exe, executable ? 0o755 : 0o644)
      const old = process.env.KERF_CHROME
      process.env.KERF_CHROME = exe
      const server = httpServer((_req, res) => {
        const answer = () => res.end(JSON.stringify({ agent: true, tabs: [] }))
        if (delay !== 'exit') {
          answer()
          return
        }
        const wait = setInterval(() => {
          if (!existsSync(`${exe}.exited`)) return
          clearInterval(wait)
          setTimeout(answer, 50)
        }, 20)
      })
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve)
      })
      try {
        const address = server.address()
        if (!address || typeof address === 'string') throw new Error('no server address')
        await expect(
          launch(root, '/', { url: `http://127.0.0.1:${address.port}` }),
        ).rejects.toThrow(message)
        expect(existsSync(join(root, '.kerf/browser/chrome.json'))).toBe(false)
      } finally {
        if (old === undefined) delete process.env.KERF_CHROME
        else process.env.KERF_CHROME = old
        server.close()
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
})

type Run = (cmd: string, p?: Record<string, unknown>) => ReturnType<typeof browser>

const chrome = findChrome()

// Drives a real browser, and CI machines and containers may not have Chrome.
describe.skipIf(!chrome)('kerf browser against the v3 shop under `vite`', () => {
  let root: string, server: Awaited<ReturnType<typeof createServer>>
  const run: Run = (cmd, p) => browser(root, cmd, p)

  beforeAll(async () => {
    // a cold Chrome on a shared CI runner sometimes takes longer than 15 s to open its first tab
    process.env.KERF_BROWSER_WAIT_MS ??= '45000'
    mkdirSync(tmpRoot, { recursive: true })
    root = mkdtempSync(join(tmpRoot, 'shop-'))
    cpSync(join(evals, 'reference-v3/kerf/src'), join(root, 'src'), { recursive: true })
    cpSync(join(evals, 'tasks-v3/shop/starter/kerf/index.html'), join(root, 'index.html'))
    writeFileSync(join(root, 'package.json'), '{ "type": "module", "private": true }')
    const events: string[] = []
    const record = (event: string) => {
      events.push(event.slice(0, 500))
      if (events.length > 20) events.shift()
    }
    const logger = createLogger()
    logger.info = () => {}
    logger.error = (message) => record(`vite error: ${message}`)
    logger.warn = (message) => record(`vite warning: ${message}`)
    server = await createServer({
      root,
      configFile: false,
      customLogger: logger,
      plugins: [
        {
          name: 'browser-test-evidence',
          configureServer(vite) {
            vite.middlewares.use((req, res, next) => {
              res.on('finish', () => record(`${req.method} ${req.url} ${res.statusCode}`))
              next()
            })
          },
        },
        kerf(),
      ],
      server: { port: 0, strictPort: false },
    })
    await server.listen()
    await new Promise((r) => {
      setTimeout(r, 100)
    }) // .kerf/dev.json is written on 'listening'
    try {
      await run('launch', { route: '/' })
    } catch (error) {
      console.error('browser launch evidence:', {
        chrome,
        address: server.httpServer?.address(),
        wsClients: server.ws.clients.size,
        events,
      })
      throw error
    }
  }, 60_000)

  afterAll(async () => {
    await run('close').catch(() => {})
    await server?.close()
  })
  registerBrowserNavigationTests(run)
  registerBrowserSessionTests(run)
})

function registerBrowserNavigationTests(run: Run) {
  it('snapshots roles, names and refs, plus the graph with real names', async () => {
    expect(
      (
        await run('assert', {
          target: { role: 'list', name: 'Products' },
          expect: { visible: true },
          timeout: 5000,
        })
      ).ok,
    ).toBe(true)
    const s = await run('snapshot', {})
    expect(s.tree).toMatch(/- button "Add Banana" \[ref=e\d+\]/)
    expect(s.tree).toMatch(/- button "Add Yogurt" \[disabled\] \[ref=e\d+\]/)
    expect(s.graph).toMatch(/^App\.count = 0 ← App\.cart/m)
    expect(s.graph).toMatch(/^ProductList\.shown = .* ← App\.filters, App\.products/m)
  })

  it('acts, asserts and writes state by name', async () => {
    const r = await run('act', { target: { role: 'button', name: 'Add Banana' }, action: 'click' })
    expect(r.changes).toContain('+ - text: Only 2 left')
    expect(
      await run('assert', {
        target: { role: 'button', name: 'Cart (1)' },
        expect: { visible: true },
      }),
    ).toMatchObject({ ok: true })
    expect(
      await run('assert', {
        target: { role: 'button', name: 'Cart (9)' },
        expect: { visible: true },
        timeout: 100,
      }),
    ).toMatchObject({ ok: false })
    await run('set', { name: 'App.tab', value: 'cart' })
    expect(
      await run('assert', { target: { role: 'list', name: 'Cart' }, expect: { visible: true } }),
    ).toMatchObject({ ok: true })
    await run('set', { name: 'App.tab', value: 'products' })
  })
}

function registerBrowserSessionTests(run: Run) {
  it('pauses the clock from page load: nothing loads until time advances', async () => {
    await run('time', { op: 'pause', reload: true })
    await new Promise((r) => {
      setTimeout(r, 1500)
    })
    expect(await run('time', { op: 'status' })).toMatchObject({ installed: true })
    expect(
      await run('assert', {
        target: { role: 'list', name: 'Products' },
        expect: { absent: true },
        timeout: 100,
      }),
    ).toMatchObject({ ok: true })
    await run('time', { op: 'advance', ms: 300 })
    expect(
      await run('assert', {
        target: { role: 'list', name: 'Products' },
        expect: { visible: true },
        timeout: 100,
      }),
    ).toMatchObject({ ok: true })
    await run('time', { op: 'resume' })
  }, 30_000)

  it('takes the page offline and back', async () => {
    expect(await run('net', { op: 'offline' })).toMatchObject({ online: false })
    expect(await run('net', { op: 'online' })).toMatchObject({ online: true })
  })

  it('records a session into a @kerf-js/core/test test', async () => {
    await run('record', { op: 'start' })
    await run('act', { target: { role: 'button', name: 'Add Milk' }, action: 'click' })
    await run('assert', { target: { role: 'button', name: 'Add Milk' }, expect: { enabled: true } })
    const { code, asserts } = await run('record', {
      op: 'code',
      component: 'App',
      from: './App',
      props: '{ api: createFakeApi() }',
      imports: ["import { createFakeApi } from './api'"],
    })
    expect(asserts).toBe(1)
    expect(code).toContain(
      'await user.click(await screen.findByRole("button", { name: "Add Milk" }))',
    )
    expect(code).toContain(
      'expect((screen.getByRole("button", { name: "Add Milk" }) as HTMLButtonElement).disabled).toBe(false)',
    )
  })

  it('screenshots the launched page', async () => {
    const { path } = await run('screenshot', {})
    expect(path).toMatch(/\.png$/)
  })
}
