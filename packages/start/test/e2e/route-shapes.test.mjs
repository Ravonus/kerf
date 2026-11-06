import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { clientRoutes } from '../../src/vite/route-modules.mjs'
import { shapeHotUpdate } from '../../src/vite.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'weft-route-shapes-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (file, source) => writeFileSync(join(root, file), source)
  return { root, write, abs: (file) => join(root, file) }
}

async function manifestModule(source, missing = []) {
  const code = source.replace(/^import \* as shape(\d+) from (.+)$/gm, (_, index, specifier) => {
    const file = JSON.parse(specifier)
    return missing.some((name) => file.endsWith(`${name}?weft-shape`))
      ? `const shape${index} = {}`
      : `const shape${index} = { 'default$shape': function Shape() {} }`
  })
  return import(`data:text/javascript,${encodeURIComponent(code)}`)
}

test('eager shapes keep nested and static route loaders lazy', async (t) => {
  const f = fixture(t)
  for (const file of ['outer.tsx', 'inner.tsx', 'page.tsx', 'missing.tsx'])
    f.write(file, 'throw new Error("route executed"); export default () => <main />')
  const levels = {
    layouts: [
      { id: 'outer', file: 'outer.tsx' },
      { id: 'inner', file: 'inner.tsx' },
    ],
    routes: [
      {
        id: '/page', file: 'page.tsx', kind: 'page', pattern: '/page',
        layouts: ['outer', 'inner'],
      },
      { id: '404', file: 'missing.tsx', kind: '404', layouts: ['outer'] },
    ],
  }
  const source = clientRoutes(levels, f.abs, { statics: new Set([f.abs('page.tsx')]) })
  for (const file of ['outer.tsx', 'inner.tsx', 'page.tsx', 'missing.tsx']) {
    assert.ok(source.includes(JSON.stringify(`${f.abs(file)}?weft-shape`)), file)
    const loader = file === 'page.tsx' ? `${f.abs(file)}?weft-assets` : f.abs(file)
    assert.ok(source.includes(`() => import(${JSON.stringify(loader)})`), file)
  }
  const routes = await manifestModule(source, ['missing.tsx'])
  assert.deepEqual(routes.table[0].layouts, ['outer', 'inner'])
  for (const id of ['outer', 'inner', '/page']) {
    assert.equal(routes.shapes[id].kind, 'generated')
    assert.equal(typeof routes.shapes[id].component, 'function')
    assert.equal(routes.shapes[id].css, null)
    assert.equal(routes.shapes[id].bytes, null)
    assert.equal(typeof routes.load[id], 'function')
  }
  assert.deepEqual(routes.shapes['404'], {
    kind: 'unavailable', reason: 'missing-shape', css: null, bytes: null,
  })
})

test('false exports disable shapes; unknown overrides do not import a route', async (t) => {
  const f = fixture(t)
  f.write('disabled.tsx', 'const off = false as const; export { off as skeleton }')
  f.write('direct.tsx', 'export const skeleton = false')
  f.write('override.tsx', 'export const skeleton = Widget')
  f.write('barrel.tsx', "export * from './other'")
  f.write('plain.ts', 'export default 1')
  const files = ['disabled', 'direct', 'override', 'barrel', 'plain']
  const routes = files.map((name) => ({
    id: name, file: `${name}.${name === 'plain' ? 'ts' : 'tsx'}`, kind: 'page', layouts: [],
  }))
  const source = clientRoutes({ layouts: [], routes }, f.abs)
  assert.ok(!source.includes('?weft-shape'))
  const result = await manifestModule(source)
  for (const id of ['disabled', 'direct']) assert.equal(result.shapes[id].kind, 'disabled')
  for (const id of ['override', 'barrel'])
    assert.equal(result.shapes[id].reason, 'unresolved-export')
  assert.equal(result.shapes.plain.reason, 'unsupported-file')
})

test('metadata edits invalidate and reload only the client route module', async (t) => {
  const f = fixture(t)
  const file = f.abs('page.tsx')
  f.write('page.tsx', 'export const skeleton = false')
  const calls = []
  const mod = {}
  const graph = {
    getModuleById(id) { calls.push(['lookup', id]); return mod },
    invalidateModule(value) { calls.push(['invalidate', value]) },
  }
  const state = {
    root: f.root, manifest: { routes: [{ file: 'page.tsx' }], layouts: [] },
    vite: { ws: { send(message) { calls.push(['send', message]) } } },
  }
  const modes = new Map([['page.tsx', 'disabled']])
  const next = async () => { calls.push(['next']); return ['existing'] }
  const handler = shapeHotUpdate(state, modes, next)
  const client = { environment: { config: { consumer: 'client' }, moduleGraph: graph } }
  assert.deepEqual(await handler.call(client, { file, modules: [] }), ['existing'])
  assert.deepEqual(calls, [['next']])
  calls.length = 0
  f.write('page.tsx', 'export default () => <main />')
  assert.deepEqual(await handler.call(client, { file, modules: [] }), [])
  assert.deepEqual(calls, [
    ['lookup', '\0virtual:weft/routes'], ['invalidate', mod], ['send', { type: 'full-reload' }],
  ])
  calls.length = 0
  const server = { environment: { config: { consumer: 'server' }, moduleGraph: graph } }
  f.write('page.tsx', 'export const skeleton = false')
  assert.deepEqual(await handler.call(server, { file, modules: [] }), ['existing'])
  assert.deepEqual(calls, [['next']])
})
