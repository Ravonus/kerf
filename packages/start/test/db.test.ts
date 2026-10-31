// The database layer in process (research 28 §2): one connection through Drizzle's proxy, migrations, the transaction
// gate, the touched-tables check, Q013/Q014, and the tables as validators. Postgres repeats the core when
// WEFT_TEST_POSTGRES names a private instance; the runtime matrix runs the whole app on it.
import { AsyncLocalStorage } from 'node:async_hooks'
import { eq, sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { mysqlTable, varchar } from 'drizzle-orm/mysql-core'
import { integer as pgInteger, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { mutation, query } from '@weft/start'
import { fnOf, runtime, StartError } from '@weft/start/data'
import { createScope, fetchQuery, runMutation } from '../src/exec'
import { schemasOf } from '../src/db/index'
import { createDb } from '../src/db/sqlite'
import { createDb as createMysql } from '../src/db/mysql'
import { readMigrations } from '../src/migrations.mjs'

const todos = sqliteTable('todos', { id: text().primaryKey(), title: text().notNull(), done: integer({ mode: 'boolean' }).notNull().default(false) })
const notes = sqliteTable('notes', { id: integer().primaryKey(), todoId: text('todo_id').notNull() })
const schema = { todos, notes }
const init = [{ tag: '0000_init', sql: 'create table todos (id text primary key, title text not null, done integer not null default 0);\n--> statement-breakpoint\ncreate table notes (id integer primary key, todo_id text not null);' }]

const als = new AsyncLocalStorage<unknown>()
beforeAll(() => { runtime.scope = () => als.getStore(); runtime.enter = (s, f) => als.run(s, f) })
afterAll(() => { runtime.scope = undefined; runtime.enter = undefined })

async function fresh() {
  const db = createDb({ schema, url: ':memory:', migrate: false })
  await db.$weft.migrate(init)
  return db
}
const scoped = (method = 'GET') => {
  const found: { code: string; message: string }[] = []
  return { found, scope: createScope(new Request('http://localhost/', { method }), { dev: true, onDiagnostic: d => found.push(d) }) }
}

test('reads and writes are async and return Drizzle rows, booleans included', async () => {
  const db = await fresh()
  await db.insert(todos).values({ id: '1', title: 'Milk' })
  await db.update(todos).set({ done: true }).where(eq(todos.id, '1'))
  expect(await db.select().from(todos)).toEqual([{ id: '1', title: 'Milk', done: true }])
  expect(await db.select().from(todos).get()).toEqual({ id: '1', title: 'Milk', done: true })
})

test('creating a client opens nothing: the first statement does', () => {
  const missing = `/nonexistent-${Date.now()}/deep/app.db`
  expect(() => createDb({ schema, url: `file:${missing}`, migrate: false })).not.toThrow()
})

test('migrations apply once, in order, and a failing one rolls back', async () => {
  const db = createDb({ schema, url: ':memory:', migrate: false })
  await db.$weft.migrate(init)
  await db.$weft.migrate(init)
  const bad = { tag: '0001_bad', sql: 'create table a (id integer);\n--> statement-breakpoint\ncreate table todos (id integer);' }
  await expect(db.$weft.migrate([...init, bad])).rejects.toThrow(/already exists/)
  expect(await db.all(sql`select tag from __weft_migrations`)).toEqual([['0000_init']])
  await expect(db.run(sql`select * from a`)).rejects.toMatchObject({ cause: { message: expect.stringContaining('no such table') } })
})

test('a transaction holds the connection: outside statements wait, a rollback takes only its own writes', async () => {
  const db = await fresh()
  let release!: () => void
  const held = new Promise<void>(ok => (release = ok))
  const tx = db.transaction(async t => {
    await t.insert(todos).values({ id: 'in', title: 'inside' })
    await held
    throw new Error('roll back')
  })
  await new Promise(ok => setTimeout(ok, 5))
  let outside = false
  const write = db.insert(todos).values({ id: 'out', title: 'outside' }).then(() => { outside = true })
  await new Promise(ok => setTimeout(ok, 5))
  expect(outside).toBe(false)
  release()
  await expect(tx).rejects.toThrow('roll back')
  await write
  expect((await db.select().from(todos)).map(t => t.id)).toEqual(['out'])
})

test('Q013: a URL the driver can\'t open, with the password out of the message', () => {
  const err = (() => { try { createDb({ schema, url: 'postgres://u:secret@localhost/x' }) } catch (e) { return e as StartError } })()!
  expect(err.code).toBe('Q013')
  expect(err.message).toContain('@weft/start/db/postgres')
  expect(err.message).not.toContain('secret')
})

test('Q014: a missing table is the migration that wasn\'t applied, with the fix', async () => {
  const db = createDb({ schema, url: ':memory:', migrate: false })
  const list = query({ $id: 'q014', tags: ['todos'], run: () => db.select().from(todos) })
  const { scope } = scoped()
  await expect(fetchQuery(scope, fnOf(list), undefined)).rejects.toMatchObject({ code: 'Q014', message: expect.stringContaining('weft db generate') })
})

test('Q011: a table no tag names, per function, once; a `table:*` tag counts and parallel functions don\'t mix', async () => {
  const db = await fresh()
  const untagged = query({ $id: 'untagged', tags: ['todos'], run: async () => (await db.select().from(todos)).concat(await db.select({ id: sql`id`, title: sql`'x'`, done: sql`0` }).from(notes) as any) })
  const byId = query({ $id: 'byId', tags: ['todos:1'], run: () => db.select().from(todos) })
  const write = mutation({ $id: 'untaggedWrite', invalidates: ['todos'], run: () => db.insert(notes).values({ id: 1, todoId: '1' }) })
  const a = scoped()
  await Promise.all([fetchQuery(a.scope, fnOf(untagged), undefined), fetchQuery(a.scope, fnOf(byId), undefined)])
  expect(a.found.map(d => d.code + ' ' + d.message.split(':')[0])).toEqual(['Q011 `untagged` reads table `notes`, but its `tags` don\'t name it'])
  const b = scoped('POST')
  await runMutation(b.scope, fnOf(write), undefined, [])
  expect(b.found.map(d => d.code)).toEqual(['Q011'])
  expect(b.found[0].message).toContain('writes table `notes`')
  const again = scoped()
  await fetchQuery(again.scope, fnOf(untagged), undefined)
  expect(again.found).toEqual([])
})

test('Q011 stays out of production and off exempt tables', async () => {
  const db = await fresh()
  const q = query({ $id: 'prod', run: () => db.select().from(todos) })
  const found: unknown[] = []
  await fetchQuery(createScope(new Request('http://localhost/'), { onDiagnostic: d => found.push(d) }), fnOf(q), undefined)
  expect(found).toEqual([])
  db.$weft.exempt.add('todos')
  const dev = query({ $id: 'exempt', run: () => db.select().from(todos) })
  const { found: seen, scope } = scoped()
  await fetchQuery(scope, fnOf(dev), undefined)
  expect(seen).toEqual([])
})

test('schemasOf: a table is its validator; `refine` and `pick` narrow it, and it reaches JSON Schema', async () => {
  const s = schemasOf(schema, { todos: { title: (t: any) => t.min(2) } })
  expect(s.todos.insert.pick({ title: true }).safeParse({ title: 'ok' }).success).toBe(true)
  expect(s.todos.insert.pick({ title: true }).safeParse({ title: 'x' }).success).toBe(false)
  expect(s.todos.select.safeParse({ id: '1', title: 'ok' }).success).toBe(false) // select: every column
  expect(s.todos.update.safeParse({ done: true }).success).toBe(true)
  expect(Object.keys(s)).toEqual(['todos', 'notes'])
  expect((s.todos.insert as any)['~standard'].jsonSchema.input({ target: 'draft-2020-12' }).required).toEqual(['id', 'title'])
})

test('readMigrations: the journal\'s order, and nothing for an app with no folder', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const root = mkdtempSync(join(tmpdir(), 'weft-mig-'))
  expect(readMigrations(root)).toEqual([])
  mkdirSync(join(root, 'drizzle/meta'), { recursive: true })
  writeFileSync(join(root, 'drizzle/0001_b.sql'), 'b')
  writeFileSync(join(root, 'drizzle/0000_a.sql'), 'a')
  writeFileSync(join(root, 'drizzle/meta/_journal.json'), JSON.stringify({ entries: [{ tag: '0000_a' }, { tag: '0001_b' }] }))
  expect(readMigrations(root)).toEqual([{ tag: '0000_a', sql: 'a' }, { tag: '0001_b', sql: 'b' }])
  rmSync(root, { recursive: true, force: true })
})

describe.each([
  ['postgres', process.env.WEFT_TEST_POSTGRES, 'postgres://u:p@127.0.0.1:1/none', () => import('../src/db/postgres'), pgTable('weft_lazy', { id: pgText().primaryKey() })],
  ['mysql', process.env.WEFT_TEST_MYSQL, 'mysql://u:p@127.0.0.1:1/none', () => import('../src/db/mysql'), mysqlTable('weft_lazy', { id: varchar({ length: 36 }).primaryKey() })],
] as const)('%s, migrated on first use', (_, url, closed, load, table) => {
  afterEach(() => { runtime.migrations = undefined })

  test.skipIf(!url)('statements and transactions wait for one run; a dead server is Q016', async () => {
    const { createDb: make } = (await load()) as any
    const tag = `lazy_${Date.now()}`
    const db = make({ schema: { table }, url })
    const migrate = vi.spyOn(db.$weft, 'migrate')
    runtime.migrations = { list: [{ tag, sql: 'drop table if exists weft_lazy;\n--> statement-breakpoint\ncreate table weft_lazy (id varchar(36) primary key);' }], report() {} }
    await Promise.all([db.select().from(table), db.select().from(table), db.transaction((tx: any) => tx.insert(table).values({ id: 'a' }))])
    expect(migrate).toHaveBeenCalledTimes(1)
    expect(await db.select().from(table)).toEqual([{ id: 'a' }])

    const seen: unknown[] = []
    runtime.migrations = { list: [], report: e => seen.push(e) }
    await expect(make({ schema: { table }, url: closed }).select().from(table)).rejects.toMatchObject({ cause: { code: 'Q016', status: 503 } })
    expect(seen).toHaveLength(1)
  })
})

describe.skipIf(!process.env.WEFT_TEST_MYSQL)('mysql', () => {
  const my = mysqlTable('my_todos', { id: varchar({ length: 36 }).primaryKey(), title: varchar({ length: 200 }).notNull() })
  const tables = { my }
  const url = process.env.WEFT_TEST_MYSQL!
  const migrations = [{ tag: `0000_${Date.now()}`, sql: 'drop table if exists my_todos;--> statement-breakpoint\ncreate table my_todos (id varchar(36) primary key, title varchar(200) not null)' }]

  test('same API and migrations, each file once; Q013 on a file URL', async () => {
    const db = createMysql({ schema: tables, url, migrate: false })
    await db.$weft.migrate(migrations)
    await db.insert(my).values({ id: '1', title: 'Milk' })
    await db.$weft.migrate(migrations) // a second run would drop the row
    expect(await db.select().from(my)).toEqual([{ id: '1', title: 'Milk' }])
    expect(() => createMysql({ schema: tables, url: 'file:x.db' })).toThrow(/Q013|mysql:/)
  })
})

describe.skipIf(!process.env.WEFT_TEST_POSTGRES)('postgres', () => {
  const rows = pgTable('weft_test_rows', { id: pgText().primaryKey(), n: pgInteger().notNull() })
  const url = process.env.WEFT_TEST_POSTGRES!
  const table = [{ tag: `pg_${Date.now()}`, sql: 'drop table if exists weft_test_rows;\n--> statement-breakpoint\ncreate table weft_test_rows (id text primary key, n integer not null);' }]

  test('same API, migrations, Q011 and Q014; Q013 on a file URL', async () => {
    const { createDb: createPg } = await import('../src/db/postgres')
    expect(() => createPg({ schema: { rows }, url: 'file:x.db' })).toThrow(/Q013|postgres/)
    const db = createPg({ schema: { rows }, url, migrate: false })
    await db.$weft.migrate(table)
    await db.$weft.migrate(table)
    await db.insert(rows).values({ id: 'a', n: 1 })
    expect(await db.select().from(rows)).toEqual([{ id: 'a', n: 1 }])
    await expect(db.transaction(async t => { await t.insert(rows).values({ id: 'b', n: 2 }); throw new Error('no') })).rejects.toThrow('no')
    expect(await db.select().from(rows)).toHaveLength(1)
    const q = query({ $id: 'pgUntagged', run: () => db.select().from(rows) })
    const { found, scope } = scoped()
    await fetchQuery(scope, fnOf(q), undefined)
    expect(found.map(d => d.code)).toEqual(['Q011'])
    await db.execute(sql`drop table weft_test_rows`)
    const gone = query({ $id: 'pgGone', tags: ['weft_test_rows'], run: () => db.select().from(rows) })
    await expect(fetchQuery(scoped().scope, fnOf(gone), undefined)).rejects.toMatchObject({ code: 'Q014' })
    await db.$client.end()
  })
})
