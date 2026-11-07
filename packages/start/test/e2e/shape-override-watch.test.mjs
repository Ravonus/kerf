import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'vite'
import { shapeHotUpdate } from '../../src/vite.mjs'
import { entryWatchLifecycle } from '../../src/vite/shape-entry-css.mjs'
import { load as moduleLoad, resolveId as moduleResolve } from '../../src/vite/module-hooks.mjs'
import { shapeSignature } from '../../src/vite/route-modules.mjs'

async function setup(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'weft-override-watch-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = (name) => join(root, name)
  const write = (name, text) => writeFileSync(file(name), text)
  write('entry.js', '')
  write('page.tsx', "import Waiting from './nested/waiting.tsx'; export const skeleton = Waiting")
  write('other.js', 'export const x = 1')
  const state = {
    root,
    abs: file,
    dev: true,
    clientEntry: () => file('entry.js'),
    manifest: { layouts: [], routes: [{ id: '/', file: 'page.tsx', kind: 'page' }] },
    hydration: async () => undefined,
  }
  const events = []
  const modes = new Map([['page.tsx', shapeSignature(file('page.tsx'))]])
  const hot = shapeHotUpdate(state, modes, async () => undefined)
  const plugin = {
    name: 'override-watch-test',
    enforce: 'pre',
    resolveId: moduleResolve({ id: (id) => `\0${id}` }),
    load: moduleLoad(state),
    configureServer(server) {
      state.vite = server
      entryWatchLifecycle(state, server, modes)
    },
    async hotUpdate(update) {
      const result = await hot.call(this, update)
      if (this.environment.config.consumer === 'client')
        events.push({ file: update.file, type: update.type, invalidated: Array.isArray(result) })
      return result
    },
    transform(code, id) {
      if (id.includes('shape-override/'))
        return (
          `export const marker = ${JSON.stringify(code)}; ` +
          'export default function Skeleton() {}'
        )
    },
  }
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [plugin],
    server: { middlewareMode: true },
    appType: 'custom',
  })
  const ctx = {
    environment: { config: { consumer: 'client' } },
    resolve: (...args) => server.environments.client.pluginContainer.resolveId(...args),
  }
  const refresh = () => moduleLoad(state).handler.call(ctx, '\0virtual:weft/routes')
  const request = `virtual:weft/shape-override/${encodeURIComponent(file('page.tsx'))}.tsx`
  return { root, file, write, state, server, events, refresh, request }
}

async function waitFor(condition, label, events) {
  const end = Date.now() + 5000
  while (!condition()) {
    if (Date.now() > end) assert.fail(`Waiting for ${label}: ${JSON.stringify(events)}`)
    await new Promise((done) => setTimeout(done, 25))
  }
}

async function metadata(source) {
  const stubbed = source.replace(
    /^import \* as shape(\d+) from .+$/gm,
    (_, index) => `const shape${index} = { default() {} }`,
  )
  return (await import(`data:text/javascript,${encodeURIComponent(stubbed)}`)).shapes['/']
}

async function change(p, name, type, action) {
  const from = p.events.length
  action()
  const match = () =>
    p.events
      .slice(from)
      .find(
        (e) =>
          e.file === p.file(name) &&
          (e.type === type || (type === 'create' && e.type === 'update')),
      )
  await waitFor(match, `${type} ${name}`, p.events)
  return match()
}

test('Vite watcher refreshes missing and changing imported overrides', async (t) => {
  const p = await setup(t)
  try {
    assert.equal((await metadata(await p.refresh())).kind, 'unavailable')
    await waitFor(
      () => (p.server.watcher.getWatched()[p.root] ?? []).includes('other.js'),
      'watcher',
      p.events,
    )
    const unrelated = await change(p, 'other.js', 'update', () => p.write('other.js', 'x'))
    assert.equal(unrelated.invalidated, false)
    mkdirSync(p.file('nested'))
    const marker = (word) => `throw Error('setup'); export default () => <div>${word}</div>`
    assert.equal(
      (
        await change(p, 'nested/waiting.tsx', 'create', () =>
          p.write('nested/waiting.tsx', marker('first')),
        )
      ).invalidated,
      true,
    )
    assert.equal((await metadata(await p.refresh())).kind, 'override')
    const first = await p.server.environments.client.transformRequest(p.request)
    assert.match(first.code, /first/)
    assert.doesNotMatch(first.code, /setup/)
    assert.equal(
      (
        await change(p, 'nested/waiting.tsx', 'update', () =>
          p.write('nested/waiting.tsx', marker('second')),
        )
      ).invalidated,
      true,
    )
    assert.equal((await metadata(await p.refresh())).kind, 'override')
    assert.match((await p.server.environments.client.transformRequest(p.request)).code, /second/)
    const unsafe = await change(p, 'nested/waiting.tsx', 'update', () =>
      p.write('nested/waiting.tsx', 'export default () => <div>{danger()}</div>'),
    )
    assert.equal(unsafe.invalidated, true)
    assert.equal((await metadata(await p.refresh())).kind, 'unavailable')
    assert.equal(
      (
        await change(p, 'nested/waiting.tsx', 'delete', () =>
          unlinkSync(p.file('nested/waiting.tsx')),
        )
      ).invalidated,
      true,
    )
    assert.equal((await metadata(await p.refresh())).kind, 'unavailable')
    assert.equal(
      (
        await change(p, 'nested/waiting.tsx', 'create', () =>
          p.write('nested/waiting.tsx', marker('third')),
        )
      ).invalidated,
      true,
    )
    assert.equal((await metadata(await p.refresh())).kind, 'override')
    assert.match((await p.server.environments.client.transformRequest(p.request)).code, /third/)
    assert.equal(
      (
        await change(p, 'page.tsx', 'update', () =>
          p.write('page.tsx', 'export default () => <main />'),
        )
      ).invalidated,
      true,
    )
    await p.refresh()
    assert.equal(
      (
        await change(p, 'nested/waiting.tsx', 'update', () =>
          p.write('nested/waiting.tsx', marker('removed')),
        )
      ).invalidated,
      false,
    )
  } finally {
    await p.server.close()
  }
  assert.equal(p.state.shapeOverrideDependencies, undefined)
  assert.equal(p.state.shapeEntryCandidates, undefined)
})
