// The `db.adapter` suite on SQLite (node:sqlite), and on Postgres when `WEFT_TEST_POSTGRES` names a throwaway database.
import { DatabaseSync } from 'node:sqlite'
import { LIST_ROWS, listSuite } from 'weft/test/plugins'
import { decodeCursor } from '@weft/start/list'
import { postgresTrigger, sqlSource, type SqlSpec } from '../src/sql'

const spec: SqlSpec = { table: 'tasks', columns: { id: 'id', title: 'title', status: 'status', rank: 'rank_no' }, search: ['title'] }

function sqlite() {
  const db = new DatabaseSync(':memory:')
  db.exec('create table tasks (id text primary key, title text, status text, rank_no integer, secret text)')
  const add = db.prepare('insert into tasks values (?, ?, ?, ?, ?)')
  for (const r of LIST_ROWS) add.run(r.id, r.title, r.status, r.rank, r.secret)
  return { dialect: 'sqlite' as const, query: async (text: string, params: unknown[]) => db.prepare(text).all(...(params as any[])) as any[] }
}

test('sqlSource passes db.adapter@1 on SQLite', async () => {
  const checks = await listSuite({ make: () => sqlSource(sqlite(), spec), decode: decodeCursor })
  expect(checks.filter(c => !c.ok)).toEqual([])
  expect(checks.length).toBeGreaterThan(20)
})

test('an identifier outside plain names never reaches SQL', () => {
  expect(() => sqlSource(sqlite(), { ...spec, table: 'tasks; drop table tasks' })).toThrow('Q002')
  expect(() => sqlSource(sqlite(), { ...spec, columns: { id: 'id', x: 'a"b' } })).toThrow('Q002')
})

test('values are bound, in the dialect\'s placeholders', async () => {
  const seen: [string, unknown[]][] = []
  const target = { dialect: 'postgresql' as const, query: async (t: string, p: unknown[]) => { seen.push([t, p]); return [{ n: 0 }] } }
  await sqlSource(target, spec).list({ mode: 'page', limit: 5, offset: 0, after: null, sort: null, search: 'x', filter: { status: 'open' } })
  expect(seen[0][0]).toContain('"status" = $1')
  expect(seen[0][0]).toContain('like $2')
  expect(seen[0][1]).toEqual(['open', '%x%'])
  expect(seen[1][1]).toEqual(['open', '%x%'])
})

const url = process.env.WEFT_TEST_POSTGRES
describe.skipIf(!url)('on Postgres', () => {
  test('the suite, and a trigger pokes tags without the row', async () => {
    const { default: postgres } = await import('postgres')
    const sql = postgres(url!, { max: 2, onnotice: () => {} })
    const table = `tasks_${Date.now()}`
    try {
      await sql.unsafe(`create table ${table} (id text primary key, title text, status text, rank_no integer, secret text)`)
      const seed = async () => {
        await sql.unsafe(`delete from ${table}`)
        for (const r of LIST_ROWS) await sql.unsafe(`insert into ${table} values ($1, $2, $3, $4, $5)`, [r.id, r.title, r.status, r.rank, r.secret])
      }
      const target = { dialect: 'postgresql' as const, query: (t: string, p: unknown[]) => sql.unsafe(t, p as any[]) as any }
      const checks = await listSuite({ make: async () => (await seed(), sqlSource(target, { ...spec, table })), decode: decodeCursor })
      expect(checks.filter(c => !c.ok)).toEqual([])

      const got: string[] = []
      await sql.listen('weft_bus', m => got.push(m))
      await sql.unsafe(postgresTrigger({ table, tag: 'tasks' }))
      await sql.unsafe(`update ${table} set title = 'top secret' where id = 't01'`)
      for (let i = 0; i < 100 && !got.length; i++) await new Promise(ok => setTimeout(ok, 20))
      expect(got[0]).toBe(`=weft:poke\n${JSON.stringify({ t: ['tasks', 'tasks:t01'] })}`.replace('{"t":["tasks","tasks:t01"]}', '{"t" : ["tasks", "tasks:t01"]}'))
      expect(got[0]).not.toContain('top secret')
    } finally {
      await sql.unsafe(`drop table if exists ${table}`)
      await sql.end()
    }
  })
})
