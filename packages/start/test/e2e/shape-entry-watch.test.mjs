import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'vite'
import * as entryStyles from '../../src/vite/shape-entry-css.mjs'
import { shapeHotUpdate } from '../../src/vite.mjs'

async function setup(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'weft-entry-watch-')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = (name) => join(root, name)
  writeFileSync(file('entry.js'), "import './nested/late'; import './nested/later.css'")
  writeFileSync(file('other.js'), 'export const x = 1')
  const state = { root, manifest: { routes: [], layouts: [] } }
  const events = []
  const hot = shapeHotUpdate(state, new Map(), async () => undefined)
  const server = await createServer({
    root, configFile: false, logLevel: 'silent',
    server: { middlewareMode: true }, appType: 'custom',
    plugins: [{
      name: 'entry-watch-test',
      configureServer(server) { state.vite = server },
      async hotUpdate(update) {
        const result = await hot.call(this, update)
        if (this.environment.config.consumer === 'client')
          events.push({ file: update.file, type: update.type, invalidated: Array.isArray(result) })
        return result
      },
    }],
  })
  const ctx = {
    resolve: (...args) => server.environments.client.pluginContainer.resolveId(...args),
  }
  const refresh = async () => {
    const result = await entryStyles.entryCss(ctx, file('entry.js'), root)
    state.shapeEntrySignatures = result.signatures
    state.shapeEntryCandidates = result.candidates
    state.shapeEntryMissing = result.missing
    entryStyles.watchEntryCandidates(server, result.candidates)
    return result
  }
  return { root, file, state, events, server, refresh }
}

async function waitFor(condition, label, events) {
  const end = Date.now() + 5000
  while (!condition()) {
    if (Date.now() > end) assert.fail(`Waiting for ${label}: ${JSON.stringify(events)}`)
    await new Promise((done) => setTimeout(done, 25))
  }
}

function event(events, file, type, from) {
  return events.slice(from).find((item) => item.file === file && item.type === type)
}

test('Vite watcher refreshes missing entry imports and drops removed edges', async (t) => {
  const p = await setup(t)
  try {
    await p.refresh()
    await waitFor(() => (p.server.watcher.getWatched()[p.root] ?? []).includes('other.js'),
      'watcher', p.events)
    let from = p.events.length
    writeFileSync(p.file('other.js'), 'export const x = 2')
    await waitFor(() => event(p.events, p.file('other.js'), 'update', from), 'unrelated', p.events)
    assert.equal(event(p.events, p.file('other.js'), 'update', from).invalidated, false)
    mkdirSync(p.file('nested'))
    from = p.events.length
    writeFileSync(p.file('nested/late.js'), "import './module.css'; throw Error('never run')")
    await waitFor(
      () => event(p.events, p.file('nested/late.js'), 'create', from), 'module', p.events,
    )
    assert.equal(event(p.events, p.file('nested/late.js'), 'create', from).invalidated, true)
    await p.refresh()
    from = p.events.length
    writeFileSync(p.file('nested/later.css'), '.x { height: 5px }')
    const cssChange = () => event(p.events, p.file('nested/later.css'), 'create', from) ??
      event(p.events, p.file('nested/later.css'), 'update', from)
    await waitFor(cssChange, 'css', p.events)
    assert.equal(cssChange().invalidated, true)
    const afterCss = await p.refresh()
    assert.ok(afterCss.candidates.has(p.file('nested/later.css')))
    from = p.events.length
    unlinkSync(p.file('nested/later.css'))
    await waitFor(
      () => event(p.events, p.file('nested/later.css'), 'delete', from), 'delete', p.events,
    )
    assert.equal(event(p.events, p.file('nested/later.css'), 'delete', from).invalidated, true)
    await p.refresh()
    from = p.events.length
    writeFileSync(p.file('nested/later.css'), '.x { height: 6px }')
    await waitFor(cssChange, 'recreate', p.events)
    assert.equal(cssChange().invalidated, true)
    from = p.events.length
    writeFileSync(p.file('entry.js'), 'export const x = 1')
    await waitFor(
      () => event(p.events, p.file('entry.js'), 'update', from), 'remove import', p.events,
    )
    assert.equal(event(p.events, p.file('entry.js'), 'update', from).invalidated, true)
    await p.refresh()
    from = p.events.length
    writeFileSync(p.file('nested/late.js'), 'export const x = 2')
    await waitFor(
      () => event(p.events, p.file('nested/late.js'), 'update', from), 'removed', p.events,
    )
    assert.equal(event(p.events, p.file('nested/late.js'), 'update', from).invalidated, false)
    from = p.events.length
    unlinkSync(p.file('nested/later.css'))
    await waitFor(
      () => event(p.events, p.file('nested/later.css'), 'delete', from), 'removed CSS', p.events,
    )
    assert.equal(event(p.events, p.file('nested/later.css'), 'delete', from).invalidated, false)
  } finally {
    await p.server.close()
  }
})
