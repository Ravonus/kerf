// The Native layer: bound values, migrations once, transactions. MySQL and Postgres repeat it when WEFT_TEST_MYSQL or
// WEFT_TEST_POSTGRES names a private instance.
import { createNative, type Driver } from '../src/index'
import { createDb as mysql } from '../src/mysql'
import { createDb as postgres } from '../src/postgres'
import { createDb as sqlite } from '../src/sqlite'

const init = `create table if not exists native_todos (id varchar(36) primary key, title varchar(200) not null);`

describe.each([
  ['sqlite', true, () => sqlite({ url: ':memory:', migrate: false })],
  ['mysql', !!process.env.WEFT_TEST_MYSQL, () => mysql({ url: process.env.WEFT_TEST_MYSQL!, migrate: false })],
  ['postgres', !!process.env.WEFT_TEST_POSTGRES, () => postgres({ url: process.env.WEFT_TEST_POSTGRES!, migrate: false })],
])('%s', (_, on, make) => {
  const ready = async () => {
    const db = make()
    await db.$weft.migrate([{ tag: `0_${Math.random()}`, sql: `drop table if exists native_todos;\n${init}` }])
    return db
  }

  test.runIf(on)('a value is bound, so a hostile one is only text', async () => {
    const db = await ready()
    const title = `'); drop table native_todos; --`
    await db.sql`insert into native_todos (id, title) values (${'1'}, ${title})`
    expect(await db.sql`select title from native_todos where id = ${'1'}`).toEqual([{ title }])
  })

  test.runIf(on)('a migration applies once', async () => {
    const db = await ready()
    const list = [{ tag: `seed_${Math.random()}`, sql: `insert into native_todos (id, title) values ('a', 'x');` }]
    await db.$weft.migrate(list)
    await db.$weft.migrate(list)
    expect(await db.sql`select id from native_todos`).toEqual([{ id: 'a' }])
  })

  test.runIf(on)('a failed transaction leaves nothing', async () => {
    const db = await ready()
    await expect(db.transaction(async tx => {
      await tx.sql`insert into native_todos (id, title) values (${'t'}, ${'x'})`
      throw new Error('no')
    })).rejects.toThrow('no')
    expect(await db.sql`select id from native_todos`).toEqual([])
  })
})

test('your own driver works the same way', async () => {
  const seen: unknown[][] = []
  const driver: Driver<string> = {
    dialect: 'postgresql', raw: 'mine', exec: async () => {}, locked: fn => fn(),
    query: async (text, params) => (seen.push([text, params]), []),
    transaction: fn => fn(driver),
  }
  const db = createNative(driver, { migrate: false })
  await db.sql`select ${1}, ${2}`
  expect(seen).toEqual([['select $1, $2', [1, 2]]])
  expect(db.driver).toBe('mine')
})
