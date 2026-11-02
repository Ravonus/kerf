// The `db.adapter` suite through real Kysely, on node:sqlite behind its SQLite dialect.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { Kysely, SqliteDialect } from 'kysely'
import { LIST_ROWS, listSuite } from '@weft-js/core/test/plugins'
import { decodeCursor } from '@weft-js/start/list'
import { kyselySource } from '../src/kysely'

function database() {
  const raw = new DatabaseSync(':memory:')
  raw.exec('create table tasks (id text primary key, title text, status text, rank_no integer, secret text)')
  const add = raw.prepare('insert into tasks values (?, ?, ?, ?, ?)')
  for (const r of LIST_ROWS) add.run(r.id, r.title, r.status, r.rank, r.secret)
  const db = {
    close: () => raw.close(),
    prepare(text: string) {
      const s = raw.prepare(text)
      return { reader: /^\s*(select|with)\b|\breturning\b/i.test(text), all: (p: readonly unknown[]) => s.all(...(p as SQLInputValue[])), run: (p: readonly unknown[]) => { const r = s.run(...(p as SQLInputValue[])); return { changes: r.changes, lastInsertRowid: r.lastInsertRowid } }, iterate: (p: readonly unknown[]) => s.iterate(...(p as SQLInputValue[])) }
    },
  }
  return new Kysely<unknown>({ dialect: new SqliteDialect({ database: db }) })
}

const spec = { table: 'tasks', columns: { id: 'id', title: 'title', status: 'status', rank: 'rank_no' }, search: ['title'] }

test('kyselySource passes db.adapter@1', async () => {
  const checks = await listSuite({ make: () => kyselySource(database(), spec), decode: decodeCursor })
  expect(checks.filter(c => !c.ok)).toEqual([])
  expect(checks.length).toBeGreaterThan(20)
})

test('without `returning`, as on MySQL, a write reads the row back', async () => {
  const s = kyselySource<{ title: string }>(database(), { ...spec, returning: false })
  expect((await s.create({ id: 'n', title: 'x', status: 'open', rank: 1 })).title).toBe('x')
  expect((await s.update('n', { title: 'y' }))?.title).toBe('y')
  expect(await s.update('nope', { title: 'y' })).toBeNull()
})

test('an update with nothing in it reads the row, where an empty `set` is bad SQL', async () => {
  const s = kyselySource<{ title: string }>(database(), spec)
  expect((await s.update('t01', {}))?.title).toBe(LIST_ROWS.find(r => r.id === 't01')!.title)
  expect(await s.update('nope', {})).toBeNull()
})
