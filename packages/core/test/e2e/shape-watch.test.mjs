import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { shapeWatch } from '../../vite/shape-watch.mjs'

test('shape group edits and deletion invalidate only current dependents', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'weft-shape-watch-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const group = join(root, 'group.ts')
  const replacement = join(root, 'replacement.ts')
  const unrelated = join(root, 'other.ts')
  for (const file of [group, replacement, unrelated]) writeFileSync(file, 'export const x = 1')
  const calls = []
  const watched = []
  const tracker = shapeWatch((file) => calls.push(['forget', file]))
  const ctx = { addWatchFile: (file) => watched.push(file) }
  const shapeA = `${join(root, 'a.tsx')}?weft-shape`
  const shapeB = `${join(root, 'b.tsx')}?weft-shape`
  const modA = { id: shapeA }
  const modB = { id: shapeB }
  const existing = { id: 'other-module' }
  const graph = {
    getModuleById: (id) => new Map([[shapeA, modA], [shapeB, modB]]).get(id),
    invalidateModule: (mod) => calls.push(['invalidate', mod.id]),
  }
  const vite = { environment: { moduleGraph: graph } }
  tracker.replace(shapeA, [group], ctx)
  tracker.replace(shapeB, [group], ctx)
  assert.deepEqual(watched, [group, group])
  writeFileSync(group, 'export const x = 2')
  assert.deepEqual(tracker.hotUpdate.call(vite, { file: group, modules: [existing] }), [
    existing, modA, modB,
  ])
  assert.deepEqual(calls, [
    ['forget', group], ['invalidate', shapeA], ['invalidate', shapeB],
  ])
  calls.length = 0
  writeFileSync(unrelated, 'export const x = 3')
  assert.equal(tracker.hotUpdate.call(vite, { file: unrelated, modules: [] }), undefined)
  assert.deepEqual(calls, [])
  unlinkSync(group)
  assert.deepEqual(tracker.hotUpdate.call(vite, { file: group, modules: [] }), [modA, modB])
  assert.deepEqual(calls, [
    ['forget', group], ['invalidate', shapeA], ['invalidate', shapeB],
  ])
  calls.length = 0
  tracker.replace(shapeA, [replacement], ctx)
  tracker.replace(shapeB, [], ctx)
  assert.equal(tracker.hotUpdate.call(vite, { file: group, modules: [] }), undefined)
  assert.deepEqual(tracker.hotUpdate.call(vite, { file: replacement, modules: [] }), [modA])
  assert.deepEqual(calls, [['forget', replacement], ['invalidate', shapeA]])
  calls.length = 0
  tracker.hotUpdate.call(vite, { file: join(root, 'a.tsx'), modules: [], type: 'delete' })
  assert.equal(tracker.hotUpdate.call(vite, { file: replacement, modules: [] }), undefined)
  assert.deepEqual(calls, [])
})

test('Vite retransforms an affected shape module after a group edit', async (t) => {
  const { createServer } = await import('vite')
  const root = mkdtempSync(join(tmpdir(), 'weft-shape-graph-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dep = join(root, 'group.ts')
  const route = join(root, 'page.js')
  writeFileSync(dep, 'export const value = 1')
  writeFileSync(route, 'export default 1')
  let count = 0
  let shapeId
  const forgotten = []
  const tracker = shapeWatch((file) => forgotten.push(file))
  const server = await createServer({
    root, configFile: false, logLevel: 'silent',
    server: { middlewareMode: true }, appType: 'custom',
    plugins: [{
      name: 'shape-watch-test',
      transform(code, id) {
        if (!id.endsWith('?weft-shape')) return
        count++
        shapeId = id
        tracker.replace(id, [dep], this)
        return code
      },
    }],
  })
  try {
    const env = server.environments.client
    const url = '/page.js?weft-shape'
    assert.ok(await env.transformRequest(url))
    assert.equal(count, 1)
    const mod = env.moduleGraph.getModuleById(shapeId)
    assert.ok(mod)
    writeFileSync(dep, 'export const value = 2')
    assert.deepEqual(tracker.hotUpdate.call({ environment: env }, { file: dep, modules: [] }), [mod])
    assert.ok(await env.transformRequest(url))
    assert.equal(count, 2)
    assert.deepEqual(forgotten, [dep])
  } finally {
    await server.close()
  }
})
