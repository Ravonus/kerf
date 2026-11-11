// A request that touches no database doesn't need one (the database down, or never started): migrations wait for the
// first statement, run once however many requests arrive together, and a request that does use a dead database gets Q016.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { mutation, query } from '@kerf/start'
import { runtime } from '@kerf/start/data'
import { createDb } from '../src/db/sqlite'
import { createHandler, type Manifest, type RouteModule } from '../src/server'

const notes = sqliteTable('notes', { id: integer().primaryKey(), body: text().notNull() })
const list = [
  { tag: '0000', sql: 'create table notes (id integer primary key, body text not null);' },
]
const manifest: Manifest = {
  dir: 'src/routes',
  layouts: [],
  routes: [
    { id: '/', file: 'home', layouts: [], pattern: '/', params: [], kind: 'page' },
    { id: '/notes', file: 'notes', layouts: [], pattern: '/notes', params: [], kind: 'page' },
  ],
}

function app(url: string, migrations = () => list) {
  const db = createDb({ schema: { notes }, url })
  const spy = vi.spyOn(db.$kerf, 'migrate')
  const found: { code: string; message: string }[] = []
  const modules: Record<string, RouteModule> = {
    home: { default: () => <h1>Marketing</h1> },
    notes: {
      default: (p: { data: { count: number } }) => <p>{`${p.data.count} notes`}</p>,
      load: async () => ({ count: (await db.select().from(notes)).length }),
    },
  }
  const handler = createHandler({
    manifest,
    modules,
    migrations,
    onDiagnostic: (d) => found.push(d),
  })
  return {
    db,
    spy,
    found,
    handler,
    get: (path: string) => handler(new Request(`http://app.test${path}`)),
  }
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kerf-lazy-'))
  runtime.migrations = undefined
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** A path SQLite can't open: its parent is a file. Removing that file is the database coming back. */
function dead() {
  const blocker = join(dir, 'blocker')
  writeFileSync(blocker, '')
  return { url: `file:${join(blocker, 'app.db')}`, revive: () => rmSync(blocker) }
}

test('a page with no queries serves with the database down, and never tries it', async () => {
  const { spy, get } = app(dead().url)
  const res = await get('/')
  expect(res.status).toBe(200)
  expect(await res.text()).toContain('Marketing')
  expect(spy).not.toHaveBeenCalled()
})

test('a page that reads the database down gets 503 and Q016, with the cause in the server log only', async () => {
  const { found, get } = app(dead().url)
  const res = await get('/notes')
  expect(res.status).toBe(503)
  const html = await res.text()
  expect(html).not.toContain('EEXIST')
  expect(found.map((d) => d.code)).toContain('Q016')
  expect(found.some((d) => /EEXIST|ENOTDIR/.test(d.message))).toBe(true)
  expect((await get('/')).status).toBe(200) // the failure doesn't stick to the pages that don't need it
})

test('a server function gets the same 503 and code', async () => {
  const { db, handler } = app(dead().url)
  query({ $id: 'lazyNotes', run: () => db.select().from(notes) })
  mutation({ $id: 'lazyAdd', run: () => db.insert(notes).values({ body: 'a' }) })
  const q = await handler(new Request('http://app.test/_kerf/fn/lazyNotes'))
  expect(q.status).toBe(503)
  expect((await q.json()).e.code).toBe('Q016')
  const m = await handler(
    new Request('http://app.test/_kerf/fn/lazyAdd', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-kerf': '1' },
      body: '{"i":{}}',
    }),
  )
  expect(m.status).toBe(503)
  expect((await m.json()).e.message).not.toMatch(/EEXIST|ENOTDIR|blocker/)
})

test('once the database is back it migrates and serves, with no restart', async () => {
  const { url, revive } = dead()
  const { get } = app(url)
  expect((await get('/notes')).status).toBe(503)
  revive()
  const res = await get('/notes')
  expect(res.status).toBe(200)
  expect(await res.text()).toContain('0 notes')
})

test('migrations apply before the first statement, and once under concurrent requests', async () => {
  const { spy, get } = app(`file:${join(dir, 'app.db')}`)
  await get('/')
  expect(spy).not.toHaveBeenCalled()
  const all = await Promise.all(Array.from({ length: 12 }, () => get('/notes')))
  expect(all.map((r) => r.status)).toEqual(Array(12).fill(200))
  expect(spy).toHaveBeenCalledTimes(1)
  await get('/notes')
  expect(spy).toHaveBeenCalledTimes(1)
})

test('a transaction waits too, and a migration that fails is Q016 with its error logged', async () => {
  const bad = [{ tag: '0000', sql: 'create tabel nope' }]
  const { found, get } = app(`file:${join(dir, 'bad.db')}`, () => bad)
  expect((await get('/notes')).status).toBe(503)
  expect(found.some((d) => d.code === 'Q016' && /syntax/i.test(d.message))).toBe(true)
  const good = app(`file:${join(dir, 'tx.db')}`)
  await good.get('/')
  await good.db.transaction((tx) => tx.insert(notes).values({ body: 'a' }))
  expect(await good.db.select().from(notes)).toHaveLength(1)
})

test('in dev a new file in `drizzle/` applies on the next statement', async () => {
  const files = [...list]
  const { db, spy, get } = app(`file:${join(dir, 'dev.db')}`, () => files)
  await get('/notes')
  files.push({ tag: '0001', sql: "insert into notes (body) values ('seeded');" })
  await get('/notes')
  expect(spy).toHaveBeenCalledTimes(2)
  expect(await db.select().from(notes)).toHaveLength(1)
})

test('with `migrate: false`, or outside a request, nothing runs', async () => {
  const db = createDb({ schema: { notes }, url: ':memory:', migrate: false })
  const spy = vi.spyOn(db.$kerf, 'migrate')
  await expect(db.select().from(notes)).rejects.toMatchObject({
    cause: { message: expect.stringContaining('no such table') },
  })
  runtime.migrations = { list, report() {} }
  await expect(db.select().from(notes)).rejects.toMatchObject({
    cause: { message: expect.stringContaining('no such table') },
  })
  expect(spy).not.toHaveBeenCalled()
})
