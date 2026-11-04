// The change feed on real SQLite files, with a real second process as the outside writer.
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { dbChanges, createFeed, type Poke, type Source } from '../src/changes'
import { changeStatements } from '../src/changes-sql.mjs'
import { createDb, open } from '../src/db/sqlite'

const run = promisify(execFile)
const wait = (ms = 0) =>
  new Promise((ok) => {
    setTimeout(ok, ms)
  })
async function until(ok: () => boolean, ms = 5000) {
  const end = Date.now() + ms
  while (!ok() && Date.now() < end) await wait(5)
  expect(ok()).toBe(true)
}

const outside = (file: string, sql: string) =>
  run(process.execPath, [
    '--no-warnings',
    '-e',
    `const { DatabaseSync } = require('node:sqlite'); const d = new DatabaseSync(${JSON.stringify(file)}); d.exec('pragma busy_timeout = 5000'); d.exec(${JSON.stringify(sql)}); d.close()`,
  ])

const dir = mkdtempSync(join(tmpdir(), 'weft-live-'))
const file = join(dir, 'app.db')
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function feedOn(source: Source, throttle = 25) {
  const pokes: Poke[] = []
  const status: (string | undefined)[] = []
  const feed = createFeed(
    source,
    { emit: (p) => pokes.push(p), status: (d) => status.push(d) },
    { hold: 25, throttle },
  )
  return { pokes, status, feed, start: async () => feed.start(await source.probe()) }
}

const db = createDb({ schema: {}, url: `file:${file}`, migrate: false })
const app = () => dbChanges(db, ['todos', 'notes'], { interval: 10 })

beforeAll(async () => {
  const c = await open(file)
  c.exec(
    'create table todos (id integer primary key, title text); create table notes (a int, b int, primary key (a, b)); create table other (id integer primary key)',
  )
  for (const s of changeStatements('sqlite', [
    { name: 'todos', pk: ['id'] },
    { name: 'notes', pk: ['a', 'b'] },
  ]))
    c.exec(s)
  c.close?.()
})

test("the probe says what it uses: the feed, and that it's `data_version`", async () => {
  expect(await app().probe()).toEqual({ mode: 'feed', via: 'sqlite-data-version' })
})

test('a commit by another process is a poke of table and row, and no column', async () => {
  const f = feedOn(app())
  await f.start()
  await outside(file, `insert into todos (id, title) values (7, 'hunter2')`)
  await until(() => f.pokes.length > 0)
  expect(f.pokes).toEqual([{ t: ['todos', 'todos:7'] }])
  await f.feed.stop()
})

test('a composite key is one id', async () => {
  const f = feedOn(app())
  await f.start()
  await outside(file, 'insert into notes values (1, 2)')
  await until(() => f.pokes.length > 0)
  expect(f.pokes[0]!.t).toEqual(['notes', 'notes:1:2'])
  await f.feed.stop()
})

test('an unrelated table moves `data_version` and pokes nothing', async () => {
  const f = feedOn(app())
  await f.start()
  await outside(file, 'insert into other (id) values (1)')
  await wait(100)
  expect(f.pokes).toEqual([])
  await f.feed.stop()
})

test('a rollback pokes nothing', async () => {
  const f = feedOn(app())
  await f.start()
  await outside(file, `begin; insert into todos (title) values ('no'); rollback;`)
  await wait(100)
  expect(f.pokes).toEqual([])
  await f.feed.stop()
})

test('10k rows are one table-level poke, and the log stays capped', async () => {
  const f = feedOn(app())
  await f.start()
  await outside(
    file,
    `with recursive n(i) as (select 1 union all select i + 1 from n where i < 10000) insert into todos (title) select 'x' from n`,
  )
  await until(() => f.pokes.length > 0)
  await wait(80)
  expect(f.pokes).toHaveLength(1)
  expect(f.pokes[0]!.t).toContain('todos') // past the log's cap the watcher can't tell what else moved: every table
  expect(f.pokes[0]!.p).toContain('todos:')
  const c = await open(file)
  const [[rows] = []] = c.query('select count(*) from __weft_changes', [], 'values') as number[][]
  c.close?.()
  expect(rows).toBeLessThanOrEqual(4097)
  await f.feed.stop()
})

test("the app's own write, then its barrier: no poke", async () => {
  const source = app()
  const f = feedOn(source, 250)
  await f.start()
  const c = await open(file)
  for (let i = 0; i < 20; i++) {
    c.exec(`update todos set title = '${i}' where id = 7`)
    await f.feed.settle(['todos', 'todos:7'])
  }
  c.close?.()
  await wait(60)
  expect(f.pokes).toEqual([])
  await f.feed.stop()
})

test("two instances each see a third process's commit", async () => {
  const a = feedOn(app()),
    b = feedOn(
      dbChanges(createDb({ schema: {}, url: `file:${file}`, migrate: false }), ['todos'], {
        interval: 10,
      }),
    )
  await a.start()
  await b.start()
  await outside(file, `update todos set title = 'both' where id = 7`)
  await until(() => a.pokes.length > 0 && b.pokes.length > 0)
  await wait(60)
  expect(a.pokes).toHaveLength(1)
  expect(b.pokes).toHaveLength(1)
  await a.feed.stop()
  await b.feed.stop()
})

test('no triggers: any commit pokes every table, and it says so', async () => {
  const bare = join(dir, 'bare.db')
  await outside(
    bare,
    'create table t (id integer primary key); create table u (id integer primary key)',
  )
  const s = dbChanges(createDb({ schema: {}, url: `file:${bare}`, migrate: false }), ['t'], {
    interval: 10,
  })
  const how = await s.probe()
  expect(how).toMatchObject({ mode: 'poll', via: 'sqlite-data-version' })
  expect(how.fix).toMatch(/weft db live/)
  const f = feedOn(s)
  await f.feed.start(how)
  await outside(bare, 'insert into u (id) values (1)')
  await until(() => f.pokes.length > 0)
  expect(f.pokes[0]!.t).toEqual(['t'])
  await f.feed.stop()
})

test('an in-memory database has nothing to watch', async () => {
  const how = await dbChanges(createDb({ schema: {}, url: ':memory:', migrate: false }), [
    't',
  ]).probe()
  expect(how.mode).toBe('off')
})
