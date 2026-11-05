#!/usr/bin/env node
// Keep repository-only helper copies visible as new consumers are added.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { repoRoot } from '../lib/helpers.mjs'

const scope =
  /^(?:(?:scripts|evals|benchmarks|examples)\/|packages\/[^/]+\/(?:scripts|test)\/).+\.(?:[cm]?[jt]sx?)$/
const distinct = new Set([
  // This consumer is copied beside registry.mjs to machines without the repository helpers.
  'scripts/release-e2e.mjs:freePort',
  'examples/lib/serve.mjs:freePort',
  'evals/agent-eval/lib/grade.mjs:freePort',
  'evals/agent-eval/lib/report.mjs:median',
  'benchmarks/speed/shared/driver.js:median',
  'packages/create/scripts/alt-runtimes.mjs:until',
  'packages/create/scripts/hot-checks.mjs:until',
  'packages/start/test/e2e/live-db-e2e.mjs:until',
  'packages/start/test/e2e/live-startup-e2e.mjs:until',
  'evals/agent-eval/tasks/helpers.mjs:until',
  'scripts/quality/boundaries.mjs:walk',
  'packages/core/scripts/parity.mjs:walk',
  'packages/core/scripts/native-stamp.cjs:walk',
  'packages/warp-icons/scripts/style.mjs:walk',
  'packages/warp/test/native.test.ts:walk',
  'packages/warp/test/critical.browser.test.tsx:walk',
  'benchmarks/compare/design/audit.mjs:walk',
  'evals/gates/ds-exit.mjs:walk',
  // These moved from run.mjs: sorted tree hashing and all-entry mutant scans differ from walk.
  'evals/agent-eval/run/prepare.mjs:walk',
  'evals/agent-eval/run/grade-tasks.mjs:walk',
  'evals/run-app.mjs:walk',
  'evals/gate.mjs:walk',
  'packages/warp/test/markup.test.tsx:walk',
  'packages/core/test/back-end.test.tsx:walk',
  'packages/core/test/oracle.test.tsx:walk',
  'packages/warp/test/polish.browser.test.ts:walk',
])

/** Check every tracked repository script and test, including setup files. */
export function check(cwd = repoRoot) {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8' })
    .split('\0')
    .filter((p) => scope.test(p))
  const problems = []
  for (const path of files) {
    if (path === 'scripts/lib/helpers.mjs' || path === 'scripts/lib/sleep.mjs') continue
    const text = readFileSync(resolve(cwd, path), 'utf8')
    const code = text.replace(
      /\/\*[\s\S]*?\*\/|\/\/[^\n]*|(['"`])(?:\\[\s\S]|(?!\1)[^\\])*?\1/g,
      (part) => part.replace(/[^\n]/g, ' '),
    )
    const declarations =
      /\b(?:async\s+)?function\s+(freePort|sleep|until|walk|median)\s*\(|\b(?:const|let)\s+(freePort|sleep|until|walk|median)\s*=\s*(?:async\s*)?(?:(?:\([^)]*\)|[a-zA-Z_$][\w$]*)\s*=>|function\b)/g
    const waits =
      /\b(?:const|let)\s+(\w+)\s*=\s*\(?\s*(\w+)(?:\s*=\s*0)?\s*\)?\s*=>\s*new\s+Promise(?:<void>)?\s*\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*(?:\{\s*)?setTimeout\s*\(\s*\3\s*,\s*\2\s*\)/g
    for (const match of code.matchAll(waits)) {
      if (match[1] === 'sleep') continue
      const line = code.slice(0, match.index).split('\n').length
      problems.push(`${path}:${line}: duplicate sleep (${match[1]})`)
    }
    const ticks =
      /\b(?:const|let)\s+(\w+)\s*=\s*\(\)\s*=>\s*new\s+Promise(?:<void>)?\s*\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*(?:\{\s*)?setTimeout\s*\(\s*\2\s*(?:,\s*0)?\s*\)/g
    for (const match of code.matchAll(ticks)) {
      const line = code.slice(0, match.index).split('\n').length
      problems.push(`${path}:${line}: duplicate sleep (${match[1]})`)
    }
    for (const match of code.matchAll(declarations)) {
      const name = match[1] ?? match[2]
      if (!distinct.has(`${path}:${name}`)) {
        const line = text.slice(0, match.index).split('\n').length
        problems.push(`${path}:${line}: duplicate ${name}`)
      }
    }
  }
  return { files, problems }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(repoRoot, 'scripts/quality/shared-helpers.mjs')
) {
  const result = check(process.argv[2] ? resolve(process.argv[2]) : repoRoot)
  console.log(`Checked ${result.files.length} tracked script and test files`)
  if (result.problems.length) console.error(result.problems.join('\n'))
  process.exitCode = result.problems.length ? 1 : 0
}
