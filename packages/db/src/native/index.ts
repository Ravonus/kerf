// SQL template values always go to the driver as parameters.

import { gate, register, touch, type DbHandle, type Migration } from '@kerf/start/db/core'

/** One row, by column name. */
export type Row = Record<string, unknown>

/** What an engine supplies: statements, files of them, a transaction and a lock. */
export interface Driver<D = unknown> {
  dialect: DbHandle['dialect']
  raw: D
  /** Run one statement with bound values, and return its rows as objects. */
  query(text: string, params: unknown[]): Promise<Row[]>
  exec(text: string): Promise<void>
  /** Run `fn` on one connection, committed when it resolves. */
  transaction<T>(fn: (driver: Pick<Driver, 'query'>) => Promise<T>): Promise<T>
  /** Hold off other instances while migrations run. */
  locked<T>(fn: () => Promise<T>): Promise<T>
}

/** The template tag: its values always go to the driver as parameters. */
export type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Row[]>

/** The client an app holds, as `ctx.db`. */
export interface NativeDb<D = unknown> {
  sql: Sql
  /** One statement you built, with its values bound. For a tool that writes SQL; in app code use `sql`. */
  query: Driver['query']
  driver: D
  transaction<T>(fn: (tx: { sql: Sql }) => Promise<T>): Promise<T>
  $kerf: DbHandle
}

const placeholder = (dialect: DbHandle['dialect'], i: number) =>
  dialect === 'postgresql' ? `$${i + 1}` : '?'

const tag =
  (handle: DbHandle, query: Driver['query']): Sql =>
  (strings, ...values) => {
    const text = strings.reduce((out, part, i) => out + placeholder(handle.dialect, i - 1) + part)
    touch(handle, text)
    return query(text, values)
  }

/** A client over any `Driver`, with its migrations behind the same gate as every statement. */
export function createNative<D>(
  driver: Driver<D>,
  { migrate = true }: { migrate?: boolean | undefined } = {},
): NativeDb<D> {
  const handle: DbHandle = {
    dialect: driver.dialect,
    exempt: new Set(),
    migrate: (list: Migration[]) =>
      driver.locked(async () => {
        await driver.exec(
          'create table if not exists __kerf_migrations (tag varchar(255) primary key)',
        )
        const done = new Set(
          (await driver.query('select tag from __kerf_migrations', [])).map((r) => r.tag),
        )
        for (const m of list) {
          if (done.has(m.tag)) continue
          // A file with only comments is a migration still being written; some engines refuse an empty query.
          if (m.sql.replace(/--.*$/gm, '').trim()) await driver.exec(m.sql)
          await driver.query(
            `insert into __kerf_migrations (tag) values (${placeholder(driver.dialect, 0)})`,
            [m.tag],
          )
        }
      }),
  }
  const ready = gate(handle, migrate)
  const query: Driver['query'] = async (text, params) => (await ready(), driver.query(text, params))
  const db = {
    sql: tag(handle, query),
    query,
    driver: driver.raw,
    transaction: async <T>(fn: (tx: { sql: Sql }) => Promise<T>) => (
      await ready(),
      driver.transaction((tx) => fn({ sql: tag(handle, tx.query) }))
    ),
  }
  return register(db, handle)
}
