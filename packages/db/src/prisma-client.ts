// Prisma: `withKerf(client, dialect)` returns the same client with the handle the server
// migrates and Q011 reads. Migrations are `prisma/migrations`, applied here because `prisma migrate deploy` isn't in a
// production bundle. Interactive transactions keep the lock and the statements on one connection. It stays Prisma's own
// client, so kerf can't hold a statement: the server runs the gate per request instead, and a failed run doesn't fail it.

import { gate, register, touch, type DbHandle, type Migration } from '@kerf/start/db/core'
import { runtime } from '@kerf/start/data'

type Dialect = DbHandle['dialect']
interface Tx {
  $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number>
  $queryRawUnsafe<T>(sql: string, ...values: unknown[]): Promise<T>
}
interface Client extends Tx {
  $on?(event: 'query', fn: (e: { query: string }) => void): void
  $transaction<T>(
    fn: (tx: Tx) => Promise<T>,
    options: { maxWait: number; timeout: number },
  ): Promise<T>
}

const LOCK = 7_301_988
const statements = (sql: string) =>
  sql
    .split(/;[ \t]*(?:\r?\n|$)/)
    .map((s) => s.replace(/^(\s*--.*\n)+/, '').trim())
    .filter(Boolean)

/** The same client, with `$kerf`: the handle the server migrates and Q011 reads. */
export function withKerf<C extends object>(
  client: C,
  dialect: Dialect,
  { migrate = true }: { migrate?: boolean | undefined } = {},
): C & { $kerf: DbHandle } {
  const c = client as unknown as Client
  const handle: DbHandle = {
    dialect,
    exempt: new Set(),
    migrate: (list: Migration[]) =>
      c.$transaction(
        async (tx) => {
          if (dialect === 'postgresql')
            await tx.$queryRawUnsafe(`select pg_advisory_xact_lock(${LOCK})::text`)
          if (dialect === 'mysql') {
            const got = await tx.$queryRawUnsafe<{ got: unknown }[]>(
              `select get_lock('kerf_migrations', 60) as got`,
            )
            if (Number(got[0]?.got) !== 1)
              throw new Error('another instance held the migration lock for 60s')
          }
          try {
            await tx.$executeRawUnsafe(
              'create table if not exists __kerf_migrations (tag varchar(255) primary key)',
            )
            const done = new Set(
              (
                await tx.$queryRawUnsafe<{ tag: string }[]>('select tag from __kerf_migrations')
              ).map((r) => r.tag),
            )
            for (const m of list) {
              if (done.has(m.tag)) continue
              for (const s of statements(m.sql)) await tx.$executeRawUnsafe(s)
              await tx.$executeRawUnsafe(
                `insert into __kerf_migrations (tag) values (${dialect === 'postgresql' ? '$1' : '?'})`,
                m.tag,
              )
            }
          } finally {
            // MySQL's lock belongs to the connection, not the transaction: a failed run would keep it in the pool.
            if (dialect === 'mysql')
              await tx.$queryRawUnsafe(`select release_lock('kerf_migrations')`).catch(() => {})
          }
        },
        { maxWait: 60_000, timeout: 120_000 },
      ),
  }
  c.$on?.('query', (e) => touch(handle, e.query))
  ;(runtime.dbs ??= new Set()).add(gate(handle, migrate))
  return register(client, handle)
}
