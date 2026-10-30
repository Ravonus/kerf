import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { describe, expect, it } from 'vitest'
import { handle } from '../src/mcp.mjs'
import { bin, fixture, project, spreadBug } from './helpers.mjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Talk to a real `weft mcp` process over stdio. */
function client(root) {
  const child = spawn(process.execPath, [bin, 'mcp', '--root', root], { stdio: ['pipe', 'pipe', 'inherit'] })
  const pending = new Map()
  createInterface({ input: child.stdout }).on('line', line => {
    const msg = JSON.parse(line)
    pending.get(msg.id)?.(msg)
    pending.delete(msg.id)
  })
  let id = 0
  return {
    request: (method, params) =>
      new Promise(done => {
        pending.set(++id, done)
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
      }),
    notify: method => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`),
    close: () => new Promise(done => { child.on('exit', done); child.stdin.end() }),
  }
}

describe('weft mcp (stdio)', () => {
  it('initializes, lists docs/check/tasks and calls each on the reference app', async () => {
    const c = client(fixture)
    const init = await c.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    expect(init.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'weft' } })
    c.notify('notifications/initialized')

    const list = await c.request('tools/list')
    expect(list.result.tools.map(t => t.name)).toEqual(['docs', 'check', 'map', 'tasks', 'style_find', 'style_explain', 'surfaces', 'test_gate', 'browser_tabs', 'browser_launch', 'browser_open', 'browser_snapshot', 'browser_act', 'browser_assert', 'browser_state', 'browser_time', 'browser_net', 'browser_record', 'browser_logs', 'browser_screenshot'])
    for (const t of list.result.tools) expect(t.inputSchema.type).toBe('object')

    const rules = await c.request('tools/call', { name: 'docs', arguments: { topic: 'rules' } })
    expect(rules.result.content[0].text).toContain('State is a box')

    const checked = await c.request('tools/call', { name: 'check', arguments: {} })
    expect(checked.result.isError).toBe(false)
    expect(checked.result.structuredContent).toMatchObject({ ok: true, summary: { files: 6, errors: 0 } })
    expect(JSON.parse(checked.result.content[0].text)).toEqual(checked.result.structuredContent)

    const listed = await c.request('tools/call', { name: 'tasks', arguments: {} })
    expect(listed.result.structuredContent.tasks.map(t => t.name)).toContain('check')

    expect((await c.request('ping')).result).toEqual({})
    await c.close()
  })

  it('check sees the cross-file W014 in a planted copy', async () => {
    const app = readFileSync(join(fixture, 'src/App.tsx'), 'utf8')
    const c = client(project({ 'src/App.tsx': app.replace(...spreadBug) }))
    await c.request('initialize', { protocolVersion: '2025-06-18', capabilities: {} })
    const r = await c.request('tools/call', { name: 'check', arguments: { files: ['src/App.tsx', 'src/components/ProductList.tsx'] } })
    expect(r.result.structuredContent.diagnostics).toMatchObject([{ code: 'W014', severity: 'error', project: true }])
    await c.close()
  })
})

describe('JSON-RPC handling', () => {
  it('negotiates the protocol version and reports errors the MCP way', async () => {
    expect((await handle(fixture, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } })).result.protocolVersion).toBe('2025-11-25')
    expect(await handle(fixture, { jsonrpc: '2.0', method: 'notifications/cancelled' })).toBeUndefined()
    expect((await handle(fixture, { jsonrpc: '2.0', id: 2, method: 'resources/list' })).error.code).toBe(-32601)
    expect((await handle(fixture, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'nope' } })).error.code).toBe(-32602)
    expect((await handle(fixture, { id: 4 })).error.code).toBe(-32600)
    const bad = await handle(fixture, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'docs', arguments: { topic: 'hooks' } } })
    expect(bad.result).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('E_UNKNOWN_TOPIC') }] })
  })
})
