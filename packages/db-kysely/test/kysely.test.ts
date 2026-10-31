// The `db.adapter` suite through real Kysely, on node:sqlite behind its SQLite dialect.
import { DatabaseSync } from 'node:sqlite'
import { Kysely, SqliteDialect } from 'kysely'
import { LIST_ROWS, listSuite } from 'weft/test/plugins'
import { decodeCursor } from '@weft/start/list'
import { kyselySource } from '../src/index'

function database() {
  const raw = new DatabaseSync(':memory:')
  raw.exec('create table tasks (id text primary key, title text, status text, rank_no integer, secret text)')
  const add = raw.prepare('insert into tasks values (?, ?, ?, ?, ?)')
  for (const r of LIST_ROWS) add.run(r.id, r.title, r.status, r.rank, r.secret)
  const db: any = {
    close: () => raw.close(),
    prepare(text: string) {
      const s = raw.prepare(text)
      return { reader: /^\s*(select|with)\b|\breturning\b/i.test(text), all: (p: any[]) => s.all(...p), run: (p: any[]) => { const r = s.run(...p); return { changes: r.changes, lastInsertRowid: r.lastInsertRowid } }, iterate: (p: any[]) => s.iterate(...p) }
    },
  }
  return new Kysely<any>({ dialect: new SqliteDialect({ database: db }) })
}

const spec = { table: 'tasks', columns: { id: 'id', title: 'title', status: 'status', rank: 'rank_no' }, search: ['title'] }

test('kyselySource passes db.adapter@1', async () => {
  const checks = await listSuite({ make: () => kyselySource(database(), spec), decode: decodeCursor })
  expect(checks.filter(c => !c.ok)).toEqual([])
  expect(checks.length).toBeGreaterThan(20)
})

test('without `returning`, as on MySQL, a write reads the row back', async () => {
  const s = kyselySource<any>(database(), { ...spec, returning: false })
  expect((await s.create({ id: 'n', title: 'x', status: 'open', rank: 1 })).title).toBe('x')
  expect((await s.update('n', { title: 'y' })).title).toBe('y')
  expect(await s.update('nope', { title: 'y' })).toBeNull()
})
