#!/usr/bin/env node
// Phase 5a's exit check (PLAN §9, "5a. Rust: remote"; research 36): a search sidecar replaces a TS `query` with no client
// change. The same app is built twice. Before: every function's body is a TS `run`. After: each is `impl: search`, and
// a Rust crate does the work. The swap touches server modules and adds a crate; this script holds it to that, and to
// the claim that follows from it:
//
//   client   `.output/public` is byte-identical, and `/search` serves byte-identical HTML
//   wire     the same requests get the same answers (values, tags, errors, statuses)
//   browser  the same e2e passes in Chromium: SSR, 0-fetch hydration, single-flight mutation, a typed error
//
// then what only the Rust side has: a sidecar killed under load, a forged call, a Rust-added tag and `touch`, `weft dev`
// reload with no failed request, a schema edit reported as R103 with the function's id, and R101/R102 from `weft check`.
// Each `weft start` runs on Node, Bun and Deno. The swap is scripted, not done by an agent.
//
//   node evals/gates/phase5a-exit.mjs <empty-dir> [--runtimes node,bun,deno] [--docs 20000]
//
// Writes evals/results/phase5a-exit.md and .json; exit 1 if any check fails. Needs cargo, and bun and deno for those
// runtimes, packages/core's native compiler built, and each package's dependencies installed.
import { corpus } from './phase5a-exit/corpus.mjs'
import { diagnostics } from './phase5a-exit/diagnostics.mjs'
import { sidecar } from './phase5a-exit/sidecar.mjs'
import { dev } from './phase5a-exit/dev.mjs'
import * as runner from './phase5a-exit/runner.mjs'
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
import { createRequire } from 'node:module'
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
    docs: { type: 'string', default: '20000' },
  },
})
if (!positionals[0]) {
  console.error('usage: phase5a-exit.mjs <empty-dir> [--runtimes node,bun,deno] [--docs 20000]')
  process.exit(1)
}
const dir = resolve(positionals[0])
if (existsSync(dir) && readdirSync(dir).length) throw new Error(`${dir} is not empty`)
const runtimes = values.runtimes.split(',')
const { chromium } = createRequire(join(repo, 'packages/start/package.json'))('playwright-core')
const { fnId } = await import(join(repo, 'packages/start/src/vite.mjs'))

const log = (...a) => console.log('[5a]', ...a)
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
const ID = {
  search: fnId('searchDocs', 'src/server/docs.ts'),
  popular: fnId('popular', 'src/server/docs.ts'),
  get: fnId('getDoc', 'src/server/docs.ts'),
  add: fnId('addDoc', 'src/server/docs.ts'),
}

const checks = []
const ok = (v, what) => {
  if (!v) throw new Error(what)
}
const check = makeCheck(checks, log, 120)

// ---- the corpus -----------------------------------------------------------------------------------------------------

// ---- running a build ------------------------------------------------------------------------------------------------

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
  chromium,
  get build() {
    return build
  },
  get publicHashes() {
    return publicHashes
  },
  get start() {
    return start
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
    'search',
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
cpSync(join(here, 'phase5a/app'), dir, { recursive: true })
cpSync(join(here, 'phase5a/ts'), dir, { recursive: true })
writeFileSync(join(dir, 'src/server/corpus.json'), JSON.stringify(corpus(Number(values.docs))))

const results = { ts: {}, rust: {} }
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

// ---- before ---------------------------------------------------------------------------------------------------------

/** `tsc` on the app, as evals/gates/phase3b-exit.mjs runs it: what a linked package reports isn't the app's. */
function types() {
  const shared = ['zod']
  const paths = Object.fromEntries(
    shared.flatMap((p) => [
      [p, [`./node_modules/${p}`]],
      [`${p}/*`, [`./node_modules/${p}/*`]],
    ]),
  )
  writeFileSync(
    join(dir, 'tsconfig.check.json'),
    JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: { preserveSymlinks: true, baseUrl: '.', paths, resolveJsonModule: true },
        include: ['src'],
      },
      null,
      2,
    ),
  )
  const out = run(join(repo, 'packages/core/node_modules/.bin/tsc'), [
    '--noEmit',
    '-p',
    'tsconfig.check.json',
  ]).stdout
  return out.split('\n').filter((l) => /^src\/.*error TS/.test(l))
}

const treeBefore = tree()
must(weft(), ['check']) // the slots and route types tsc reads
const typesBefore = types()
for (const r of runtimes) await variant('ts', r, results)

// ---- the swap -------------------------------------------------------------------------------------------------------

rmSync(join(dir, 'src/server/rank.ts'))
cpSync(join(here, 'phase5a/rust'), dir, { recursive: true })
const cargoFile = join(dir, 'crates/search/Cargo.toml')
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
  eq(changed, ['src/server/docs.ts', 'src/server/rank.ts', 'src/server/rust.ts'], 'changed files')
  return { changed }
})

await check('the app type-checks before and after, with the same client types', () => {
  must(weft(), ['check'])
  eq([typesBefore, types()], [[], []], 'tsc errors under src/')
})

for (const r of runtimes)
  await variant('rust', r, results).then(
    () => {},
    (e) => {
      checks.push({ name: `the Rust build serves on ${r}`, ok: false, error: e.message })
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
  await check(`${r}: /search serves the same HTML`, () => eq(after.html, before.html, 'HTML'))
  await check(`${r}: every request gets the same answer`, () => {
    for (const k of Object.keys(before.wire)) eq(after.wire[k], before.wire[k], k)
    return { requests: Object.keys(before.wire).length }
  })
  await check(`${r}: the same e2e passes in Chromium`, () => {
    eq(after.browser, before.browser, 'browser run')
    eq(after.browser.hydrated, 0, 'requests during hydration')
    eq(after.browser.errors, [], 'page errors')
    eq(
      after.browser.addRequests.filter((x) => x.startsWith('GET')),
      [],
      'a GET after the mutation (single-flight)',
    )
    eq(after.browser.output, 'NotFound:no-such-doc', 'typed error')
    return { compassTop: after.browser.compass[0], added: after.browser.added[0] }
  })
}

const speed = Object.fromEntries(
  runtimes
    .filter((r) => results.rust[r])
    .map((r) => [r, { ts: results.ts[r].bench, rust: results.rust[r].bench }]),
)

// ---- only the Rust side has these -----------------------------------------------------------------------------------

await sidecar({ build, start, check, call, ID, eq, ok, until })

// ---- weft check -----------------------------------------------------------------------------------------------------

const weftCheck = () => JSON.parse(run(weft(), ['check', '--json']).stdout || '{}')
const docs = join(dir, 'src/server/docs.ts')
const main = join(dir, 'crates/search/src/main.rs')
const cleanDocs = readFileSync(docs, 'utf8'),
  cleanMain = readFileSync(main, 'utf8')

await diagnostics({ check, eq, weftCheck, docs, main, cleanDocs, cleanMain, ID, ok })

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
  docs,
  cleanDocs,
  ok,
})

// ---- report ---------------------------------------------------------------------------------------------------------

const passed = checks.filter((c) => c.ok).length
const failed = checks.filter((c) => !c.ok)
const result = {
  date: new Date().toISOString().slice(0, 10),
  ok: !failed.length,
  docs: Number(values.docs),
  runtimes,
  changed,
  speed,
  checks,
  sizes: existsSync(join(dir, '.output/rust/manifest.json'))
    ? JSON.parse(readFileSync(join(dir, '.output/rust/manifest.json'), 'utf8'))
    : {},
}
mkdirSync(join(here, 'results'), { recursive: true })
writeFileSync(join(here, 'results/phase5a-exit.json'), JSON.stringify(result, null, 2) + '\n')
const speedRows = Object.entries(speed).flatMap(([r, s]) => [
  `| ${r} | TS \`run\` | ${s.ts.p50} | ${s.ts.p99} | ${s.ts.perSecond} |`,
  `| ${r} | Rust sidecar | ${s.rust.p50} | ${s.rust.p99} | ${s.rust.perSecond} |`,
])
writeFileSync(
  join(here, 'results/phase5a-exit.md'),
  `# Phase 5a exit check

${result.date}: **${failed.length ? 'FAIL' : 'PASS'}**, ${passed} of ${checks.length} checks. A search sidecar replaces a TS \`query\` with no client change.
The swap is scripted (\`evals/gates/phase5a-exit.mjs\`, the app in \`evals/phase5a/\`), not done by an agent. ${result.docs} documents; \`weft start\` on ${runtimes.join(', ')}.

Changed under \`src/\`: ${changed.map((f) => `\`${f}\``).join(', ')}. Added: \`crates/search\`.

| Check | Result | Detail |
|---|---|---|
${checks.map((c) => `| ${c.name} | ${c.ok ? 'pass' : `**FAIL**: ${String(c.error).split('\n')[0].slice(0, 160).replaceAll('|', '\\|')}`} | ${c.detail ? `\`${JSON.stringify(c.detail).slice(0, 110).replaceAll('|', '\\|')}\`` : ''} |`).join('\n')}

## Speed

The same tf-idf search over one corpus, through the public \`GET /_weft/fn/<id>\`, on one machine. Sequential p50 and p99, then 32 callers at once.
A within-weft comparison of two server bodies: the \`benchmarks/compare\` stacks have no server functions, so they have no counterpart.

| Runtime | Body | p50 ms | p99 ms | calls/s |
|---|---|---|---|---|
${speedRows.join('\n')}
`,
)
log(`${failed.length ? 'FAIL' : 'PASS'}: ${passed}/${checks.length}`)
for (const f of failed) log(`  ${f.name}: ${String(f.error).slice(0, 300)}`)
process.exit(failed.length ? 1 : 0)
