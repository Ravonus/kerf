import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { load as moduleLoad } from '../../src/vite/module-hooks.mjs'
import { entryWatchLifecycle } from '../../src/vite/shape-entry-css.mjs'
import { shapeHotUpdate } from '../../src/vite.mjs'

function setup(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'weft-shape-race-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = (name) => join(root, name)
  const write = (name, source) => writeFileSync(file(name), source)
  write('entry.js', '')
  for (const name of ['old', 'new']) write(`${name}.tsx`, `export default () => <div>${name}</div>`)
  const page = (name) =>
    write(
      'page.tsx',
      `import Waiting from './${name}.tsx';
    import './${name}.css'; export const skeleton = Waiting`,
    )
  page('old')
  const state = {
    root,
    abs: file,
    clientEntry: () => file('entry.js'),
    manifest: { layouts: [], routes: [{ id: '/', file: 'page.tsx', kind: 'page' }] },
    hydration: async () => undefined,
  }
  const server = { watcher: { add() {} }, ws: { send() {} }, async close() {} }
  state.vite = server
  entryWatchLifecycle(state, server, new Map())
  let release, reject, started
  const waiting = new Promise((done) => {
    started = done
  })
  const pending = new Promise((done, fail) => {
    release = done
    reject = fail
  })
  const context = (slow = false) => ({
    environment: { config: { consumer: 'client' } },
    resolve: async (spec) => {
      if (slow && spec === './old.tsx') {
        started()
        return pending
      }
      return { id: file(spec.slice(2)) }
    },
  })
  const load = (ctx) => moduleLoad(state).handler.call(ctx, '\0virtual:weft/routes')
  return { root, file, page, state, server, release, reject, waiting, context, load }
}

test('older delayed scan cannot replace newer metadata or ownership', async (t) => {
  const p = setup(t)
  const old = p.load(p.context(true))
  const oldResult = assert.rejects(old, /superseded/)
  await p.waiting
  p.page('new')
  const current = await p.load(p.context())
  assert.ok(current.includes(`${p.file('new.css')}?inline`))
  assert.ok(p.state.shapeOverrideDependencies.has(p.file('new.tsx')))
  p.release({ id: p.file('old.tsx') })
  await oldResult
  assert.ok(p.state.shapeOverrideDependencies.has(p.file('new.tsx')))
  assert.ok(!p.state.shapeOverrideDependencies.has(p.file('old.tsx')))
  assert.ok(p.state.shapeEntryCandidates.has(p.file('new.css')))
  await p.server.close()
})

test('an older failed scan cannot disturb a newer success', async (t) => {
  const p = setup(t)
  const old = p.load(p.context(true))
  const oldResult = assert.rejects(old, /old resolver failure/)
  await p.waiting
  p.page('new')
  await p.load(p.context())
  p.reject(new Error('old resolver failure'))
  await oldResult
  assert.ok(p.state.shapeOverrideDependencies.has(p.file('new.tsx')))
  await p.server.close()
})

test('a newer failed scan still prevents an older scan publishing', async (t) => {
  const p = setup(t)
  const old = p.load(p.context(true))
  const oldResult = assert.rejects(old, /superseded/)
  await p.waiting
  p.page('new')
  const broken = p.context()
  broken.resolve = async () => {
    throw new Error('new resolver failure')
  }
  await assert.rejects(p.load(broken), /new resolver failure/)
  p.release({ id: p.file('old.tsx') })
  await oldResult
  assert.equal(p.state.shapeOverrideDependencies, undefined)
  await p.server.close()
})

test('a client edit invalidates a scan even before its dependencies are published', async (t) => {
  const p = setup(t)
  const old = p.load(p.context(true))
  const oldResult = assert.rejects(old, /superseded/)
  await p.waiting
  const calls = []
  const graph = { getModuleById: () => 'routes', invalidateModule: (m) => calls.push(m) }
  const handler = shapeHotUpdate(p.state, new Map(), async () => ['unchanged'])
  const context = { environment: { config: { consumer: 'client' }, moduleGraph: graph } }
  await handler.call(context, { file: p.file('old.tsx'), type: 'update' })
  p.release({ id: p.file('old.tsx') })
  await oldResult
  assert.deepEqual(calls, ['routes'])
  assert.equal(p.state.shapeOverrideDependencies, undefined)
  await p.server.close()
})

test('server replacement fences an older scan without clearing the new owner', async (t) => {
  const p = setup(t)
  const old = p.load(p.context(true))
  const oldResult = assert.rejects(old, /outlived its server/)
  await p.waiting
  const next = { watcher: { add() {} }, async close() {} }
  entryWatchLifecycle(p.state, next, new Map())
  p.page('new')
  await p.load(p.context())
  await p.server.close()
  p.release({ id: p.file('old.tsx') })
  await oldResult
  assert.ok(p.state.shapeOverrideDependencies.has(p.file('new.tsx')))
  await next.close()
})

test('closing fences an in-flight scan before the close promise settles', async (t) => {
  const p = setup(t)
  let finishClose
  const close = new Promise((done) => {
    finishClose = done
  })
  const next = { watcher: { add() {} }, close: () => close }
  entryWatchLifecycle(p.state, next, new Map())
  const old = p.load(p.context(true))
  const oldResult = assert.rejects(old, /superseded/)
  await p.waiting
  const closing = next.close()
  await assert.rejects(p.load(p.context()), /outlived its server/)
  p.release({ id: p.file('old.tsx') })
  await oldResult
  assert.equal(p.state.shapeOverrideDependencies, undefined)
  finishClose()
  await closing
  await assert.rejects(p.load(p.context()), /outlived its server/)
  await p.server.close()
})
