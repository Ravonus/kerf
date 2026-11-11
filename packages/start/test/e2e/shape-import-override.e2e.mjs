import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'vite'
import { load as moduleLoad, resolveId as moduleResolve } from '../../src/vite/module-hooks.mjs'
import { shapeHotUpdate } from '../../src/vite.mjs'

async function project(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'kerf-override-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = (name) => join(root, name)
  const write = (name, source) => writeFileSync(file(name), source)
  write('entry.js', '')
  const manifest = { layouts: [], routes: [{ id: '/', file: 'page.tsx', kind: 'page' }] }
  const state = {
    root,
    manifest,
    abs: file,
    clientEntry: () => file('entry.js'),
    hydration: () => undefined,
  }
  const transformed = []
  const plugin = {
    name: 'override-test',
    resolveId: moduleResolve({ id: (id) => `\0${id}` }),
    load: moduleLoad(state),
    transform(code, id) {
      if (!id.includes('shape-override/')) return
      transformed.push(code)
      return 'export default function Skeleton() {}'
    },
  }
  const redirects = {
    name: 'override-redirects',
    resolveId(spec) {
      if (spec === '@waiting') return file('waiting.tsx')
      if (spec === './external.tsx') return { id: file('waiting.tsx'), external: true }
    },
  }
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [redirects, plugin],
    server: { middlewareMode: true },
    appType: 'custom',
  })
  const watched = []
  const context = {
    environment: { config: { consumer: 'client' } },
    resolve: (...args) => server.environments.client.pluginContainer.resolveId(...args),
    addWatchFile: (path) => watched.push(path),
    error: (msg) => {
      throw new Error(msg)
    },
  }
  const load = (id) => moduleLoad(state).handler.call(context, id)
  const routes = () => load('\0virtual:kerf/routes')
  const override = () =>
    load(`\0virtual:kerf/shape-override/${encodeURIComponent(file('page.tsx'))}.tsx`)
  return { root, file, write, state, server, watched, routes, override, transformed }
}

void test('Vite resolves direct default and named overrides without running setup', async (t) => {
  const p = await project(t)
  try {
    for (const [binding, exportSource] of [
      ['Waiting', 'export default () => <div>default marker</div>'],
      ['{ Card as Waiting }', 'export const Card = () => <span>named marker</span>'],
    ]) {
      p.write(
        'page.tsx',
        `import ${binding} from './waiting.tsx';
        throw Error('route setup'); export const skeleton = Waiting`,
      )
      p.write('waiting.tsx', `throw Error('component setup'); ${exportSource}`)
      const source = await p.routes()
      assert.ok(source.includes('virtual:kerf/shape-override/'))
      assert.ok(source.includes(`() => import(${JSON.stringify(p.file('page.tsx'))})`))
      const stubbed = source.replace(
        /^import \* as shape(\d+) from .+$/gm,
        (_, index) => `const shape${index} = { default() {} }`,
      )
      const metadata = await import(`data:text/javascript,${encodeURIComponent(stubbed)}`)
      assert.equal(metadata.shapes['/'].kind, 'override')
      const isolated = await p.override()
      assert.match(isolated, /(?:default|named) marker/)
      assert.doesNotMatch(isolated, /setup|throw/)
      assert.ok(p.watched.includes(p.file('waiting.tsx')))
      assert.ok(p.state.shapeOverrideDependencies.has(p.file('waiting.tsx')))
    }
    p.write(
      'page.tsx',
      `import { Card as Waiting } from '@waiting';
      export const skeleton = Waiting`,
    )
    assert.ok((await p.routes()).includes('virtual:kerf/shape-override/'))
    const request = `virtual:kerf/shape-override/${encodeURIComponent(p.file('page.tsx'))}.tsx`
    const output = await p.server.environments.client.transformRequest(request)
    assert.ok(output.code.includes('function Skeleton'))
    assert.match(p.transformed[0], /named marker/)
    assert.doesNotMatch(p.transformed[0], /setup|throw/)
    const calls = []
    const graph = {
      getModuleById: (id) => (id.includes('shape-override/') ? 'asset' : 'routes'),
      invalidateModule: (id) => calls.push(id),
    }
    const handler = shapeHotUpdate(p.state, new Map(), () => ['unchanged'])
    const ctx = { environment: { config: { consumer: 'client' }, moduleGraph: graph } }
    assert.deepEqual(await handler.call(ctx, { file: p.file('waiting.tsx'), type: 'update' }), [])
    assert.deepEqual(calls, ['asset', 'routes'])
  } finally {
    await p.server.close()
  }
})

void test('unsafe and ambiguous imported sources remain unavailable', async (t) => {
  const p = await project(t)
  try {
    p.write('page.tsx', "import Waiting from './waiting.tsx'; export const skeleton = Waiting")
    for (const source of [
      "export { default } from './other.tsx'",
      'export default () => <div>{danger()}</div>',
      'export default () => { sideEffect(); return <div /> }',
      'export default () => <Widget />',
    ]) {
      p.write('waiting.tsx', source)
      const manifest = await p.routes()
      assert.ok(manifest.includes("reason: 'unresolved-export'"), source)
      assert.ok(!manifest.includes('virtual:kerf/shape-override/'), source)
      await assert.rejects(() => p.override(), /Unsafe or missing/)
    }
    const graph = { getModuleById: () => 'routes', invalidateModule: () => {} }
    const handler = shapeHotUpdate(p.state, new Map(), () => ['unchanged'])
    const ctx = { environment: { config: { consumer: 'client' }, moduleGraph: graph } }
    p.write('waiting.tsx', 'export default () => <div>repaired</div>')
    assert.deepEqual(await handler.call(ctx, { file: p.file('waiting.tsx'), type: 'update' }), [])
    assert.ok((await p.routes()).includes('virtual:kerf/shape-override/'))
    p.write('page.tsx', "import Waiting from './waiting.tsx'; export const skeleton = false")
    assert.ok((await p.routes()).includes("kind: 'disabled'"))
    p.write('page.tsx', "import Waiting from './external.tsx'; export const skeleton = Waiting")
    assert.ok((await p.routes()).includes("reason: 'unresolved-export'"))
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'kerf-outside-')))
    t.after(() => rmSync(outside, { recursive: true, force: true }))
    writeFileSync(join(outside, 'outside.tsx'), 'export default () => <div>outside</div>')
    symlinkSync(join(outside, 'outside.tsx'), p.file('linked.tsx'))
    p.write('page.tsx', "import Waiting from './linked.tsx'; export const skeleton = Waiting")
    assert.ok((await p.routes()).includes("reason: 'unresolved-export'"))
  } finally {
    await p.server.close()
  }
})
