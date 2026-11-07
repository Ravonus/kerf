import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'vite'
import { entryCss } from '../../src/vite/shape-entry-css.mjs'
import { shapeHotUpdate } from '../../src/vite.mjs'
import { load as moduleLoad } from '../../src/vite/module-hooks.mjs'

async function project(t) {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'weft-entry-alias-')))
  t.after(() => rmSync(parent, { recursive: true, force: true }))
  const root = join(parent, 'project')
  mkdirSync(root)
  mkdirSync(join(root, 'node_modules', 'evil'), { recursive: true })
  const file = (name) => join(root, name)
  const write = (name, source) => writeFileSync(file(name), source)
  writeFileSync(join(parent, 'outside.js'), "import './outside.css'; throw Error('outside')")
  symlinkSync(join(parent, 'outside.js'), file('escape.js'))
  write('node_modules/evil/package.json', '{"name":"evil","main":"index.js"}')
  write('node_modules/evil/index.js', "import './package.css'; throw Error('package')")
  write('node_modules/evil/package.css', '.package { height: 1px }')
  write('secret.server.js', "import './server.css'; throw Error('server')")
  write('dynamic.js', "import './dynamic.css'; throw Error('dynamic')")
  write('alias.js', "import './alias.css'; import './entry.js'; throw Error('alias')")
  write('bare.js', "import './bare.css'; throw Error('bare')")
  for (const name of [
    'first',
    'alias',
    'bare',
    'last',
    'non-source',
    'outside',
    'server',
    'dynamic',
  ])
    write(`${name}.css`, '')
  write('page.tsx', 'export default () => <main />')
  write(
    'entry.js',
    `
    import './first.css'; import '@local'; import 'bare-local';
    import 'external-js'; import 'virtual-js'; import 'not-source';
    import 'escape-local'; import 'server-local'; import 'evil';
    import './last.css'; import('./dynamic.js'); throw Error('entry');
  `,
  )
  let hot
  const events = []
  const plugin = {
    name: 'bare-local-test',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'bare-local') return file('bare.js')
      if (id === 'escape-local') return file('escape.js')
      if (id === 'server-local') return file('secret.server.js')
      if (id === 'external-js') return { id: 'https://example.com/x.js', external: true }
      if (id === 'virtual-js') return '\0virtual:opaque'
      if (id === 'not-source') return file('non-source.css')
    },
    async hotUpdate(update) {
      if (!hot) return
      const result = await hot.call(this, update)
      if (this.environment.config.consumer === 'client')
        events.push({ file: update.file, type: update.type, invalidated: Array.isArray(result) })
      return result
    },
  }
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: [{ find: '@local', replacement: file('alias.js') }], preserveSymlinks: true },
    plugins: [plugin],
  })
  const ctx = {
    environment: { config: { consumer: 'client' } },
    resolve: (...args) => server.environments.client.pluginContainer.resolveId(...args),
  }
  const watch = (state) => {
    state.vite = server
    hot = shapeHotUpdate(state, new Map(), () => undefined)
  }
  return { root, file, write, server, ctx, events, watch }
}

void test('entry CSS follows resolved local aliases and bare modules only', async (t) => {
  const p = await project(t)
  try {
    const pkg = await p.ctx.resolve('evil', p.file('entry.js'))
    assert.ok(pkg?.id.includes('/node_modules/'), pkg?.id)
    const escaped = await p.ctx.resolve('escape-local', p.file('entry.js'))
    assert.equal(escaped?.id, p.file('escape.js'))
    const result = await entryCss(p.ctx, p.file('entry.js'), p.root)
    assert.deepEqual(result.styles, [
      p.file('first.css'),
      p.file('alias.css'),
      p.file('bare.css'),
      p.file('last.css'),
    ])
    assert.deepEqual(
      [...result.signatures.keys()],
      [p.file('entry.js'), p.file('alias.js'), p.file('bare.js')],
    )
    const state = {
      root: p.root,
      abs: p.file,
      clientEntry: () => p.file('entry.js'),
      manifest: { layouts: [], routes: [{ id: '/', file: 'page.tsx', kind: 'page' }] },
      hydration: () => undefined,
    }
    const source = await moduleLoad(state).handler.call(p.ctx, '\0virtual:weft/routes')
    let before = -1
    for (const css of result.styles) {
      const index = source.indexOf(JSON.stringify(`${css}?inline`))
      assert.ok(index > before, `missing or reordered ${css}`)
      before = index
    }
    assert.ok(!source.includes('package.css?inline'))
    assert.ok(!source.includes('outside.css?inline'))
    assert.ok(!source.includes('server.css?inline'))
    assert.ok(!source.includes('dynamic.css?inline'))
    assert.ok(source.includes("cssStatus: 'partial'"))
  } finally {
    await p.server.close()
  }
})

void test('edits to a resolved alias dependency invalidate entry shape metadata', async (t) => {
  const p = await project(t)
  try {
    const result = await entryCss(p.ctx, p.file('entry.js'), p.root)
    const state = {
      root: p.root,
      manifest: { routes: [], layouts: [] },
      shapeEntrySignatures: result.signatures,
    }
    p.watch(state)
    const until = async (condition) => {
      const deadline = Date.now() + 5000
      while (!condition()) {
        if (Date.now() > deadline) assert.fail(`watcher timed out: ${JSON.stringify(p.events)}`)
        await new Promise((done) => {
          setTimeout(done, 25)
        })
      }
    }
    await until(() => (p.server.watcher.getWatched()[p.root] ?? []).includes('alias.js'))
    p.write('alias.js', "import './changed.css'; throw Error('alias')")
    await until(() => p.events.some((e) => e.file === p.file('alias.js') && e.type === 'update'))
    const changed = p.events.find((e) => e.file === p.file('alias.js') && e.type === 'update')
    assert.equal(changed.invalidated, true)
  } finally {
    await p.server.close()
  }
})
