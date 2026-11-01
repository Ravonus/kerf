#!/usr/bin/env node
// One site, one variant, against the role-based test that every variant has to pass before any number counts (rule 6).
//   node e2e.mjs <site> <variant> [--no-build]     builds it if needed, then database, proxy, production server, tests, and stops all of it
//   node e2e.mjs <site> --dir <folder>             a local build as it stands, started with its own start script
//   node e2e.mjs <site> --dir <url> [--db <name>]  a server already running; --db names its weft_bench_* database
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { here, loadApp } from './lib/app.mjs'
import { lastBuild, packOnce, prepare } from './lib/build.mjs'
import { startServer } from './lib/serve.mjs'
import { provision } from './shared/pg/env.mjs'

const { values: opt, positionals: [site, variant] } = parseArgs({ allowPositionals: true, options: { 'no-build': { type: 'boolean' }, dir: { type: 'string' }, db: { type: 'string' } } })
if (!site || (!variant && !opt.dir)) { console.error('usage: node e2e.mjs <site> <variant> [--no-build] | <site> --dir <folder|url>'); process.exit(1) }
const say = s => process.stderr.write(`${s}\n`)
const test = join(here, site, 'e2e.test.mjs')
if (!existsSync(test)) { console.error(`no ${test}`); process.exit(1) }
const running = /^https?:/.test(opt.dir ?? '')
const app = loadApp(site, { only: opt.dir ? [] : [variant] })
if (variant && !opt.dir && !app.variants.length) { console.error(`${site} has no variant "${variant}"`); process.exit(1) }

function localVariant(dir) {
  const root = resolve(dir), pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  return { name: 'dir', root, start: pkg.scripts?.start ?? null, stack: { out: [] }, env: {}, log: join(mkdtempSync(join(tmpdir(), 'bench-e2e-')), 'server.log') }
}

const work = process.env.BENCH_WORK ?? join(homedir(), '.cache/weft-app-bench')
let db, server, code = 1
try {
  const v = running ? null : opt.dir ? localVariant(opt.dir) : app.variants[0]
  if (v && app.db) { db = await provision(app.name, v.name, { rtt: app.db.rtt[0] }); v.dbEnv = db.env }
  if (v && !opt.dir) {
    if (opt['no-build']) lastBuild(app, v, { work })
    else {
      const store = join(work, 'store'), weft = v.tarballs ? await packOnce(store, join(work, 'pack.log')) : null
      const { reused, build } = await prepare(app, v, { work, runId: Date.now().toString(36), store, weft: weft?.inputs, buildRuns: 1, quick: true })
      say(reused ? `${v.name}: build reused` : `${v.name}: built in ${Math.round(build.med / 1000)} s`)
    }
  }
  if (v && opt.dir) v.buildEnv = { ...v.dbEnv }
  if (v) server = await startServer(v, app.pages[0].path, { proveBuild: !opt.dir })
  const url = running ? opt.dir.replace(/\/$/, '') : server.url
  say(`${app.name}: testing ${url}${db ? ` on ${db.name}` : ''}`)
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', '--test-concurrency=1', test], { stdio: 'inherit', env: { ...process.env, BENCH_E2E: JSON.stringify({ url, db: db?.name ?? opt.db, login: app.login }) } })
  code = r.status ?? 1
} catch (e) {
  console.error(e.message)
} finally {
  await server?.stop()
  await db?.stop()
}
process.exit(code)
