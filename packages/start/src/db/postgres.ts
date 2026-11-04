// Postgres for `@weft-js/start` (research 28 §2): Drizzle on postgres.js, pure JS on Node, Bun and Deno. The client
// connects on the first statement, so `weft build` and a page with no queries need no database. Migrations hold an
// advisory lock, so instances starting together apply each file once.

import postgres from 'postgres'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { StartError } from '../data'
import { gate, register, statements, touch, type DbHandle, type Migration } from './core'

/** `createDb` on Postgres: the schema, the URL, and whether to migrate on first use. */
export interface PostgresOptions<S extends Record<string, unknown>> {
  schema: S
  /** `postgres://user:pass@host:5432/db`. */
  url: string
  /** Apply `drizzle/` before the first statement a request runs (default true). */
  migrate?: boolean
  /** Pool size (default 10). */
  max?: number
  /**
   * Keep each statement prepared on its connection (default true). Drizzle asks for neither, and an unprepared statement
   * with parameters is two round trips, a describe before every bind. Off behind a pooler in transaction mode. A long
   * list isn't kept: each length is a statement of its own, and each statement stays in the connection's memory.
   */
  prepare?: boolean
}

/** Drizzle on postgres.js, with `$weft` for the framework's own needs. */
export type PostgresDb<S extends Record<string, unknown>> = PostgresJsDatabase<S> & {
  $weft: DbHandle
}

const LOCK = 7_301_986
/** The most parameters a statement that's kept takes. Past it, `inArray` over a growing list is what's asking. */
const KEPT = 32

/** A pooled Drizzle client on Postgres, with this app's migrations and write tracking. */
export function createDb<S extends Record<string, unknown>>({
  schema,
  url,
  migrate = true,
  max = 10,
  prepare = true,
}: PostgresOptions<S>): PostgresDb<S> {
  if (!url && process.env.WEFT_BUILD) url = 'postgres://localhost/build' // a build loads this module and never connects
  if (!/^postgres(ql)?:\/\//.test(url ?? ''))
    throw new StartError(
      'Q013',
      `\`@weft-js/start/db/postgres\` needs a \`postgres://\` URL, not \`${(url ?? '').replace(/\/\/.*@/, '//…@')}\``,
      'set `DATABASE_URL`, or `createDb` from `@weft-js/start/db/sqlite` for a file',
    )
  // Idle connections close, so a stopped server can exit.
  const client = postgres(url, { max, idle_timeout: 20, onnotice: () => {} })
  const handle: DbHandle = {
    dialect: 'postgresql',
    exempt: new Set(),
    async migrate(list: Migration[]) {
      await client.begin(async (tx) => {
        await tx.unsafe(`select pg_advisory_xact_lock(${LOCK})`)
        await tx.unsafe(
          'create table if not exists __weft_migrations (tag text primary key, at timestamptz not null default now())',
        )
        const done = new Set(
          (await tx.unsafe('select tag from __weft_migrations')).map((r) => r.tag),
        )
        for (const m of list) {
          if (done.has(m.tag)) continue
          for (const s of statements(m.sql)) await tx.unsafe(s)
          await tx.unsafe('insert into __weft_migrations (tag) values ($1)', [m.tag])
        }
      })
    },
    changes: (tables, o) =>
      import('./changes-postgres').then((m) => m.postgresChanges({ ...o, url, client, tables })),
  }
  const ready = gate(handle, migrate)
  // All Drizzle sends goes through `unsafe` and `begin`, so holding those holds it; `handle.migrate` keeps the plain client.
  const held = new Proxy(client, {
    get(t, key) {
      if (key === 'begin')
        return async (...a: Parameters<typeof t.begin>) => (await ready(), t.begin(...a))
      if (key !== 'unsafe') return Reflect.get(t, key)
      return (
        text: string,
        params?: postgres.ParameterOrJSON<never>[],
        options?: postgres.UnsafeQueryOptions,
      ) => {
        const send = () =>
          t.unsafe(text, params, { ...options, prepare: prepare && (params?.length ?? 0) <= KEPT })
        const after = <T>(go: () => PromiseLike<T>) => Promise.resolve(ready()).then(go)
        // oxlint-disable-next-line unicorn/no-thenable -- postgres.js's query is a lazy thenable, and Drizzle awaits it as one
        return {
          values: () => after(() => send().values()),
          then: <A, B>(ok: (rows: unknown) => A, no: (e: unknown) => B) => after(send).then(ok, no),
        }
      }
    },
  })
  const db = drizzle(held, { schema, logger: { logQuery: (sql) => touch(handle, sql) } })
  return register(db, handle)
}
