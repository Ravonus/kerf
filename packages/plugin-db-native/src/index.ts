// The no-ORM client (research 34 §4): one `sql` tag over any driver. Values always go to the driver as parameters, so
// a template can't build SQL from a value. An engine file supplies the driver; `createNative` takes your own the same way.

import { register, touch, type DbHandle, type Migration } from '@weft/start/db/core'

export type Row = Record<string, unknown>

export interface Driver<D = unknown> {
  dialect: DbHandle['dialect']
  /** The client underneath, for anything `sql` doesn't cover. */
  raw: D
  /** Run one statement with bound values, and return its rows as objects. */
  query(text: string, params: unknown[]): Promise<Row[]>
  /** Run a whole file of statements. */
  exec(text: string): Promise<void>
  /** Run `fn` on one connection, committed when it resolves. */
  transaction<T>(fn: (driver: Pick<Driver, 'query'>) => Promise<T>): Promise<T>
  /** Hold off other instances while migrations run. */
  locked<T>(fn: () => Promise<T>): Promise<T>
}

export type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Row[]>

export interface NativeDb<D = unknown> {
  sql: Sql
  /** One statement you built, with its values bound. For a tool that writes SQL; in app code use `sql`. */
  query: Driver['query']
  driver: D
  transaction<T>(fn: (tx: { sql: Sql }) => Promise<T>): Promise<T>
  $weft: DbHandle
}

const placeholder = (dialect: DbHandle['dialect'], i: number) => (dialect === 'postgresql' ? `$${i + 1}` : '?')

const tag = (handle: DbHandle, query: Driver['query']): Sql => (strings, ...values) => {
  const text = strings.reduce((out, part, i) => out + placeholder(handle.dialect, i - 1) + part)
  touch(handle, text)
  return query(text, values)
}

export function createNative<D>(driver: Driver<D>, { migrate = true }: { migrate?: boolean } = {}): NativeDb<D> {
  const handle: DbHandle = {
    dialect: driver.dialect,
    exempt: new Set(),
    migrate: (list: Migration[]) => driver.locked(async () => {
      await driver.exec('create table if not exists __weft_migrations (tag varchar(255) primary key)')
      const done = new Set((await driver.query('select tag from __weft_migrations', [])).map(r => r.tag))
      for (const m of list) {
        if (done.has(m.tag)) continue
        // A file with only comments is a migration still being written; some engines refuse an empty query.
        if (m.sql.replace(/--.*$/gm, '').trim()) await driver.exec(m.sql)
        await driver.query(`insert into __weft_migrations (tag) values (${placeholder(driver.dialect, 0)})`, [m.tag])
      }
    }),
  }
  const db = {
    sql: tag(handle, driver.query),
    query: driver.query,
    driver: driver.raw,
    transaction: <T>(fn: (tx: { sql: Sql }) => Promise<T>) => driver.transaction(tx => fn({ sql: tag(handle, tx.query) })),
  }
  return register(db, handle, migrate)
}

