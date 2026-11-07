import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'vite'
import { tokens } from '../../../core/vite/config-plugins.mjs'
import { shapeHotUpdate } from '../../src/vite.mjs'
import { load as moduleLoad } from '../../src/vite/module-hooks.mjs'

async function project(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'weft-level-css-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = (name) => join(root, name)
  const write = (name, source) => writeFileSync(file(name), source)
  mkdirSync(file('.weft/tokens'), { recursive: true })
  write('.weft/tokens/warp.css', ':root { --size: 4px }')
  for (const name of [
    'shared',
    'global',
    'layout',
    'first',
    'component',
    'last',
    'server',
    'unrelated',
    'changed',
  ])
    write(`${name}.css`, '')
  write('entry.js', "import './shared.css'; import './global.css'; throw Error('entry')")
  write('layout.tsx', "import './layout.css'; export default () => <main />")
  write(
    'page.tsx',
    `
    import './first.css'; import { Component } from '@local';
    import './secret.server.js'; import './last.css';
    export default () => <main><Component /></main>;
  `,
  )
  write(
    'component.js',
    `
    import './component.css'; import './shared.css'; import 'weft:tokens/warp';
    import './page.tsx'; export function Component() { throw Error('component') }
  `,
  )
  write('secret.server.js', "import './server.css'; throw Error('server')")
  write('unrelated.js', "import './unrelated.css'; throw Error('unrelated')")
  write('disabled.tsx', "import './disabled.css'; export const skeleton = false")
  write('custom.tsx', "import './custom.css'; export const skeleton = Widget")
  const events = []
  let hot
  const plugin = {
    name: 'level-watch-test',
    enforce: 'pre',
    resolveId(spec) {
      if (spec === './disabled.css' || spec === './custom.css') throw new Error('unavailable style')
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
    resolve: { alias: [{ find: '@local', replacement: file('component.js') }] },
    plugins: [plugin, tokens()],
  })
  const plan = { statics: new Set([file('page.tsx')]), islands: [] }
  const state = {
    root,
    abs: file,
    clientEntry: () => file('entry.js'),
    hydration: async () => plan,
    manifest: {
      layouts: [{ id: 'layout', file: 'layout.tsx' }],
      routes: [
        { id: '/', file: 'page.tsx', kind: 'page', pattern: '/', layouts: ['layout'] },
        { id: '/disabled', file: 'disabled.tsx', kind: 'page' },
        { id: '/custom', file: 'custom.tsx', kind: 'page' },
      ],
    },
    vite: server,
  }
  hot = shapeHotUpdate(state, new Map(), async () => undefined)
  const ctx = {
    environment: { config: { consumer: 'client' } },
    resolve: (...args) => server.environments.client.pluginContainer.resolveId(...args),
  }
  const refresh = () => moduleLoad(state).handler.call(ctx, '\0virtual:weft/routes')
  return { root, file, write, state, server, events, refresh }
}

async function inspect(source) {
  const shapes = source.replace(
    /^import \* as shape(\d+) from .+$/gm,
    (_, index) => `const shape${index} = { 'default$shape': function Shape() {} }`,
  )
  const code = shapes.replace(
    /^import style(\d+) from (.+)$/gm,
    (_, index, spec) => `const style${index} = ${JSON.stringify(JSON.parse(spec))}`,
  )
  return import(`data:text/javascript,${encodeURIComponent(code)}`)
}

test('generated levels include ordered nested styles without loading routes', async (t) => {
  const p = await project(t)
  try {
    const source = await p.refresh()
    const manifest = await inspect(source)
    assert.deepEqual(
      manifest.shapes['/'].cssText,
      [
        p.file('shared.css'),
        p.file('global.css'),
        p.file('first.css'),
        p.file('component.css'),
        p.file('.weft/tokens/warp.css'),
        p.file('last.css'),
      ].map((path) => `${path}?inline`),
    )
    assert.deepEqual(
      manifest.shapes.layout.cssText,
      [p.file('shared.css'), p.file('global.css'), p.file('layout.css')].map(
        (path) => `${path}?inline`,
      ),
    )
    assert.equal(manifest.shapes['/'].cssStatus, 'partial')
    assert.equal(manifest.shapes['/disabled'].kind, 'disabled')
    assert.equal(manifest.shapes['/custom'].kind, 'unavailable')
    const pageRequest = JSON.stringify(`${p.file('page.tsx')}?weft-assets`)
    assert.ok(source.includes(`() => import(${pageRequest})`))
    assert.ok(!source.includes('server.css?inline'))
    assert.ok(!source.includes('unrelated.css?inline'))
    assert.ok(p.state.shapeEntrySignatures.has(p.file('component.js')))
  } finally {
    await p.server.close()
  }
})

test('a real component edit refreshes its level stylesheet metadata', async (t) => {
  const p = await project(t)
  try {
    await p.refresh()
    const until = async (condition) => {
      const deadline = Date.now() + 5000
      while (!condition()) {
        if (Date.now() > deadline) assert.fail(`watcher timed out: ${JSON.stringify(p.events)}`)
        await new Promise((done) => setTimeout(done, 25))
      }
    }
    await until(() => (p.server.watcher.getWatched()[p.root] ?? []).includes('component.js'))
    p.write('component.js', "import './changed.css'; export function Component() {}")
    await until(() =>
      p.events.some((e) => e.file === p.file('component.js') && e.type === 'update'),
    )
    const changed = p.events.find((e) => e.file === p.file('component.js') && e.type === 'update')
    assert.equal(changed.invalidated, true)
    const manifest = await inspect(await p.refresh())
    assert.ok(manifest.shapes['/'].cssText.includes(`${p.file('changed.css')}?inline`))
    assert.ok(!manifest.shapes['/'].cssText.includes(`${p.file('component.css')}?inline`))
  } finally {
    await p.server.close()
  }
})
