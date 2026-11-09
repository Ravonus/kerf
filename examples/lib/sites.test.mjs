// node --test examples/lib: the database half of the harness. The last tests need Postgres, psql and Chromium, and run the probes
// for real against lib/fixture, which has the todo contract and no framework.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { allApps, freshness, here, loadApp } from './app.mjs'
import { signIn, sitePass, splitHtml, ttfbPass } from './flow.mjs'
import { launchBrowser } from './measure.mjs'
import { mismatch, parseList, raceOnce } from './race.mjs'
import { shuffled } from './race/probes.mjs'
import { startServer } from './serve.mjs'
import { SITE_METRICS } from './stats.mjs'
import {
  clone,
  contentHash,
  dbName,
  ensureSeed,
  measureRtt,
  provision,
  psql,
  seedHash,
  seedName,
} from '../shared/pg/env.mjs'
import { createProxy } from '../shared/pg/latency-proxy.mjs'

const pgUp = await psql('postgres', 'select 1').then(
  () => true,
  () => false,
)

test('live needs a canary, cached is a label, and a map picks by variant', () => {
  const canary = { sql: 'x', text: true }
  assert.equal(freshness({ path: '/', canary }, 'a'), 'live')
  assert.equal(freshness({ path: '/' }, 'a'), 'unchecked')
  assert.equal(freshness({ path: '/', freshness: 'cached' }, 'a'), 'cached')
  assert.throws(() => freshness({ path: '/', freshness: 'live' }, 'a'), /needs a canary/)
  assert.throws(() => freshness({ path: '/', freshness: 'stale' }, 'a'), /live or cached/)
  const mixed = { path: '/', canary, freshness: { next: 'cached', '*': 'live' } }
  assert.equal(freshness(mixed, 'next'), 'cached')
  assert.equal(freshness(mixed, 'weft'), 'live')
})

test('every site manifest says what the contract needs', () => {
  for (const site of ['landing', 'todo', 'admin', 'catalog']) {
    assert.ok(allApps().includes(site))
    const m = JSON.parse(readFileSync(join(here, site, 'app.json'), 'utf8'))
    assert.ok(m.db, site)
    assert.equal(m.variants.weft.scaffold.template, site)
    assert.deepEqual(Object.keys(m.variants).sort(), ['next', 'solid', 'weft'])
    for (const v of Object.values(m.variants)) assert.ok(v.label, site)
    for (const p of m.pages) if (p.canary) assert.match(p.canary.sql, /\$1/)
  }
})

test('a scaffold variant is generated, in the work area, the same every load', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-scaffold-')),
    work = process.env.BENCH_WORK
  process.env.BENCH_WORK = join(dir, 'work')
  writeFileSync(
    join(dir, 'app.json'),
    JSON.stringify({
      db: {},
      login: {},
      pages: ['/'],
      variants: { weft: { scaffold: { db: 'postgres', auth: true } } },
    }),
  )
  try {
    const a = loadApp(dir),
      v = a.variants[0],
      env = readFileSync(join(v.path, '.env.example'), 'utf8')
    assert.equal(v.path, join(dir, 'work/gen', a.name, 'weft'))
    assert.equal(v.stack.family, 'weft')
    assert.equal(v.tarballs, true)
    assert.equal(a.db.hash, seedHash())
    assert.equal(a.login.submit, 'Sign in')
    assert.equal(
      readFileSync(join(loadApp(dir).variants[0].path, '.env.example'), 'utf8'),
      env,
      'a random secret would change the build key every load',
    )
  } finally {
    if (work === undefined) delete process.env.BENCH_WORK
    else process.env.BENCH_WORK = work
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an unknown template is refused, not ignored', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bench-scaffold-'))
  writeFileSync(
    join(dir, 'app.json'),
    JSON.stringify({ pages: ['/'], variants: { weft: { scaffold: { template: 'nope' } } } }),
  )
  assert.throws(() => loadApp(dir), /--template/)
  rmSync(dir, { recursive: true, force: true })
})

test('database names stay in the bench namespace', async () => {
  assert.equal(dbName('todo', 'weft-naive'), 'weft_bench_todo_weft_naive')
  await assert.rejects(clone('postgres', 'weft_bench_seed_x'), /not weft_bench_/)
})

test('the seed hash moves with the files and nothing else', () => {
  assert.equal(seedHash(), seedHash())
  assert.match(seedName(), /^weft_bench_seed_[0-9a-f]{12}$/)
})

test('markup and embedded data split at inline scripts; a script with src is markup', () => {
  const s = splitHtml(
    '<head><script src="/a.js"></script></head><body><p>hi</p><script>self.x=[1,2]</script><script type="application/json">{"a":1}</script></body>',
  )
  assert.equal(s.data.raw, 'self.x=[1,2]{"a":1}'.length)
  assert.ok(s.html.raw > 0 && s.html.br > 0)
  assert.equal(splitHtml('<p>none</p>').data.br, 0)
})

test('first byte and the </head> byte are told apart, even split across chunks', async () => {
  const s = createServer((q, r) => {
    r.writeHead(200)
    r.write('<html><head></he')
    setTimeout(() => {
      r.write('ad>')
      setTimeout(() => r.end('</html>'), 5)
    }, 60)
  })
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok))
  const t = await ttfbPass(`http://127.0.0.1:${s.address().port}/`, {
    connections: 1,
    seconds: 0.2,
  })
  s.close()
  assert.ok(t.p50 < 40, `first byte ${t.p50}`)
  assert.ok(t.head >= 55, `head ${t.head}`)
})

test('the accessibility tree reads as title and state; a difference is named', () => {
  const rows = parseList(
    '- list "Todos":\n  - listitem:\n    - checkbox "Say \\"hi\\"" [checked]\n    - button "Delete"\n  - listitem:\n    - checkbox "Two"\n',
  )
  assert.deepEqual(rows, [
    { title: 'Say "hi"', done: true },
    { title: 'Two', done: false },
  ])
  assert.equal(mismatch(rows, [...rows].reverse()), null)
  assert.deepEqual(mismatch(rows, [{ title: 'Two', done: true }]).database, ['[x] Two'])
  const twice = [
    { title: 'a', done: false },
    { title: 'a', done: false },
  ]
  assert.deepEqual(mismatch(twice, twice.slice(1)).screen, ['[ ] a'])
})

test('a shuffle is a permutation, and the seed replays it', () => {
  assert.deepEqual(shuffled(8, 7), shuffled(8, 7))
  assert.notDeepEqual(shuffled(8, 7), shuffled(8, 8))
  assert.deepEqual(
    [...shuffled(8, 7)].sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6, 7],
  )
})

test('the proxy delays each way, counts turns, and frames queries across chunks', async () => {
  const echo = net.createServer((c) => c.on('data', (d) => c.write(d)).on('error', () => {})) // proxy.close() is a reset on Windows
  await new Promise((ok) => echo.listen(0, '127.0.0.1', ok))
  const proxy = createProxy({ port: echo.address().port, rtt: 40 }),
    port = await proxy.listen()
  const c = net.connect(port, '127.0.0.1')
  await new Promise((ok) => c.once('connect', ok))
  const ask = (b) =>
    new Promise((ok) => {
      const t = performance.now()
      c.once('data', () => ok(performance.now() - t))
      c.write(b)
    })
  const startup = Buffer.alloc(8)
  startup.writeInt32BE(8, 0)
  startup.writeInt32BE(196608, 4)
  assert.ok((await ask(startup)) >= 39)
  const query = Buffer.from('Q\0\0\0\x0bselect\0'),
    half = query.subarray(0, 3),
    rest = query.subarray(3)
  c.write(half)
  await new Promise((r) => setTimeout(r, 20))
  await ask(rest)
  await ask(query)
  const s = proxy.stats()
  assert.equal(s.queries, 2)
  assert.equal(s.roundTrips, 3)
  assert.equal(s.peak, 1)
  c.destroy()
  await proxy.close()
  echo.close()
})

const manifest = {
  name: 'fixture',
  db: { rtt: [2, 40], pool: 10 },
  login: { path: '/login', email: 'Email', password: 'Password', submit: 'Sign in' },
  pages: [
    { path: '/login' },
    {
      path: '/todos',
      canary: { sql: "update todos set title = $1 where id = md5('todo-1')::uuid", text: true },
      interact: ['checkbox:Seeded todo 1', 'checkbox:Seeded todo 2'],
      nav: { click: 'link:Active', url: 'filter=active', see: 'Seeded todo 2' },
      mutate: { fill: { 'textbox:New todo': '$value' }, click: 'button:Add', see: '$value' },
      rows: {
        50: "delete from todos where user_id = 'bench-user' and created_at > timestamptz '2026-10-01 00:50:00+00'",
      },
    },
  ],
  race: {
    path: '/todos',
    list: 'Todos',
    input: 'New todo',
    submit: 'Add',
    toggle: 'Seeded todo 1',
    state: "select title, done from todos where user_id = 'bench-user'",
    away: { link: 'Active', keep: { done: false } },
  },
}

describe('against Postgres and a browser', { skip: !pgUp }, () => {
  let browser
  const up = async (variant, env = {}) => {
    const db = await provision('fixture', variant),
      root = fileURLToPath(new URL('fixture', import.meta.url))
    const v = {
      name: variant,
      root,
      start: 'node server.mjs',
      stack: { out: [] },
      dbEnv: db.env,
      buildEnv: { ...db.env, ...env },
      log: join(mkdtempSync(join(tmpdir(), 'bench-log-')), 'log'),
    }
    const server = await startServer(v, '/__up', { proveBuild: false }),
      site = {
        db,
        url: server.url,
        jar: [],
        cookies: () => site.jar,
        login: async () => {
          site.jar = await signIn(browser, server.url, manifest.login)
        },
      }
    return {
      db,
      server,
      site,
      stop: async () => {
        await server.stop()
        await db.stop()
      },
    }
  }
  const fresh = (s) => async () => {
    await s.db.reset()
    await s.site.login()
    return s.site.cookies()
  }
  before(async () => {
    browser = await launchBrowser()
  })
  after(() => browser.close())

  registerClone()
  registerProxy(up)
  registerSite(up, () => browser)
  registerCorrectRace(up, fresh, () => browser)
  registerUnguardedRace(up, fresh, () => browser)
})

function registerClone() {
  test('a clone holds exactly the seed, a reset brings it back, and two seed builds agree', async () => {
    const a = await ensureSeed(),
      name = 'weft_bench_test_clone',
      again = `${a}_t`
    await clone(name)
    const seeded = await contentHash(name)
    await psql(name, "update orders set status = 'x'")
    assert.notEqual(await contentHash(name), seeded)
    await clone(name)
    assert.equal(await contentHash(name), seeded)
    await ensureSeed({ name: again })
    assert.equal(await contentHash(again), seeded)
    await psql('postgres', `drop database ${again}`)
    await psql('postgres', `drop database ${name}`)
  })
}

function registerProxy(up) {
  test('the proxy adds its RTT to SELECT 1, and a server keeps working through a reset', async () => {
    const s = await up('rtt')
    try {
      await s.db.rtt(40)
      const m = await measureRtt(s.db.name, s.db.proxy.port)
      assert.ok(m.added > 38 && m.added < 46, `added ${m.added}`)
      await s.db.rtt(2)
      await s.site.login()
      await s.db.reset()
      await s.site.login()
    } finally {
      await s.stop()
    }
  })
}

function registerSite(up, getBrowser) {
  test('sitePass fills what applies and leaves the rest null', async () => {
    const s = await up('site'),
      out = {
        pages: {
          '/login': { metrics: {}, fresh: { samples: 1 } },
          '/todos': { metrics: {}, fresh: { samples: 1 } },
        },
      }
    try {
      await s.site.login()
      await sitePass({
        app: { ...manifest, race: null },
        v: { name: 'site' },
        site: s.site,
        server: s.server,
        browser: getBrowser(),
        samples: 1,
        out,
      })
    } finally {
      await s.stop()
    }
    const page = out.pages['/todos'].metrics,
      login = out.pages['/login'].metrics
    for (const k of SITE_METRICS) {
      assert.ok(k in page, k)
      assert.ok(k in login, k)
    }
    for (const k of [
      'db.queries',
      'db.roundTrips',
      'server.ttfb.p50',
      'server.flush.head',
      'flow.nav.url.cold',
      'flow.nav.data.second',
      'flow.interaction.worst',
      'flow.mutate.confirmed',
      'flow.mutate.requests',
      'bytes.html.50.br',
      'bytes.data.50.raw',
    ])
      assert.ok(page[k]?.med > 0, `${k}: ${JSON.stringify(page[k])}`)
    for (const k of [
      'flow.nav.url.cold',
      'flow.mutate.optimistic',
      'flow.interaction.streaming',
      'bytes.html.500.br',
    ])
      assert.equal(login[k], null, k)
    assert.equal(page['flow.interaction.streaming'], null)
    assert.ok(page['db.queries'].med >= 2, 'the fixture runs two queries a page')
    assert.ok(page['db.roundTrips'].med > 1, `round trips ${page['db.roundTrips'].med}`)
    assert.equal(out.pages['/todos'].canary.label, 'live')
    assert.equal(out.pages['/login'].canary.label, 'unchecked')
    assert.equal(out.db.queries, 'pg_stat_statements')
  })
}

function registerCorrectRace(up, fresh, getBrowser) {
  test('a correct client passes every race', async () => {
    const s = await up('good')
    try {
      const r = await raceOnce({
        browser: getBrowser(),
        url: s.server.url,
        race: manifest.race,
        fresh: fresh(s),
        rows: () => s.db.rows(manifest.race.state),
        seed: 11,
      })
      assert.deepEqual(Object.keys(r).sort(), [
        'doubleSubmit',
        'invalidateDuring',
        'navigateDuring',
        'rollback',
        'toggles',
        'twoTabs',
      ])
      for (const [k, x] of Object.entries(r)) assert.ok(x.pass, `${k}: ${JSON.stringify(x.detail)}`)
    } finally {
      await s.stop()
    }
  })
}

function registerUnguardedRace(up, fresh, getBrowser) {
  test('a client with no ordering guard fails them', async () => {
    const s = await up('bad', { FIXTURE_BUG: '1' })
    try {
      const r = await raceOnce({
        browser: getBrowser(),
        url: s.server.url,
        race: manifest.race,
        fresh: fresh(s),
        rows: () => s.db.rows(manifest.race.state),
        seed: 11,
      })
      for (const k of ['rollback', 'twoTabs']) assert.equal(r[k].pass, false, `${k} should fail`)
      // Timing decides which reply lands last, so one sample can miss it: a bench takes several.
      let caught = !r.toggles.pass
      for (let i = 0; i < 4 && !caught; i++)
        caught = !(
          await raceOnce({
            browser: getBrowser(),
            url: s.server.url,
            race: manifest.race,
            fresh: fresh(s),
            rows: () => s.db.rows(manifest.race.state),
            seed: i,
            only: ['toggles'],
          })
        ).toggles.pass
      assert.ok(caught, 'toggles should fail')
    } finally {
      await s.stop()
    }
  })
}
