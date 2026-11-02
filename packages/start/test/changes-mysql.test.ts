// The change feed on a real MySQL. `WEFT_TEST_MYSQL=mysql://…`, a database that's yours to lose.
import type { Loose } from './loose'
import { createPool } from 'mysql2/promise'
import { createFeed } from '../src/changes'
import { changeStatements } from '../src/changes-sql.mjs'
import { mysqlChanges } from '../src/db/changes-mysql'

const url = process.env.WEFT_TEST_MYSQL!
const wait = (ms = 0) => new Promise(ok => { setTimeout(ok, ms) })
async function until(ok: () => boolean, ms = 6000) {
  const end = Date.now() + ms
  while (!ok() && Date.now() < end) await wait(5)
  expect(ok()).toBe(true)
}

// Needs a MySQL server, named by WEFT_TEST_MYSQL.
describe.skipIf(!url)('mysql change feed', () => {
  const pool = url ? createPool({ uri: url, connectionLimit: 4 }) : (undefined as never)
  const source = () => ({ name: 'mysql', tables: ['live_a'], ...mysqlChanges({ pool, tables: ['live_a'], interval: 25 }) })
  beforeAll(async () => {
    await pool.query('drop table if exists live_a, live_b')
    await pool.query('create table live_a (id int auto_increment primary key, secret text)')
    await pool.query('create table live_b (id int primary key)')
    for (const s of changeStatements('mysql', [{ name: 'live_a', pk: ['id'] }])) await pool.query(s)
  })
  afterAll(async () => {
    await pool.query('drop table if exists live_a, live_b, __weft_changes')
    await pool.end()
  })
  const on = () => {
    const pokes: Loose[] = []
    const s = source()
    return { pokes, s, feed: createFeed(s, { emit: p => pokes.push(p), status() {} }, { hold: 25, throttle: 25 }) }
  }

  test('a write is a poke of table and row, and the log holds no column', async () => {
    const f = on()
    const how = await f.s.probe()
    expect(how).toMatchObject({ mode: 'feed', via: 'mysql-log' })
    await f.feed.start(how)
    const [r] = (await pool.query(`insert into live_a (secret) values ('hunter2')`)) as Loose
    await until(() => f.pokes.length > 0)
    expect(f.pokes).toEqual([{ t: ['live_a', `live_a:${r.insertId}`] }])
    const [cols] = (await pool.query('select * from __weft_changes')) as Loose
    expect(JSON.stringify(cols)).not.toContain('hunter2')
    await f.feed.stop()
  })

  test('a commit that lands behind the mark is still seen', async () => {
    const f = on()
    await f.feed.start(await f.s.probe())
    const long = await pool.getConnection()
    await long.beginTransaction()
    await long.query(`insert into live_a (secret) values ('slow')`) // takes the lower id
    await pool.query(`insert into live_a (secret) values ('fast')`)
    await until(() => f.pokes.length === 1)
    await long.commit()
    long.release()
    await until(() => f.pokes.length === 2)
    await f.feed.stop()
  })

  test('10k rows are one table-level poke', async () => {
    const f = on()
    await f.feed.start(await f.s.probe())
    await pool.query(`insert into live_a (secret) select 'x' from information_schema.columns a, information_schema.columns b limit 10000`)
    await until(() => f.pokes.length > 0)
    await wait(200)
    expect(f.pokes.every(p => p.p?.includes('live_a:'))).toBe(true)
    await f.feed.stop()
  })

  test('no trigger: off, with the reason', async () => {
    const how = await mysqlChanges({ pool, tables: ['live_b'] }).probe()
    expect(how).toMatchObject({ mode: 'off' })
    expect(how.why).toMatch(/no trigger on `live_b`/)
  })
})
