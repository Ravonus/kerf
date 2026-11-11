import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { shapeWatch } from '../../vite/shape-watch.mjs'

void test('shape group edits and deletion invalidate only current dependents', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'kerf-shape-watch-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const group = join(root, 'group.ts')
  const replacement = join(root, 'replacement.ts')
  const unrelated = join(root, 'other.ts')
  for (const file of [group, replacement, unrelated]) writeFileSync(file, 'export const x = 1')
  const calls = []
  const watched = []
  const tracker = shapeWatch((file) => calls.push(['forget', file]))
  const shapeA = `${join(root, 'a.tsx')}?kerf-shape`
  const shapeB = `${join(root, 'b.tsx')}?kerf-shape`
  const modA = { id: shapeA }
  const modB = { id: shapeB }
  const existing = { id: 'other-module' }
  const graph = {
    getModuleById: (id) =>
      new Map([
        [shapeA, modA],
        [shapeB, modB],
      ]).get(id),
    invalidateModule: (mod) => calls.push(['invalidate', mod.id]),
  }
  const vite = { environment: { moduleGraph: graph } }
  const ctx = { environment: vite.environment, addWatchFile: (file) => watched.push(file) }
  tracker.replace(shapeA, [group], ctx)
  tracker.replace(shapeB, [group], ctx)
  assert.deepEqual(watched, [group, group])
  writeFileSync(group, 'export const x = 2')
  assert.deepEqual(tracker.hotUpdate.call(vite, { file: group, modules: [existing] }), [
    existing,
    modA,
    modB,
  ])
  assert.deepEqual(calls, [
    ['forget', group],
    ['invalidate', shapeA],
    ['invalidate', shapeB],
  ])
  calls.length = 0
  writeFileSync(unrelated, 'export const x = 3')
  assert.equal(tracker.hotUpdate.call(vite, { file: unrelated, modules: [] }), undefined)
  assert.deepEqual(calls, [])
  unlinkSync(group)
  assert.deepEqual(tracker.hotUpdate.call(vite, { file: group, modules: [] }), [modA, modB])
  assert.deepEqual(calls, [
    ['forget', group],
    ['invalidate', shapeA],
    ['invalidate', shapeB],
  ])
  calls.length = 0
  const retained = new Set()
  tracker.candidate(group.replace(/\.ts$/, ''), retained)
  assert.deepEqual([...retained], [group.replace(/\.ts$/, '')])
  tracker.replace(shapeA, retained, ctx)
  assert.equal(watched.filter((file) => file === group).length, 2)
  tracker.replace(shapeA, [replacement], ctx)
  tracker.replace(shapeB, [], ctx)
  assert.equal(tracker.hotUpdate.call(vite, { file: group, modules: [] }), undefined)
  assert.deepEqual(tracker.hotUpdate.call(vite, { file: replacement, modules: [] }), [modA])
  assert.deepEqual(calls, [
    ['forget', replacement],
    ['invalidate', shapeA],
  ])
  calls.length = 0
  tracker.hotUpdate.call(vite, { file: join(root, 'a.tsx'), modules: [], type: 'delete' })
  assert.equal(tracker.hotUpdate.call(vite, { file: replacement, modules: [] }), undefined)
  assert.deepEqual(calls, [])
})

void test('Vite retransforms an affected shape module after a group edit', async (t) => {
  const { createServer } = await import('vite')
  const root = mkdtempSync(join(tmpdir(), 'kerf-shape-graph-'))
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
    root,
    configFile: false,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
    plugins: [
      {
        name: 'shape-watch-test',
        transform(code, id) {
          if (!id.endsWith('?kerf-shape')) return
          count++
          shapeId = id
          tracker.replace(id, [dep], this)
          return code
        },
      },
    ],
  })
  try {
    const env = server.environments.client
    const url = '/page.js?kerf-shape'
    assert.ok(await env.transformRequest(url))
    assert.equal(count, 1)
    const mod = env.moduleGraph.getModuleById(shapeId)
    assert.ok(mod)
    writeFileSync(dep, 'export const value = 2')
    assert.deepEqual(tracker.hotUpdate.call({ environment: env }, { file: dep, modules: [] }), [
      mod,
    ])
    assert.ok(await env.transformRequest(url))
    assert.equal(count, 2)
    assert.deepEqual(forgotten, [dep])
  } finally {
    await server.close()
  }
})

void test('Vite watcher handles group edit, deletion, recreation and owner deletion', async (t) => {
  const { createServer } = await import('vite')
  const { existsSync, realpathSync } = await import('node:fs')
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'kerf-shape-events-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dep = join(root, 'group.ts')
  const route = join(root, 'page.js')
  writeFileSync(dep, 'export const value = 1')
  writeFileSync(route, '// GROUP\nexport default 1')
  const tracker = shapeWatch(() => {})
  const events = []
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
    plugins: [
      {
        name: 'shape-watcher-test',
        transform(code, id) {
          if (!id.endsWith('?kerf-shape')) return
          const deps = new Set()
          if (code.includes('GROUP')) {
            if (existsSync(dep)) deps.add(dep)
            else tracker.candidate(dep, deps)
          }
          tracker.replace(id, deps, this)
          return code
        },
        hotUpdate(update) {
          const result = tracker.hotUpdate.call(this, update)
          if (this.environment.config.consumer === 'client')
            events.push({ file: update.file, type: update.type, affected: result?.length ?? 0 })
          return result
        },
      },
    ],
  })
  const wait = async (condition, label) => {
    const deadline = Date.now() + 5000
    while (!condition()) {
      if (Date.now() > deadline)
        assert.fail(`Timed out waiting for ${label}: ${JSON.stringify(events)}`)
      await new Promise((done) => {
        setTimeout(done, 25)
      })
    }
  }
  const event = (file, type, from) =>
    events.slice(from).find((e) => e.file === file && e.type === type)
  try {
    const env = server.environments.client
    const url = '/page.js?kerf-shape'
    assert.ok(await env.transformRequest(url))
    await wait(() => (server.watcher.getWatched()[root] ?? []).includes('group.ts'), 'watcher')
    let from = events.length
    writeFileSync(dep, 'export const value = 2')
    await wait(() => event(dep, 'update', from), 'group edit')
    assert.ok(event(dep, 'update', from).affected > 0)
    from = events.length
    unlinkSync(dep)
    await wait(() => event(dep, 'delete', from), 'group deletion')
    assert.ok(event(dep, 'delete', from).affected > 0)
    assert.ok(await env.transformRequest(url))
    from = events.length
    writeFileSync(dep, 'export const value = 3')
    await wait(() => event(dep, 'create', from), 'group recreation')
    assert.ok(event(dep, 'create', from).affected > 0, 'recreated group must invalidate the shape')
    assert.ok(await env.transformRequest(url))
    from = events.length
    writeFileSync(route, '// no dependency\nexport default 1')
    await wait(() => event(route, 'update', from), 'import removal')
    assert.ok(await env.transformRequest(url))
    from = events.length
    writeFileSync(dep, 'export const value = 4')
    await wait(() => event(dep, 'update', from), 'edit after import removal')
    assert.equal(event(dep, 'update', from).affected, 0)
    from = events.length
    writeFileSync(route, '// GROUP\nexport default 1')
    await wait(() => event(route, 'update', from), 'import restoration')
    assert.ok(await env.transformRequest(url))
    from = events.length
    unlinkSync(route)
    await wait(() => event(route, 'delete', from), 'owner deletion')
    from = events.length
    writeFileSync(dep, 'export const value = 5')
    await wait(() => event(dep, 'update', from), 'edit after owner deletion')
    assert.equal(event(dep, 'update', from).affected, 0)
  } finally {
    await server.close()
  }
})

for (const initial of ['nongroup', 'missing']) {
  void test(`Vite watcher tracks an initially ${initial} group candidate`, async (t) => {
    const { createServer } = await import('vite')
    const { realpathSync } = await import('node:fs')
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'kerf-shape-candidate-')))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const file = join(root, 'group.ts')
    const unrelated = join(root, 'other.ts')
    const route = join(root, 'page.js')
    if (initial === 'nongroup') writeFileSync(file, 'export const card = 1')
    writeFileSync(unrelated, 'export const other = 1')
    writeFileSync(route, "import { card } from './group'; export default card")
    const tracker = shapeWatch(() => {})
    const events = []
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true },
      appType: 'custom',
      plugins: [
        {
          name: 'candidate-watch-test',
          configureServer(dev) {
            tracker.attach(dev)
          },
          async transform(code, id) {
            if (!id.endsWith('?kerf-shape')) return
            const deps = new Set()
            if (code.includes("from './group'")) {
              const hit = await this.resolve('./group', route, { skipSelf: true })
              const candidate = hit?.id ?? join(root, 'group')
              tracker.candidate(candidate, deps)
            }
            tracker.replace(id, deps, this)
            return 'export default 1'
          },
          hotUpdate(update) {
            const result = tracker.hotUpdate.call(this, update)
            if (this.environment.config.consumer === 'client')
              events.push({ file: update.file, type: update.type, affected: result?.length ?? 0 })
            return result
          },
        },
      ],
    })
    const wait = async (condition, label) => {
      const deadline = Date.now() + 5000
      while (!condition()) {
        if (Date.now() > deadline) assert.fail(`Waiting for ${label}: ${JSON.stringify(events)}`)
        await new Promise((done) => {
          setTimeout(done, 25)
        })
      }
    }
    const event = (path, type, from) =>
      events.slice(from).find((e) => e.file === path && e.type === type)
    try {
      const env = server.environments.client
      const url = '/page.js?kerf-shape'
      assert.ok(await env.transformRequest(url))
      await wait(() => (server.watcher.getWatched()[root] ?? []).includes('other.ts'), 'watcher')
      let from = events.length
      writeFileSync(unrelated, 'export const other = 2')
      await wait(() => event(unrelated, 'update', from), 'unrelated edit')
      assert.equal(event(unrelated, 'update', from).affected, 0)
      from = events.length
      writeFileSync(file, "export const card = 'group'")
      const change = initial === 'missing' ? 'create' : 'update'
      await wait(() => event(file, change, from), 'candidate change')
      assert.ok(event(file, change, from).affected > 0, 'candidate must invalidate shape')
      assert.ok(await env.transformRequest(url))
      from = events.length
      writeFileSync(route, 'export default 1')
      await wait(() => event(route, 'update', from), 'import removal')
      assert.ok(await env.transformRequest(url))
      from = events.length
      writeFileSync(file, "export const card = 'group2'")
      await wait(() => event(file, 'update', from), 'edit after import removal')
      assert.equal(event(file, 'update', from).affected, 0)
    } finally {
      await server.close()
    }
  })
}

void test('extensionless index candidates invalidate each environment and remove stale edges', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'kerf-shape-index-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const candidate = join(root, 'missing')
  const created = join(candidate, 'index.ts')
  const id = `${join(root, 'page.tsx')}?kerf-shape`
  const tracker = shapeWatch(() => {})
  const dirs = []
  tracker.attach({ watcher: { add: (dir) => dirs.push(dir) } })
  const deps = new Set()
  tracker.candidate(candidate, deps)
  for (const name of ['client', 'server']) {
    const mod = { id, name }
    const invalidated = []
    const context = {
      environment: {
        moduleGraph: {
          getModuleById: () => mod,
          invalidateModule: (value) => invalidated.push(value),
        },
      },
    }
    tracker.replace(id, deps, {
      environment: context.environment,
      addWatchFile: () => assert.fail('missing file is not a module'),
    })
    assert.deepEqual(tracker.hotUpdate.call(context, { file: created, modules: [] }), [mod])
    assert.deepEqual(invalidated, [mod])
  }
  assert.deepEqual(dirs, [root, root])
  const context = {
    environment: { moduleGraph: { getModuleById: () => assert.fail('stale edge') } },
  }
  tracker.replace(id, [], {
    environment: context.environment,
    addWatchFile: () => assert.fail('no dependencies'),
  })
  assert.equal(tracker.hotUpdate.call(context, { file: created, modules: [] }), undefined)
})

void test('environment ownership keeps divergent dependencies and deletion separate', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'kerf-shape-env-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const clientFile = join(root, 'client.ts')
  const serverFile = join(root, 'server.ts')
  for (const file of [clientFile, serverFile]) writeFileSync(file, 'export const x = 1')
  const id = `${join(root, 'page.tsx')}?kerf-shape`
  const tracker = shapeWatch(() => {})
  const clientMod = { id, env: 'client' }
  const serverMod = { id, env: 'server' }
  const env = (mod) => ({ moduleGraph: { getModuleById: () => mod, invalidateModule() {} } })
  const client = env(clientMod)
  const server = env(serverMod)
  const ctx = (environment) => ({ environment, addWatchFile() {} })
  tracker.replace(id, [clientFile], ctx(client))
  tracker.replace(id, [serverFile], ctx(server))
  assert.deepEqual(
    tracker.hotUpdate.call(
      { environment: client },
      {
        file: clientFile,
        modules: [],
      },
    ),
    [clientMod],
  )
  assert.deepEqual(
    tracker.hotUpdate.call(
      { environment: server },
      {
        file: serverFile,
        modules: [],
      },
    ),
    [serverMod],
  )
  assert.equal(
    tracker.hotUpdate.call(
      { environment: client },
      {
        file: serverFile,
        modules: [],
      },
    ),
    undefined,
  )
  tracker.hotUpdate.call(
    { environment: client },
    {
      file: join(root, 'page.tsx'),
      modules: [],
      type: 'delete',
    },
  )
  assert.deepEqual(
    tracker.hotUpdate.call(
      { environment: server },
      {
        file: serverFile,
        modules: [],
      },
    ),
    [serverMod],
  )
})

void test('close and restart clears shape ownership from the previous server', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'kerf-shape-restart-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = join(root, 'group.ts')
  writeFileSync(file, 'export const card = 1')
  const id = `${join(root, 'page.tsx')}?kerf-shape`
  const mod = { id }
  const environment = { moduleGraph: { getModuleById: () => mod, invalidateModule() {} } }
  const tracker = shapeWatch(() => {})
  let closed = 0
  const server = {
    watcher: { add() {} },
    close() {
      closed++
    },
  }
  tracker.attach(server)
  tracker.replace(id, [file], { environment, addWatchFile() {} })
  assert.deepEqual(tracker.hotUpdate.call({ environment }, { file, modules: [] }), [mod])
  server.close()
  assert.equal(closed, 1)
  tracker.attach({ watcher: { add() {} }, async close() {} })
  assert.equal(tracker.hotUpdate.call({ environment }, { file, modules: [] }), undefined)
  tracker.replace(id, [file], { environment, addWatchFile() {} })
  assert.deepEqual(tracker.hotUpdate.call({ environment }, { file, modules: [] }), [mod])
  server.close()
  assert.deepEqual(tracker.hotUpdate.call({ environment }, { file, modules: [] }), [mod])
})
