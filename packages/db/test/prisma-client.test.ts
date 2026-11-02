// withWeft on a stand-in client: the real one runs in the database matrix (create-weft/scripts/db-matrix.mjs).
import { runtime } from '@weft/start/data'
import { withWeft } from '../src/prisma-client'

function client() {
  const ran: string[] = []
  const tags = new Set<string>()
  const tx = {
    async $executeRawUnsafe(sql: string, ...values: unknown[]) {
      ran.push(sql)
      if (sql.startsWith('insert into __weft_migrations')) tags.add(values[0] as string)
      return 0
    },
    async $queryRawUnsafe() {
      return [...tags].map(tag => ({ tag }))
    },
  }
  return { ran, ...tx, $transaction: (fn: (t: typeof tx) => Promise<void>) => fn(tx) }
}

const list = [{ tag: '1_init', sql: '-- CreateTable\nCREATE TABLE a (id int);\n\n-- CreateIndex\nCREATE INDEX i ON a(id);\n' }]

test('a file runs statement by statement, and once', async () => {
  const c = client()
  const db = withWeft(c, 'sqlite', { migrate: false })
  await db.$weft.migrate(list)
  await db.$weft.migrate(list)
  expect(c.ran.filter(s => /^CREATE/.test(s))).toEqual(['CREATE TABLE a (id int)', 'CREATE INDEX i ON a(id)'])
})

test('the server waits on a client it can\'t hold: its gate runs the list once, and `migrate: false` has none to run', async () => {
  const c = client()
  const before = runtime.dbs?.size ?? 0
  withWeft(c, 'sqlite')
  withWeft(client(), 'sqlite', { migrate: false })
  expect(runtime.dbs!.size).toBe(before + 2)
  const [on, off] = [...runtime.dbs!].slice(before)
  runtime.migrations = { list, report() {} }
  await Promise.all([on(), on()])
  expect(off()).toBeUndefined()
  expect(c.ran.filter(s => /^CREATE TABLE/.test(s))).toEqual(['CREATE TABLE a (id int)'])
  runtime.migrations = undefined
})

test('it is the same client, so Prisma\'s docs stay true', () => {
  const c = client()
  expect(withWeft(c, 'mysql', { migrate: false })).toBe(c)
})
