import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'vite'
import * as entryStyles from '../../src/vite/shape-entry-css.mjs'
import { load as moduleLoad } from '../../src/vite/module-hooks.mjs'

function fixture(t) {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'weft-entry-boundary-')))
  t.after(() => rmSync(parent, { recursive: true, force: true }))
  const root = join(parent, 'project')
  const outside = join(parent, 'outside')
  mkdirSync(root)
  mkdirSync(outside)
  symlinkSync(outside, join(root, 'link'))
  return { root, outside }
}

test('missing CSS and watches stay within the configured root, including symlinks', async (t) => {
  const { root, outside } = fixture(t)
  const entry = join(root, 'entry.js')
  writeFileSync(entry, "import './nested/a.css'; import '../outside/b.css'; import './link/c.css'")
  const result = await entryStyles.entryCss({ resolve: async () => null }, entry, root)
  assert.ok(result.missing.has(join(root, 'nested/a.css')))
  assert.ok(!result.missing.has(join(outside, 'b.css')))
  assert.ok(!result.missing.has(join(root, 'link/c.css')))
  const watched = []
  const watcher = { add: (path) => watched.push(path), unwatch: () => assert.fail('unwatch') }
  entryStyles.watchEntryCandidates({ watcher }, new Set([
    join(root, 'nested/a.css'), join(outside, 'missing/x.css'), join(root, 'link/missing/x.css'),
  ]), root)
  assert.deepEqual(watched, [root])
})

test('resolved CSS outside the project remains a Vite-controlled stylesheet', async (t) => {
  const { root, outside } = fixture(t)
  const entry = join(root, 'entry.js')
  const css = join(outside, 'shared.css')
  writeFileSync(entry, "import '../outside/shared.css'")
  writeFileSync(css, '.x { width: 3px }')
  const result = await entryStyles.entryCss({ resolve: async () => ({ id: css }) }, entry, root)
  assert.deepEqual(result.styles, [css])
})

test('closing a server clears only its entry state and never unwatches shared paths', async () => {
  const state = {
    shapeEntrySignatures: new Map([['entry', 'signature']]),
    shapeEntryCandidates: new Set(['candidate']), shapeEntryMissing: new Set(['missing']),
  }
  const modes = new Map([['route', 'mode']])
  let closes = 0
  const server = () => ({
    watcher: { unwatch: () => assert.fail('unwatch') },
    async close() { closes++; return 'closed' },
  })
  const old = server()
  const current = server()
  state.vite = old
  entryStyles.entryWatchLifecycle(state, old, modes)
  state.vite = current
  entryStyles.entryWatchLifecycle(state, current, modes)
  assert.equal(await old.close(), 'closed')
  assert.equal(state.shapeEntryCandidates.size, 1)
  assert.equal(modes.size, 1)
  assert.equal(await current.close(), 'closed')
  assert.equal(closes, 2)
  assert.equal(state.shapeEntrySignatures, undefined)
  assert.equal(state.shapeEntryCandidates, undefined)
  assert.equal(state.shapeEntryMissing, undefined)
  assert.equal(state.vite, undefined)
  assert.equal(modes.size, 0)
})


test('an entry scan finishing after server close cannot restore stale state', async (t) => {
  const { root } = fixture(t)
  const entry = join(root, 'entry.js')
  writeFileSync(entry, "import './pending.css'")
  let release
  let started
  const waiting = new Promise((done) => { started = done })
  const pending = new Promise((done) => { release = done })
  const server = { watcher: { add: () => assert.fail('watch after close') }, async close() {} }
  const state = {
    root, abs: (file) => join(root, file), clientEntry: () => entry, dev: true, vite: server,
    manifest: { layouts: [], routes: [] }, hydration: async () => undefined,
  }
  entryStyles.entryWatchLifecycle(state, server, new Map())
  const context = {
    environment: { config: { consumer: 'client' } },
    resolve: () => { started(); return pending },
  }
  const loading = moduleLoad(state).handler.call(context, '\0virtual:weft/routes')
  await waiting
  await server.close()
  release(null)
  await assert.rejects(loading, /scan outlived its server/)
  assert.equal(state.shapeEntryCandidates, undefined)
  assert.equal(state.shapeEntrySignatures, undefined)
})


test('a real Vite middleware close clears the registered entry state', async (t) => {
  const { root } = fixture(t)
  const state = { shapeEntryCandidates: new Set(['pending']) }
  const modes = new Map([['entry', 'signature']])
  const server = await createServer({
    root, configFile: false, logLevel: 'silent', appType: 'custom',
    server: { middlewareMode: true },
    plugins: [{
      name: 'entry-lifecycle-test',
      configureServer(server) {
        state.vite = server
        entryStyles.entryWatchLifecycle(state, server, modes)
      },
    }],
  })
  try {
    assert.ok(state.shapeEntryOwner)
  } finally {
    await server.close()
  }
  assert.equal(state.shapeEntryOwner, undefined)
  assert.equal(state.shapeEntryCandidates, undefined)
  assert.equal(state.vite, undefined)
  assert.equal(modes.size, 0)
})

test('a route style scan finishing after close cannot restore entry state', async (t) => {
  const { root } = fixture(t)
  const entry = join(root, 'entry.js')
  writeFileSync(entry, 'export const ready = true')
  writeFileSync(join(root, 'page.tsx'), "import './pending.css'; export default () => <main />")
  let release
  let started
  const waiting = new Promise((done) => { started = done })
  const pending = new Promise((done) => { release = done })
  const server = { watcher: { add: () => assert.fail('watch after close') }, async close() {} }
  const state = {
    root, abs: (file) => join(root, file), clientEntry: () => entry, dev: true, vite: server,
    manifest: { layouts: [], routes: [{ id: '/', file: 'page.tsx', kind: 'page' }] },
    hydration: async () => undefined,
  }
  entryStyles.entryWatchLifecycle(state, server, new Map())
  const context = {
    environment: { config: { consumer: 'client' } },
    resolve: () => { started(); return pending },
  }
  const loading = moduleLoad(state).handler.call(context, '\0virtual:weft/routes')
  await waiting
  await server.close()
  release(null)
  await assert.rejects(loading, /scan outlived its server/)
  assert.equal(state.shapeEntryCandidates, undefined)
})
