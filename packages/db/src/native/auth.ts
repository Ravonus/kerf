// Better Auth on Native (research 34 §5): Better Auth speaks Kysely, so this is a Kysely dialect over Native's own
// connection. One connection on every engine and runtime, with no second driver and no ORM in the app's code.

import { MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler, type Dialect, type Kysely } from 'kysely'
import type { NativeDb } from './index'

const PARTS = {
  sqlite: { adapter: SqliteAdapter, compiler: SqliteQueryCompiler, introspector: SqliteIntrospector, type: 'sqlite' },
  postgresql: { adapter: PostgresAdapter, compiler: PostgresQueryCompiler, introspector: PostgresIntrospector, type: 'postgres' },
  mysql: { adapter: MysqlAdapter, compiler: MysqlQueryCompiler, introspector: MysqlIntrospector, type: 'mysql' },
} as const

/** Better Auth's `database` option on a Native client. It runs without transactions, which Better Auth treats as optional. */
export function nativeAuth(db: NativeDb) {
  const { adapter, compiler, introspector, type } = PARTS[db.$weft.dialect]
  const connection = {
    async executeQuery({ sql, parameters }: { sql: string; parameters: readonly unknown[] }) {
      const out = await db.query(sql, [...parameters]) as unknown
      // mysql2 answers a write with a header, not rows.
      if (Array.isArray(out)) return { rows: out }
      return { rows: [], numAffectedRows: BigInt((out as { affectedRows?: number }).affectedRows ?? 0) }
    },
    streamQuery(): never {
      throw new Error('Native has no streaming queries')
    },
  }
  const dialect = {
    createAdapter: () => new adapter(),
    createDriver: () => ({
      init: async () => {},
      destroy: async () => {},
      acquireConnection: async () => connection,
      releaseConnection: async () => {},
      beginTransaction: async () => {},
      commitTransaction: async () => {},
      rollbackTransaction: async () => {},
    }),
    createIntrospector: (kysely: Kysely<any>) => new introspector(kysely),
    createQueryCompiler: () => new compiler(),
  } as unknown as Dialect
  return { dialect, type, transaction: false }
}
