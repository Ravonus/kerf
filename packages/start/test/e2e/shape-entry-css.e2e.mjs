import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'vite'
import { tokens } from '../../../core/vite/config-plugins.mjs'
import { entryCss } from '../../src/vite/shape-entry-css.mjs'
import { shapeCssSources } from '../../src/vite/route-modules.mjs'
import { shapeHotUpdate } from '../../src/vite.mjs'
import { load as moduleLoad } from '../../src/vite/module-hooks.mjs'

async function project(t, plugins = []) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'kerf-entry-closure-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = (name) => join(root, name)
  const write = (name, code) => writeFileSync(file(name), code)
  mkdirSync(file('.kerf/tokens'), { recursive: true })
  write('.kerf/tokens/veneer.css', ':root { --size: 4px }')
  write('entry.js', "import './a.css'; import './nested.js'; import './b.css'; throw Error('run')")
  write(
    'nested.js',
    `
    import './nested.css'; import './entry.js'; import 'kerf:tokens/veneer';
    export { value } from './deep.js'; import('./dynamic.js');
  `,
  )
  write('deep.js', "import './deep.css'; import './bad.server.js'; export const value = 1")
  write('bad.server.js', "import './server.css'; throw Error('server ran')")
  write('dynamic.js', "import './dynamic.css'; throw Error('dynamic ran')")
  for (const name of ['a', 'b', 'nested', 'deep', 'server', 'dynamic']) write(`${name}.css`, '')
  write('page.tsx', 'export default () => <main />')
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [...plugins, tokens()],
    server: { middlewareMode: true },
    appType: 'custom',
  })
  const ctx = {
    environment: { config: { consumer: 'client' } },
    resolve: (...args) => server.environments.client.pluginContainer.resolveId(...args),
  }
  return { root, file, write, server, ctx }
}

void test('entry closure follows static CSS in order through cycles without running JS', async (t) => {
  const p = await project(t)
  try {
    const result = await entryCss(p.ctx, p.file('entry.js'), p.root)
    assert.deepEqual(result.styles, [
      p.file('a.css'),
      p.file('nested.css'),
      p.file('.kerf/tokens/veneer.css'),
      p.file('deep.css'),
      p.file('b.css'),
    ])
    assert.deepEqual(
      [...result.signatures.keys()],
      [p.file('entry.js'), p.file('nested.js'), p.file('deep.js')],
    )
    const state = {
      root: p.root,
      abs: p.file,
      clientEntry: () => p.file('entry.js'),
      manifest: { layouts: [], routes: [{ id: '/', file: 'page.tsx', kind: 'page' }] },
      hydration: () => undefined,
    }
    const source = await moduleLoad(state).handler.call(p.ctx, '\0virtual:kerf/routes')
    let before = -1
    for (const css of result.styles) {
      const index = source.indexOf(JSON.stringify(`${css}?inline`))
      assert.ok(index > before, `missing or reordered ${css}`)
      before = index
    }
    assert.ok(!source.includes('server.css?inline'))
    assert.ok(!source.includes('dynamic.css?inline'))
    assert.deepEqual(
      [...state.shapeEntrySignatures.keys()],
      [p.file('entry.js'), p.file('nested.js'), p.file('deep.js'), p.file('page.tsx')],
    )
  } finally {
    await p.server.close()
  }
})

void test('changed nested entry imports invalidate metadata but other edits do not', async (t) => {
  const p = await project(t)
  try {
    const result = await entryCss(p.ctx, p.file('entry.js'), p.root)
    const calls = []
    const graph = {
      getModuleById: () => 'routes',
      invalidateModule: (value) => calls.push(value),
    }
    const state = {
      root: p.root,
      manifest: { routes: [], layouts: [] },
      shapeEntrySignatures: result.signatures,
      vite: { ws: { send: (value) => calls.push(value) } },
    }
    const handler = shapeHotUpdate(state, new Map(), () => ['existing'])
    const context = { environment: { config: { consumer: 'client' }, moduleGraph: graph } }
    p.write('deep.js', "import './deep.css'; import './bad.server.js'; export const value = 2")
    assert.deepEqual(await handler.call(context, { file: p.file('deep.js') }), ['existing'])
    assert.deepEqual(calls, [])
    p.write('deep.js', "import css from './deep.css'; export const value = 2")
    assert.deepEqual(await handler.call(context, { file: p.file('deep.js') }), [])
    assert.deepEqual(calls, ['routes', { type: 'full-reload' }])
    calls.length = 0
    p.write('deep.js', "import './changed.css'; export const value = 2")
    assert.deepEqual(await handler.call(context, { file: p.file('deep.js') }), [])
    assert.deepEqual(calls, ['routes', { type: 'full-reload' }])
  } finally {
    await p.server.close()
  }
})

void test('relative CSS uses Vite redirects and rejects external, virtual and JS results', async (t) => {
  const redirect = {
    name: 'css-resolution-test',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './alias.css') return join(dirname(importer), 'theme.css')
      if (source === './external.css')
        return { id: 'https://example.com/theme.css', external: true }
      if (source === './virtual.css') return '\0virtual:theme'
      if (source === './script.css') return join(dirname(importer), 'unsafe.js')
    },
  }
  const p = await project(t, [redirect])
  try {
    p.write('theme.css', '.target { width: 5px }')
    p.write('unsafe.js', "throw Error('JS must not run')")
    mkdirSync(p.file('inner'))
    p.write('inner/entry.js', "import '../theme.css'")
    const imports = `
      import './alias.css'; import './external.css';
      import './virtual.css'; import './script.css'; import './absent.css';
    `
    p.write('entry.js', `${imports} import './nested.js'`)
    p.write('nested.js', `${imports} export const value = 1`)
    p.write('page.tsx', `${imports} export default () => <main />`)
    assert.deepEqual(await shapeCssSources(p.ctx, p.file('page.tsx')), [p.file('theme.css')])
    assert.deepEqual(await shapeCssSources(p.ctx, p.file('inner/entry.js')), [p.file('theme.css')])
    const result = await entryCss(p.ctx, p.file('entry.js'), p.root)
    assert.deepEqual(result.styles, [p.file('theme.css')])
    assert.deepEqual([...result.signatures.keys()], [p.file('entry.js'), p.file('nested.js')])
  } finally {
    await p.server.close()
  }
})
