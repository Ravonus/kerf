// MySQL with no ORM: mysql2's pool, which connects on the first statement, so a build needs no database. Files run on
// one connection with multiple statements on; everything else has it off.

import { driver } from '../driver'
import { createNative, type Driver, type Row } from './index'

const { createConnection, createPool } = await driver(
  '@kerf-js/db/plugin-native/mysql',
  'mysql2',
  () => import('mysql2/promise'),
)

const LOCK = 'kerf_migrations'
type ExecuteValues = Parameters<Awaited<ReturnType<typeof createConnection>>['execute']>[1]

/** A client on a mysql2 pool. */
export function createDb({
  url,
  migrate,
  max = 10,
}: {
  url: string
  migrate?: boolean
  max?: number
}) {
  const uri = url || 'mysql://localhost/build'
  // No `maxIdle` below the limit: that starts mysql2's reaper, a timer that keeps a finished `kerf build` alive forever.
  const pool = createPool({ uri, connectionLimit: max })
  const rows = async (run: Promise<[unknown, unknown]>) => (await run)[0] as Row[]
  const engine: Driver<typeof pool> = {
    dialect: 'mysql',
    raw: pool,
    query: (text, params) => rows(pool.execute(text, params as ExecuteValues)),
    async exec(text) {
      const c = await createConnection({ uri, multipleStatements: true })
      try {
        await c.query(text)
      } finally {
        await c.end()
      }
    },
    async transaction(fn) {
      const c = await pool.getConnection()
      try {
        await c.beginTransaction()
        const out = await fn({
          query: (text, params) => rows(c.execute(text, params as ExecuteValues)),
        })
        await c.commit()
        return out
      } catch (e) {
        await c.rollback()
        throw e
      } finally {
        c.release()
      }
    },
    async locked(fn) {
      const c = await pool.getConnection()
      try {
        const [got] = (await c.query('select get_lock(?, 60) as got', [LOCK])) as unknown as [
          { got: unknown }[],
        ]
        if (Number(got[0]?.got) !== 1)
          throw new Error('another instance held the migration lock for 60s')
        return await fn()
      } finally {
        await c.query('select release_lock(?)', [LOCK]).catch(() => {})
        c.release()
      }
    },
  }
  return createNative(engine, { migrate })
}
