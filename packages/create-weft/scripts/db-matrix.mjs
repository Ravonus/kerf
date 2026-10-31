#!/usr/bin/env node
// The database matrix (research 34 §9): every data layer on every engine, from tarballs, through `weft db generate`,
// tsc and `weft check`, then a build served on each runtime against its own empty database and driven by an e2e.
//
//   node packages/create-weft/scripts/db-matrix.mjs <empty-dir> [--layers a,b] [--dbs a,b] [--runtimes a,b] [--json <out>]
//
// `--auth-seam` adds four apps on SQLite: Native with the hand-written provider in scripts/custom-auth, which has to pass
// the same e2e as Better Auth with no change to weft (research 34 §9); `--auth-provider custom`'s stub; and `weft add auth`
// on an app scaffolded without it, on each layer.
//
// WEFT_MATRIX_MYSQL and WEFT_MATRIX_POSTGRES are server URLs with no database name (`mysql://root@127.0.0.1:13306`),
// whose accounts can create databases. An engine with no URL is skipped and reported. Exit 1 on any failure.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { scaffold } from '../src/index.mjs'
import { packAll, pin, pkgs } from './tarballs.mjs'
import { jobs, pool } from '../../../scripts/jobs.mjs'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { layers: { type: 'string', default: 'drizzle,prisma,native' }, dbs: { type: 'string', default: 'sqlite,postgres,mysql' }, runtimes: { type: 'string', default: 'node,bun,deno' }, json: { type: 'string' }, 'auth-seam': { type: 'boolean' }, jobs: { type: 'string' } },
})
if (!positionals[0]) throw new Error('usage: db-matrix.mjs <empty-dir>')
const root = resolve(positionals[0])
if (existsSync(root) && readdirSync(root).length) throw new Error(`${root} is not empty`)
const script = name => join(pkgs, 'start/scripts', name)
const sh = (cmd, args, cwd, env) => promisify(execFile)(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, ...env } })

const tarballs = packAll(join(root, 'tgz'))

const SERVER = { mysql: process.env.WEFT_MATRIX_MYSQL, postgres: process.env.WEFT_MATRIX_POSTGRES }
let fresh = 0

/** An empty database for one run, and its URL. Each engine's own driver makes it, from the app's node_modules. */
async function database(app, db) {
  if (db === 'sqlite') return `file:${join(app, `.data/run-${++fresh}.db`)}`
  const name = `weft_matrix_${process.pid}_${++fresh}`
  const code = db === 'mysql'
    ? `import('mysql2/promise').then(async m => { const c = await m.createConnection(${JSON.stringify(SERVER.mysql)}); await c.query('create database ${name}'); await c.end() })`
    : `import('postgres').then(async m => { const c = m.default(${JSON.stringify(`${SERVER.postgres}/postgres`)}); await c.unsafe('create database ${name}'); await c.end() })`
  const helper = join(app, '.make-db.mjs')
  writeFileSync(helper, `await ${code}\n`)
  await sh(process.execPath, [helper], app)
  return `${SERVER[db]}/${name}`
}

const results = []
const combos = values.layers.split(',').flatMap(layer => values.dbs.split(',').map(db => ({ layer, db })))
if (values['auth-seam']) combos.push({ layer: 'native', db: 'sqlite', seam: 'hand-written' }, { layer: 'drizzle', db: 'sqlite', seam: 'stub' }, ...['drizzle', 'prisma', 'native'].map(layer => ({ layer, db: 'sqlite', seam: 'add' })))
await pool(combos, jobs(), async ({ layer, db, seam }) => {
  const combo = `${layer}/${db}${seam ? `/${seam}` : ''}`
  const auth = seam === 'stub' ? 'custom' : seam !== 'add'
  if (db !== 'sqlite' && !SERVER[db]) {
    results.push({ combo, skipped: `no WEFT_MATRIX_${db.toUpperCase()}` })
    console.log(`[db] ${combo}: skipped, no server`)
    return
  }
  const app = join(root, `${layer}-${db}${seam ? `-${seam}` : ''}`)
  const entry = { combo, runtimes: {} }
  results.push(entry)
  const step = async (what, cmd, args, env) => {
    console.log(`[db] ${combo}: ${what}`)
    return sh(cmd, args, app, env)
  }
  try {
    scaffold(app, { ui: 'warp', db, layer, auth })
    if (seam === 'hand-written') {
      const from = new URL('./custom-auth/', import.meta.url)
      copyFileSync(new URL('auth.server.ts', from), join(app, 'src/auth.server.ts'))
      copyFileSync(new URL('session.ts', from), join(app, 'src/server/session.ts'))
    }
    writeFileSync(join(app, 'package.json'), JSON.stringify(pin(JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')), tarballs), null, 2))
    await step('install', 'npm', ['install', '--silent'])
    const bin = name => join(app, 'node_modules/.bin', name)
    if (seam === 'add') await step('weft add auth', bin('weft'), ['add', 'auth'])
    await step('db generate', bin('weft'), ['db', 'generate'])
    await step('tsc', bin('tsc'), ['--noEmit'])
    await step('weft check', bin('weft'), ['check'])
  } catch (e) {
    entry.error = `${e.message}\n${e.stdout ?? ''}${e.stderr ?? ''}`.slice(0, 3000)
    console.log(`[db] ${combo}: FAIL\n${entry.error}`)
    return
  }
  for (const runtime of values.runtimes.split(',')) {
    const url = await database(app, db)
    const r = await sh(process.execPath, [script('runtime-matrix.mjs'), app, '--runtimes', runtime, '--e2e', script(auth === true ? 'e2e-todo.mjs' : 'e2e-crud.mjs')], undefined, { DATABASE_URL: url }).then(o => ({ ...o, status: 0 }), e => ({ stdout: e.stdout ?? '', stderr: e.stderr ?? String(e), status: 1 }))
    entry.runtimes[runtime] = r.status === 0 ? 'pass' : 'fail'
    console.log(`[db] ${combo} on ${runtime}: ${entry.runtimes[runtime]}`)
    if (r.status !== 0) entry[`${runtime}Error`] = `${r.stdout}${r.stderr}`.slice(-2500)
  }
})

if (values.json) writeFileSync(values.json, JSON.stringify(results, null, 2))
const bad = results.filter(r => r.error || Object.values(r.runtimes ?? {}).includes('fail'))
for (const r of results) console.log(`[db] ${r.combo}: ${r.skipped ?? r.error?.split('\n')[0] ?? Object.entries(r.runtimes).map(([k, v]) => `${k} ${v}`).join(', ')}`)
console.log(bad.length ? `[db] ${bad.length} failing` : '[db] all pass')
process.exit(bad.length ? 1 : 0)
