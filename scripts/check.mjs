#!/usr/bin/env node
// One command for every rule on the framework's own code: `npm run check`. It says what failed and how to fix it, and it's what
// CI runs. `weft check` is something else: the rules an app gets.
//
//   npm run check                    everything
//   npm run check -- --fast          everything but the test suites
//   npm run check -- --only=lint,types
//   npm run check -- --list          the steps, and what each covers
//   npm run check -- --require-tools a missing gitleaks or cargo-deny fails instead of skipping (CI does this)
//   npm run check -- --jobs=4        how much to run at once (see scripts/jobs.mjs)
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jobs, pool } from './jobs.mjs'

// While a new rule beds in this is 'warn': everything is reported and nothing fails. Otherwise 'error'.
const LEVEL = 'warn'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const only = argv.find(a => a.startsWith('--only='))?.slice(7).split(',')
const fast = argv.includes('--fast'), requireTools = argv.includes('--require-tools')
const limit = jobs()
const windows = process.platform === 'win32'
const bin = name => join(root, 'node_modules', '.bin', windows ? `${name}.cmd` : name)
const CRATES = ['crates/weft-compiler', 'crates/weft-layout', 'crates/weft']
const PACKAGES = readdirSync(join(root, 'packages')).filter(d => existsSync(join(root, 'packages', d, 'package.json'))).map(d => `packages/${d}`)
const LOCKED = ['.', 'site', ...PACKAGES].filter(d => existsSync(join(root, d, 'package-lock.json')))
const LINT_PATHS = ['packages', 'scripts', 'site', ...readdirSync(join(root, 'evals')).filter(f => f.endsWith('.mjs')).map(f => `evals/${f}`)]
const has = cmd => spawnSync(cmd, ['--version'], { stdio: 'ignore', shell: windows }).status === 0
const hasCargo = sub => spawnSync('cargo', [sub, '--version'], { stdio: 'ignore', shell: windows }).status === 0

function run(cmd, args, cwd = '.', env = {}) {
  return new Promise(ok => {
    const child = spawn(cmd, args, { cwd: join(root, cwd), env: { ...process.env, NO_COLOR: '1', ...env }, shell: windows, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', d => (out += d)); child.stderr.on('data', d => (out += d))
    child.on('error', e => ok({ code: 1, out: String(e) }))
    child.on('close', code => ok({ code, out }))
  })
}

/** Runs each job, at most `limit` at once, and joins what the failures printed. */
async function all(items, job) {
  const results = await pool(items, limit, async item => ({ item, ...await job(item) }))
  const failed = results.filter(r => r.code !== 0)
  return { problems: failed.flatMap(r => [`--- ${r.item}`, ...r.out.trim().split('\n').slice(-40)]) }
}
const lines = r => (r.code === 0 ? { problems: [] } : { problems: r.out.trim().split('\n') })

/** Where a gitleaks finding is, never what it found. */
const leakPlaces = text => JSON.parse(text || '[]').map(f => `${f.File}:${f.StartLine} ${f.RuleID}${f.Commit ? ` in ${f.Commit.slice(0, 8)}` : ''}`)

const STEPS = [
  {
    id: 'lint', covers: 'Oxlint with type-aware rules: bugs, async mistakes, types, comments, tests, code from strings',
    fix: 'Run `npm run fix` for what can be fixed by machine. Each line names the rule. A disable needs a reason: `// oxlint-disable-next-line <rule> -- <why>`, and CONTRIBUTING.md says when one is allowed.',
    async run() {
      const r = await run(bin('oxlint'), ['--type-aware', '--report-unused-disable-directives-severity=warn', '--format', 'json', ...LINT_PATHS])
      let report
      try { report = JSON.parse(r.out.slice(r.out.indexOf('{'))) } catch { return lines({ code: 1, out: r.out }) }
      return { problems: [...new Set(report.diagnostics.map(d => `${d.filename}:${d.labels?.[0]?.span.line ?? 0} ${d.code ?? 'plugin'} ${d.message.split('\n')[0]}`))] }
    },
  },
  {
    id: 'types', covers: 'tsc on every package: strict, noUncheckedIndexedAccess, noImplicitOverride, exactOptionalPropertyTypes',
    fix: 'Fix the type. Where an index is known to be in range, `xs[i]!` says so; anywhere else, handle the undefined.',
    async run() {
      const projects = ['.', 'site', ...PACKAGES].filter(d => existsSync(join(root, d, 'tsconfig.json')))
      const found = new Set()
      await pool(projects, limit, async dir => {
        const r = await run(bin('tsc'), ['-p', dir === '.' ? 'tsconfig.json' : `${dir}/tsconfig.json`, '--pretty', 'false'])
        // Tests import examples from evals/ and spikes/ to prove they work, and text's gen/ is vendored code rewritten. Not held to this.
        for (const line of r.out.split('\n')) if (/error TS\d+/.test(line) && !/^(?:evals|spikes|packages\/text\/gen)\//.test(line)) found.add(line)
      })
      return { problems: [...found].toSorted((a, b) => a.localeCompare(b)) }
    },
  },
  {
    id: 'boundaries', covers: 'warp-core imports no framework; browser entries reach no Node code, however deep',
    fix: 'Each line shows the chain of imports. Move the Node code behind a server entry, or the framework code into bindings/.',
    run: async () => lines(await run(process.execPath, ['scripts/quality/boundaries.mjs'])),
  },
  {
    id: 'rust-fmt', covers: 'cargo fmt --check on crates/',
    fix: 'Run `npm run fix`.',
    run: () => all(CRATES, async c => run('cargo', ['fmt', '--check'], c)),
  },
  {
    id: 'clippy', covers: 'cargo clippy with pedantic: no unwrap outside tests, SAFETY comments on unsafe, reasons on allows',
    fix: 'Each block is one lint. `#[allow(...)]` needs `reason = "..."`. Use `expect("why it holds")` over unwrap; `unsafe` takes a `// SAFETY:` comment.',
    async run() {
      const found = []
      await pool(CRATES, limit, async c => {
        const r = await run('cargo', ['clippy', '--all-targets', '--message-format=short', '--', '-D', 'warnings'], c)
        if (r.code !== 0) found.push(...new Set(r.out.split('\n').filter(l => /^\S+\.rs:\d+:\d+: (?:error|warning)/.test(l) || /^error: (?!could not compile)/.test(l)).map(l => `${c}/${l}`)))
      })
      return { problems: found.toSorted((a, b) => a.localeCompare(b)) }
    },
  },
  {
    id: 'secrets', covers: 'gitleaks over the working tree',
    fix: 'If it is real: rotate it first, then remove it. If it is a fixture: add the path to .gitleaks.toml with a reason. The report gives places, never values.',
    tool: 'gitleaks', install: 'brew install gitleaks, or a release from github.com/gitleaks/gitleaks',
    async run() {
      if (!has('gitleaks')) return { skipped: 'gitleaks is not installed' }
      const report = join(root, 'node_modules', '.gitleaks-report.json')
      const r = await run('gitleaks', ['dir', '.', '--config', '.gitleaks.toml', '--redact', '--no-banner', '--report-format', 'json', '--report-path', report, '--exit-code', '3'])
      if (r.code === 0) return { problems: [] }
      return { problems: r.code === 3 ? leakPlaces(readFileSync(report, 'utf8')) : r.out.trim().split('\n').slice(-5) }
    },
  },
  {
    id: 'tarballs', covers: '.gitignore keeps out env files and credentials; no package would ship them',
    fix: 'Add the pattern to .gitignore, or the path to `files` in the package, or remove the file.',
    run: async () => lines(await run(process.execPath, ['scripts/quality/tarballs.mjs'])),
  },
  {
    id: 'licences', covers: 'every npm dependency on the allowlist',
    fix: 'Pick another dependency, or if the licence is acceptable add it to scripts/quality/licences.mjs in its own commit, saying why.',
    run: async () => lines(await run(process.execPath, ['scripts/quality/licences.mjs'])),
  },
  {
    id: 'npm-audit', covers: 'npm audit for every lockfile',
    fix: 'Update the dependency in that package and run `npm install` there. Each package has its own lockfile.',
    run: () => all(LOCKED, async d => {
      // Anything that ships, at any severity; dev tools from high up, since they only ever run on a contributor's machine.
      const shipped = await run('npm', ['audit', '--omit=dev', '--audit-level=low', '--no-fund'], d)
      const r = shipped.code ? shipped : await run('npm', ['audit', '--audit-level=high', '--no-fund'], d)
      return { ...r, out: r.out.split('\n').filter(l => !l.startsWith('npm warn')).join('\n') }
    }),
  },
  {
    id: 'cargo-deny', covers: 'cargo deny: advisories, licences, bans and sources for each crate',
    fix: 'Update the crate with `cargo update -p <name>`. An advisory that does not apply goes in deny.toml with a reason.',
    tool: 'cargo-deny', install: 'cargo install cargo-deny --locked, or brew install cargo-deny',
    async run() {
      if (!hasCargo('deny')) return { skipped: 'cargo-deny is not installed' }
      return all(CRATES, c => run('cargo', ['deny', '--manifest-path', `${c}/Cargo.toml`, '--all-features', 'check']))
    },
  },
  {
    id: 'commits', covers: 'each commit that fixes a bug touches a test',
    fix: 'Add a test that fails without the fix, or a `No-Regression-Test: <reason>` trailer if one truly cannot exist.',
    run: async () => lines(await run(process.execPath, ['scripts/quality/commits.mjs'])),
  },
  {
    id: 'rust-tests', covers: 'cargo test in each crate', slow: true,
    fix: 'Run the failing crate on its own: `cd crates/<name> && cargo test`.',
    run: () => all(CRATES, c => run('cargo', ['test'], c)),
  },
  {
    id: 'tests', covers: 'every package\'s npm test', slow: true,
    fix: 'Run the failing package on its own: `cd packages/<name> && npm test`.',
    run: () => all(PACKAGES.filter(d => JSON.parse(readFileSync(join(root, d, 'package.json'), 'utf8')).scripts?.test), d => run('npm', ['test'], d)),
  },
]

if (argv.includes('--list')) {
  for (const s of STEPS) console.log(`${s.id.padEnd(11)} ${s.covers}${s.slow ? ' (not with --fast)' : ''}`)
  process.exit(0)
}
if (only) for (const id of only) if (!STEPS.some(s => s.id === id)) { console.error(`no step called ${id}: --list shows them`); process.exit(2) }

const chosen = STEPS.filter(s => (only ? only.includes(s.id) : !(fast && s.slow)))
const results = []
for (const step of chosen) {
  const started = performance.now()
  process.stdout.write(`${step.id.padEnd(11)} `)
  let result
  try { result = await step.run() } catch (e) { result = { problems: [String(e?.stack ?? e)] } }
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  const count = result.problems?.length ?? 0
  console.log(result.skipped ? `skipped: ${result.skipped}` : count ? `${count} problem(s), ${seconds}s` : `ok, ${seconds}s`)
  results.push({ step, ...result })
}

const failed = results.filter(r => r.problems?.length)
const skipped = results.filter(r => r.skipped)
for (const { step, problems } of failed) {
  console.log(`\n${step.id}: ${problems.length} problem(s)`)
  for (const line of problems.slice(0, 60)) console.log(`  ${line}`)
  if (problems.length > 60) console.log(`  ... and ${problems.length - 60} more: npm run check -- --only=${step.id}`)
  console.log(`  how to fix: ${step.fix}`)
}
for (const { step, skipped: why } of skipped) console.log(`\n${step.id} did not run: ${why}. Install it: ${step.install}`)
const missed = requireTools ? skipped.length : 0
console.log(failed.length || missed ? `\nnpm run check: ${failed.map(r => r.step.id).concat(requireTools ? skipped.map(r => r.step.id) : []).join(', ')} failed` : `\nnpm run check: all passed${skipped.length ? `, ${skipped.length} skipped` : ''}`)
process.exit(LEVEL === 'error' && (failed.length || missed) ? 1 : 0)
