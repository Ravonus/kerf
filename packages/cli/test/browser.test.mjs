// `weft browser` end to end: a Vite dev server with the weft() plugin, a headless Chrome as a plain host page (no
// automation library), and every command relayed through the dev server to @weft-js/core/agent in the page.
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import weft from '@weft-js/core/vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { browser, cliParams } from '../src/browser/commands.mjs'
import { findChrome } from '../src/browser/client.mjs'

const evals = fileURLToPath(new URL('../../../evals/', import.meta.url))
const tmpRoot = fileURLToPath(new URL('./.tmp/', import.meta.url))

describe('cli words', () => {
  it('parse targets, actions and expectations', () => {
    expect(cliParams('act', ['button', 'Add Banana', 'click'], {})).toEqual({ target: { role: 'button', name: 'Add Banana' }, action: 'click', value: undefined })
    expect(cliParams('act', ['@e5', 'fill', 'SAVE10'], {})).toEqual({ target: '@e5', action: 'fill', value: 'SAVE10' })
    expect(cliParams('act', ['label', 'Coupon', 'type', 'x'], {})).toEqual({ target: { label: 'Coupon' }, action: 'type', value: 'x' })
    expect(cliParams('assert', ['status', '-', 'text', 'Total $4'], {})).toMatchObject({ target: { role: 'status' }, expect: { text: 'Total $4' } })
    expect(cliParams('assert', ['listitem', '-', 'count', '6'], {})).toMatchObject({ expect: { count: 6 } })
    expect(cliParams('set', ['Cart.qty', '3'], {})).toEqual({ name: 'Cart.qty', value: 3 })
    expect(() => cliParams('act', ['button', 'x', 'smash'], {})).toThrow(/unknown action smash/)
  })
})

const chrome = findChrome()

// Drives a real browser, and CI machines and containers may not have Chrome.
describe.skipIf(!chrome)('weft browser against the v3 shop under `vite`', () => {
  let root, server
  const run = (cmd, p) => browser(root, cmd, p)

  beforeAll(async () => {
    mkdirSync(tmpRoot, { recursive: true })
    root = mkdtempSync(join(tmpRoot, 'shop-'))
    cpSync(join(evals, 'reference-v3/weft/src'), join(root, 'src'), { recursive: true })
    cpSync(join(evals, 'tasks-v3/shop/starter/weft/index.html'), join(root, 'index.html'))
    writeFileSync(join(root, 'package.json'), '{ "type": "module", "private": true }')
    server = await createServer({ root, configFile: false, logLevel: 'silent', plugins: [weft()], server: { port: 0, strictPort: false } })
    await server.listen()
    await new Promise(r => { setTimeout(r, 100) }) // .weft/dev.json is written on 'listening'
    await run('launch', { route: '/' })
  }, 60_000)

  afterAll(async () => {
    await run('close').catch(() => {})
    await server?.close()
  })

  it('snapshots roles, names and refs, plus the graph with real names', async () => {
    expect((await run('assert', { target: { role: 'list', name: 'Products' }, expect: { visible: true }, timeout: 5000 })).ok).toBe(true)
    const s = await run('snapshot', {})
    expect(s.tree).toMatch(/- button "Add Banana" \[ref=e\d+\]/)
    expect(s.tree).toMatch(/- button "Add Yogurt" \[disabled\] \[ref=e\d+\]/)
    expect(s.graph).toMatch(/^App\.count = 0 ← App\.cart/m)
    expect(s.graph).toMatch(/^ProductList\.shown = .* ← App\.filters, App\.products/m)
  })

  it('acts, asserts and writes state by name', async () => {
    const r = await run('act', { target: { role: 'button', name: 'Add Banana' }, action: 'click' })
    expect(r.changes).toContain('+ - text: Only 2 left')
    expect(await run('assert', { target: { role: 'button', name: 'Cart (1)' }, expect: { visible: true } })).toMatchObject({ ok: true })
    expect(await run('assert', { target: { role: 'button', name: 'Cart (9)' }, expect: { visible: true }, timeout: 100 })).toMatchObject({ ok: false })
    await run('set', { name: 'App.tab', value: 'cart' })
    expect(await run('assert', { target: { role: 'list', name: 'Cart' }, expect: { visible: true } })).toMatchObject({ ok: true })
    await run('set', { name: 'App.tab', value: 'products' })
  })

  it('pauses the clock from page load: nothing loads until time advances', async () => {
    await run('time', { op: 'pause', reload: true })
    await new Promise(r => { setTimeout(r, 1500) })
    expect(await run('time', { op: 'status' })).toMatchObject({ installed: true })
    expect(await run('assert', { target: { role: 'list', name: 'Products' }, expect: { absent: true }, timeout: 100 })).toMatchObject({ ok: true })
    await run('time', { op: 'advance', ms: 300 })
    expect(await run('assert', { target: { role: 'list', name: 'Products' }, expect: { visible: true }, timeout: 100 })).toMatchObject({ ok: true })
    await run('time', { op: 'resume' })
  }, 30_000)

  it('takes the page offline and back', async () => {
    expect(await run('net', { op: 'offline' })).toMatchObject({ online: false })
    expect(await run('net', { op: 'online' })).toMatchObject({ online: true })
  })

  it('records a session into a @weft-js/core/test test', async () => {
    await run('record', { op: 'start' })
    await run('act', { target: { role: 'button', name: 'Add Milk' }, action: 'click' })
    await run('assert', { target: { role: 'button', name: 'Add Milk' }, expect: { enabled: true } })
    const { code, asserts } = await run('record', { op: 'code', component: 'App', from: './App', props: '{ api: createFakeApi() }', imports: ["import { createFakeApi } from './api'"] })
    expect(asserts).toBe(1)
    expect(code).toContain('await user.click(await screen.findByRole("button", { name: "Add Milk" }))')
    expect(code).toContain('expect((screen.getByRole("button", { name: "Add Milk" }) as HTMLButtonElement).disabled).toBe(false)')
  })

  it('screenshots the launched page', async () => {
    const { path } = await run('screenshot', {})
    expect(path).toMatch(/\.png$/)
  })
})
