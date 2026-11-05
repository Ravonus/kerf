// Compare static diagnostic sites and compile-test assertions with the catalog.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import { compilerDiagnostics } from '../../packages/cli/src/catalog/compiler.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const baselinePath = resolve(root, 'scripts/quality/diagnostic-catalog-baseline.json')

function tracked(...paths) {
  return execFileSync('git', ['ls-files', '-z', '--', ...paths], { cwd: root })
    .toString().split('\0').filter(Boolean)
}

// The second argument is the code. Unknown expressions fail instead of disappearing.
export function emitted(files) {
  const codes = new Set(), problems = []
  for (const [path, text] of Object.entries(files)) {
    const calls = /\b(?:Diagnostic::new|Self::new)\s*\(/g
    for (const call of text.matchAll(calls)) {
      if (call[0].startsWith('Self::') && path !== 'crates/weft-compiler/src/diag.rs') continue
      const args = text.slice(call.index + call[0].length)
      const match = args.match(/^\s*([^,]+),\s*([^,]+),/)
      const code = match?.[2].trim().match(/^"([A-Z]\d{3})"$/)?.[1]
      if (code) codes.add(code)
      else problems.push(`unrecognized constructor: ${path}: ${match?.[2]?.trim() ?? 'unknown'}`)
    }
  }
  return { codes, problems }
}

// A code in an assertion is evidence of a test, not proof of its semantics.
export function asserted(files) {
  const codes = new Set()
  for (const text of Object.values(files)) {
    for (const assertion of text.matchAll(/\bassert(?:_eq|_ne)?!\s*\([\s\S]*?;/g)) {
      for (const code of assertion[0].matchAll(/"([A-Z]\d{3})"/g)) codes.add(code[1])
    }
  }
  return codes
}

export function gaps(catalog, source, tests) {
  const entries = new Set(catalog.filter((entry) => entry.by === 'compiler').map((entry) => entry.code))
  const { codes, problems } = emitted(source)
  const covered = asserted(tests)
  const missing = []
  for (const code of entries) {
    if (!codes.has(code)) missing.push(`missing emit: ${code}`)
    if (!covered.has(code)) missing.push(`missing test: ${code}`)
  }
  for (const code of codes) if (!entries.has(code)) missing.push(`missing entry: ${code}`)
  return { missing: missing.sort(), problems }
}

export function compare(result, baseline) {
  const known = new Set(baseline), current = new Set(result.missing)
  return [...result.problems, ...result.missing.filter((gap) => !known.has(gap)),
    ...baseline.filter((gap) => !current.has(gap)).map((gap) => `stale baseline: ${gap}`)]
}

function readFiles(paths) {
  return Object.fromEntries(paths.map((path) => [path, readFileSync(resolve(root, path), 'utf8')]))
}

export function check() {
  const source = tracked('crates/weft-compiler/src/*.rs', 'crates/weft-compiler/src/**/*.rs')
  const tests = tracked('crates/weft-compiler/tests/compile.rs', 'crates/weft-compiler/tests/compile/*.rs')
  const result = gaps(compilerDiagnostics, readFiles(source), readFiles(tests))
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
  return { problems: compare(result, baseline), source: source.length, tests: tests.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = check()
  console.log(`Checked ${result.source} tracked source files and ${result.tests} tracked compile test files (git ls-files).`)
  for (const problem of result.problems) console.error(problem)
  if (result.problems.length) process.exitCode = 1
}
