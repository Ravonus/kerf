// Postgres with no ORM: postgres.js, which connects on the first statement, so a build needs no database.

import { driver } from '../driver'
import { createNative, type Driver, type Row } from './index'

const { default: postgres } = await driver('@weft-js/db/plugin-native/postgres', 'postgres', () => import('postgres'))

const LOCK = 7_301_987

/** A client on a postgres.js connection pool. */
export function createDb({ url, migrate, max = 10 }: { url: string; migrate?: boolean; max?: number }) {
  const client = postgres(url || 'postgres://localhost/build', { max, idle_timeout: 20, onnotice: () => {} })
  const on = (c: { unsafe: typeof client.unsafe }) => (text: string, params: unknown[]) => c.unsafe(text, params as Parameters<typeof client.unsafe>[1]) as unknown as Promise<Row[]>
  const engine: Driver<typeof client> = {
    dialect: 'postgresql',
    raw: client,
    query: on(client),
    exec: async text => void (await client.unsafe(text)),
    transaction: fn => client.begin(tx => fn({ query: on(tx) })),
    locked: fn => client.begin(async tx => {
      await tx.unsafe(`select pg_advisory_xact_lock(${LOCK})`)
      return fn()
    }),
  }
  return createNative(engine, { migrate })
}
