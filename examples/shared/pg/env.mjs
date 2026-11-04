// The Postgres side of a bench: one seeded template per state of schema.sql and seed.sql, one clone per variant, reset from the
// template, reached through one latency proxy. Only ever touches databases named weft_bench_*. Talks to Postgres with `psql`, so
// the harness itself installs no driver.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { spawnProxy } from './latency-proxy.mjs'

const here = dirname(fileURLToPath(import.meta.url)),
  exec = promisify(execFile)
const HOST = process.env.BENCH_PG_HOST ?? '127.0.0.1',
  PORT = +(process.env.BENCH_PG_PORT ?? 5432),
  USER = process.env.BENCH_PG_USER
export const PSQL = process.env.BENCH_PSQL ?? 'psql'
const STATS = 'weft_bench_stats' // holds the pg_stat_statements extension, so reading it adds nothing to a variant's own database
export const benchUser = JSON.parse(readFileSync(join(here, 'bench-user.json'), 'utf8'))
export const seedHash = () =>
  createHash('sha256')
    .update(readFileSync(join(here, 'schema.sql')))
    .update(readFileSync(join(here, 'seed.sql')))
    .digest('hex')
    .slice(0, 12)
export const seedName = () => `weft_bench_seed_${seedHash()}`
export const dbName = (app, variant) =>
  `weft_bench_${app}_${variant}${process.env.BENCH_TAG ? `_${process.env.BENCH_TAG}` : ''}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')

function mine(name) {
  if (!/^weft_bench_[a-z0-9_]+$/.test(name))
    throw new Error(`refusing to touch database "${name}": not weft_bench_*`)
  return name
}

const psqlArgs = (db, { port = PORT, host = HOST } = {}) => [
  '-h',
  host,
  '-p',
  String(port),
  ...(USER ? ['-U', USER] : []),
  '-d',
  db,
  '-X',
  '-A',
  '-t',
  '-q',
  '-v',
  'ON_ERROR_STOP=1',
]
export const psql = async (db, sql, to) =>
  (await exec(PSQL, [...psqlArgs(db, to), '-c', sql], { maxBuffer: 1 << 28 })).stdout
    .replace(/\r\n/g, process.platform === 'win32' ? '\n' : '$&')
    .trim()
const psqlFile = (db, file) => exec(PSQL, [...psqlArgs(db), '-f', file], { maxBuffer: 1 << 26 })
/** Rows of a query as objects, through json so types survive. */
export const rows = async (db, sql, to) =>
  JSON.parse(await psql(mine(db), `select coalesce(json_agg(t), '[]') from (${sql}) t`, to))
const has = async (name) =>
  (await psql('postgres', `select 1 from pg_database where datname = '${mine(name)}'`)) === '1'
const drop = (name) => psql('postgres', `drop database if exists ${mine(name)} with (force)`)

/** The template, built once under a private name and renamed, so a half-seeded one can't be cloned. */
export async function ensureSeed({ name = seedName() } = {}) {
  if (await has(name)) return name
  const building = mine(`${name}_${process.pid}`)
  await drop(building)
  await psql('postgres', `create database ${building}`)
  await psqlFile(building, join(here, 'schema.sql'))
  await psqlFile(building, join(here, 'seed.sql'))
  try {
    await psql('postgres', `alter database ${building} rename to ${mine(name)}`)
  } catch (e) {
    if (!(await has(name))) throw e
    await drop(building)
  }
  return name
}

/** A fresh copy of the template. Cuts the app's connections, which its pool reopens on the next query. */
export async function clone(name, from = seedName()) {
  await drop(name)
  for (let i = 0; ; i++) {
    try {
      return await psql('postgres', `create database ${mine(name)} template ${mine(from)}`)
    } catch (e) {
      // Two clones of one template can collide on the brief lock on it.
      if (i === 5 || !/being accessed by other users/.test(e.stderr ?? e.message)) throw e
      await new Promise((r) => setTimeout(r, 200))
    }
  }
}

/** Every row of every table of this seed, as one hash: what "same data" means. */
export async function contentHash(db) {
  const tables = (
    await psql(mine(db), `select tablename from pg_tables where schemaname = 'public' order by 1`)
  ).split('\n')
  const h = createHash('sha256')
  for (const t of tables)
    h.update(t).update(
      await psql(
        db,
        `select coalesce(md5(string_agg(x::text, ',' order by x::text)), '') from "${t}" x`,
      ),
    )
  return h.digest('hex').slice(0, 16)
}

/** `pg_stat_statements` when this server has it loaded; otherwise null, and the proxy's wire count stands in. */
async function statements() {
  const loaded =
    (await psql(
      'postgres',
      `select current_setting('shared_preload_libraries') ~ 'pg_stat_statements' and exists (select 1 from pg_available_extensions where name = 'pg_stat_statements')`,
    )) === 't'
  if (!loaded) return false
  if (!(await has(STATS))) {
    await psql('postgres', `create database ${STATS}`).catch((e) => {
      if (!/already exists/.test(e.stderr ?? '')) throw e
    })
  }
  await psql(STATS, 'create extension if not exists pg_stat_statements')
  return true
}

const NOT_A_QUERY = String.raw`^\s*(begin|commit|rollback|set|show|deallocate|discard|savepoint|release|start transaction)\y`

/**
 * Queries and rows `fn` caused in database `name`. Rows come only from pg_stat_statements; the fallback counts Query and Execute
 * messages on the wire, so it includes BEGIN and COMMIT, and says so in `source`.
 */
export async function countQueries(name, proxy, fn, { forceProxy = false } = {}) {
  const pss = !forceProxy && (await statements())
  if (!pss) {
    await proxy.reset()
    await fn()
    return { queries: (await proxy.stats()).queries, rows: null, source: 'proxy' }
  }
  await psql(
    STATS,
    `select pg_stat_statements_reset(0, oid, 0) from pg_database where datname = '${mine(name)}'`,
  )
  await fn()
  const [q, r] = (
    await psql(
      STATS,
      `select coalesce(sum(calls), 0), coalesce(sum(s.rows), 0) from pg_stat_statements s join pg_database d on d.oid = s.dbid where d.datname = '${name}' and s.query !~* '${NOT_A_QUERY}'`,
    )
  ).split('|')
  return { queries: +q, rows: +r, source: 'pg_stat_statements' }
}

/** `select 1` through the proxy against the same without it, by psql's own timing: the RTT a run really got. */
export async function measureRtt(db, proxyPort, n = 20) {
  const time = async (to) => {
    const { stdout } = await exec(PSQL, [
      ...psqlArgs(db, to),
      '-c',
      '\\timing on',
      ...Array(n).fill(['-c', 'select 1']).flat(),
    ])
    const t = [...stdout.matchAll(/Time: ([\d.]+) ms/g)].map((m) => +m[1]).sort((a, b) => a - b)
    return t[t.length >> 1]
  }
  const direct = await time(),
    through = await time({ port: proxyPort })
  return { direct, through, added: through - direct }
}

export async function serverInfo() {
  return {
    version: await psql('postgres', 'show server_version'),
    statements: (await statements()) ? 'pg_stat_statements' : 'proxy',
  }
}

/** A variant's database and proxy. `env` is what its build and server get. */
export async function provision(app, variant, { rtt = 2 } = {}) {
  await ensureSeed()
  const name = dbName(app, variant)
  await clone(name)
  const proxy = await spawnProxy({ port: PORT, host: HOST, rtt })
  return {
    name,
    proxy,
    env: {
      DATABASE_URL: `postgres://${USER ?? userInfo().username}@127.0.0.1:${proxy.port}/${name}`,
      BETTER_AUTH_SECRET: benchUser.authSecret,
    },
    reset: () => clone(name),
    sql: (q) => psql(name, q),
    rows: (q) => rows(name, q),
    counted: (fn) => countQueries(name, proxy, fn),
    rtt: (ms) => proxy.rtt(ms),
    measureRtt: () => measureRtt(name, proxy.port),
    stop: async ({ keep = false } = {}) => {
      await proxy.stop()
      if (!keep) await drop(name)
    },
  }
}
