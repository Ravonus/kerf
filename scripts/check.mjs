#!/usr/bin/env node
// One command for every rule on the framework's own code: `pnpm run check`. It says what failed and how to fix it, and it's what
// CI runs. `weft check` is something else: the rules an app gets.
//
//   pnpm run check                 everything
//   pnpm run check --fast          everything but the test suites
//   pnpm run check --only=lint,types
//   pnpm run check --list          the steps, and what each covers
//   pnpm run check --require-tools a missing gitleaks or cargo-deny fails instead of skipping (CI does this)
//   pnpm run check --jobs=4        how much to run at once (see scripts/jobs.mjs)
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jobs, pool } from './jobs.mjs'
import { checkLengths } from './quality/lengths.mjs'
import { clippyProblems, lintProblems } from './quality/length-diagnostics.mjs'

// While a new rule beds in this is 'warn': everything is reported and nothing fails. Otherwise 'error'.
const LEVEL = 'error'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const only = argv
  .find((a) => a.startsWith('--only='))
  ?.slice(7)
  .split(',')
const fast = argv.includes('--fast'),
  requireTools = argv.includes('--require-tools')
const limit = jobs()
const windows = process.platform === 'win32'
const bin = (name) => join(root, 'node_modules', '.bin', windows ? `${name}.cmd` : name)
const CRATES = ['crates/weft-compiler', 'crates/weft-layout', 'crates/weft']
const PACKAGES = readdirSync(join(root, 'packages'))
  .filter((d) => existsSync(join(root, 'packages', d, 'package.json')))
  .map((d) => `packages/${d}`)
const LINT_PATHS = [
  'packages',
  'scripts',
  'site',
  ...readdirSync(join(root, 'evals'))
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => `evals/${f}`),
]
const has = (cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore', shell: windows }).status === 0
const hasCargo = (sub) =>
  spawnSync('cargo', [sub, '--version'], { stdio: 'ignore', shell: windows }).status === 0

function run(cmd, args, cwd = '.', env = {}) {
  return new Promise((ok) => {
    const child = spawn(cmd, args, {
      cwd: join(root, cwd),
      env: { ...process.env, NO_COLOR: '1', ...env },
      shell: windows,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = '',
      stdout = '',
      stderr = ''
    child.stdout.on('data', (d) => {
      out += d
      stdout += d
    })
    child.stderr.on('data', (d) => {
      out += d
      stderr += d
    })
    child.on('error', (e) => ok({ code: 1, out: String(e) }))
    child.on('close', (code) => ok({ code, out, stdout, stderr }))
  })
}

/** Runs each job, at most `limit` at once, and joins what the failures printed. */
async function all(items, job) {
  const results = await pool(items, limit, async (item) => ({ item, ...(await job(item)) }))
  const failed = results.filter((r) => r.code !== 0)
  return {
    problems: failed.flatMap((r) => [`--- ${r.item}`, ...r.out.trim().split('\n').slice(-40)]),
  }
}
const lines = (r) => (r.code === 0 ? { problems: [] } : { problems: r.out.trim().split('\n') })
let lengthResult
const lengths = () => (lengthResult ??= checkLengths())

/** Where a gitleaks finding is, never what it found. */
const leakPlaces = (text) =>
  JSON.parse(text || '[]').map(
    (f) => `${f.File}:${f.StartLine} ${f.RuleID}${f.Commit ? ` in ${f.Commit.slice(0, 8)}` : ''}`,
  )

const STEPS = [
  {
    id: 'package-folders',
    covers: 'package folders match their npm names',
    fix: 'Rename the folder to match the package name without its scope.',
    run() {
      const problems = []
      for (const dir of PACKAGES) {
        const { name } = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'))
        const expected = typeof name === 'string' ? name.split('/').at(-1) : ''
        if (!expected || dir !== `packages/${expected}`)
          problems.push(`${dir}: package name ${name} requires packages/${expected}`)
      }
      return { problems, detail: `${PACKAGES.length} packages checked` }
    },
  },
  {
    id: 'format',
    covers: 'oxfmt source formatting at 100 columns, with a checked-file count',
    fix: 'Run `node scripts/quality/format.mjs --write`.',
    async run() {
      const result = await run(process.execPath, ['scripts/quality/format.mjs'])
      return { ...lines(result), detail: result.code === 0 ? result.out.trim() : '' }
    },
  },
  {
    id: 'sample-width',
    covers: '70-column doc fences and 58-column split-pane samples (warnings in S0)',
    fix: 'Rewrite samples to fit their boxes; Sprint 1 makes these warnings errors.',
    async run() {
      const result = await run(process.execPath, ['site/scripts/sample-width.mjs'])
      return { ...lines(result), detail: result.code === 0 ? result.out.trim() : '' }
    },
  },
  {
    id: 'lint',
    covers:
      'Oxlint with type-aware rules: bugs, async mistakes, types, comments, tests, code from strings',
    fix: 'Run `pnpm run fix` for what can be fixed by machine. Each line names the rule. A disable needs a reason: `// oxlint-disable-next-line <rule> -- <why>`, and CONTRIBUTING.md says when one is allowed.',
    async run() {
      const r = await run(bin('oxlint'), [
        '--type-aware',
        '--report-unused-disable-directives-severity=error',
        '--format',
        'json',
        ...LINT_PATHS,
      ])
      let report
      try {
        report = JSON.parse(r.out.slice(r.out.indexOf('{')))
      } catch {
        return lines({ code: 1, out: r.out })
      }
      const problems = lintProblems(report, lengths())
      if (r.code !== 0 && !report.diagnostics.length)
        problems.push(r.out.trim() || 'Oxlint failed without diagnostics')
      return { problems }
    },
  },
  {
    id: 'lengths',
    covers:
      '400 source / 800 generated and test lines; 80 per function, with a shrinking Git baseline',
    fix: 'Split the file or function, and regenerate the baseline. The baseline may only shrink against its Git base.',
    run() {
      const result = lengths()
      const files = result.findings.filter((f) => f.kind === 'file').length
      const functions = result.findings.length - files
      const tokens = result.findings.reduce((sum, f) => sum + f.tokens, 0)
      return {
        problems: result.problems,
        detail: `${files} files, ${functions} functions, ${tokens} syntax units (whitespace-independent)`,
      }
    },
  },
  {
    id: 'types',
    covers:
      'tsc on every package: strict, noUncheckedIndexedAccess, noImplicitOverride, exactOptionalPropertyTypes',
    fix: 'Fix the type. Where an index is known to be in range, `xs[i]!` says so; anywhere else, handle the undefined.',
    async run() {
      const projects = ['.', 'site', ...PACKAGES].filter((d) =>
        existsSync(join(root, d, 'tsconfig.json')),
      )
      const found = new Set()
      await pool(projects, limit, async (dir) => {
        const r = await run(bin('tsc'), [
          '-p',
          dir === '.' ? 'tsconfig.json' : `${dir}/tsconfig.json`,
          '--pretty',
          'false',
        ])
        // Tests import examples from evals/ and spikes/ to prove they work, and text's gen/ is vendored code rewritten. Not held to this.
        for (const line of r.out.split('\n'))
          if (/error TS\d+/.test(line) && !/^(?:evals|spikes|packages\/text\/gen)\//.test(line))
            found.add(line)
      })
      return { problems: [...found].toSorted((a, b) => a.localeCompare(b)) }
    },
  },
  {
    id: 'boundaries',
    covers: 'warp-core imports no framework; browser entries reach no Node code, however deep',
    fix: 'Each line shows the chain of imports. Move the Node code behind a server entry, or the framework code into bindings/.',
    run: async () => lines(await run(process.execPath, ['scripts/quality/boundaries.mjs'])),
  },
  {
    id: 'browser-apis',
    covers:
      'browser code, packages and site, calls no crypto.randomUUID: plain http (a LAN address) has none',
    fix: "Use crypto.getRandomValues, or test `typeof crypto.randomUUID === 'function'` before calling it. A server-only module goes in src/server/ or a *.server.ts file.",
    run: async () => lines(await run(process.execPath, ['scripts/quality/browser-apis.mjs'])),
  },
  {
    id: 'rust-fmt',
    covers: 'rustfmt --check on all tracked Rust files',
    fix: 'Run `pnpm run fix`.',
    async run() {
      const result = await run(process.execPath, ['scripts/quality/rust-format.mjs'])
      const output = lines(result)
      output.problems.sort(
        (a, b) => Number(b.startsWith('rustfmt failed:')) - Number(a.startsWith('rustfmt failed:')),
      )
      return { ...output, detail: result.code === 0 ? result.out.trim() : '' }
    },
  },
  {
    id: 'clippy',
    covers: 'Clippy: no unwrap outside tests, SAFETY comments on unsafe, reasons on allows',
    fix: 'Each block is one lint. `#[allow(...)]` needs `reason = "..."`. Use `expect("why it holds")` over unwrap; `unsafe` takes a `// SAFETY:` comment.',
    async run() {
      const found = [],
        measured = lengths()
      await pool(CRATES, limit, async (c) => {
        const r = await run(
          'cargo',
          [
            'clippy',
            '--all-targets',
            '--message-format=json',
            '--',
            '-D',
            'warnings',
            '--force-warn',
            'clippy::too_many_lines',
          ],
          c,
        )
        found.push(...clippyProblems(c, r, measured))
      })
      return {
        problems: [...measured.problems, ...new Set(found)].toSorted((a, b) => a.localeCompare(b)),
      }
    },
  },
  {
    id: 'secrets',
    covers: 'gitleaks over the working tree',
    fix: 'If it is real: rotate it first, then remove it. If it is a fixture: add the path to .gitleaks.toml with a reason. The report gives places, never values.',
    tool: 'gitleaks',
    install: 'brew install gitleaks, or a release from github.com/gitleaks/gitleaks',
    async run() {
      if (!has('gitleaks')) return { skipped: 'gitleaks is not installed' }
      const report = join(root, 'node_modules', '.gitleaks-report.json')
      const r = await run('gitleaks', [
        'dir',
        '.',
        '--config',
        '.gitleaks.toml',
        '--redact',
        '--no-banner',
        '--report-format',
        'json',
        '--report-path',
        report,
        '--exit-code',
        '3',
      ])
      if (r.code === 0) return { problems: [] }
      return {
        problems:
          r.code === 3
            ? leakPlaces(readFileSync(report, 'utf8'))
            : r.out.trim().split('\n').slice(-5),
      }
    },
  },
  {
    id: 'tarballs',
    covers: '.gitignore keeps out env files and credentials; no package would ship them',
    fix: 'Add the pattern to .gitignore, or the path to `files` in the package, or remove the file.',
    run: async () => lines(await run(process.execPath, ['scripts/quality/tarballs.mjs'])),
  },
  {
    id: 'licences',
    covers: 'every npm dependency on the allowlist',
    fix: 'Pick another dependency, or if the licence is acceptable add it to scripts/quality/licences.mjs in its own commit, saying why.',
    run: async () => lines(await run(process.execPath, ['scripts/quality/licences.mjs'])),
  },
  {
    id: 'npm-audit',
    covers: 'pnpm audit over the workspace lockfile',
    fix: 'Update the dependency in the package that names it and run `pnpm install` at the root.',
    run: async () => {
      // Anything that ships, at any severity; dev tools from high up, since they only ever run on a contributor's machine.
      const shipped = await run('pnpm', ['audit', '--prod', '--audit-level=low'])
      return lines(
        shipped.code !== 0 ? shipped : await run('pnpm', ['audit', '--audit-level=high']),
      )
    },
  },
  {
    id: 'cargo-deny',
    covers: 'cargo deny: advisories, licences, bans and sources for each crate',
    fix: 'Update the crate with `cargo update -p <name>`. An advisory that does not apply goes in deny.toml with a reason.',
    tool: 'cargo-deny',
    install: 'cargo install cargo-deny --locked, or brew install cargo-deny',
    async run() {
      if (!hasCargo('deny')) return { skipped: 'cargo-deny is not installed' }
      return all(CRATES, (c) =>
        run('cargo', ['deny', '--manifest-path', `${c}/Cargo.toml`, '--all-features', 'check']),
      )
    },
  },
  {
    id: 'commits',
    covers: 'each commit that fixes a bug touches a test',
    fix: 'Add a test that fails without the fix, or a `No-Regression-Test: <reason>` trailer if one truly cannot exist.',
    run: async () => lines(await run(process.execPath, ['scripts/quality/commits.mjs'])),
  },
  {
    id: 'rust-tests',
    covers: 'cargo test in each crate',
    slow: true,
    fix: 'Run the failing crate on its own: `cd crates/<name> && cargo test`.',
    run: () => all(CRATES, (c) => run('cargo', ['test'], c)),
  },
  {
    id: 'tests',
    covers: "every package's test script",
    slow: true,
    fix: 'Run the failing package on its own: `pnpm --filter <name> test`.',
    run: () =>
      all(
        PACKAGES.filter(
          (d) => JSON.parse(readFileSync(join(root, d, 'package.json'), 'utf8')).scripts?.test,
        ),
        (d) => run('pnpm', ['test'], d),
      ),
  },
]

if (argv.includes('--list')) {
  for (const s of STEPS)
    console.log(`${s.id.padEnd(11)} ${s.covers}${s.slow ? ' (not with --fast)' : ''}`)
  process.exit(0)
}
if (only)
  for (const id of only)
    if (!STEPS.some((s) => s.id === id)) {
      console.error(`no step called ${id}: --list shows them`)
      process.exit(2)
    }

const chosen = STEPS.filter((s) => (only ? only.includes(s.id) : !(fast && s.slow)))
const results = []
for (const step of chosen) {
  const started = performance.now()
  process.stdout.write(`${step.id.padEnd(11)} `)
  let result
  try {
    result = await step.run()
  } catch (e) {
    result = { problems: [String(e?.stack ?? e)] }
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  const count = result.problems?.length ?? 0
  console.log(
    result.skipped
      ? `skipped: ${result.skipped}`
      : count
        ? `${count} problem(s), ${seconds}s`
        : `ok, ${seconds}s${result.detail ? `; ${result.detail}` : ''}`,
  )
  results.push({ step, ...result })
}

const failed = results.filter((r) => r.problems?.length)
const skipped = results.filter((r) => r.skipped)
for (const { step, problems } of failed) {
  console.log(`\n${step.id}: ${problems.length} problem(s)`)
  for (const line of problems.slice(0, 60)) console.log(`  ${line}`)
  if (problems.length > 60)
    console.log(`  ... and ${problems.length - 60} more: pnpm run check --only=${step.id}`)
  console.log(`  how to fix: ${step.fix}`)
}
for (const { step, skipped: why } of skipped)
  console.log(`\n${step.id} did not run: ${why}. Install it: ${step.install}`)
const missed = requireTools ? skipped.length : 0
console.log(
  failed.length || missed
    ? `\npnpm run check: ${failed
        .map((r) => r.step.id)
        .concat(requireTools ? skipped.map((r) => r.step.id) : [])
        .join(', ')} failed`
    : `\npnpm run check: all passed${skipped.length ? `, ${skipped.length} skipped` : ''}`,
)
process.exit(LEVEL === 'error' && (failed.length || missed) ? 1 : 0)
