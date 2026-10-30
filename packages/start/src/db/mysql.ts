// MySQL for `@weft/start` (research 34 §4): Drizzle on mysql2, pure JS. The pool connects on the first statement, so
// `weft build` needs no database. MySQL commits around DDL, so a failed migration can't roll back; a named lock keeps
// instances starting together from applying a file twice.

import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2'
import { createPool } from 'mysql2/promise'
import { StartError } from '../data'
import { register, statements, touch, type DbHandle, type Migration } from './core'

export interface MysqlOptions<S extends Record<string, unknown>> {
  schema: S
  /** `mysql://user:pass@host:3306/db`. */
  url: string
  /** Apply `drizzle/` before the first request (default true). */
  migrate?: boolean
  /** Pool size (default 10). */
  max?: number
}

export type MysqlDb<S extends Record<string, unknown>> = MySql2Database<S> & { $weft: DbHandle }

const LOCK = 'weft_migrations'

export function createDb<S extends Record<string, unknown>>({ schema, url, migrate = true, max = 10 }: MysqlOptions<S>): MysqlDb<S> {
  if (!url && process.env.WEFT_BUILD) url = 'mysql://localhost/build' // a build loads this module and never connects
  if (!/^mysql:\/\//.test(url ?? ''))
    throw new StartError('Q013', `\`@weft/start/db/mysql\` needs a \`mysql://\` URL, not \`${String(url).replace(/\/\/.*@/, '//…@')}\``, 'set `DATABASE_URL`, or `createDb` from `@weft/start/db/sqlite`')
  // No `maxIdle` below the limit: that starts mysql2's reaper, a timer that keeps a finished `weft build` alive forever.
  const pool = createPool({ uri: url, connectionLimit: max })
  const handle: DbHandle = {
    dialect: 'mysql',
    exempt: new Set(),
    async migrate(list: Migration[]) {
      const c = await pool.getConnection()
      try {
        await c.query('select get_lock(?, 60)', [LOCK])
        await c.query('create table if not exists __weft_migrations (tag varchar(255) primary key, at timestamp not null default current_timestamp)')
        const [rows] = await c.query('select tag from __weft_migrations')
        const done = new Set((rows as { tag: string }[]).map(r => r.tag))
        for (const m of list) {
          if (done.has(m.tag)) continue
          for (const s of statements(m.sql)) await c.query(s)
          await c.query('insert into __weft_migrations (tag) values (?)', [m.tag])
        }
      } finally {
        await c.query('select release_lock(?)', [LOCK]).catch(() => {})
        c.release()
      }
    },
  }
  const db = drizzle(pool, { schema, mode: 'default', logger: { logQuery: sql => touch(handle, sql) } })
  return register(db, handle, migrate)
}
