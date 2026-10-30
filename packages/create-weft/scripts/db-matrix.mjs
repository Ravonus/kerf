#!/usr/bin/env node
// The database matrix (research 34 §9): every data layer on every engine, from tarballs, through `weft db generate`,
// tsc and `weft check`, then a build served on each runtime against its own empty database and driven by an e2e.
//
//   node packages/create-weft/scripts/db-matrix.mjs <empty-dir> [--layers a,b] [--dbs a,b] [--runtimes a,b] [--json <out>]
//
// WEFT_MATRIX_MYSQL and WEFT_MATRIX_POSTGRES are server URLs with no database name (`mysql://root@127.0.0.1:13306`),
// whose accounts can create databases. An engine with no URL is skipped and reported. Exit 1 on any failure.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { scaffold } from '../src/index.mjs'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { layers: { type: 'string', default: 'drizzle,prisma,native' }, dbs: { type: 'string', default: 'sqlite,postgres,mysql' }, runtimes: { type: 'string', default: 'node,bun,deno' }, json: { type: 'string' } },
})
if (!positionals[0]) throw new Error('usage: db-matrix.mjs <empty-dir>')
const root = resolve(positionals[0])
if (existsSync(root) && readdirSync(root).length) throw new Error(`${root} is not empty`)
const pkgs = fileURLToPath(new URL('../../', import.meta.url))
const tgz = join(root, 'tgz')
const script = name => join(pkgs, 'start/scripts', name)
const sh = (cmd, args, cwd, env) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } })

mkdirSync(tgz, { recursive: true })
const tarballs = {}
for (const dir of readdirSync(pkgs)) {
  const file = join(pkgs, dir, 'package.json')
  if (!existsSync(file)) continue
  const { name } = JSON.parse(readFileSync(file, 'utf8'))
  tarballs[name] = `file:${join(tgz, sh('npm', ['pack', '--silent', '--pack-destination', tgz], join(pkgs, dir)).trim().split('\n').pop())}`
}

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
  sh(process.execPath, [helper], app)
  return `${SERVER[db]}/${name}`
}

const results = []
for (const layer of values.layers.split(',')) for (const db of values.dbs.split(',')) {
  const combo = `${layer}/${db}`
  const auth = layer !== 'native'
  if (db !== 'sqlite' && !SERVER[db]) {
    results.push({ combo, skipped: `no WEFT_MATRIX_${db.toUpperCase()}` })
    console.log(`[db] ${combo}: skipped, no server`)
    continue
  }
  const app = join(root, `${layer}-${db}`)
  const entry = { combo, runtimes: {} }
  results.push(entry)
  const step = (what, cmd, args, env) => {
    console.log(`[db] ${combo}: ${what}`)
    return sh(cmd, args, app, env)
  }
  try {
    scaffold(app, { ui: 'warp', db, layer, auth })
    const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
    for (const deps of [pkg.dependencies, pkg.devDependencies]) for (const name in deps) if (tarballs[name]) deps[name] = tarballs[name]
    writeFileSync(join(app, 'package.json'), JSON.stringify({ ...pkg, overrides: tarballs }, null, 2))
    step('install', 'npm', ['install', '--silent'])
    const bin = name => join(app, 'node_modules/.bin', name)
    step('db generate', bin('weft'), ['db', 'generate'])
    step('tsc', bin('tsc'), ['--noEmit'])
    step('weft check', bin('weft'), ['check'])
  } catch (e) {
    entry.error = `${e.message}\n${e.stdout ?? ''}${e.stderr ?? ''}`.slice(0, 3000)
    console.log(`[db] ${combo}: FAIL\n${entry.error}`)
    continue
  }
  for (const runtime of values.runtimes.split(',')) {
    const url = await database(app, db)
    const r = spawnSync(process.execPath, [script('runtime-matrix.mjs'), app, '--runtimes', runtime, '--e2e', script(auth ? 'e2e-todo.mjs' : 'e2e-crud.mjs')], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: url } })
    entry.runtimes[runtime] = r.status === 0 ? 'pass' : 'fail'
    console.log(`[db] ${combo} on ${runtime}: ${entry.runtimes[runtime]}`)
    if (r.status !== 0) entry[`${runtime}Error`] = `${r.stdout}${r.stderr}`.slice(-2500)
  }
}

if (values.json) writeFileSync(values.json, JSON.stringify(results, null, 2))
const bad = results.filter(r => r.error || Object.values(r.runtimes ?? {}).includes('fail'))
for (const r of results) console.log(`[db] ${r.combo}: ${r.skipped ?? r.error?.split('\n')[0] ?? Object.entries(r.runtimes).map(([k, v]) => `${k} ${v}`).join(', ')}`)
console.log(bad.length ? `[db] ${bad.length} failing` : '[db] all pass')
process.exit(bad.length ? 1 : 0)
