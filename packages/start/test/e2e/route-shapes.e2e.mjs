import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'vite'
import { clientRoutes, shapeCssSources, shapeSignature } from '../../src/vite/route-modules.mjs'
import { shapeHotUpdate } from '../../src/vite.mjs'
import { load as moduleLoad, resolveId as moduleResolve } from '../../src/vite/module-hooks.mjs'
import { parse } from '../../src/vite/syntax.mjs'
import { shapeGroupCss } from '../../../core/vite/shape-styles.mjs'
import { tokens } from '../../../core/vite/config-plugins.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'kerf-route-shapes-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (file, source) => writeFileSync(join(root, file), source)
  return { root, write, abs: (file) => join(root, file) }
}

async function manifestModule(source, missing = [], groupCss = '') {
  const code = source.replace(/^import \* as shape(\d+) from (.+)$/gm, (_, index, specifier) => {
    const file = JSON.parse(specifier)
    return missing.some((name) => file.endsWith(`${name}?kerf-shape`))
      ? `const shape${index} = {}`
      : `const shape${index} = { default: function Custom() {}, 'default$shape': function Shape() {}, ` +
          `'NotFoundPage$shape': function NotFound() {}, 'ErrorPage$shape': function Error() {}, ` +
          `${JSON.stringify('$kerfShapeCss')}: ${JSON.stringify(groupCss)} }`
  })
  const withStyles = code.replace(
    /^import style(\d+) from (.+)$/gm,
    (_, index, specifier) => `const style${index} = ${JSON.stringify(JSON.parse(specifier))}`,
  )
  return import(`data:text/javascript,${encodeURIComponent(withStyles)}`)
}

void test('eager shapes keep nested and static route loaders lazy', async (t) => {
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
        id: '/page',
        file: 'page.tsx',
        kind: 'page',
        pattern: '/page',
        layouts: ['outer', 'inner'],
      },
      { id: '404', file: 'missing.tsx', kind: '404', layouts: ['outer'] },
    ],
  }
  const source = clientRoutes(levels, f.abs, { statics: new Set([f.abs('page.tsx')]) })
  for (const file of ['outer.tsx', 'inner.tsx', 'page.tsx', 'missing.tsx']) {
    assert.ok(source.includes(JSON.stringify(`${f.abs(file)}?kerf-shape`)), file)
    const loader = file === 'page.tsx' ? `${f.abs(file)}?kerf-assets` : f.abs(file)
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
    kind: 'unavailable',
    reason: 'missing-shape',
    css: null,
    bytes: null,
  })
})

void test('false exports disable shapes; unknown overrides do not import a route', async (t) => {
  const f = fixture(t)
  f.write('disabled.tsx', 'const off = false as const; export { off as skeleton }')
  f.write('direct.tsx', 'export const skeleton = false')
  f.write('override.tsx', 'export const skeleton = Widget')
  f.write('barrel.tsx', "export * from './other'")
  f.write('plain.ts', 'export default 1')
  const files = ['disabled', 'direct', 'override', 'barrel', 'plain']
  const routes = files.map((name) => ({
    id: name,
    file: `${name}.${name === 'plain' ? 'ts' : 'tsx'}`,
    kind: 'page',
    layouts: [],
  }))
  const source = clientRoutes({ layouts: [], routes }, f.abs)
  for (const route of routes) assert.ok(!source.includes(`${f.abs(route.file)}?kerf-shape`))
  const result = await manifestModule(source)
  for (const id of ['disabled', 'direct']) assert.equal(result.shapes[id].kind, 'disabled')
  for (const id of ['override', 'barrel'])
    assert.equal(result.shapes[id].reason, 'unresolved-export')
  assert.equal(result.shapes.plain.reason, 'unsupported-file')
})

void test('built-in error shapes retain nested levels and yield to authored overrides', async (t) => {
  const f = fixture(t)
  f.write('outer.tsx', 'export default () => <main />')
  f.write('inner.tsx', 'export default () => <section />')
  f.write('page.tsx', 'throw Error("route ran"); export default () => <p />')
  f.write('404.tsx', 'export const skeleton = false; export default () => <p />')
  const layouts = [
    { id: 'outer', file: 'outer.tsx' },
    { id: 'inner', file: 'inner.tsx' },
  ]
  const page = {
    id: '/page',
    file: 'page.tsx',
    kind: 'page',
    pattern: '/page',
    layouts: ['outer', 'inner'],
  }
  const source = clientRoutes({ layouts, routes: [page] }, f.abs, undefined, {
    entry: [f.abs('entry.css')],
  })
  assert.equal((source.match(/builtin\.tsx\?kerf-shape/g) ?? []).length, 1)
  assert.ok(source.includes(`() => import(${JSON.stringify(f.abs('page.tsx'))})`))
  const result = await manifestModule(source)
  assert.deepEqual(result.table[0].layouts, ['outer', 'inner'])
  for (const id of ['outer', 'inner', '404', 'error']) {
    assert.equal(result.shapes[id].kind, 'generated')
    assert.equal(result.shapes[id].cssStatus, 'partial')
    assert.deepEqual(result.shapes[id].cssText, [`${f.abs('entry.css')}?inline`])
  }
  assert.equal(result.shapes['404'].component.name, 'NotFound')
  assert.equal(result.shapes.error.component.name, 'Error')
  assert.equal(result.load['404'], undefined)
  const missing = await manifestModule(source, ['builtin.tsx'])
  assert.equal(missing.shapes['404'].reason, 'missing-shape')
  assert.equal(missing.shapes.error.reason, 'missing-shape')
  const override = { id: '404', file: '404.tsx', kind: '404', layouts: ['outer'] }
  const custom = await manifestModule(clientRoutes({ layouts, routes: [page, override] }, f.abs))
  assert.equal(custom.shapes['404'].kind, 'disabled')
  assert.equal(custom.shapes.error.kind, 'generated')
  assert.equal(typeof custom.load['404'], 'function')
  f.write('error.tsx', 'export const skeleton = false; export default () => <p />')
  const error = { id: 'error', file: 'error.tsx', kind: 'error', layouts: ['outer'] }
  const both = clientRoutes({ layouts, routes: [page, override, error] }, f.abs)
  assert.ok(!both.includes('builtin.tsx?kerf-shape'))
  assert.equal((await manifestModule(both)).shapes.error.kind, 'disabled')
})

void test('a static local override is isolated and unsafe closures stay unavailable', async (t) => {
  const f = fixture(t)
  const source = `import { secret } from './private.server';
    const setup = sideEffect();
    const Waiting = () => <section class="waiting"><span>custom marker</span></section>;
    export const skeleton = Waiting;
    export default () => <main>{secret}{setup}</main>`
  f.write('page.tsx', source)
  const levels = { layouts: [], routes: [{ id: '/', file: 'page.tsx', kind: 'page' }] }
  const output = clientRoutes(levels, f.abs)
  const request = `virtual:kerf/shape-override/${encodeURIComponent(f.abs('page.tsx'))}.tsx`
  assert.ok(output.includes(JSON.stringify(request)))
  assert.ok(output.includes(`() => import(${JSON.stringify(f.abs('page.tsx'))})`))
  const watched = []
  const context = {
    addWatchFile: (file) => watched.push(file),
    error: (msg) => {
      throw new Error(msg)
    },
    environment: { config: { consumer: 'client' } },
  }
  const state = { manifest: levels, abs: f.abs }
  const id = moduleResolve({ id: (value) => `\0${value}` }).handler(request)
  const extracted = await moduleLoad(state).handler.call(context, id)
  assert.ok(extracted.includes('custom marker'))
  assert.ok(!extracted.includes('sideEffect'))
  assert.ok(!extracted.includes('private.server'))
  assert.deepEqual(watched, [f.abs('page.tsx')])
  const other = `\0virtual:kerf/shape-override/${encodeURIComponent(f.abs('other.tsx'))}.tsx`
  await assert.rejects(() => moduleLoad(state).handler.call(context, other), /Unknown/)
  const result = await manifestModule(output)
  assert.equal(result.shapes['/'].kind, 'override')
  assert.equal(result.shapes['/'].component.name, 'Custom')
  const before = shapeSignature(f.abs('page.tsx'))
  const invalidated = []
  const graph = { getModuleById: () => 'routes', invalidateModule: (m) => invalidated.push(m) }
  const update = shapeHotUpdate(
    { root: f.root, manifest: levels },
    new Map([['page.tsx', before]]),
    () => ['unchanged'],
  )
  f.write('page.tsx', source.replace('custom marker', 'changed marker'))
  assert.notEqual(shapeSignature(f.abs('page.tsx')), before)
  const hot = { environment: { config: { consumer: 'client' }, moduleGraph: graph } }
  assert.deepEqual(await update.call(hot, { file: f.abs('page.tsx'), modules: [] }), [])
  assert.deepEqual(invalidated, ['routes'])
  for (const expression of [
    '<div>{secret}</div>',
    '<div onClick={sideEffect}>bad</div>',
    '<Widget />',
    '<custom-widget />',
    '<script>bad</script>',
    '<div {...secret} />',
  ]) {
    f.write(
      'page.tsx',
      source.replace('<section class="waiting"><span>custom marker</span></section>', expression),
    )
    const route = await manifestModule(clientRoutes(levels, f.abs))
    assert.equal(route.shapes['/'].kind, 'unavailable', expression)
    await assert.rejects(() => moduleLoad(state).handler.call(context, id), /Unsafe or missing/)
  }
  f.write('page.tsx', "import Waiting from './waiting'; export const skeleton = Waiting")
  assert.equal((await manifestModule(clientRoutes(levels, f.abs))).shapes['/'].kind, 'unavailable')
  f.write(
    'page.tsx',
    'const Waiting = () => { sideEffect(); return <div /> }; export const skeleton = Waiting',
  )
  assert.equal((await manifestModule(clientRoutes(levels, f.abs))).shapes['/'].kind, 'unavailable')
  f.write('page.tsx', 'export const skeleton = false')
  assert.equal((await manifestModule(clientRoutes(levels, f.abs))).shapes['/'].kind, 'disabled')
})

void test('imported custom shape metadata uses the override discriminant', async (t) => {
  const f = fixture(t)
  f.write('page.tsx', "import Waiting from './waiting'; export const skeleton = Waiting")
  const manifest = { layouts: [], routes: [{ id: '/', file: 'page.tsx', kind: 'page' }] }
  const css = { overrides: new Map([[f.abs('page.tsx'), 'validated source']]) }
  const routes = await manifestModule(clientRoutes(manifest, f.abs, undefined, css))
  assert.equal(routes.shapes['/'].kind, 'override')
  assert.equal(routes.shapes['404'].kind, 'generated')
  assert.equal(routes.shapes.error.kind, 'generated')
})

void test('Vite loads the isolated override as TSX through the plugin pipeline', async (t) => {
  const f = fixture(t)
  f.write(
    'page.tsx',
    `const Waiting = () => <div>custom marker</div>;
    export const skeleton = Waiting; throw Error('route setup ran')`,
  )
  const request = `virtual:kerf/shape-override/${encodeURIComponent(f.abs('page.tsx'))}.tsx`
  const seen = []
  const plugin = {
    name: 'shape-override-test',
    resolveId: moduleResolve({ id: (id) => `\0${id}` }),
    load: moduleLoad({ manifest: { layouts: [], routes: [{ file: 'page.tsx' }] }, abs: f.abs }),
    transform(code, id) {
      if (!id.includes('shape-override/')) return
      seen.push(code)
      return 'export default function Skeleton() {}'
    },
  }
  const server = await createServer({
    root: f.root,
    configFile: false,
    logLevel: 'silent',
    plugins: [plugin],
    server: { middlewareMode: true },
    appType: 'custom',
  })
  try {
    const resolved = await server.environments.client.pluginContainer.resolveId(request)
    assert.equal(resolved.id, `\0${request}`)
    const result = await server.environments.client.transformRequest(request)
    assert.ok(result?.code.includes('function Skeleton'))
    assert.equal(seen.length, 1)
    assert.ok(seen[0].includes('custom marker'))
    assert.ok(!seen[0].includes('route setup ran'))
  } finally {
    await server.close()
  }
})

void test('metadata edits invalidate and reload only the client route module', async (t) => {
  const f = fixture(t)
  const file = f.abs('page.tsx')
  f.write('page.tsx', 'export const skeleton = false')
  const calls = []
  const mod = {}
  const graph = {
    getModuleById(id) {
      calls.push(['lookup', id])
      return mod
    },
    invalidateModule(value) {
      calls.push(['invalidate', value])
    },
  }
  const state = {
    root: f.root,
    manifest: { routes: [{ file: 'page.tsx' }], layouts: [] },
    vite: {
      ws: {
        send(message) {
          calls.push(['send', message])
        },
      },
    },
  }
  const modes = new Map([['page.tsx', shapeSignature(file)]])
  const next = () => {
    calls.push(['next'])
    return ['existing']
  }
  const handler = shapeHotUpdate(state, modes, next)
  const client = { environment: { config: { consumer: 'client' }, moduleGraph: graph } }
  assert.deepEqual(await handler.call(client, { file, modules: [] }), ['existing'])
  assert.deepEqual(calls, [['next']])
  calls.length = 0
  f.write('page.tsx', 'export default () => <main />')
  assert.deepEqual(await handler.call(client, { file, modules: [] }), [])
  assert.deepEqual(calls, [
    ['lookup', '\0virtual:kerf/routes'],
    ['invalidate', mod],
    ['send', { type: 'full-reload' }],
  ])
  calls.length = 0
  const server = { environment: { config: { consumer: 'server' }, moduleGraph: graph } }
  f.write('page.tsx', 'export const skeleton = false')
  assert.deepEqual(await handler.call(server, { file, modules: [] }), ['existing'])
  assert.deepEqual(calls, [['next']])
})

void test('direct sizing CSS travels as partial data without importing route code', async (t) => {
  const f = fixture(t)
  f.write('size.css', '.panel { min-height: 12rem }')
  f.write('global.css', '.panel { width: 50vw }')
  f.write(
    'page.tsx',
    `
    import './size.css'
    import './global.css'
    import './size.css'
    import styles from './private.module.css'
    import './server.js'
    throw new Error('route executed')
    export default () => <main class="panel" />
  `,
  )
  const levels = { layouts: [], routes: [{ id: '/', file: 'page.tsx', kind: 'page' }] }
  const ctx = { resolve: (spec) => ({ id: f.abs(spec) }) }
  const levelStyles = await shapeCssSources(ctx, f.abs('page.tsx'))
  const css = { levels: new Map([[f.abs('page.tsx'), levelStyles]]) }
  const source = clientRoutes(levels, f.abs, undefined, css)
  assert.equal((source.match(/import style\d+ from/g) ?? []).length, 2)
  assert.ok(!source.includes('private.module.css?inline'))
  assert.ok(!source.includes('server.js?inline'))
  const routes = await manifestModule(source)
  assert.deepEqual(routes.shapes['/'].cssText, [
    `${f.abs('size.css')}?inline`,
    `${f.abs('global.css')}?inline`,
  ])
  assert.equal(routes.shapes['/'].css, null)
  assert.equal(routes.shapes['/'].cssStatus, 'partial')
  assert.equal(routes.shapes['/'].bytes, null)
})

void test("a build's routes table loads the shapes' stylesheet text when shapeStyles is called", async (t) => {
  const f = fixture(t)
  f.write('page.tsx', 'export default () => <main class="panel" />')
  const levels = { layouts: [], routes: [{ id: '/', file: 'page.tsx', kind: 'page' }] }
  const sheets = [f.abs('entry.css'), f.abs('size.css')]
  const css = {
    entry: [sheets[0]],
    levels: new Map([[f.abs('page.tsx'), [sheets[1]]]]),
    lazy: true,
  }
  const source = clientRoutes(levels, f.abs, undefined, css)
  assert.ok(!/^import style\d+ from/m.test(source))
  assert.ok(!source.includes('import.meta.hot'))
  for (const file of sheets)
    assert.ok(source.includes(`import(${JSON.stringify(`${file}?inline`)})`))
  const code = source.replace(
    /import\(("[^"]+\?inline")\)/g,
    (_, spec) => `Promise.resolve({ default: ${JSON.stringify(`text of ${JSON.parse(spec)}`)} })`,
  )
  const routes = await manifestModule(code)
  assert.deepEqual(routes.shapes['/'].cssText, [undefined, undefined])
  await routes.shapeStyles()
  assert.deepEqual(
    routes.shapes['/'].cssText,
    sheets.map((file) => `text of ${file}?inline`),
  )
})

void test('Vite transforms an inline CSS request to data without injecting a stylesheet', async (t) => {
  const f = fixture(t)
  f.write('size.css', '.panel { min-height: 12rem }')
  const server = await createServer({
    root: f.root,
    configFile: false,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
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

void test('changing direct stylesheet imports invalidates shape metadata', async (t) => {
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
    root: f.root,
    manifest: { routes: [{ file: 'page.tsx' }], layouts: [] },
    vite: { ws: { send: (value) => calls.push(value) } },
  }
  const handler = shapeHotUpdate(state, modes, () => ['unchanged'])
  const context = { environment: { config: { consumer: 'client' }, moduleGraph: graph } }
  f.write('page.tsx', "import './two.css'; export default () => <main />")
  assert.deepEqual(await handler.call(context, { file, modules: [] }), [])
  assert.deepEqual(calls, ['routes', { type: 'full-reload' }])
})

void test('recovered parser errors cannot classify a malformed route', (t) => {
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

void test('a malformed edit takes ordinary HMR, and a repair that changes the shape reloads', async (t) => {
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
    root: f.root,
    manifest: { routes: [{ id: '/', file: 'page.tsx', kind: 'page' }], layouts: [] },
    vite: { ws: { send: (value) => calls.push(value) } },
  }
  const handler = shapeHotUpdate(state, modes, () => ['unchanged'])
  const context = { environment: { config: { consumer: 'client' }, moduleGraph: graph } }
  const before = modes.get('page.tsx')
  // A reload here would leave the tab on the server's error page, where no fix reaches it.
  f.write('page.tsx', 'export const skeleton = ;')
  assert.deepEqual(await handler.call(context, { file, modules: [] }), ['unchanged'])
  assert.equal(modes.get('page.tsx'), before)
  assert.deepEqual(calls, [])
  f.write('page.tsx', 'export const skeleton = false')
  assert.deepEqual(await handler.call(context, { file, modules: [] }), [])
  assert.equal(modes.get('page.tsx'), shapeSignature(file))
  assert.deepEqual(calls, ['routes', { type: 'full-reload' }])
  const routes = await manifestModule(clientRoutes(state.manifest, f.abs))
  assert.equal(routes.shapes['/'].kind, 'disabled')
})

void test('static group facts produce CSS carried alongside the shape', async (t) => {
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

void test('entry and token styles join route shape CSS without running entry code', async (t) => {
  const f = fixture(t)
  f.write(
    'entry.ts',
    `
    import './app.css'
    import 'kerf:tokens/veneer'
    import 'kerf:tokens/missing'
    import '@kit/tokens.css'
    import '@kit/unsafe.css'
    import './entry-runtime.js'
    throw new Error('entry executed')
  `,
  )
  f.write('page.tsx', "import './page.css'; export default () => <main />")
  const token = f.abs('token.css')
  const kit = f.abs('kit.css')
  const calls = []
  const ctx = {
    resolve: (spec) => {
      calls.push(spec)
      if (spec === './app.css') return { id: f.abs('app.css') }
      if (spec === 'kerf:tokens/veneer') return { id: token }
      if (spec === 'kerf:tokens/missing') return { id: '\0kerf:tokens-empty' }
      if (spec === '@kit/tokens.css') return { id: kit }
      if (spec === '@kit/unsafe.css') return { id: f.abs('unsafe.js') }
    },
  }
  const entry = await shapeCssSources(ctx, f.abs('entry.ts'))
  assert.deepEqual(entry, [f.abs('app.css'), token, kit])
  assert.ok(!calls.includes('./entry-runtime.js'))
  const levels = { layouts: [], routes: [{ id: '/', file: 'page.tsx', kind: 'page' }] }
  const styles = new Map([[f.abs('page.tsx'), [token, f.abs('page.css')]]])
  const source = clientRoutes(levels, f.abs, undefined, { entry, levels: styles })
  assert.ok(!source.includes('entry-runtime.js'))
  assert.ok(!source.includes('unsafe.js'))
  const routes = await manifestModule(source)
  assert.deepEqual(routes.shapes['/'].cssText, [
    `${f.abs('app.css')}?inline`,
    `${token}?inline`,
    `${kit}?inline`,
    `${f.abs('page.css')}?inline`,
  ])
  assert.equal(routes.shapes['/'].cssStatus, 'partial')
  assert.equal(routes.shapes['/'].css, null)
  assert.equal(routes.shapes['/'].bytes, null)
})

void test('the token plugin resolves generated token CSS as an inert inline stylesheet', async (t) => {
  const f = fixture(t)
  mkdirSync(join(f.root, '.kerf', 'tokens'), { recursive: true })
  f.write('.kerf/tokens/veneer.css', ':root { --veneer-space-group: 12px }')
  f.write('entry.ts', "import 'kerf:tokens/veneer'")
  const server = await createServer({
    root: f.root,
    configFile: false,
    logLevel: 'silent',
    plugins: [tokens()],
    server: { middlewareMode: true },
    appType: 'custom',
  })
  try {
    const ctx = {
      resolve: (...args) => server.environments.client.pluginContainer.resolveId(...args),
    }
    const styles = await shapeCssSources(ctx, f.abs('entry.ts'))
    assert.equal(styles.length, 1)
    assert.ok(styles[0].endsWith('/.kerf/tokens/veneer.css'), styles[0])
    const output = await server.environments.client.transformRequest(
      '/.kerf/tokens/veneer.css?inline',
    )
    assert.ok(output?.code.includes('--veneer-space-group: 12px'), output?.code)
    assert.ok(output?.code.includes('export default'), output?.code)
    assert.ok(!output?.code.includes('updateStyle'), output?.code)
  } finally {
    await server.close()
  }
})

void test('entry stylesheet import changes invalidate shape metadata', async (t) => {
  const f = fixture(t)
  const file = f.abs('entry.ts')
  f.write('entry.ts', "import './one.css'")
  const modes = new Map([['entry.ts', shapeSignature(file)]])
  const calls = []
  const graph = {
    getModuleById: () => 'routes',
    invalidateModule: (value) => calls.push(value),
  }
  const state = {
    root: f.root,
    manifest: { routes: [], layouts: [] },
    clientEntry: () => file,
    vite: { ws: { send: (value) => calls.push(value) } },
  }
  const handler = shapeHotUpdate(state, modes, () => ['unchanged'])
  const context = { environment: { config: { consumer: 'client' }, moduleGraph: graph } }
  f.write('entry.ts', "import './two.css'")
  assert.deepEqual(await handler.call(context, { file, modules: [] }), [])
  assert.deepEqual(calls, ['routes', { type: 'full-reload' }])
})

void test('client virtual routes collect entry and route styles through the Vite hook', async (t) => {
  const f = fixture(t)
  f.write('entry.ts', "import './app.css'; throw new Error('entry ran')")
  f.write('page.tsx', "import 'kerf:tokens/veneer'; export default () => <main />")
  f.write('disabled.tsx', "import '@bad/disabled.css'; export const skeleton = false")
  const manifest = {
    layouts: [],
    routes: [
      { id: '/', file: 'page.tsx', kind: 'page' },
      { id: '/disabled', file: 'disabled.tsx', kind: 'page' },
    ],
  }
  const state = {
    manifest,
    abs: f.abs,
    clientEntry: () => f.abs('entry.ts'),
    hydration: () => undefined,
  }
  const context = {
    environment: { config: { consumer: 'client' } },
    resolve: (spec) => {
      if (spec === '@bad/disabled.css') throw new Error('disabled CSS was resolved')
      if (spec === './app.css') return { id: f.abs('app.css') }
      return spec === 'kerf:tokens/veneer' ? { id: f.abs('token.css') } : null
    },
  }
  const source = await moduleLoad(state).handler.call(context, '\0virtual:kerf/routes')
  const routes = await manifestModule(source)
  assert.deepEqual(routes.shapes['/'].cssText, [
    `${f.abs('app.css')}?inline`,
    `${f.abs('token.css')}?inline`,
  ])
  assert.equal(routes.shapes['/'].cssStatus, 'partial')
})
