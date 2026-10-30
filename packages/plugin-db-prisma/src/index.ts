// Prisma on weft's seam (research 34 §4): `withWeft(client, dialect)` returns the same client with the handle the server
// migrates and Q011 reads. Migrations are `prisma/migrations`, applied here because `prisma migrate deploy` isn't in a
// production bundle. Interactive transactions keep the lock and the statements on one connection.

import { register, touch, type DbHandle, type Migration } from '@weft/start/db/core'

type Dialect = DbHandle['dialect']
interface Tx {
  $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number>
  $queryRawUnsafe<T>(sql: string, ...values: unknown[]): Promise<T>
}
interface Client extends Tx {
  $on?(event: 'query', fn: (e: { query: string }) => void): void
  $transaction<T>(fn: (tx: Tx) => Promise<T>, options: { maxWait: number; timeout: number }): Promise<T>
}

const LOCK = 7_301_988
const statements = (sql: string) => sql.split(/;[ \t]*(?:\r?\n|$)/).map(s => s.replace(/^(\s*--.*\n)+/, '').trim()).filter(Boolean)

export function withWeft<C extends object>(client: C, dialect: Dialect, { migrate = true }: { migrate?: boolean } = {}): C & { $weft: DbHandle } {
  const c = client as unknown as Client
  const handle: DbHandle = {
    dialect,
    exempt: new Set(),
    migrate: (list: Migration[]) => c.$transaction(async tx => {
      if (dialect === 'postgresql') await tx.$queryRawUnsafe(`select pg_advisory_xact_lock(${LOCK})::text`)
      if (dialect === 'mysql') await tx.$queryRawUnsafe(`select get_lock('weft_migrations', 60)`)
      await tx.$executeRawUnsafe('create table if not exists __weft_migrations (tag varchar(255) primary key)')
      const done = new Set((await tx.$queryRawUnsafe<{ tag: string }[]>('select tag from __weft_migrations')).map(r => r.tag))
      for (const m of list) {
        if (done.has(m.tag)) continue
        for (const s of statements(m.sql)) await tx.$executeRawUnsafe(s)
        await tx.$executeRawUnsafe(`insert into __weft_migrations (tag) values (${dialect === 'postgresql' ? '$1' : '?'})`, m.tag)
      }
      if (dialect === 'mysql') await tx.$queryRawUnsafe(`select release_lock('weft_migrations')`)
    }, { maxWait: 60_000, timeout: 120_000 }),
  }
  c.$on?.('query', e => touch(handle, e.query))
  return register(client, handle, migrate)
}
