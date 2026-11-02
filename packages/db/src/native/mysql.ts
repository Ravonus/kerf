// MySQL with no ORM: mysql2's pool, which connects on the first statement, so a build needs no database. Files run on
// one connection with multiple statements on; everything else has it off.

import { driver } from '../driver'
import { createNative, type Driver, type Row } from './index'

const { createConnection, createPool } = await driver('@weft-js/db/plugin-native/mysql', 'mysql2', () => import('mysql2/promise'))

const LOCK = 'weft_migrations'

export function createDb({ url, migrate, max = 10 }: { url: string; migrate?: boolean; max?: number }) {
  const uri = url || 'mysql://localhost/build'
  // No `maxIdle` below the limit: that starts mysql2's reaper, a timer that keeps a finished `weft build` alive forever.
  const pool = createPool({ uri, connectionLimit: max })
  const rows = async (run: Promise<[unknown, unknown]>) => (await run)[0] as Row[]
  const driver: Driver<typeof pool> = {
    dialect: 'mysql',
    raw: pool,
    query: (text, params) => rows(pool.execute(text, params as any[]) as any),
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
        const out = await fn({ query: (text, params) => rows(c.execute(text, params as any[]) as any) })
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
        await c.query('select get_lock(?, 60)', [LOCK])
        return await fn()
      } finally {
        await c.query('select release_lock(?)', [LOCK]).catch(() => {})
        c.release()
      }
    },
  }
  return createNative(driver, { migrate })
}
