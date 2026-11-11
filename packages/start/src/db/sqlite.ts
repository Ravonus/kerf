// SQLite for `@kerf-js/start` (research 28 §1): Node's and Deno's `node:sqlite` or Bun's `bun:sqlite` behind Drizzle's
// proxy driver, so no native binary and the same async API as Postgres. One connection, opened on the first statement
// (`kerf build` loads this module and must not touch a file). A transaction's body is async, so it holds a gate:
// statements outside it wait, or a rollback would take another request's writes with it.

// oxlint-disable-next-line typescript/triple-slash-reference -- an installed app's tsc doesn't include this file by itself, and it declares a module, so nothing can import it
/// <reference path="./bun-sqlite.d.ts" />
import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SQLInputValue } from 'node:sqlite'
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import { StartError } from '../data'
import { gate, register, statements, touch, type DbHandle, type Migration } from './core'

/** How Drizzle's proxy driver asks for rows. */
export type Method = 'run' | 'all' | 'values' | 'get'

interface Conn {
  /** Array rows, as the proxy driver wants them. */
  query(sql: string, params: unknown[], method: Method): unknown
  exec(sql: string): void
  close?(): void
}

/** The file open on this runtime's driver: Bun's, or `node:sqlite`. */
export async function open(path: string): Promise<Conn> {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const pick = (rows: unknown[][], method: Method) => (method === 'get' ? rows[0] : rows)
  let conn: Conn
  if ('Bun' in globalThis) {
    const { Database } = await import('bun:sqlite')
    const db = new Database(path, { create: true })
    conn = {
      query: (sql, params, method) =>
        method === 'run'
          ? void db.prepare(sql).run(...params)
          : pick(db.prepare(sql).values(...params), method),
      exec: (sql) => void db.run(sql),
      close: () => db.close(),
    }
  } else {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(path)
    conn = {
      query: (sql, params, method) => {
        const s = db.prepare(sql)
        if (method === 'run') return void s.run(...(params as SQLInputValue[]))
        s.setReturnArrays(true)
        return pick(s.all(...(params as SQLInputValue[])) as unknown as unknown[][], method)
      },
      exec: (sql) => db.exec(sql),
      close: () => db.close(),
    }
  }
  if (path !== ':memory:') conn.exec('pragma journal_mode = wal')
  conn.exec('pragma foreign_keys = on; pragma busy_timeout = 5000')
  return conn
}

async function migrateSqlite(connect: () => Promise<Conn>, list: Migration[]) {
  const c = await connect()
  c.exec('create table if not exists __kerf_migrations (tag text primary key, at integer not null)')
  const done = new Set(
    (c.query('select tag from __kerf_migrations', [], 'values') as string[][]).map((r) => r[0]),
  )
  for (const m of list) {
    if (done.has(m.tag)) continue
    c.exec('begin')
    try {
      for (const s of statements(m.sql)) c.exec(s)
      c.query('insert into __kerf_migrations values (?, ?)', [m.tag, Date.now()], 'run')
      c.exec('commit')
    } catch (e) {
      c.exec('rollback')
      throw e
    }
  }
}

/** `createDb` on SQLite: the schema, the file, and whether to migrate on first use. */
export interface SqliteOptions<S extends Record<string, unknown>> {
  schema: S
  /** `file:.data/app.db` (the default), a path, or `:memory:`. */
  url?: string
  /** Apply `drizzle/` before the first statement a request runs (default true). */
  migrate?: boolean
}

/** Drizzle over a local file, with `$kerf` for the framework's own needs. */
export type SqliteDb<S extends Record<string, unknown>> = SqliteRemoteDatabase<S> & {
  $kerf: DbHandle
}

/** A Drizzle client on a SQLite file, with this app's migrations and write tracking. */
export function createDb<S extends Record<string, unknown>>({
  schema,
  url = 'file:.data/app.db',
  migrate = true,
}: SqliteOptions<S>): SqliteDb<S> {
  if (/^[a-z][a-z0-9+.-]+:\/\//i.test(url) && !url.startsWith('file:'))
    throw new StartError(
      'Q013',
      `\`@kerf-js/start/db/sqlite\` can't open \`${url.replace(/\/\/.*@/, '//…@')}\``,
      'use `file:<path>`, or `createDb` from `@kerf-js/start/db/postgres` for a Postgres URL',
    )
  const path = url.replace(/^file:/, '')
  let conn: Promise<Conn> | undefined
  const connect = () =>
    (conn ??= open(path).catch((e) => {
      conn = undefined
      throw e
    }))
  const inside = new AsyncLocalStorage<boolean>()
  let held: Promise<unknown> = Promise.resolve()
  const handle: DbHandle = {
    dialect: 'sqlite',
    exempt: new Set(),
    ping: async () => (await connect()).query('select 1', [], 'all'),
    migrate: (list) => migrateSqlite(connect, list),
    changes: (tables, o) =>
      import('./changes-sqlite').then((m) => m.sqliteChanges({ ...o, path, open, tables })),
  }
  const ready = gate(handle, migrate)
  const run = async (sql: string, params: unknown[], method: Method) => {
    touch(handle, sql)
    await ready()
    const c = await connect()
    if (!inside.getStore()) await held
    return { rows: c.query(sql, params, method) as unknown[] }
  }
  const batch = async (list: { sql: string; params: unknown[]; method: Method }[]) => {
    await ready()
    const c = await connect()
    await held
    c.exec('begin')
    try {
      const out = list.map(
        (q) => (touch(handle, q.sql), { rows: c.query(q.sql, q.params, q.method) as unknown[] }),
      )
      c.exec('commit')
      return out
    } catch (e) {
      c.exec('rollback')
      throw e
    }
  }
  const db = drizzle(run, batch, { schema })
  const transaction = db.transaction.bind(db)
  db.transaction = (async (...args: Parameters<typeof transaction>) => {
    if (inside.getStore()) return transaction(...args)
    await ready()
    const before = held
    let release!: () => void
    held = new Promise<void>((ok) => {
      release = ok
    })
    await before
    try {
      return await inside.run(true, () => transaction(...args))
    } finally {
      release()
    }
  }) as typeof db.transaction
  return register(db, handle)
}
