#!/usr/bin/env node
import { freePort } from '../../../scripts/lib/helpers.mjs'
// The runtime matrix (PLAN §4.1, research 28 §5): build one app per runtime, serve each build on its own runtime with
// its own empty database, and run one e2e file against it. This builds on Node for all three, so it's the check that
// a Bun or Deno break doesn't ship. `create-kerf/scripts/alt-runtimes.mjs` is the one with no Node on the machine.
//
//   node packages/start/scripts/runtime-matrix.mjs <app> [--e2e <file>] [--runtimes node,bun,deno] [--json <out>]
//
// The e2e file's default export takes `{ url, runtime, log }`, and throws or returns `{ checks }`. `DATABASE_URL` in
// the environment replaces the per-runtime SQLite file (Postgres: one server, the file's first step empties nothing,
// so give each run a fresh database). Exit 1 on any failure.

import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    e2e: { type: 'string' },
    runtimes: { type: 'string', default: 'node,bun,deno' },
    json: { type: 'string' },
  },
})
const app = resolve(positionals[0] ?? '.')
const e2e = resolve(values.e2e ?? new URL('../test/e2e/e2e-todo.mjs', import.meta.url).pathname)
const SERVERS = {
  node: ['node', ['--disable-warning=ExperimentalWarning', '.output/server/index.mjs']],
  bun: ['bun', ['run', '.output/server/index.mjs']],
  deno: ['deno', ['run', '-A', '.output/server/index.mjs']],
}

const log = (...a) => console.log('[matrix]', ...a)
const version = (cmd) =>
  spawnSync(cmd, ['--version'], { encoding: 'utf8' }).stdout.split('\n')[0].trim()

/** SIGTERM, then SIGKILL: a server still draining mustn't hold the matrix. */
function stop(child) {
  if (child.exitCode !== null) return
  child.kill()
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000)
  return new Promise((ok) => {
    child.on('close', () => {
      clearTimeout(timer)
      ok()
    })
  })
}

async function serve(runtime, env) {
  const [cmd, args] = SERVERS[runtime]
  const child = spawn(cmd, args, {
    cwd: app,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output = []
  child.stdout.on('data', (d) => output.push(String(d)))
  child.stderr.on('data', (d) => output.push(String(d)))
  const url = `http://localhost:${env.PORT}`
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null)
      throw new Error(`${runtime} server exited ${child.exitCode}:\n${output.join('')}`)
    try {
      await fetch(url + '/', { redirect: 'manual' })
      return { url, output, stop: () => stop(child) }
    } catch {}
    await new Promise((ok) => {
      setTimeout(ok, 100)
    })
  }
  child.kill()
  throw new Error(`${runtime} server didn't answer:\n${output.join('')}`)
}

const scratch = mkdtempSync(join(tmpdir(), 'kerf-matrix-'))
const { default: run } = await import(pathToFileURL(e2e).href)
const kerf = join(app, 'node_modules', '.bin', 'kerf')
const results = []
for (const runtime of values.runtimes.split(',')) {
  const entry = { runtime, version: version(SERVERS[runtime][0]), ok: false }
  results.push(entry)
  log(`${runtime} (${entry.version}): build`)
  const t = performance.now()
  const built = spawnSync(kerf, ['build', '--runtime', runtime], {
    cwd: app,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production' },
  })
  entry.buildMs = Math.round(performance.now() - t)
  if (built.status !== 0 || !existsSync(join(app, '.output', 'server', 'index.mjs'))) {
    entry.error = `build failed:\n${built.stdout}${built.stderr}`
    log(`${runtime}: ${entry.error}`)
    continue
  }
  let server
  try {
    const env = {
      PORT: String(await freePort()),
      NODE_ENV: 'production',
      DATABASE_URL: process.env.DATABASE_URL ?? `file:${join(scratch, `${runtime}.db`)}`,
      BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
    }
    env.BETTER_AUTH_URL = `http://localhost:${env.PORT}`
    log(`${runtime}: serve on ${env.PORT}`)
    server = await serve(runtime, env)
    const out = await run({ url: server.url, runtime, log: (...a) => log(`${runtime}:`, ...a) })
    entry.checks = out?.checks
    entry.ok = true
    log(`${runtime}: pass${out?.checks ? ` (${out.checks.length} checks)` : ''}`)
  } catch (e) {
    entry.error = e.stack ?? String(e)
    entry.server = server?.output.join('').slice(-4000)
    log(`${runtime}: FAIL\n${entry.error}\n--- server output\n${entry.server ?? ''}`)
  } finally {
    await server?.stop()
  }
}
rmSync(scratch, { recursive: true, force: true })
if (values.json) writeFileSync(values.json, JSON.stringify({ app, e2e, results }, null, 2) + '\n')
const ok = results.every((r) => r.ok)
log(
  ok
    ? 'all runtimes pass'
    : `failed: ${results
        .filter((r) => !r.ok)
        .map((r) => r.runtime)
        .join(', ')}`,
)
process.exit(ok ? 0 : 1)
