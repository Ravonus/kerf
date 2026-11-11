// The change feed on a real Postgres. `KERF_TEST_POSTGRES=postgres://…` turns these on, and its database is yours to lose:
// they drop and create their tables. `KERF_TEST_PGBOUNCER`: the same database through pgBouncer in transaction mode.
import { until5000 as until } from './change-wait.helpers.mjs'
import { sleep as wait } from '../../../scripts/lib/helpers.mjs'
import postgres from 'postgres'
import { changeStatements } from '../src/changes-sql.mjs'
import { createFeed, type Poke, type Probe, type Sink, type Source } from '../src/changes'
import { postgresChanges } from '../src/db/changes-postgres'

const url = process.env.KERF_TEST_POSTGRES!
const bouncer = process.env.KERF_TEST_PGBOUNCER

function source(
  sql: ReturnType<typeof postgres>,
  tables = ['live_a', 'live_b'],
  extra: object = {},
): Source {
  return {
    name: 'postgresql',
    tables,
    ...postgresChanges({ url, client: sql, tables, heartbeat: 100, interval: 100, ...extra }),
  }
}
function sinkless(s: Source, how?: Probe, throttle = 25) {
  const pokes: Poke[] = []
  const status: (string | undefined)[] = []
  const feed = createFeed(
    s,
    { emit: (p) => pokes.push(p), status: (d) => status.push(d) },
    { hold: 25, throttle },
  )
  return { pokes, status, feed, start: async () => feed.start(how ?? (await s.probe())) }
}

// Needs a Postgres server, named by KERF_TEST_POSTGRES.
describe.skipIf(!url)('postgres change feed', () => {
  let sql: ReturnType<typeof postgres>
  beforeAll(async () => {
    sql = postgres(url, { onnotice: () => {} })
    await sql.unsafe(
      'drop table if exists live_a, live_b, live_c, live_plain; create table live_a (id serial primary key, secret text); create table live_b (a int, b int, primary key (a, b)); create table live_c (id int primary key); create table live_plain (id int primary key)',
    )
    for (const s of changeStatements('postgresql', [
      { name: 'live_a', pk: ['id'] },
      { name: 'live_b', pk: ['a', 'b'] },
      { name: 'live_c', pk: ['id'] },
    ]))
      await sql.unsafe(s)
  })
  afterAll(async () => {
    await sql.unsafe('drop table if exists live_a, live_b, live_c, live_plain')
    await sql.end()
  })

  postgresProbeTests(() => sql)

  postgresNotificationTests(() => sql)

  postgresFallbackTests(() => sql)

  postgresPooledListenerTests()
})

void (0 as unknown as Sink)

function postgresProbeTests(getSql: () => ReturnType<typeof postgres>) {
  test('the probe proves it: triggers there, a NOTIFY heard', async () => {
    const sql = getSql()
    expect(await source(sql).probe()).toEqual({ mode: 'feed', via: 'postgres-notify' })
  })

  test('a write from another connection is a poke of table and row, and no column', async () => {
    const sql = getSql()
    const f = sinkless(source(sql))
    await f.start()
    const other = postgres(url, { max: 1, connection: { application_name: 'not-kerf' } })
    const [{ id } = { id: '' }] = await other<
      { id: string }[]
    >`insert into live_a (secret) values ('hunter2') returning id`
    await until(() => f.pokes.length > 0)
    expect(f.pokes).toEqual([{ t: ['live_a', `live_a:${id}`] }])
    expect(JSON.stringify(f.pokes)).not.toContain('hunter2')
    await other.end()
    await f.feed.stop()
  })

  test('what reaches the channel is ids: anyone who can LISTEN sees no column', async () => {
    const sql = getSql()
    const heard: string[] = []
    const l = postgres(url, { max: 1, onnotice: () => {} })
    await l.listen('kerf_changes', (p) => heard.push(p))
    await sql`insert into live_a (secret) values ('hunter2')`
    await until(() => heard.length > 0)
    expect(heard[0]).toMatch(/^\{"t" : "live_a", "i" : \["\d+"\]\}$/)
    await l.end()
  })

  test('a composite key is one id; a rollback and an update of nothing are silent', async () => {
    const sql = getSql()
    const f = sinkless(source(sql))
    await f.start()
    await sql
      .begin(async (tx) => {
        await tx`insert into live_a (secret) values ('x')`
        throw new Error('no')
      })
      .catch(() => {})
    await sql`update live_a set secret = 'y' where id < 0`
    await wait(120)
    expect(f.pokes).toEqual([])
    await sql`insert into live_b values (1, 2)`
    await until(() => f.pokes.length > 0)
    expect(f.pokes[0]!.t).toEqual(['live_b', 'live_b:1:2'])
    await f.feed.stop()
  })

  test("a table it doesn't list, and a table with no trigger, make no poke", async () => {
    const sql = getSql()
    const f = sinkless(source(sql))
    await f.start()
    await sql`insert into live_c values (${Date.now() % 1e9})`
    await sql`insert into live_plain values (${Date.now() % 1e9})`
    await wait(150)
    expect(f.pokes).toEqual([])
    await f.feed.stop()
  })
}

function postgresNotificationTests(getSql: () => ReturnType<typeof postgres>) {
  test('10k rows in a statement: one notification, one table-level poke, with its prefix', async () => {
    const sql = getSql()
    const f = sinkless(source(sql))
    const notes: string[] = []
    const l = postgres(url, { max: 1, onnotice: () => {} })
    await l.listen('kerf_changes', (p) => notes.push(p))
    await f.start()
    await sql`insert into live_a (secret) select 'x' from generate_series(1, 10000)`
    await until(() => f.pokes.length > 0)
    await wait(120)
    expect(f.pokes).toEqual([{ t: ['live_a'], p: ['live_a:'] }])
    expect(notes.filter((n) => n[0] === '{')).toHaveLength(1)
    await l.end()
    await f.feed.stop()
  })

  test('two instances each hear a change once, and a barrier reaches both', async () => {
    const sql = getSql()
    const a = sinkless(source(sql)),
      b = sinkless(source(sql))
    await a.start()
    await b.start()
    await sql`update live_a set secret = 'z' where id = 1`
    await until(() => a.pokes.length > 0 && b.pokes.length > 0)
    await wait(60)
    expect(a.pokes).toHaveLength(1)
    expect(b.pokes).toHaveLength(1)
    a.pokes.length = b.pokes.length = 0
    await sql`update live_a set secret = 'w' where id = 1`
    await a.feed.settle(['live_a', 'live_a:1']) // one instance's mutation, as `hub.poke` sends it
    await wait(80)
    expect(a.pokes).toEqual([])
    expect(b.pokes).toEqual([])
    await a.feed.stop()
    await b.feed.stop()
  })

  test('barrier and write in one flow: a real commit, then its barrier, is never poked', async () => {
    const sql = getSql()
    const f = sinkless(source(sql), undefined, 250)
    await f.start()
    for (let i = 0; i < 25; i++) {
      await sql`update live_a set secret = ${String(i)} where id = 1`
      await f.feed.settle(['live_a', 'live_a:1'])
    }
    await wait(80)
    expect(f.pokes).toEqual([])
    await f.feed.stop()
  })

  test('a dropped connection: the listener comes back, and pokes every table for what it missed', async () => {
    const sql = getSql()
    const f = sinkless(source(sql))
    await f.start()
    const before = f.pokes.length
    await sql`select pg_terminate_backend(pid) from pg_stat_activity where query ilike 'listen%' and datname = current_database() and pid <> pg_backend_pid()`
    await sql`update live_b set a = a` // while it's gone
    await until(() => f.pokes.length > before)
    await until(
      () => f.pokes.some((p) => p.p?.includes('live_a:') && p.p?.includes('live_b:')),
      8000,
    )
    f.pokes.length = 0
    await sql`insert into live_c values (1) on conflict do nothing`
    await sql`update live_a set secret = 'after' where id = 1`
    await until(() => f.pokes.some((p) => p.t.includes('live_a:1')))
    await f.feed.stop()
  })
}

function postgresFallbackTests(getSql: () => ReturnType<typeof postgres>) {
  test('no trigger: it says so and estimates from the counters, table by table', async () => {
    const sql = getSql()
    const tables = ['live_plain']
    const s = source(sql, tables)
    const how = await s.probe()
    expect(how).toMatchObject({ mode: 'poll', via: 'postgres-stats' })
    expect(how.why).toMatch(/no trigger on `live_plain`/)
    expect(how.fix).toMatch(/kerf db live/)
    const f = sinkless(s, how)
    await f.start()
    await sql`insert into live_plain values (${(Date.now() + 1) % 1e9})`
    await until(() => f.pokes.length > 0, 8000)
    expect(f.pokes[0]).toEqual({ t: ['live_plain'], p: ['live_plain:'] })
    await f.feed.stop()
  })

  test("a role that can't create triggers is told who can", async () => {
    const sql = getSql()
    await sql.unsafe(
      `drop role if exists live_ro; create role live_ro login; grant select on live_plain to live_ro; grant connect on database ${new URL(url).pathname.slice(1)} to live_ro`,
    )
    const u = new URL(url)
    u.username = 'live_ro'
    u.password = ''
    const ro = postgres(u.href, { max: 1, onnotice: () => {} })
    const how = await source(ro, ['live_plain'], { url: u.href }).probe()
    expect(how.mode).toBe('poll')
    expect(how.fix).toMatch(/role that may create triggers/)
    await ro.end()
    await sql.unsafe(
      'revoke all on live_plain from live_ro; revoke all on database ' +
        new URL(url).pathname.slice(1) +
        ' from live_ro; drop role live_ro',
    )
  })

  // Needs a PgBouncer in front of Postgres, named by KERF_TEST_PGBOUNCER.
  // Needs a PgBouncer in front of Postgres, named by KERF_TEST_PGBOUNCER.
  test.skipIf(!bouncer)(
    'pgBouncer in transaction mode: a LISTEN that hears nothing is found out',
    async () => {
      const pooled = postgres(bouncer!, { max: 2, prepare: false, onnotice: () => {} })
      const s = {
        name: 'postgresql',
        tables: ['live_a'],
        ...postgresChanges({ url: bouncer!, client: pooled, tables: ['live_a'] }),
      }
      const how = await s.probe()
      expect(how.mode).toBe('poll')
      expect(how.why).toMatch(/never reached a LISTEN|LISTEN failed/)
      expect(how.fix).toMatch(/listenUrl/)
      await pooled.end()
    },
  )
}

function postgresPooledListenerTests() {
  // Needs a PgBouncer in front of Postgres, named by KERF_TEST_PGBOUNCER.
  test.skipIf(!bouncer)(
    'the app through the pooler, the listener direct: a full feed',
    async () => {
      const pooled = postgres(bouncer!, { max: 2, prepare: false, onnotice: () => {} })
      const s = {
        name: 'postgresql',
        tables: ['live_a'],
        ...postgresChanges({ url: bouncer!, listenUrl: url, client: pooled, tables: ['live_a'] }),
      }
      expect(await s.probe()).toEqual({ mode: 'feed', via: 'postgres-notify' })
      const f = sinkless(s)
      await f.start()
      await pooled`update live_a set secret = 'pooled' where id = 1`
      await until(() => f.pokes.length > 0)
      await f.feed.settle(['live_a'])
      await f.feed.stop()
      await pooled.end()
    },
  )
}
