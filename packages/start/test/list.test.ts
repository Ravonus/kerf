// `listInput` on its own, and the default `db.adapter` provider through the suite, on a real Drizzle over node:sqlite.
import { DatabaseSync } from 'node:sqlite'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { LIST_ROWS, listSuite } from '@kerf/core/test/plugins'
import type { SchemaIssue } from '@kerf/start/data'
import { decodeCursor, encodeCursor, listInput, type ListParams } from '@kerf/start/list'
import { drizzleSource } from '@kerf/start/list/drizzle'

const input = listInput({
  sort: ['rank', 'title'],
  filter: ['status'],
  search: ['title'],
  pageSize: { default: 10, max: 50 },
})
const parse = (v: unknown) =>
  input['~standard'].validate(v) as { value?: ListParams; issues?: readonly SchemaIssue[] }
const bad = (v: unknown) => parse(v).issues?.map((i) => i.message)

test('a request becomes params', () => {
  expect(parse(undefined).value).toMatchObject({
    mode: 'page',
    limit: 10,
    offset: 0,
    after: null,
    sort: null,
  })
  expect(
    parse({
      page: 3,
      pageSize: 20,
      sort: { field: 'rank', dir: 'desc' },
      filter: { status: ['open', null] },
      search: 'x',
    }).value,
  ).toMatchObject({
    limit: 20,
    offset: 40,
    sort: { field: 'rank', dir: 'desc' },
    filter: { status: ['open', null] },
    search: 'x',
  })
  expect(parse({ cursor: encodeCursor(3, 'a') }).value).toMatchObject({
    mode: 'cursor',
    after: [3, 'a'],
  })
})

test('names outside the allowlist, and shapes outside scalars, are refused', () => {
  expect(bad({ sort: { field: 'secret', dir: 'asc' } })).toBeTruthy()
  expect(bad({ sort: { field: 'rank', dir: 'sideways' } })).toBeTruthy()
  expect(bad({ filter: { secret: 'x' } })).toBeTruthy()
  expect(bad({ filter: { constructor: 'x' } })).toBeTruthy()
  expect(bad({ filter: { status: { $ne: null } } })).toBeTruthy()
  expect(bad({ filter: { status: [{ $gt: '' }] } })).toBeTruthy()
  expect(bad({ filter: { status: [] } })).toBeTruthy()
  expect(bad({ pageSize: 51 })).toBeTruthy()
  expect(bad({ pageSize: 1.5 })).toBeTruthy()
  expect(bad({ cursor: 'not ours' })).toBeTruthy()
  expect(bad({ cursor: encodeCursor({ $gt: 1 }, 'a') })).toBeTruthy()
})

test('a date survives a cursor, as a date', () => {
  const at = new Date('2026-01-02T03:04:05.000Z')
  expect(decodeCursor(encodeCursor(at, 'é'))).toEqual([at, 'é'])
})

const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title'),
  status: text('status'),
  rank_no: integer('rank_no'),
  secret: text('secret'),
})

function database() {
  const raw = new DatabaseSync(':memory:')
  raw.exec(
    'create table tasks (id text primary key, title text, status text, rank_no integer, secret text)',
  )
  const add = raw.prepare('insert into tasks values (?, ?, ?, ?, ?)')
  for (const r of LIST_ROWS) add.run(r.id, r.title, r.status, r.rank, r.secret)
  return drizzle((statement, params, method) => {
    const s = raw.prepare(statement)
    s.setReturnArrays(true)
    if (method === 'run' && !/returning/i.test(statement))
      return (s.run(...params), Promise.resolve({ rows: [] }))
    const rows = s.all(...params) as unknown as unknown[][]
    return Promise.resolve({ rows: method === 'get' ? (rows[0] ?? []) : rows })
  })
}

test('drizzleSource passes db.adapter@1', async () => {
  const checks = await listSuite({
    make: () =>
      drizzleSource(
        { db: database(), table: tasks },
        {
          columns: { id: 'id', title: 'title', status: 'status', rank: 'rank_no' },
          search: ['title'],
        },
      ),
    decode: decodeCursor,
  })
  expect(checks.filter((c) => !c.ok)).toEqual([])
  expect(checks.length).toBeGreaterThan(20)
})

test('an update with nothing to write reads the row: Drizzle refuses an empty `set`', async () => {
  const source = drizzleSource(
    { db: database(), table: tasks },
    { columns: { id: 'id', title: 'title', status: 'status', rank: 'rank_no' }, search: ['title'] },
  )
  expect(await source.update(LIST_ROWS[0]!.id, {})).toMatchObject({
    id: LIST_ROWS[0]!.id,
    title: LIST_ROWS[0]!.title,
  })
})
