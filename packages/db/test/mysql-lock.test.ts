// The migration lock on a stand-in pool: MySQL's `get_lock` answers 0 on a timeout, it doesn't throw.
import { createDb } from '../src/native/mysql'

const seen = vi.hoisted(() => ({ got: 1 }))
vi.mock('mysql2/promise', () => ({
  createConnection: () => Promise.resolve({ query: () => Promise.resolve(), end: () => Promise.resolve() }),
  createPool: () => ({
    getConnection: () => Promise.resolve({ query: (text: string) => Promise.resolve([text.includes('get_lock') ? [{ got: seen.got }] : []]), release() {} }),
    execute: () => Promise.resolve([[]]),
  }),
}))

test('a lock it didn\'t get stops the migrations: two instances don\'t run one file', async () => {
  const db = createDb({ url: 'mysql://x/y', migrate: false })
  seen.got = 0
  await expect(db.$weft.migrate([])).rejects.toThrow('migration lock')
  seen.got = 1
  await expect(db.$weft.migrate([])).resolves.toBeUndefined()
})
