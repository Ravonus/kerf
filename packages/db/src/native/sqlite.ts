// SQLite with no ORM: Node's and Deno's `node:sqlite`, or Bun's `bun:sqlite`. One connection, opened on the first
// statement. A transaction's body is async, so it holds a gate: statements outside it wait.

import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SQLInputValue } from 'node:sqlite'
import { createNative, type Driver, type Row } from './index'

interface Conn {
  all(text: string, params: unknown[]): Row[]
  exec(text: string): void
}

async function open(path: string): Promise<Conn> {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  let conn: Conn
  if ('Bun' in globalThis) {
    const { Database } = await import('bun:sqlite')
    const db = new Database(path, { create: true })
    conn = { all: (text, params) => db.prepare(text).all(...params), exec: text => void db.run(text) }
  } else {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(path)
    // `node:sqlite` on Deno refuses a boolean, which SQLite stores as 0 or 1 anyway.
    conn = { all: (text, params) => db.prepare(text).all(...(params.map(v => (typeof v === 'boolean' ? Number(v) : v)) as SQLInputValue[])), exec: text => db.exec(text) }
  }
  if (path !== ':memory:') conn.exec('pragma journal_mode = wal')
  conn.exec('pragma foreign_keys = on; pragma busy_timeout = 5000')
  return conn
}

/** A client on one SQLite file, or `:memory:`. */
export function createDb({ url = 'file:.data/app.db', migrate }: { url?: string; migrate?: boolean } = {}) {
  const path = url.replace(/^file:/, '')
  let conn: Promise<Conn> | undefined
  const connect = () => (conn ??= open(path))
  const inside = new AsyncLocalStorage<boolean>()
  let gate: Promise<unknown> = Promise.resolve()
  const query = async (text: string, params: unknown[]) => {
    const c = await connect()
    if (!inside.getStore()) await gate
    return c.all(text, params)
  }
  const driver: Driver<() => Promise<Conn>> = {
    dialect: 'sqlite',
    raw: connect,
    query,
    exec: async text => (await connect()).exec(text),
    async transaction(fn) {
      if (inside.getStore()) return fn({ query })
      const c = await connect()
      const before = gate
      let release!: () => void
      gate = new Promise<void>(ok => { release = ok })
      await before
      try {
        c.exec('begin')
        try {
          const out = await inside.run(true, () => fn({ query }))
          c.exec('commit')
          return out
        } catch (e) {
          c.exec('rollback')
          throw e
        }
      } finally {
        release()
      }
    },
    locked: fn => fn(),
  }
  return createNative(driver, { migrate })
}
