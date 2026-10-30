// Postgres for `@weft/start` (research 28 §2): Drizzle on postgres.js, pure JS on Node, Bun and Deno. The client
// connects on the first statement, so `weft build` needs no database. Migrations hold an advisory lock, so instances
// starting together apply each file once.

import postgres from 'postgres'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { StartError } from '../data'
import { register, statements, touch, type DbHandle, type Migration } from './core'

export interface PostgresOptions<S extends Record<string, unknown>> {
  schema: S
  /** `postgres://user:pass@host:5432/db`. */
  url: string
  /** Apply `drizzle/` before the first request (default true). */
  migrate?: boolean
  /** Pool size (default 10). */
  max?: number
}

export type PostgresDb<S extends Record<string, unknown>> = PostgresJsDatabase<S> & { $weft: DbHandle }

const LOCK = 7_301_986

export function createDb<S extends Record<string, unknown>>({ schema, url, migrate = true, max = 10 }: PostgresOptions<S>): PostgresDb<S> {
  if (!url && process.env.WEFT_BUILD) url = 'postgres://localhost/build' // a build loads this module and never connects
  if (!/^postgres(ql)?:\/\//.test(url ?? ''))
    throw new StartError('Q013', `\`@weft/start/db/postgres\` needs a \`postgres://\` URL, not \`${String(url).replace(/\/\/.*@/, '//…@')}\``, 'set `DATABASE_URL`, or `createDb` from `@weft/start/db/sqlite` for a file')
  // Idle connections close, so a stopped server can exit.
  const client = postgres(url, { max, idle_timeout: 20, onnotice: () => {} })
  const handle: DbHandle = {
    dialect: 'postgresql',
    exempt: new Set(),
    async migrate(list: Migration[]) {
      await client.begin(async tx => {
        await tx.unsafe(`select pg_advisory_xact_lock(${LOCK})`)
        await tx.unsafe('create table if not exists __weft_migrations (tag text primary key, at timestamptz not null default now())')
        const done = new Set((await tx.unsafe('select tag from __weft_migrations')).map(r => r.tag))
        for (const m of list) {
          if (done.has(m.tag)) continue
          for (const s of statements(m.sql)) await tx.unsafe(s)
          await tx.unsafe('insert into __weft_migrations (tag) values ($1)', [m.tag])
        }
      })
    },
  }
  const db = drizzle(client, { schema, logger: { logQuery: sql => touch(handle, sql) } })
  return register(db, handle, migrate)
}
