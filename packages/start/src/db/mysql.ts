// MySQL for `@kerf-js/start` (research 34 §4): Drizzle on mysql2, pure JS. The pool connects on the first statement, so
// `kerf build` and a page with no queries need no database. MySQL commits around DDL, so a failed migration can't roll back; a named lock keeps
// instances starting together from applying a file twice.

import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2'
import { createPool } from 'mysql2/promise'
import { StartError } from '../data'
import { gate, register, statements, touch, type DbHandle, type Migration } from './core'

/** `createDb` on MySQL: the schema, the URL, and whether to migrate on first use. */
export interface MysqlOptions<S extends Record<string, unknown>> {
  schema: S
  /** `mysql://user:pass@host:3306/db`. */
  url: string
  /** Apply `drizzle/` before the first statement a request runs (default true). */
  migrate?: boolean
  /** Pool size (default 10). */
  max?: number
}

/** Drizzle on mysql2, with `$kerf` for the framework's own needs. */
export type MysqlDb<S extends Record<string, unknown>> = MySql2Database<S> & { $kerf: DbHandle }

const LOCK = 'kerf_migrations'

/** A pooled Drizzle client on MySQL, with this app's migrations and write tracking. */
export function createDb<S extends Record<string, unknown>>({
  schema,
  url,
  migrate = true,
  max = 10,
}: MysqlOptions<S>): MysqlDb<S> {
  if (!url && process.env.KERF_BUILD) url = 'mysql://localhost/build' // a build loads this module and never connects
  if (!url?.startsWith('mysql://'))
    throw new StartError(
      'Q013',
      `\`@kerf-js/start/db/mysql\` needs a \`mysql://\` URL, not \`${(url ?? '').replace(/\/\/.*@/, '//…@')}\``,
      'set `DATABASE_URL`, or `createDb` from `@kerf-js/start/db/sqlite`',
    )
  // No `maxIdle` below the limit: that starts mysql2's reaper, a timer that keeps a finished `kerf build` alive forever.
  const pool = createPool({ uri: url, connectionLimit: max })
  const handle: DbHandle = {
    dialect: 'mysql',
    exempt: new Set(),
    ping: () => pool.query('select 1'),
    async migrate(list: Migration[]) {
      const c = await pool.getConnection()
      try {
        await c.query('select get_lock(?, 60)', [LOCK])
        await c.query(
          'create table if not exists __kerf_migrations (tag varchar(255) primary key, at timestamp not null default current_timestamp)',
        )
        const [rows] = await c.query('select tag from __kerf_migrations')
        const done = new Set((rows as { tag: string }[]).map((r) => r.tag))
        for (const m of list) {
          if (done.has(m.tag)) continue
          for (const s of statements(m.sql)) await c.query(s)
          await c.query('insert into __kerf_migrations (tag) values (?)', [m.tag])
        }
      } finally {
        await c.query('select release_lock(?)', [LOCK]).catch(() => {})
        c.release()
      }
    },
    changes: (tables, o) =>
      import('./changes-mysql').then((m) => m.mysqlChanges({ ...o, pool, tables })),
  }
  const ready = gate(handle, migrate)
  // All Drizzle sends goes through these three, so holding them holds it; `handle.migrate` keeps the plain pool.
  const held = new Proxy(pool, {
    get(t, key) {
      const v = Reflect.get(t, key)
      if (typeof v !== 'function') return v
      if (key !== 'query' && key !== 'execute' && key !== 'getConnection') return v.bind(t)
      return async (...a: unknown[]) => (await ready(), v.apply(t, a))
    },
  })
  const db = drizzle(held, {
    schema,
    mode: 'default',
    logger: { logQuery: (sql) => touch(handle, sql) },
  })
  return register(db, handle)
}
