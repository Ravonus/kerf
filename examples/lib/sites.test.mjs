// node --test examples/lib: the database half of the harness. The tests under sites/ need Postgres, psql and Chromium for
// the last ones, and run the probes for real against lib/fixture, which has the todo contract and no framework.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { allApps, freshness, here, loadApp } from './app.mjs'
import { clone, dbName, seedHash, seedName } from '../shared/pg/env.mjs'

test('live needs a canary, cached is a label, and a map picks by variant', () => {
  const canary = { sql: 'x', text: true }
  assert.equal(freshness({ path: '/', canary }, 'a'), 'live')
  assert.equal(freshness({ path: '/' }, 'a'), 'unchecked')
  assert.equal(freshness({ path: '/', freshness: 'cached' }, 'a'), 'cached')
  assert.throws(() => freshness({ path: '/', freshness: 'live' }, 'a'), /needs a canary/)
  assert.throws(() => freshness({ path: '/', freshness: 'stale' }, 'a'), /live or cached/)
  const mixed = { path: '/', canary, freshness: { next: 'cached', '*': 'live' } }
  assert.equal(freshness(mixed, 'next'), 'cached')
  assert.equal(freshness(mixed, 'kerf'), 'live')
})

test('every site manifest says what the contract needs', () => {
  for (const site of ['landing', 'todo', 'admin', 'catalog']) {
    assert.ok(allApps().includes(site))
    const m = JSON.parse(readFileSync(join(here, site, 'app.json'), 'utf8'))
    assert.ok(m.db, site)
    assert.equal(m.variants.kerf.scaffold.template, site)
    assert.deepEqual(Object.keys(m.variants).sort(), ['next', 'solid', 'kerf'])
    for (const v of Object.values(m.variants)) assert.ok(v.label, site)
    for (const p of m.pages) if (p.canary) assert.match(p.canary.sql, /\$1/)
  }
})

test('a scaffold variant is generated, in the work area, the same every load', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-scaffold-')),
    work = process.env.BENCH_WORK
  process.env.BENCH_WORK = join(dir, 'work')
  writeFileSync(
    join(dir, 'app.json'),
    JSON.stringify({
      db: {},
      login: {},
      pages: ['/'],
      variants: { kerf: { scaffold: { db: 'postgres', auth: true } } },
    }),
  )
  try {
    const a = loadApp(dir),
      v = a.variants[0],
      env = readFileSync(join(v.path, '.env.example'), 'utf8')
    assert.equal(v.path, join(dir, 'work/gen', a.name, 'kerf'))
    assert.equal(v.stack.family, 'kerf')
    assert.equal(v.tarballs, true)
    assert.equal(a.db.hash, seedHash())
    assert.equal(a.login.submit, 'Sign in')
    assert.equal(
      readFileSync(join(loadApp(dir).variants[0].path, '.env.example'), 'utf8'),
      env,
      'a random secret would change the build key every load',
    )
  } finally {
    if (work === undefined) delete process.env.BENCH_WORK
    else process.env.BENCH_WORK = work
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an unknown template is refused, not ignored', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-scaffold-'))
  writeFileSync(
    join(dir, 'app.json'),
    JSON.stringify({ pages: ['/'], variants: { kerf: { scaffold: { template: 'nope' } } } }),
  )
  assert.throws(() => loadApp(dir), /--template/)
  rmSync(dir, { recursive: true, force: true })
})

test('database names stay in the bench namespace', async () => {
  assert.equal(dbName('todo', 'kerf-naive'), 'kerf_bench_todo_kerf_naive')
  await assert.rejects(clone('postgres', 'kerf_bench_seed_x'), /not kerf_bench_/)
})

test('the seed hash moves with the files and nothing else', () => {
  assert.equal(seedHash(), seedHash())
  assert.match(seedName(), /^kerf_bench_seed_[0-9a-f]{12}$/)
})
