#!/usr/bin/env node
// One command for every rule on the framework's own code: `pnpm run check`. It says what failed and how to fix it, and it's what
// CI runs. `weft check` is something else: the rules an app gets.
//
//   pnpm run check                 every step a merge needs (all at once)
//   pnpm run check --fast          without the test suites
//   pnpm run check --release       also the release-only steps and test files (scripts/check/tiers.mjs), and WebKit
//   pnpm run check --changed=main  test only the packages changed since main, and those that depend on them
//   pnpm run check --only=lint,types
//   pnpm run check --list          the steps, and what each covers
//   pnpm run check --require-tools a missing gitleaks or cargo-deny fails instead of skipping (CI does this)
//   pnpm run check --jobs=4        how much to run at once (see scripts/jobs.mjs)
import { repoRoot } from './lib/helpers.mjs'
import { spawnSync } from 'node:child_process'
import { run, allJobs } from './check/run.mjs'
import { runSteps } from './check/steps.mjs'
import { affected, mergeArgs } from './check/tiers.mjs'
import { typeProblems } from './check/types.mjs'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { jobs, pool } from './jobs.mjs'
import { leakPlaces } from './quality/leak-places.mjs'
import { packageProblems } from './quality/package-folders.mjs'
import { checkLengths } from './quality/lengths.mjs'
import { conventionsStep } from './quality/conventions.mjs'
import { clippyProblems, lintProblems } from './quality/length-diagnostics.mjs'

// While a new rule beds in this is 'warn': everything is reported and nothing fails. Otherwise 'error'.
const LEVEL = 'error'
const root = repoRoot
const argv = process.argv.slice(2)
const only = argv
  .find((a) => a.startsWith('--only='))
  ?.slice(7)
  .split(',')
const fast = argv.includes('--fast'),
  release = argv.includes('--release'),
  requireTools = argv.includes('--require-tools')
if (release) process.env.WEFT_WEBKIT = '1'
// --changed=<ref>: test only the packages a change since <ref> touches, and those that depend on them.
const changedSince = argv.find((a) => a.startsWith('--changed='))?.slice(10)
const limit = jobs()
const windows = process.platform === 'win32'
const bin = (name) => join(root, 'node_modules', '.bin', windows ? `${name}.cmd` : name)
const LONG = ['packages/create', 'packages/cli', 'packages/warp', 'packages/start']
const CRATES = ['crates/weft-compiler', 'crates/weft-layout', 'crates/weft']
const PACKAGES = readdirSync(join(root, 'packages'))
  .filter((d) => existsSync(join(root, 'packages', d, 'package.json')))
  .map((d) => `packages/${d}`)
const testable = changedSince ? affected(root, PACKAGES, changedSince) : PACKAGES
const LINT_PATHS = [
  'packages',
  'scripts',
  'site',
  'evals/gates',
  'evals/lib',
  ...readdirSync(join(root, 'evals'))
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => `evals/${f}`),
]
const has = (cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore', shell: windows }).status === 0
const hasCargo = (sub) =>
  spawnSync('cargo', [sub, '--version'], { stdio: 'ignore', shell: windows }).status === 0

const all = (items, job) => allJobs(items, job, limit)
const lines = (r) => (r.code === 0 ? { problems: [] } : { problems: r.out.trim().split('\n') })
let lengthResult
const lengths = () => (lengthResult ??= checkLengths())

const STEPS = [
  conventionsStep(run, lines),
  {
    id: 'package-folders',
    covers: 'package folders, tracked paths and shared repository helpers',
    fix: 'Rename mismatched package folders and remove archived or generated files from the index.',
    async run() {
      const check = await run(process.execPath, [
        '--test',
        'scripts/quality/layout-paths.test.mjs',
        'scripts/quality/shared-helpers.test.mjs',
      ])
      const { problems } = lines(check)
      problems.push(
        ...lines(await run(process.execPath, ['scripts/quality/shared-helpers.mjs'])).problems,
      )
      problems.push(...packageProblems(root, PACKAGES))
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
    covers: '70-column doc fences and 58-column split-pane samples',
    fix: 'Rewrite samples to fit their boxes.',
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
      const test = await run(process.execPath, ['--test', 'scripts/check/types.test.mjs'])
      const found = new Set(lines(test).problems)
      await pool(projects, limit, async (dir) => {
        const r = await run(bin('tsc'), [
          '-p',
          dir === '.' ? 'tsconfig.json' : `${dir}/tsconfig.json`,
          '--pretty',
          'false',
        ])
        for (const problem of typeProblems(dir, r)) found.add(problem)
      })
      return { problems: [...found].toSorted((a, b) => a.localeCompare(b)) }
    },
  },
  {
    id: 'api-snapshots',
    covers: 'core and start export maps and reference coverage',
    fix: 'Review export changes, update snapshots, and document each path.',
    async run() {
      const test = await run(process.execPath, ['--test', 'scripts/quality/api-snapshots.test.mjs'])
      const check = await run(process.execPath, ['scripts/quality/api-snapshots.mjs'])
      return { problems: [...lines(test).problems, ...lines(check).problems] }
    },
  },
  {
    id: 'diagnostic-catalog',
    covers: 'compiler diagnostic catalog, emit sites and compile test assertions',
    fix: 'Resolve catalog coverage gaps or update the temporary baseline.',
    async run() {
      const test = await run(process.execPath, [
        '--test',
        'scripts/quality/diagnostic-catalog.test.mjs',
      ])
      const check = await run(process.execPath, ['scripts/quality/diagnostic-catalog.mjs'])
      return { problems: [...lines(test).problems, ...lines(check).problems] }
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
    id: 'instant-navigation',
    covers: 'landing scaffold navigation on Fast and Slow 3G',
    slow: true,
    release: true,
    fix: 'Run `pnpm --filter @weft-js/create test:e2e` and inspect the failures.',
    run: async () => lines(await run('pnpm', ['--filter', '@weft-js/create', 'test:e2e'])),
  },
  {
    id: 'guardrails',
    covers: 'the tests of the check scripts and eval gates themselves',
    slow: true,
    fix: 'Run them: `node --test scripts/quality/*.test.mjs evals/gates/*.test.mjs`.',
    run: async () => {
      const tests = ['scripts/quality', 'evals/gates'].flatMap((d) =>
        readdirSync(join(root, d))
          .filter((f) => f.endsWith('.test.mjs'))
          .map((f) => `${d}/${f}`),
      )
      return lines(await run(process.execPath, ['--test', ...tests]))
    },
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
        // The longest suites start first; each gets a few workers rather than the whole machine.
        PACKAGES.filter(
          (d) => JSON.parse(readFileSync(join(root, d, 'package.json'), 'utf8')).scripts?.test,
        )
          .filter((d) => !changedSince || testable.includes(d))
          .sort((a, b) => LONG.indexOf(b) - LONG.indexOf(a)),
        (d) => run('pnpm', ['test', '--maxWorkers=4', ...(release ? [] : mergeArgs(d))], d),
      ),
  },
]

if (argv.includes('--list')) {
  for (const s of STEPS)
    console.log(
      `${s.id.padEnd(11)} ${s.covers}${s.release ? ' (only with --release)' : s.slow ? ' (not with --fast)' : ''}`,
    )
  process.exit(0)
}
if (only)
  for (const id of only)
    if (!STEPS.some((s) => s.id === id)) {
      console.error(`no step called ${id}: --list shows them`)
      process.exit(2)
    }

const chosen = STEPS.filter((s) =>
  only ? only.includes(s.id) : !(fast && s.slow) && (release || !s.release),
)
process.exit(await runSteps(chosen, { requireTools, failOn: LEVEL === 'error' }))
