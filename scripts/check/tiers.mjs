// Which test suites a gate runs. The merge gate tests the packages a change touches (and those that depend on them)
// and leaves the heaviest integration files to the release gate, which runs everything.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Files only `--release` runs: full app scaffolds and builds, preset builds, mutation testing, benchmarks, bundle
 * shakes and cross-browser layout comparisons. Each costs a merge gate tens of seconds; the release gate's packed
 * install and runtime matrix build the same apps again.
 */
export const RELEASE_TESTS = {
  'packages/cli': ['test/gate.test.ts', 'test/audit.browser.test.ts', 'test/audit-indexing.browser.test.ts'],
  'packages/core': ['test/oracle.test.tsx', 'test/compiler-parity.test.ts', 'test/hmr.test.ts'],
  'packages/create': ['test/scaffold.test.ts', 'test/templates.test.ts'],
  'packages/start': ['test/build.test.ts'],
  'packages/warp': [
    'test/critical.browser.test.tsx',
    'test/field-text-css.browser.test.ts',
    'test/choice-css.browser.test.ts',
    'test/overlays.browser.test.ts',
    'test/sweep.browser.test.ts',
    'test/shake.test.ts',
    'test/plugin.test.ts',
  ],
  'packages/warp-icons': ['test/generator.test.ts', 'test/distinct.test.ts', 'test/shake.test.ts'],
}

/** Paths whose change can't break a package's tests. */
const INERT = /^(?:docs\/|site\/|examples\/|benchmarks\/|evals\/|[^/]+\.md$|\.github\/)/

/**
 * The packages to test for a change against `base`: those with a changed file, and every package that depends on
 * one. A change outside packages/ (scripts, the lockfile, the compiler crates) tests them all.
 */
export function affected(root, packages, base) {
  const changed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => f && !INERT.test(f))
  if (changed.some((f) => !f.startsWith('packages/'))) return packages
  const manifest = (dir) => JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'))
  const dirOf = new Map(packages.map((dir) => [manifest(dir).name, dir]))
  const users = new Map(packages.map((dir) => [dir, []]))
  for (const dir of packages) {
    const m = manifest(dir)
    for (const dep of Object.keys({ ...m.dependencies, ...m.devDependencies, ...m.peerDependencies }))
      if (dirOf.has(dep)) users.get(dirOf.get(dep)).push(dir)
  }
  const out = new Set()
  const add = (dir) => {
    if (out.has(dir)) return
    out.add(dir)
    for (const user of users.get(dir) ?? []) add(user)
  }
  for (const f of changed) {
    const dir = f.split('/').slice(0, 2).join('/')
    if (users.has(dir)) add(dir)
  }
  return packages.filter((dir) => out.has(dir))
}

/** The extra Vitest arguments for a package in a merge gate: its release-only files left out. */
export const mergeArgs = (dir) => (RELEASE_TESTS[dir] ?? []).flatMap((f) => ['--exclude', f])
