import { freePort, sleep as wait } from '../../../scripts/lib/helpers.mjs'
// What a built server does at startup with a required live query, on real infrastructure: a pooler in each mode, no
// triggers, a role that can't add them; and a separate listener process feeding an app that holds no feed of its own.
//
//   DIRECT=postgres://…/live TX=postgres://…pgbouncer-transaction…/live SESSION=postgres://…session…/live node scripts/live-startup-e2e.mjs
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { changeStatements } from '../src/changes-sql.mjs'

const { chromium } = createRequire(import.meta.url)('playwright-core')
const { DIRECT, TX, SESSION } = process.env
const fixture = fileURLToPath(new URL('../test/fixtures/live-db', import.meta.url))
const bin = fileURLToPath(new URL('../../cli/bin/weft.mjs', import.meta.url))
const failed = []
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failed.push(what)
}

if (!process.env.SKIP_BUILD) {
  const b = spawnSync(
    process.execPath,
    [
      'test/build-app.mjs',
      JSON.stringify({
        root: fixture,
        site: { name: 'x', url: 'http://localhost' },
        preset: 'node_server',
        logLevel: 'warn',
      }),
    ],
    {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      stdio: 'inherit',
      env: { ...process.env, WEFT_BUILD: '1' },
    },
  )
  if (b.status) throw new Error('build failed')
}

const admin = postgres(DIRECT, { max: 2, onnotice() {} })
const statements = changeStatements('postgresql', [{ name: 'notes', pk: ['id'] }])
const fresh = async (triggers = true) => {
  await admin.unsafe(
    'drop table if exists notes; create table notes (id serial primary key, owner text not null, body text not null)',
  )
  if (triggers) for (const s of statements) await admin.unsafe(s)
}

/** Starts the built app; resolves when it answers, or when it exits. */
async function boot(env) {
  const port = await freePort()
  const child = spawn(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', '.output/server/index.mjs'],
    {
      cwd: fixture,
      env: { ...process.env, NODE_ENV: 'production', PORT: String(port), ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let log = '',
    code
  child.stdout.on('data', (d) => {
    log += d
  })
  child.stderr.on('data', (d) => {
    log += d
  })
  child.on('exit', (c) => {
    code = c ?? 'signal'
  })
  const base = `http://localhost:${port}`
  // oxlint-disable-next-line no-unmodified-loop-condition -- the child's exit handler sets `code` during the wait
  for (let i = 0; i < 200 && code === undefined; i++) {
    if (
      await fetch(`${base}/`).then(
        (r) => r.status < 600,
        () => false,
      )
    )
      break
    await wait(100)
  }
  // oxlint-disable-next-line no-unmodified-loop-condition -- the child's handlers set `code` and `log` during the wait
  for (let i = 0; i < 80 && code === undefined && !/weft live:/.test(log); i++) await wait(100) // the probe takes its 1.5 s
  await wait(300)
  return { child, base, log: () => log, code: () => code, stop: () => (child.kill(), wait(200)) }
}

// ---- required, and the server can't deliver: it does not serve ------------------------------------------------------
await fresh()
let s = await boot({ DATABASE_URL: TX })
check(s.code() === 1 && /R015/.test(s.log()), `transaction pooler: exits ${s.code()}`)
console.log(
  '     ',
  s
    .log()
    .split('\n')
    .find((l) => /R015/.test(l))
    ?.slice(0, 200),
)
check(!/weft@|:\/\/[^ ]*@/.test(s.log()), 'and prints no connection string')
await s.stop()

s = await boot({ DATABASE_URL: TX, LISTEN_URL: DIRECT })
check(
  s.code() === undefined && /weft live: feed/.test(s.log()),
  `transaction pooler plus a direct listenUrl: ${s
    .log()
    .split('\n')
    .find((l) => l.includes('weft live'))}`,
)
await s.stop()

s = await boot({ DATABASE_URL: SESSION })
check(
  s.code() === undefined && /weft live: feed/.test(s.log()),
  `session pooler: ${s
    .log()
    .split('\n')
    .find((l) => l.includes('weft live'))}`,
)
await s.stop()

await fresh(false)
s = await boot({ DATABASE_URL: DIRECT })
check(
  s.code() === 1 && /R015/.test(s.log()) && /weft db live/.test(s.log()),
  `no triggers: exits ${s.code()}, and says to run \`weft db live\``,
)
await s.stop()

await admin.unsafe(`drop role if exists weft_reader`).catch(() => {})
await admin.unsafe(
  `create role weft_reader login; grant select, insert on notes to weft_reader; grant connect on database live to weft_reader`,
)
s = await boot({ DATABASE_URL: DIRECT.replace(/\/\/[^@]*@/, '//weft_reader@') })
check(
  s.code() === 1 && /may create triggers/.test(s.log()),
  `a role with no TRIGGER: exits ${s.code()}, and says which permission`,
)
await s.stop()
await admin.unsafe(
  `revoke all on notes from weft_reader; revoke connect on database live from weft_reader; drop role weft_reader`,
)

// ---- an app with no feed of its own, and a listener in another process ----------------------------------------------
await fresh()
const app = await boot({ DATABASE_URL: DIRECT, LISTENER: 'external' })
check(
  /weft live: external/.test(app.log()),
  `the app: ${app
    .log()
    .split('\n')
    .find((l) => l.includes('weft live'))}`,
)
const listener = () =>
  spawn(process.execPath, [bin, 'db', 'listen', '--root', fixture], {
    env: { ...process.env, DATABASE_URL: DIRECT, LISTENER: 'external' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
let side = listener(),
  said = ''
side.stdout.on('data', (d) => {
  said += d
})
side.stderr.on('data', (d) => {
  said += d
})
for (let i = 0; i < 300 && !/weft live: feed/.test(said); i++) await wait(100)
check(/weft live: feed/.test(said), 'the listener process has the feed')
const browser = await chromium.launch()
const ctx = await browser.newContext()
await ctx.addCookies([{ name: 'user', value: 'alice', url: app.base }])
const page = await ctx.newPage()
await page.goto(app.base)
const status = () => page.textContent('[aria-label=status]')
const until = async (ok, ms) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await ok()) return true
    await wait(50)
  }
  return false
}
await until(async () => (await status()) === 'live', 15000)
check(
  (await page.textContent('[aria-label=mode]')) === 'external',
  `the page says ${await page.textContent('[aria-label=mode]')}, ${await status()}`,
)
await admin`insert into notes (owner, body) values ('alice', 'through the listener')`
check(
  await until(
    async () =>
      (await page.$$eval('li', (l) => l.map((x) => x.textContent))).includes(
        'through the listener',
      ),
    8000,
  ),
  'an outside write reaches the page through the listener',
)

side.kill('SIGTERM')
const t = Date.now()
const quiet = await until(async () => (await status()) !== 'live', 70_000)
check(
  quiet,
  `the page stops saying live after ${Math.round((Date.now() - t) / 1000)} s without a listener: ${await status()}`,
)
side = listener()
said = ''
side.stdout.on('data', (d) => {
  said += d
})
side.stderr.on('data', (d) => {
  said += d
})
check(
  await until(async () => (await status()) === 'live', 60_000),
  'and says live again when one comes back',
)
await admin`insert into notes (owner, body) values ('alice', 'after the restart')`
check(
  await until(
    async () =>
      (await page.$$eval('li', (l) => l.map((x) => x.textContent))).includes('after the restart'),
    8000,
  ),
  'and writes arrive',
)

await browser.close()
side.kill('SIGTERM')
await app.stop()
await admin.end()
console.log(failed.length ? `${failed.length} FAILED` : 'all passed')
process.exit(failed.length ? 1 : 0)
