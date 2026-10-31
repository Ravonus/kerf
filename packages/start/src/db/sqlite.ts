// SQLite for `@weft/start` (research 28 §1): Node's and Deno's `node:sqlite` or Bun's `bun:sqlite` behind Drizzle's
// proxy driver, so no native binary and the same async API as Postgres. One connection, opened on the first statement
// (`weft build` loads this module and must not touch a file). A transaction's body is async, so it holds a gate:
// statements outside it wait, or a rollback would take another request's writes with it.

import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import { StartError } from '../data'
import { gate, register, statements, touch, type DbHandle, type Migration } from './core'

export type Method = 'run' | 'all' | 'values' | 'get'

interface Conn {
  /** Array rows, as the proxy driver wants them. */
  query(sql: string, params: unknown[], method: Method): unknown
  exec(sql: string): void
}

async function open(path: string): Promise<Conn> {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const pick = (rows: unknown[][], method: Method) => (method === 'get' ? rows[0] : rows)
  let conn: Conn
  if ((globalThis as any).Bun) {
    const { Database } = await import('bun:sqlite' as string)
    const db = new Database(path, { create: true })
    conn = {
      query: (sql, params, method) => (method === 'run' ? void db.prepare(sql).run(...params) : pick(db.prepare(sql).values(...params), method)),
      exec: sql => void db.run(sql),
    }
  } else {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(path)
    conn = {
      query: (sql, params, method) => {
        const s = db.prepare(sql)
        if (method === 'run') return void s.run(...(params as any[]))
        s.setReturnArrays(true)
        return pick(s.all(...(params as any[])) as unknown as unknown[][], method)
      },
      exec: sql => db.exec(sql),
    }
  }
  if (path !== ':memory:') conn.exec('pragma journal_mode = wal')
  conn.exec('pragma foreign_keys = on; pragma busy_timeout = 5000')
  return conn
}

export interface SqliteOptions<S extends Record<string, unknown>> {
  schema: S
  /** `file:.data/app.db` (the default), a path, or `:memory:`. */
  url?: string
  /** Apply `drizzle/` before the first statement a request runs (default true). */
  migrate?: boolean
}

export type SqliteDb<S extends Record<string, unknown>> = SqliteRemoteDatabase<S> & { $weft: DbHandle }

export function createDb<S extends Record<string, unknown>>({ schema, url = 'file:.data/app.db', migrate = true }: SqliteOptions<S>): SqliteDb<S> {
  if (/^[a-z][a-z0-9+.-]+:\/\//i.test(url) && !url.startsWith('file:'))
    throw new StartError('Q013', `\`@weft/start/db/sqlite\` can't open \`${url.replace(/\/\/.*@/, '//…@')}\``, 'use `file:<path>`, or `createDb` from `@weft/start/db/postgres` for a Postgres URL')
  const path = url.replace(/^file:/, '')
  let conn: Promise<Conn> | undefined
  const connect = () => (conn ??= open(path).catch(e => { conn = undefined; throw e }))
  const inside = new AsyncLocalStorage<boolean>()
  let held: Promise<unknown> = Promise.resolve()
  const handle: DbHandle = {
    dialect: 'sqlite',
    exempt: new Set(),
    async migrate(list: Migration[]) {
      const c = await connect()
      c.exec('create table if not exists __weft_migrations (tag text primary key, at integer not null)')
      const done = new Set((c.query('select tag from __weft_migrations', [], 'values') as string[][]).map(r => r[0]))
      for (const m of list) {
        if (done.has(m.tag)) continue
        c.exec('begin')
        try {
          for (const s of statements(m.sql)) c.exec(s)
          c.query('insert into __weft_migrations values (?, ?)', [m.tag, Date.now()], 'run')
          c.exec('commit')
        } catch (e) {
          c.exec('rollback')
          throw e
        }
      }
    },
  }
  const ready = gate(handle, migrate)
  const run = async (sql: string, params: unknown[], method: Method) => {
    touch(handle, sql)
    await ready()
    const c = await connect()
    if (!inside.getStore()) await held
    return { rows: c.query(sql, params, method) as any }
  }
  const batch = async (list: { sql: string; params: unknown[]; method: Method }[]) => {
    await ready()
    const c = await connect()
    await held
    c.exec('begin')
    try {
      const out = list.map(q => (touch(handle, q.sql), { rows: c.query(q.sql, q.params, q.method) as any }))
      c.exec('commit')
      return out
    } catch (e) {
      c.exec('rollback')
      throw e
    }
  }
  const db = drizzle(run, batch, { schema })
  const transaction = db.transaction.bind(db)
  db.transaction = (async (fn: any, config: any) => {
    if (inside.getStore()) return transaction(fn, config)
    await ready()
    const before = held
    let open!: () => void
    held = new Promise<void>(ok => (open = ok))
    await before
    try {
      return await inside.run(true, () => transaction(fn, config))
    } finally {
      open()
    }
  }) as typeof db.transaction
  return register(db, handle)
}
