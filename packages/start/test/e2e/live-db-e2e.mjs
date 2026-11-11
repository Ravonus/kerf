import { freePort, sleep as wait } from '../../../../scripts/lib/helpers.mjs'
// The change feed end to end: a built app, two instances, a real browser, and a second process writing straight to the
// database. Not in `vitest`: it needs a real database and takes a minute.
//
//   DATABASE_URL=postgres://… node test/e2e/live-db-e2e.mjs     (the database's `notes` is dropped)
//   DATABASE_URL=file:/tmp/x.db node test/e2e/live-db-e2e.mjs
import { execFile, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { changeStatements } from '../../src/changes-sql.mjs'

const require = createRequire(new URL('../../scripts/live-db-e2e.mjs', import.meta.url))
const { chromium } = require('playwright-core')
const postgres = (await import('postgres')).default
const fixture = fileURLToPath(new URL('../fixtures/live-db', import.meta.url))
const url = process.env.DATABASE_URL
const isPg = url.startsWith('postgres')
const run = promisify(execFile)
const say = (...a) => console.log(...a)
const failed = []
const check = (ok, what) => {
  say(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failed.push(what)
}

const file = url.replace(/^file:/, '')
/** The outside writer: a process of its own, knowing nothing of kerf. */
const outside = isPg
  ? (sql) =>
      run(process.execPath, [
        '--input-type=module',
        '-e',
        `import p from ${JSON.stringify(require.resolve('postgres').replace(/cjs.*/, 'src/index.js'))}; const s = p(${JSON.stringify(url)}, { max: 1, onnotice() {} }); await s.unsafe(${JSON.stringify(sql)}); console.log(Date.now()); await s.end()`,
      ])
  : (sql) =>
      run(process.execPath, [
        '--no-warnings',
        '-e',
        `const { DatabaseSync } = require('node:sqlite'); const d = new DatabaseSync(${JSON.stringify(file)}); d.exec('pragma busy_timeout = 5000'); d.exec(${JSON.stringify(sql)}); console.log(Date.now()); d.close()`,
      ])

async function setup() {
  const ddl = isPg
    ? 'drop table if exists notes; create table notes (id serial primary key, owner text not null, body text not null)'
    : 'drop table if exists notes; create table notes (id integer primary key autoincrement, owner text not null, body text not null)'
  const statements = [
    ddl,
    ...changeStatements(isPg ? 'postgresql' : 'sqlite', [{ name: 'notes', pk: ['id'] }]),
  ]
  if (isPg) {
    const s = postgres(url, { max: 1, onnotice() {} })
    for (const x of statements) await s.unsafe(x)
    await s.end()
  } else {
    if (existsSync(file)) rmSync(file)
    const { DatabaseSync } = await import('node:sqlite')
    const d = new DatabaseSync(file)
    d.exec('pragma journal_mode = wal')
    for (const x of statements) d.exec(x)
    d.close()
  }
}

const env = { ...process.env, NODE_ENV: 'production' }
// A fixture inside the package has no `@kerf/start` of its own.
mkdirSync(`${fixture}/node_modules/@kerf`, { recursive: true })
if (!existsSync(`${fixture}/node_modules/@kerf/start`))
  symlinkSync(
    fileURLToPath(new URL('../..', import.meta.url)),
    `${fixture}/node_modules/@kerf/start`,
  )
if (!process.env.SKIP_BUILD) {
  const b = spawnSync(
    process.execPath,
    [
      'test/build-app.mjs',
      JSON.stringify({
        root: fixture,
        site: { name: 'x', url: 'http://localhost' },
        preset: 'node_server',
        logLevel: 'error',
      }),
    ],
    { cwd: new URL('../..', import.meta.url), env: { ...env, KERF_BUILD: '1' }, stdio: 'inherit' },
  )
  if (b.status) throw new Error('build failed')
}
await setup()

const instance = async () => {
  const port = await freePort()
  const child = spawn(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', '.output/server/index.mjs'],
    { cwd: fixture, env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let log = ''
  child.stdout.on('data', (d) => {
    log += d
  })
  child.stderr.on('data', (d) => {
    log += d
  })
  for (let i = 0; i < 300; i++) {
    if (
      await fetch(`http://localhost:${port}/_kerf/none`).then(
        () => true,
        () => false,
      )
    )
      break
    await wait(100)
  }
  return { port, child, base: `http://localhost:${port}`, log: () => log }
}

const a = await instance(),
  b = await instance()
const browser = await chromium.launch()
const open = async (inst, user) => {
  const ctx = await browser.newContext()
  if (user) await ctx.addCookies([{ name: 'user', value: user, url: inst.base }])
  const page = await ctx.newPage()
  const seen = { gets: 0, bodies: [], pokes: 0 }
  page.on('response', async (r) => {
    if (!r.url().includes('/_kerf/fn/') || r.request().method() !== 'GET') return
    seen.gets++
    seen.bodies.push(await r.text().catch(() => ''))
  })
  await page.goto(inst.base)
  await page
    .waitForFunction(
      () =>
        document.querySelector('[aria-label=status]')?.textContent !== 'connecting' &&
        document.querySelector('[aria-label=status]')?.textContent !== '',
      null,
      { timeout: 15000 },
    )
    .catch(() => {})
  await page.evaluate(() => {
    window.__seen = {}
    new MutationObserver(() => {
      for (const li of document.querySelectorAll('li')) window.__seen[li.textContent] ??= Date.now()
    }).observe(document.querySelector('main'), {
      subtree: true,
      childList: true,
      characterData: true,
    })
  })
  return { page, seen }
}
const text = (p, label) => p.page.textContent(`[aria-label=${label}]`)
const rows = (p) => p.page.$$eval('li', (l) => l.map((x) => x.textContent))
const until = async (ok, ms = 8000) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await ok()) return true
    await wait(10)
  }
  return false
}

const alice1 = await open(a, 'alice'),
  alice2 = await open(b, 'alice'),
  bob = await open(a, 'bob'),
  nobody = await open(b)
check(
  (await text(alice1, 'status')) === 'live' && (await text(alice1, 'mode')) === 'feed',
  `status: ${await text(alice1, 'status')}, mode: ${await text(alice1, 'mode')}`,
)
say(
  'server said:',
  a
    .log()
    .split('\n')
    .find((l) => l.includes('kerf live')),
)

// ---- an outside write reaches the right browsers, and only them -----------------------------------------------------
const bobBefore = { rows: await rows(bob), gets: bob.seen.gets }
const samples = []
for (let i = 0; i < 20; i++) {
  const body = `outside ${i} ${Date.now()}`
  const { stdout } = await outside(`insert into notes (owner, body) values ('alice', '${body}')`)
  const t = +stdout
  const hit = await until(
    async () =>
      (await alice1.page.evaluate((said) => window.__seen[said], body)) &&
      (await alice2.page.evaluate((said) => window.__seen[said], body)),
  )
  if (!hit) {
    check(false, `sample ${i} never arrived`)
    continue
  }
  samples.push(
    Math.max(
      await alice1.page.evaluate((said) => window.__seen[said], body),
      await alice2.page.evaluate((said) => window.__seen[said], body),
    ) - t,
  )
  await wait(400)
}
samples.sort((x, y) => x - y)
say(
  `external write to DOM on both instances, ms from commit: min ${samples[0]} p50 ${samples[samples.length >> 1]} p95 ${samples[Math.floor(samples.length * 0.95)]} max ${samples.at(-1)}`,
)
check(samples.length === 20, 'all 20 outside writes reached both instances')

await wait(500)
check(
  (await rows(bob)).length === 0 &&
    JSON.stringify(await rows(bob)) === JSON.stringify(bobBefore.rows),
  "bob, signed in, sees none of alice's rows",
)
check(
  !bob.seen.bodies.some((x) => x.includes('outside')),
  `no response to bob held alice's text (${bob.seen.gets - bobBefore.gets} refetches, all empty)`,
)
check(
  !nobody.seen.bodies.some((x) => x.includes('outside')) && !(await rows(nobody)).length,
  'a signed-out client got no data',
)

// ---- the app's own write: one refetch per other client, none twice --------------------------------------------------
await wait(600)
const before = { other: alice2.seen.gets, own: alice1.seen.gets }
await alice1.page.click('button')
await until(async () => (await rows(alice2)).some((x) => x.startsWith('from the app')))
await wait(700)
check(
  alice2.seen.gets - before.other === 1,
  `an app write refetches another client once (${alice2.seen.gets - before.other})`,
)
check(
  alice1.seen.gets - before.own === 0,
  `and the tab that made it not at all (${alice1.seen.gets - before.own}: the mutation's response carried it)`,
)

// ---- bulk ---------------------------------------------------------------------------------------------------------
await wait(600)
const beforeBulk = alice2.seen.gets
await outside(
  isPg
    ? `insert into notes (owner, body) select 'alice', 'bulk' || g from generate_series(1, 10000) g`
    : `with recursive n(i) as (select 1 union all select i + 1 from n where i < 10000) insert into notes (owner, body) select 'alice', 'bulk' || i from n`,
)
await until(async () => (await rows(alice2)).length > 10000, 20000)
await wait(600)
check(
  alice2.seen.gets - beforeBulk === 1,
  `a 10k-row statement is one refetch (${alice2.seen.gets - beforeBulk})`,
)
await outside(`delete from notes where body like 'bulk%'`)
await wait(1000)

// ---- losing the listener -----------------------------------------------------------------------------------------
if (isPg) {
  const s = postgres(url, { max: 1, onnotice() {} })
  await s`select pg_terminate_backend(pid) from pg_stat_activity where query ilike 'listen%' and pid <> pg_backend_pid()`
  const body = `after the drop ${Date.now()}`
  await outside(`insert into notes (owner, body) values ('alice', '${body}')`)
  check(
    await until(async () => (await rows(alice1)).includes(body), 15000),
    'a dropped listener comes back, and nobody stays stale',
  )
  await s.end()
}

await browser.close()
// ---- zero clients: what a server costs doing nothing ----------------------------------------------------------------
await wait(3000)
const cpu = async (pid) => {
  const { stdout } = await run('ps', ['-o', 'time=,rss=', '-p', String(pid)])
  return stdout.trim()
}
say('idle instance, before 60 s window:', await cpu(a.child.pid))
if (process.env.IDLE) {
  await wait(+process.env.IDLE * 1000)
  say(`idle instance after ${process.env.IDLE} s:`, await cpu(a.child.pid))
}
a.child.kill()
b.child.kill()
say(failed.length ? `\n${failed.length} FAILED` : '\nall passed')
process.exit(failed.length ? 1 : 0)
