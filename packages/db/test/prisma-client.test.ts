// withKerf on a stand-in client: the real one runs in the database matrix (create-kerf/scripts/db-matrix.mjs).
import { runtime } from '@kerf-js/start/data'
import { withKerf } from '../src/prisma-client'

function client() {
  const ran: string[] = []
  const tags = new Set<string>()
  const tx = {
    $executeRawUnsafe(sql: string, ...values: unknown[]) {
      ran.push(sql)
      if (sql.startsWith('insert into __kerf_migrations')) tags.add(values[0] as string)
      return Promise.resolve(0)
    },
    $queryRawUnsafe() {
      return Promise.resolve([...tags].map((tag) => ({ tag })))
    },
  }
  return { ran, ...tx, $transaction: (fn: (t: typeof tx) => Promise<void>) => fn(tx) }
}

const list = [
  {
    tag: '1_init',
    sql: '-- CreateTable\nCREATE TABLE a (id int);\n\n-- CreateIndex\nCREATE INDEX i ON a(id);\n',
  },
]

test('a file runs statement by statement, and once', async () => {
  const c = client()
  const db = withKerf(c, 'sqlite', { migrate: false })
  await db.$kerf.migrate(list)
  await db.$kerf.migrate(list)
  expect(c.ran.filter((s) => s.startsWith('CREATE'))).toEqual([
    'CREATE TABLE a (id int)',
    'CREATE INDEX i ON a(id)',
  ])
})

test("the server waits on a client it can't hold: its gate runs the list once, and `migrate: false` has none to run", async () => {
  const c = client()
  const before = runtime.dbs?.size ?? 0
  withKerf(c, 'sqlite')
  withKerf(client(), 'sqlite', { migrate: false })
  expect(runtime.dbs!.size).toBe(before + 2)
  const [on, off] = [...runtime.dbs!].slice(before) as [() => unknown, () => unknown]
  runtime.migrations = { list, report() {} }
  await Promise.all([on(), on()])
  expect(off()).toBeUndefined()
  expect(c.ran.filter((s) => s.startsWith('CREATE TABLE'))).toEqual(['CREATE TABLE a (id int)'])
  runtime.migrations = undefined
})

test("MySQL: a lock it didn't get stops the run, and a failed run lets the connection go without it", async () => {
  const c = client()
  const query = (got: number) => (sql: string) => {
    c.ran.push(sql)
    return Promise.resolve(sql.includes('get_lock') ? [{ got: BigInt(got) }] : [])
  }
  const db = (got: number) =>
    withKerf(
      {
        ...c,
        $queryRawUnsafe: query(got),
        $transaction: (fn: (t: unknown) => Promise<void>) =>
          fn({ ...c, $queryRawUnsafe: query(got) }),
      },
      'mysql',
      { migrate: false },
    )
  await expect(db(0).$kerf.migrate(list)).rejects.toThrow('migration lock')
  expect(c.ran.filter((s) => s.startsWith('CREATE'))).toEqual([])
  await expect(
    db(1).$kerf.migrate([{ tag: 'b', sql: 'CREATE TABLE b (id int);' }]),
  ).resolves.toBeUndefined()
  expect(c.ran.at(-1)).toContain('release_lock')
  const failing = {
    ...c,
    $queryRawUnsafe: query(1),
    $executeRawUnsafe: () => Promise.reject(new Error('bad sql')),
  }
  await expect(
    withKerf(
      { ...failing, $transaction: (fn: (t: unknown) => Promise<void>) => fn(failing) },
      'mysql',
      { migrate: false },
    ).$kerf.migrate(list),
  ).rejects.toThrow('bad sql')
  expect(c.ran.at(-1)).toContain('release_lock')
})

test("it is the same client, so Prisma's docs stay true", () => {
  const c = client()
  expect(withKerf(c, 'mysql', { migrate: false })).toBe(c)
})
