// The Native layer: bound values, migrations once, transactions. MySQL and Postgres repeat it when WEFT_TEST_MYSQL or
// WEFT_TEST_POSTGRES names a private instance.
import { runtime } from '@weft/start/data'
import { Kysely } from 'kysely'
import { nativeAuth } from '../src/auth'
import { createNative, type Driver } from '../src/index'
import { createDb as mysql } from '../src/mysql'
import { createDb as postgres } from '../src/postgres'
import { createDb as sqlite } from '../src/sqlite'

const init = `create table if not exists native_todos (id varchar(36) primary key, title varchar(200) not null);`

test('statements wait for the server\'s migrations, and only a request that sends one runs them', async () => {
  const ran: string[] = []
  let down = true
  const driver: Driver = {
    dialect: 'sqlite', raw: null,
    query: async text => { if (down) throw new Error('down'); ran.push(text); return [] },
    exec: async text => { if (down) throw new Error('down'); ran.push(text) },
    transaction: fn => fn(driver),
    locked: fn => fn(),
  }
  const db = createNative(driver)
  const seen: unknown[] = []
  runtime.migrations = { list: [{ tag: '0', sql: 'create table t (id int)' }], report: e => seen.push(e) }
  await expect(db.sql`select 1`).rejects.toMatchObject({ code: 'Q016', status: 503 })
  expect(seen).toHaveLength(1)
  down = false
  await Promise.all([db.sql`select 2`, db.query('select 3', []), db.transaction(tx => tx.sql`select 4`)])
  expect(ran.filter(s => s.startsWith('create table t'))).toHaveLength(1)
  expect(ran.indexOf('create table t (id int)')).toBeLessThan(ran.findIndex(s => s.startsWith('select 2')))
  runtime.migrations = undefined
})

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

describe.each([
  ['sqlite', true, () => sqlite({ url: ':memory:', migrate: false })],
  ['mysql', !!process.env.WEFT_TEST_MYSQL, () => mysql({ url: process.env.WEFT_TEST_MYSQL!, migrate: false })],
  ['postgres', !!process.env.WEFT_TEST_POSTGRES, () => postgres({ url: process.env.WEFT_TEST_POSTGRES!, migrate: false })],
])('Better Auth on %s', (_, on, make) => {
  test.runIf(on)('nativeAuth gives Kysely rows and affected counts over the same connection', async () => {
    const db = make()
    await db.$weft.migrate([{ tag: `0_${Math.random()}`, sql: `drop table if exists native_auth;\ncreate table native_auth (id varchar(36) primary key, title varchar(200) not null);` }])
    const kysely = new Kysely<{ native_auth: { id: string; title: string } }>({ dialect: nativeAuth(db).dialect })
    await kysely.insertInto('native_auth').values({ id: 'a', title: 'x' }).execute()
    const changed = await kysely.updateTable('native_auth').set({ title: 'y' }).where('id', '=', 'a').executeTakeFirst()
    if (db.$weft.dialect === 'mysql') expect(changed.numUpdatedRows).toBe(1n)
    expect(await kysely.selectFrom('native_auth').selectAll().execute()).toEqual([{ id: 'a', title: 'y' }])
  })
})
