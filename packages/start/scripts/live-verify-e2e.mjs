import { freePort, sleep as wait } from '../../../scripts/lib/helpers.mjs'
// `live: { verify }` against a disposable Postgres and a built app: a pass, each link broken on purpose, the refusals, and
// proof no row survives any of it. Needs `node scripts/live-db-e2e.mjs` to have built the fixture.
//
//   DATABASE_URL=postgres://…localhost…/x node scripts/live-verify-e2e.mjs
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { writeContract, readLivePlan } from '../src/contract.mjs'
import { changeStatements } from '../src/changes-sql.mjs'
import { literalSecrets, refusal, resolveTarget } from '../src/live-target.mjs'

const root = fileURLToPath(new URL('../test/fixtures/live-db', import.meta.url))
const url = process.env.DATABASE_URL
const failed = []
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`)
  if (!ok) failed.push(what)
}

const sql = postgres(url, { max: 2, onnotice() {} })
await sql.unsafe(
  'drop table if exists notes; create table notes (id serial primary key, owner text not null, body text not null)',
)
const statements = changeStatements('postgresql', [{ name: 'notes', pk: ['id'] }])
for (const s of statements) await sql.unsafe(s)
const leftovers = async () =>
  (await sql`select count(*)::int as n from notes where body like 'weft-verify-%'`)[0].n

const port = await freePort()
const app = spawn(
  process.execPath,
  ['--disable-warning=ExperimentalWarning', '.output/server/index.mjs'],
  {
    cwd: root,
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
    stdio: 'ignore',
  },
)
const base = `http://localhost:${port}`
for (let i = 0; i < 300; i++) {
  if (
    await fetch(`${base}/x`).then(
      () => true,
      () => false,
    )
  )
    break
  await wait(100)
}

const live = { targets: { staging: { url: base, db: 'FIXTURE_DATABASE_URL', production: false } } }
process.env.FIXTURE_DATABASE_URL = url
process.env.WEFT_STAGING_COOKIE = 'user=alice'
process.env.WEFT_STAGING_OTHER_COOKIE = 'user=bob'
process.env.WEFT_VERIFY_FRESH = '1'
process.env.WEFT_BUILD = '1'
const plan = (options) => readLivePlan({ root, preset: 'node_server', live: options ?? live })
const codes = (p) => p.diagnostics.map((d) => d.code)
const r019 = (p) => p.diagnostics.find((d) => d.code === 'R019')?.why ?? ''

let p = await plan()
if (process.env.DEBUG) console.log(JSON.stringify(p, null, 1))
check(
  p.verified[0]?.ok && !codes(p).includes('R019'),
  `the whole chain passes: ${JSON.stringify(p.verified[0]?.ms)}`,
)
check(p.verified[0]?.untested.length === 0, 'with both targets, nothing is untested')
check((await leftovers()) === 0, 'its row is gone')

delete process.env.WEFT_VERIFY_FRESH
const again = await plan()
check(again.verified[0]?.cached, "an unchanged query isn't run again")
process.env.WEFT_VERIFY_FRESH = '1'

p = await plan({ targets: { staging: { db: 'FIXTURE_DATABASE_URL', production: false } } })
check(
  p.verified[0]?.ok && codes(p).includes('R023'),
  `a database alone passes, and says what it didn't test: ${p.diagnostics.find((d) => d.code === 'R023')?.why.slice(0, 90)}…`,
)
p = await plan({ targets: { staging: { url: base, production: false } } })
check(
  p.verified[0]?.ok && codes(p).includes('R023'),
  "a URL alone passes, and says what it didn't test",
)

await sql.unsafe('alter table notes disable trigger weft_changes_ins')
p = await plan()
check(/at `trigger`.*disabled/.test(r019(p)), `a disabled trigger: ${r019(p)}`)
await sql.unsafe('alter table notes enable trigger weft_changes_ins')

await sql.unsafe(
  `create or replace function weft_changes_notify() returns trigger as $$ begin return null; end $$ language plpgsql`,
)
p = await plan({ ...live, targets: { staging: { ...live.targets.staging } } })
check(/at `notify`/.test(r019(p)), `a trigger that fires and says nothing: ${r019(p)}`)
check((await leftovers()) === 0, 'the row is gone after a failure too')
await sql.unsafe(statements[0])

const broken = await plan({
  targets: {
    staging: { url: 'http://localhost:1', db: 'FIXTURE_DATABASE_URL', production: false },
  },
})
check(/at `app`/.test(r019(broken)), `the app down: ${r019(broken)}`)

process.env.WEFT_STAGING_OTHER_COOKIE = 'user=alice'
p = await plan()
check(/at `denied`/.test(r019(p)), `a "user without access" who sees the row: ${r019(p)}`)
check((await leftovers()) === 0, 'and the row is gone')
process.env.WEFT_STAGING_OTHER_COOKIE = 'user=bob'

// ---- refusals, and nothing touched ------------------------------------------------------------------------------------
const before = (await sql`select count(*)::int as n from notes`)[0].n
for (const { what, verify, conf } of [
  { what: 'a host that says prod', verify: { url: 'https://app.prod.example.com' }, conf: {} },
  {
    what: 'a database that says production',
    verify: { db: 'postgres://u@db.internal/production' },
    conf: {},
  },
  {
    what: 'a target named production, even marked',
    verify: 'production',
    conf: { production: { url: 'https://x.example.com', production: false } },
  },
  {
    what: 'a named target with no mark',
    verify: 'staging',
    conf: { staging: { url: 'https://x.example.com' } },
  },
  {
    what: 'a host nothing vouches for',
    verify: { db: 'postgres://u@abc123.rds.amazonaws.com/app' },
    conf: {},
  },
]) {
  const t = resolveTarget(verify, { targets: conf, env: {} })
  check(
    !t.missing && !!refusal(t, { targets: conf }),
    `refused, ${what}: ${refusal(t, { targets: conf }) ?? 'it went through'}`,
  )
}
check(
  !refusal(resolveTarget({ db: 'postgres://u@staging-db.example.com/app' }, { env: {} })),
  'allowed: a host that says staging',
)
check(
  (await sql`select count(*)::int as n from notes`)[0].n === before,
  'a refusal touched nothing',
)

// ---- a target that isn't here ----------------------------------------------------------------------------------------
const off = { targets: { staging: { url: base, db: 'NOT_SET_ANYWHERE', production: false } } }
const soft = await plan(off)
check(
  soft.diagnostics.some((d) => d.code === 'R021' && d.severity === 'warning'),
  `check warns and skips: ${soft.diagnostics.find((d) => d.code === 'R021')?.why}`,
)
const hard = await writeContract({ root, preset: 'node_server', live: off, verify: true })
check(
  hard.diagnostics.some((d) => d.code === 'R021' && d.severity === 'error'),
  'a build fails on it',
)

const dir = mkdtempSync(join(tmpdir(), 'weft-verify-'))
mkdirSync(join(dir, 'src'))
writeFileSync(
  join(dir, 'src/q.ts'),
  `export const q = query({ live: { verify: { db: 'postgres://app:hunter2@staging.example.com/x' } } })\n`,
)
check(literalSecrets(dir).length === 1, 'R020 finds a password in source')
rmSync(dir, { recursive: true })

// ---- two builds at once -----------------------------------------------------------------------------------------------
const both = await Promise.all([plan(), plan()])
check(
  both.every((x) => x.verified[0]?.ok),
  "two runs at once don't collide",
)
check((await leftovers()) === 0, 'and leave nothing')

const out = JSON.stringify([p, both])
check(
  !out.includes('postgres://') && !out.includes('user=alice'),
  'no result holds a URL or a cookie',
)
app.kill()
await sql.end()
console.log(failed.length ? `\n${failed.length} FAILED` : '\nall passed')
process.exit(failed.length ? 1 : 0)
