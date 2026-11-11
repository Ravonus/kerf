import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'vite'
import { shapeHotUpdate } from '../../src/vite.mjs'
import { load as moduleLoad } from '../../src/vite/module-hooks.mjs'

async function setup(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'kerf-entry-watch-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = (name) => join(root, name)
  writeFileSync(
    file('entry.js'),
    `
    import './nested/late'; import './nested/later.css';
    import './alias.css'; import './external.css';
    throw Error('entry must not run');
  `,
  )
  writeFileSync(file('page.tsx'), 'export default () => <main />')
  writeFileSync(file('redirect.css'), '.redirect { width: 8px }')
  writeFileSync(file('other.js'), 'export const x = 1')
  const state = {
    root,
    abs: file,
    dev: true,
    clientEntry: () => file('entry.js'),
    manifest: { layouts: [], routes: [{ id: '/', file: 'page.tsx', kind: 'page' }] },
    hydration: () => undefined,
  }
  const events = []
  const hot = shapeHotUpdate(state, new Map(), () => undefined)
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
    plugins: [
      {
        name: 'entry-watch-test',
        enforce: 'pre',
        resolveId(spec) {
          if (spec === './alias.css') return file('redirect.css')
          if (spec === './external.css') return { id: 'https://example.com/a.css', external: true }
        },
        configureServer(dev) {
          state.vite = dev
        },
        async hotUpdate(update) {
          const result = await hot.call(this, update)
          if (this.environment.config.consumer === 'client')
            events.push({
              file: update.file,
              type: update.type,
              invalidated: Array.isArray(result),
            })
          return result
        },
      },
    ],
  })
  const ctx = {
    environment: { config: { consumer: 'client' } },
    resolve: (...args) => server.environments.client.pluginContainer.resolveId(...args),
  }
  const refresh = () => moduleLoad(state).handler.call(ctx, '\0virtual:kerf/routes')
  return { root, file, state, events, server, refresh }
}

async function waitFor(condition, label, events) {
  const end = Date.now() + 5000
  while (!condition()) {
    if (Date.now() > end) assert.fail(`Waiting for ${label}: ${JSON.stringify(events)}`)
    await new Promise((done) => {
      setTimeout(done, 25)
    })
  }
}

function event(events, file, type, from) {
  return events.slice(from).find((item) => item.file === file && item.type === type)
}

async function cssTextInManifest(p, source) {
  let code = source.replace(
    /^import \* as shape(\d+) from .+$/gm,
    (_, index) => `const shape${index} = { 'default$shape': function Shape() {} }`,
  )
  for (const match of source.matchAll(/^import style(\d+) from (.+)$/gm)) {
    const [, index, specifier] = match
    const url = '/' + relative(p.root, JSON.parse(specifier))
    const output = await p.server.environments.client.transformRequest(url)
    assert.ok(output?.code, url)
    const module = await import(`data:text/javascript,${encodeURIComponent(output.code)}`)
    code = code.replace(match[0], `const style${index} = ${JSON.stringify(module.default)}`)
  }
  const manifest = await import(`data:text/javascript,${encodeURIComponent(code)}`)
  return manifest.shapes['/'].cssText
}

void test('Vite watcher refreshes missing entry imports and drops removed edges', async (t) => {
  const p = await setup(t)
  try {
    const initial = await p.refresh()
    assert.ok(initial.includes(JSON.stringify(`${p.file('redirect.css')}?inline`)))
    assert.ok(!initial.includes('external.css?inline'))
    assert.ok(!initial.includes('https://example.com/a.css'))
    await waitFor(
      () => (p.server.watcher.getWatched()[p.root] ?? []).includes('other.js'),
      'watcher',
      p.events,
    )
    let from = p.events.length
    writeFileSync(p.file('other.js'), 'export const x = 2')
    await waitFor(() => event(p.events, p.file('other.js'), 'update', from), 'unrelated', p.events)
    assert.equal(event(p.events, p.file('other.js'), 'update', from).invalidated, false)
    mkdirSync(p.file('nested'))
    from = p.events.length
    writeFileSync(p.file('nested/late.js'), "import './module.css'; throw Error('never run')")
    await waitFor(
      () => event(p.events, p.file('nested/late.js'), 'create', from),
      'module',
      p.events,
    )
    assert.equal(event(p.events, p.file('nested/late.js'), 'create', from).invalidated, true)
    await p.refresh()
    from = p.events.length
    writeFileSync(p.file('nested/later.css'), '.x { height: 5px }')
    const cssChange = () =>
      event(p.events, p.file('nested/later.css'), 'create', from) ??
      event(p.events, p.file('nested/later.css'), 'update', from)
    await waitFor(cssChange, 'css', p.events)
    assert.equal(cssChange().invalidated, true)
    const afterCss = await p.refresh()
    assert.ok(afterCss.includes(JSON.stringify(`${p.file('nested/later.css')}?inline`)))
    assert.ok(afterCss.includes(JSON.stringify(`${p.file('redirect.css')}?inline`)))
    assert.ok(!afterCss.includes('external.css?inline'))
    assert.ok(afterCss.includes("cssStatus: 'partial'"))
    const css = await p.server.environments.client.transformRequest('/nested/later.css?inline')
    assert.ok(css?.code.includes('height: 5px'), css?.code)
    assert.ok((await cssTextInManifest(p, afterCss)).some((text) => text.includes('height: 5px')))
    from = p.events.length
    unlinkSync(p.file('nested/later.css'))
    await waitFor(
      () => event(p.events, p.file('nested/later.css'), 'delete', from),
      'delete',
      p.events,
    )
    assert.equal(event(p.events, p.file('nested/later.css'), 'delete', from).invalidated, true)
    assert.ok(!(await p.refresh()).includes(JSON.stringify(`${p.file('nested/later.css')}?inline`)))
    from = p.events.length
    writeFileSync(p.file('nested/later.css'), '.x { height: 6px }')
    await waitFor(cssChange, 'recreate', p.events)
    assert.equal(cssChange().invalidated, true)
    const afterRecreate = await p.refresh()
    assert.ok(afterRecreate.includes(JSON.stringify(`${p.file('nested/later.css')}?inline`)))
    const recreated = await p.server.environments.client.transformRequest(
      '/nested/later.css?inline',
    )
    assert.ok(recreated?.code.includes('height: 6px'), recreated?.code)
    assert.ok((await cssTextInManifest(p, afterRecreate)).some((s) => s.includes('height: 6px')))
    from = p.events.length
    writeFileSync(p.file('entry.js'), 'export const x = 1')
    await waitFor(
      () => event(p.events, p.file('entry.js'), 'update', from),
      'remove import',
      p.events,
    )
    assert.equal(event(p.events, p.file('entry.js'), 'update', from).invalidated, true)
    await p.refresh()
    from = p.events.length
    writeFileSync(p.file('nested/late.js'), 'export const x = 2')
    await waitFor(
      () => event(p.events, p.file('nested/late.js'), 'update', from),
      'removed',
      p.events,
    )
    assert.equal(event(p.events, p.file('nested/late.js'), 'update', from).invalidated, false)
    from = p.events.length
    unlinkSync(p.file('nested/later.css'))
    await waitFor(
      () => event(p.events, p.file('nested/later.css'), 'delete', from),
      'removed CSS',
      p.events,
    )
    assert.equal(event(p.events, p.file('nested/later.css'), 'delete', from).invalidated, false)
  } finally {
    await p.server.close()
  }
})
