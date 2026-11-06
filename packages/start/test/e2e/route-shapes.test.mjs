import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'vite'
import { clientRoutes, shapeSignature } from '../../src/vite/route-modules.mjs'
import { shapeHotUpdate } from '../../src/vite.mjs'
import { parse } from '../../src/vite/syntax.mjs'
import { shapeGroupCss } from '../../../core/vite/shape-styles.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'weft-route-shapes-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (file, source) => writeFileSync(join(root, file), source)
  return { root, write, abs: (file) => join(root, file) }
}

async function manifestModule(source, missing = [], groupCss = '') {
  const code = source.replace(/^import \* as shape(\d+) from (.+)$/gm, (_, index, specifier) => {
    const file = JSON.parse(specifier)
    return missing.some((name) => file.endsWith(`${name}?weft-shape`))
      ? `const shape${index} = {}`
      : `const shape${index} = { 'default$shape': function Shape() {}, ` +
        `${JSON.stringify('$weftShapeCss')}: ${JSON.stringify(groupCss)} }`
  })
  const withStyles = code.replace(
    /^import style(\d+) from (.+)$/gm,
    (_, index, specifier) => `const style${index} = ${JSON.stringify(JSON.parse(specifier))}`,
  )
  return import(`data:text/javascript,${encodeURIComponent(withStyles)}`)
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
    assert.deepEqual(routes.shapes[id].cssText, [])
    assert.equal(routes.shapes[id].cssStatus, 'partial')
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
  const modes = new Map([['page.tsx', shapeSignature(file)]])
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


test('direct sizing CSS travels as partial data without importing route code', async (t) => {
  const f = fixture(t)
  f.write('size.css', '.panel { min-height: 12rem }')
  f.write('global.css', '.panel { width: 50vw }')
  f.write('page.tsx', `
    import './size.css'
    import './global.css'
    import './size.css'
    import styles from './private.module.css'
    import './server.js'
    throw new Error('route executed')
    export default () => <main class="panel" />
  `)
  const levels = { layouts: [], routes: [{ id: '/', file: 'page.tsx', kind: 'page' }] }
  const source = clientRoutes(levels, f.abs)
  assert.equal((source.match(/import style\d+ from/g) ?? []).length, 2)
  assert.ok(!source.includes('private.module.css?inline'))
  assert.ok(!source.includes('server.js?inline'))
  const routes = await manifestModule(source)
  assert.deepEqual(routes.shapes['/'].cssText, [
    `${f.abs('size.css')}?inline`, `${f.abs('global.css')}?inline`,
  ])
  assert.equal(routes.shapes['/'].css, null)
  assert.equal(routes.shapes['/'].cssStatus, 'partial')
  assert.equal(routes.shapes['/'].bytes, null)
})

test('Vite transforms an inline CSS request to data without injecting a stylesheet', async (t) => {
  const f = fixture(t)
  f.write('size.css', '.panel { min-height: 12rem }')
  const server = await createServer({
    root: f.root, configFile: false, logLevel: 'silent',
    server: { middlewareMode: true }, appType: 'custom',
  })
  try {
    const output = await server.transformRequest('/size.css?inline')
    assert.ok(output?.code.includes('min-height: 12rem'), output?.code)
    assert.ok(output?.code.includes('export default'), output?.code)
    assert.ok(!output?.code.includes('updateStyle'), output?.code)
  } finally {
    await server.close()
  }
})

test('changing direct stylesheet imports invalidates shape metadata', async (t) => {
  const f = fixture(t)
  const file = f.abs('page.tsx')
  f.write('page.tsx', "import './one.css'; export default () => <main />")
  const modes = new Map([['page.tsx', shapeSignature(file)]])
  const calls = []
  const graph = {
    getModuleById: () => 'routes',
    invalidateModule: (value) => calls.push(value),
  }
  const state = {
    root: f.root, manifest: { routes: [{ file: 'page.tsx' }], layouts: [] },
    vite: { ws: { send: (value) => calls.push(value) } },
  }
  const handler = shapeHotUpdate(state, modes, async () => ['unchanged'])
  const context = { environment: { config: { consumer: 'client' }, moduleGraph: graph } }
  f.write('page.tsx', "import './two.css'; export default () => <main />")
  assert.deepEqual(await handler.call(context, { file, modules: [] }), [])
  assert.deepEqual(calls, ['routes', { type: 'full-reload' }])
})

test('recovered parser errors cannot classify a malformed route', (t) => {
  const f = fixture(t)
  const levels = { layouts: [], routes: [{ id: '/', file: 'page.tsx', kind: 'page' }] }
  for (const source of [
    'export const skeleton = ;',
    'export const skeleton = false; const broken = ;',
    'export default () => <main>',
  ]) {
    f.write('page.tsx', source)
    const parsed = parse(f.abs('page.tsx'), source)
    assert.ok(parsed.errors.length > 0, source)
    assert.throws(() => clientRoutes(levels, f.abs), /page\.tsx.*syntax/i)
    assert.throws(() => shapeSignature(f.abs('page.tsx')), /page\.tsx.*syntax/i)
  }
})

test('malformed edits invalidate metadata and a repaired route recovers', async (t) => {
  const f = fixture(t)
  const file = f.abs('page.tsx')
  f.write('page.tsx', 'export default () => <main />')
  const modes = new Map([['page.tsx', shapeSignature(file)]])
  const calls = []
  const graph = {
    getModuleById: () => 'routes',
    invalidateModule: (value) => calls.push(value),
  }
  const state = {
    root: f.root, manifest: { routes: [{ id: '/', file: 'page.tsx', kind: 'page' }], layouts: [] },
    vite: { ws: { send: (value) => calls.push(value) } },
  }
  const handler = shapeHotUpdate(state, modes, async () => ['unchanged'])
  const context = { environment: { config: { consumer: 'client' }, moduleGraph: graph } }
  f.write('page.tsx', 'export const skeleton = ;')
  assert.deepEqual(await handler.call(context, { file, modules: [] }), [])
  assert.equal(modes.get('page.tsx'), 'invalid')
  assert.deepEqual(calls, ['routes', { type: 'full-reload' }])
  calls.length = 0
  f.write('page.tsx', 'export const skeleton = false')
  assert.deepEqual(await handler.call(context, { file, modules: [] }), [])
  assert.equal(modes.get('page.tsx'), shapeSignature(file))
  assert.deepEqual(calls, ['routes', { type: 'full-reload' }])
  const routes = await manifestModule(clientRoutes(state.manifest, f.abs))
  assert.equal(routes.shapes['/'].kind, 'disabled')
})


test('static group facts produce CSS carried alongside the shape', async (t) => {
  const f = fixture(t)
  f.write('page.tsx', 'export default () => <main />')
  const facts = {
    groups: [{ name: 'card', def: { base: { pad: 'group' } }, line: 1 }],
    groupUses: [{ group: 'card', axes: {}, states: [], part: null, dynamic: false }],
  }
  const css = shapeGroupCss(facts, {}, f.abs('page.tsx'))
  assert.ok(css.includes('[data-g="card"]'), css)
  assert.ok(css.includes('padding'), css)
  assert.equal(shapeGroupCss({ ...facts, groupUses: [] }, {}, f.abs('page.tsx')), '')
  const imported = { '/app/card#card': { name: 'card', def: facts.groups[0].def } }
  assert.equal(shapeGroupCss({ ...facts, groups: [] }, imported, f.abs('page.tsx')), css)
  const manifest = { layouts: [], routes: [{ id: '/', file: 'page.tsx', kind: 'page' }] }
  const routes = await manifestModule(clientRoutes(manifest, f.abs), [], css)
  assert.deepEqual(routes.shapes['/'].cssText, [css])
  assert.equal(routes.shapes['/'].cssStatus, 'partial')
  assert.equal(routes.shapes['/'].css, null)
})
