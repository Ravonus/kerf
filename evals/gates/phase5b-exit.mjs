#!/usr/bin/env node
// Phase 5b's exit check (PLAN §9, "5b. Rust: native"; research 39): a CPU-bound demo beats its TS `run` by at least 5× on
// Node and Bun. The same app is built twice. Before: `thumbnail` is a TS `run`, written with typed arrays as a careful
// author writes it. After: it's `impl: media`, and a crate does the same arithmetic, which this script holds it to:
//
//   client   `.output/public` is byte-identical, `/thumb` serves byte-identical HTML, and the same e2e passes
//   wire     the same requests get the same answers, checksums of every output byte included
//   speed    p50 through the public GET, then 32 callers at once, at ≥ 5× on the first two runtimes
//
// then what only native() has: the WASM fallback with the addon gone, the event loop staying free, a pool as big as the
// machine, a panic, a deadline, a stale library, R103–R105, `weft dev` reloading in place, `weft add rust` from nothing,
// and a build with no `native()` carrying none of it. Each `weft start` runs on Node, Bun and Deno. The swap is scripted.
//
//   node evals/gates/phase5b-exit.mjs <empty-dir> [--runtimes node,bun,deno] [--no-browser] [--results phase5b-exit]
//
// Writes evals/results/<results>.md and .json; exit 1 if any check fails. Needs cargo with Rust 1.99, bun and deno for those
// runtimes, packages/core's native compiler built, and each package's dependencies installed.
import { diagnostics } from './phase5b-exit/diagnostics.mjs'
import { nativeChecks, fallbackChecks } from './phase5b-exit/native.mjs'
import { report } from './phase5b-exit/report.mjs'
import { dev } from './phase5b-exit/dev.mjs'
import * as runner from './phase5b-exit/runner.mjs'
import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { commands, until, eq, makeCheck, localPackages } from '../lib/gate.mjs'

const here = join(dirname(fileURLToPath(import.meta.url)), '..')
const repo = join(here, '..')
const packageUrl = localPackages(repo)
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    runtimes: { type: 'string', default: 'node,bun,deno' },
    browser: { type: 'boolean', default: true },
    results: { type: 'string', default: 'phase5b-exit' },
  },
})
if (!positionals[0]) {
  console.error(
    'usage: phase5b-exit.mjs <empty-dir> [--runtimes node,bun,deno] [--no-browser] [--results name]',
  )
  process.exit(1)
}
const dir = resolve(positionals[0])
if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} is not empty`)
const runtimes = values.runtimes.split(',')
const { fnId } = await import(join(repo, 'packages/start/src/vite.mjs'))

const log = (...a) => console.log('[5b]', ...a)
const { run, must } = commands(dir, 1 << 28, true)
const sleep = (ms) =>
  new Promise((ok) => {
    setTimeout(ok, ms)
  })
const freePort = () =>
  new Promise((ok) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address()
      s.close(() => ok(port))
    })
  })
const weft = () => join(dir, 'node_modules/.bin/weft')
const ID = Object.fromEntries(
  ['thumbnail', 'guarded', 'stats', 'boom', 'spin'].map((n) => [n, fnId(n, 'src/server/thumb.ts')]),
)
const REQUIRED = 5

const checks = []
const ok = (v, what) => {
  if (!v) throw new Error(what)
}
const check = makeCheck(checks, log, 140)

const runnerContext = {
  must,
  weft,
  dir,
  freePort,
  until,
  sleep,
  ID,
  log,
  ok,
  values,
  repo,
  get build() {
    return build
  },
  get publicHashes() {
    return publicHashes
  },
  get start() {
    return start
  },
  get link() {
    return link
  },
  get call() {
    return call
  },
  get wire() {
    return wire
  },
  get browserRun() {
    return browserRun
  },
  get bench() {
    return bench
  },
  get variant() {
    return variant
  },
}
const build = (...args) => runner.buildRunner(runnerContext, ...args)
const publicHashes = (...args) => runner.publicHashesRunner(runnerContext, ...args)
const start = (...args) => runner.startRunner(runnerContext, ...args)
const link = (...args) => runner.linkRunner(runnerContext, ...args)
const call = (...args) => runner.callRunner(runnerContext, ...args)
const wire = (...args) => runner.wireRunner(runnerContext, ...args)
const browserRun = (...args) => runner.browserRunRunner(runnerContext, ...args)
const bench = (...args) => runner.benchRunner(runnerContext, ...args)
const variant = (...args) => runner.variantRunner(runnerContext, ...args)

// ---- prepare --------------------------------------------------------------------------------------------------------

mkdirSync(dir, { recursive: true })
log(`scaffold in ${dir}`)
must(
  'node',
  [
    join(repo, 'packages/create/bin/create-weft.mjs'),
    dir,
    '--db',
    'none',
    '--ui',
    'none',
    '--name',
    'thumb',
  ],
  repo,
)
const pkgFile = join(dir, 'package.json')
const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
for (const deps of [pkg.dependencies, pkg.devDependencies])
  for (const name of Object.keys(deps ?? {}))
    if (name === '@weft-js/core' || name.startsWith('@weft-js/')) deps[name] = packageUrl(name)
pkg.dependencies.zod = '4.6.7'
writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n')
must('npm', ['install', '--no-audit', '--no-fund'])
cpSync(join(here, 'phase5b/app'), dir, { recursive: true })
cpSync(join(here, 'phase5b/ts'), dir, { recursive: true })

const results = { ts: {}, rust: {}, wasm: {} }
const tree = () =>
  Object.fromEntries(
    readdirSync(join(dir, 'src'), { recursive: true, withFileTypes: true })
      .filter((f) => f.isFile())
      .map((f) => join(f.parentPath, f.name))
      .map((f) => [
        relative(dir, f),
        createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 12),
      ]),
  )
const serverText = () =>
  readdirSync(join(dir, '.output/server'), { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile() && /\.m?js$/.test(f.name))
    .map((f) => readFileSync(join(f.parentPath, f.name), 'utf8'))
    .join('\n')

// ---- before ---------------------------------------------------------------------------------------------------------

const treeBefore = tree()
must(weft(), ['check'])
for (const r of runtimes) await variant('ts', r, results)
await check('a build with no `native()` has none of it', () => {
  const text = serverText()
  ok(!text.includes('dlopen'), 'dlopen in the server bundle')
  ok(!text.includes('weft_alloc'), 'the WASM loader in the server bundle')
  ok(!existsSync(join(dir, '.output/server/rust')), '.output/server/rust')
})

// ---- the swap -------------------------------------------------------------------------------------------------------

rmSync(join(dir, 'src/server/image.ts'))
cpSync(join(here, 'phase5b/rust'), dir, { recursive: true })
const cargoFile = join(dir, 'crates/media/Cargo.toml')
writeFileSync(
  cargoFile,
  readFileSync(cargoFile, 'utf8').replaceAll('WEFT_CRATE', join(repo, 'crates/weft')),
)
const treeAfter = tree()
const changed = Object.keys({ ...treeBefore, ...treeAfter })
  .filter((f) => treeBefore[f] !== treeAfter[f])
  .sort()
log('changed under src/:', changed)

await check('the swap touches server modules only', () => {
  eq(changed, ['src/server/image.ts', 'src/server/rust.ts', 'src/server/thumb.ts'], 'changed files')
  return { changed }
})

for (const r of runtimes)
  await variant('rust', r, results).then(
    () => {},
    (e) => {
      checks.push({ name: `the addon serves on ${r}`, ok: false, error: e.message })
      log(`FAIL on ${r}: ${e.message}`)
    },
  )

for (const r of runtimes) {
  const before = results.ts[r],
    after = results.rust[r]
  await check(`${r}: the client is byte-identical`, () => {
    ok(after, 'no Rust run')
    eq(after.hashes, before.hashes, '.output/public')
    return { files: Object.keys(after.hashes).length }
  })
  await check(`${r}: /thumb serves the same HTML`, () => eq(after.html, before.html, 'HTML'))
  await check(`${r}: every request gets the same answer, to the byte`, () => {
    for (const k of Object.keys(before.wire)) eq(after.wire[k], before.wire[k], k)
    return { requests: Object.keys(before.wire).length }
  })
  if (values.browser)
    await check(`${r}: the same e2e passes in Chromium`, () => {
      eq(after.browser, before.browser, 'browser run')
      eq(after.browser.errors, [], 'page errors')
      eq(after.browser.hydrated, 0, 'requests during hydration')
      return { failed: after.browser.failed }
    })
}

const speed = Object.fromEntries(
  runtimes
    .filter((r) => results.rust[r])
    .map((r) => {
      const ts = results.ts[r].bench,
        rust = results.rust[r].bench
      return [
        r,
        {
          ts,
          rust,
          latency: +(ts.p50 / rust.p50).toFixed(1),
          throughput: +(rust.perSecond / ts.perSecond).toFixed(1),
        },
      ]
    }),
)
for (const r of runtimes.filter((x) => x !== 'deno'))
  await check(`${r}: the addon beats its TS \`run\` by at least ${REQUIRED}×`, () => {
    const s = speed[r]
    ok(s, 'no Rust run')
    ok(s.latency >= REQUIRED, `p50 is only ${s.latency}× (${s.ts.p50} ms to ${s.rust.p50} ms)`)
    ok(
      s.throughput >= REQUIRED,
      `throughput is only ${s.throughput}× (${s.ts.perSecond} to ${s.rust.perSecond} calls/s)`,
    )
    return { latency: s.latency, throughput: s.throughput }
  })

// ---- only native() has these ----------------------------------------------------------------------------------------

const addons = () =>
  readdirSync(join(dir, '.output/server/rust')).filter((f) => f.endsWith('.node'))

/** A call that spins for 200 ms. */
const spin = (url) => call(url, ID.spin)

for (const r of runtimes) {
  const context = {
    build,
    start,
    check,
    call,
    ID,
    eq,
    ok,
    until,
    spin,
    sleep,
    dir,
    addons,
    wire,
    results,
    bench,
    log,
  }
  await nativeChecks(context, r)
  await fallbackChecks(context, r)
}

build('node')
await check('`node .output/server/index.mjs` finds the addon with no `weft start`', async () => {
  const s = await start('node', ['node', '.output/server/index.mjs'])
  try {
    const a = await call(s.url, ID.thumbnail, { seed: 1, width: 64, height: 64 })
    eq(a.status, 200, `the answer: ${JSON.stringify(a.body).slice(0, 300)}`)
  } finally {
    await s.stop()
  }
})

// ---- weft check -----------------------------------------------------------------------------------------------------

const weftCheck = () => JSON.parse(run(weft(), ['check', '--json']).stdout || '{}')
const server = join(dir, 'src/server/thumb.ts')
const main = join(dir, 'crates/media/src/lib.rs')
const cleanServer = readFileSync(server, 'utf8'),
  cleanMain = readFileSync(main, 'utf8')

await diagnostics({
  check,
  eq,
  weftCheck,
  server,
  main,
  cleanServer,
  cleanMain,
  ID,
  run,
  weft,
  dir,
  repo,
  ok,
})

// ---- weft dev -------------------------------------------------------------------------------------------------------

await dev({
  freePort,
  weft,
  dir,
  until,
  call,
  ID,
  sleep,
  check,
  eq,
  main,
  cleanMain,
  server,
  cleanServer,
  ok,
})

// ---- weft add rust --------------------------------------------------------------------------------------------------

await check(
  '`weft add rust`: a native crate and a sidecar build, check clean and answer, on the first try',
  async () => {
    must(weft(), ['add', 'rust', 'hasher', '--no-install'])
    must(weft(), ['add', 'rust', 'finder', '--remote', '--no-install'])
    const r = weftCheck()
    eq([r.ok, r.diagnostics?.filter((d) => d.code.startsWith('R1'))], [true, []], 'check')
    build('node')
    const s = await start('node')
    try {
      for (const name of ['hasher', 'finder']) {
        const a = await call(s.url, fnId('digest', `src/server/${name}.ts`), { text: 'hello' })
        eq([a.status, a.body.v], [200, { bytes: 5, hash: '4f9f2cab' }], name)
      }
    } finally {
      await s.stop()
    }
    return {
      sizes: JSON.parse(readFileSync(join(dir, '.output/server/rust/manifest.json'), 'utf8')),
    }
  },
)

// ---- report ---------------------------------------------------------------------------------------------------------

report({ checks, dir, runtimes, changed, speed, results, here, values, REQUIRED, log })
