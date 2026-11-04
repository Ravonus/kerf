#!/usr/bin/env node
// Grade one solution file against a task's hidden tests.
// usage: node grade.mjs <framework> <task> <solution.tsx> [--suite tasks-v2] [--json]
import { execFile } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const root = dirname(fileURLToPath(import.meta.url))
const run = promisify(execFile)

export async function grade(framework, task, solutionPath, suite = 'tasks') {
  const fwDir = join(root, 'frameworks', framework)
  const id = `${task}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  const dir = join(fwDir, '.grade', id)
  mkdirSync(dir, { recursive: true })
  const report = join(dir, 'report.json')
  try {
    if (!existsSync(solutionPath))
      return { task, framework, passed: 0, total: 0, error: 'no solution file', tests: [] }
    copyFileSync(solutionPath, join(dir, 'solution.tsx'))
    copyFileSync(join(root, suite, task, 'eval.test.tsx'), join(dir, 'eval.test.tsx'))
    try {
      await run(
        'npx',
        ['vitest', 'run', `.grade/${id}`, '--reporter=json', `--outputFile=${report}`],
        {
          cwd: fwDir,
          timeout: 120_000,
          maxBuffer: 1 << 26,
        },
      )
    } catch {} // non-zero exit on failures; the report has the details
    if (!existsSync(report))
      return { task, framework, passed: 0, total: 0, error: 'vitest produced no report', tests: [] }
    const data = JSON.parse(readFileSync(report, 'utf8'))
    const tests = data.testResults.flatMap((f) =>
      f.assertionResults.length
        ? f.assertionResults.map((a) => ({
            name: a.title,
            ok: a.status === 'passed',
            message: a.failureMessages?.[0]?.split('\n')[0],
          }))
        : [{ name: '(file)', ok: false, message: f.message?.split('\n')[0] }],
    )
    const passed = tests.filter((t) => t.ok).length
    return {
      task,
      framework,
      passed,
      total: tests.length,
      pass: passed === tests.length && tests.length > 0,
      tests,
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [framework, task, solution] = process.argv.slice(2)
  const i = process.argv.indexOf('--suite')
  const r = await grade(framework, task, resolve(solution), i > 0 ? process.argv[i + 1] : 'tasks')
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2))
  else {
    console.log(
      `${r.pass ? 'PASS' : 'FAIL'} ${framework}/${task} ${r.passed}/${r.total}${r.error ? ' ' + r.error : ''}`,
    )
    for (const t of r.tests) if (!t.ok) console.log(`  ✗ ${t.name}: ${t.message ?? ''}`)
  }
}
