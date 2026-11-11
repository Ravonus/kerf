// Snapshot package export maps and require a reference entry for each path.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { repoRoot } from '../lib/helpers.mjs'

const packages = ['core', 'start']

/** Compare one package's complete export map and its reference entries. */
export function problemsFor(name, exports, snapshot, docs) {
  const problems = []
  if (JSON.stringify(exports) !== JSON.stringify(snapshot.exports))
    problems.push(`${name}: export map differs from api.json`)
  for (const path of Object.keys(exports)) {
    const specifier = `@kerf/${name}${path === '.' ? '' : path.slice(1)}`
    if (
      !docs
        .split('\n')
        .some(
          (line) =>
            line.startsWith(`- \`${specifier}\`: `) &&
            line.slice(line.indexOf(': ') + 2).trim().length > 0,
        )
    )
      problems.push(`${name}: missing reference for ${specifier}`)
  }
  return problems
}

/** Check tracked package manifests, targets, snapshots and reference entries. */
export function check(repo = repoRoot) {
  const tracked = new Set(
    execFileSync('git', ['ls-files', '-z'], { cwd: repo, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean),
  )
  const docsPath = 'packages/cli/docs/entrypoints.md'
  const docs = readFileSync(resolve(repo, docsPath), 'utf8')
  const problems = []
  if (!tracked.has(docsPath)) problems.push(`${docsPath}: not tracked`)
  let count = 0
  for (const name of packages) {
    const base = `packages/${name}`
    const manifest = `${base}/package.json`
    if (!tracked.has(manifest)) problems.push(`${manifest}: not tracked`)
    if (!tracked.has(`${base}/api.json`)) problems.push(`${base}/api.json: not tracked`)
    const exports = JSON.parse(readFileSync(resolve(repo, manifest), 'utf8')).exports
    const snapshot = JSON.parse(readFileSync(resolve(repo, base, 'api.json'), 'utf8'))
    problems.push(...problemsFor(name, exports, snapshot, docs))
    for (const target of Object.values(exports)) {
      count++
      for (const file of typeof target === 'string' ? [target] : Object.values(target)) {
        if (!tracked.has(`${base}/${file.replace(/^\.\//, '')}`))
          problems.push(`${base}: export target ${file} is not tracked`)
      }
    }
  }
  return { problems, count, manifests: packages.length }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = check()
  console.log(`Checked ${result.count} export paths in ${result.manifests} tracked manifests.`)
  for (const problem of result.problems) console.error(problem)
  if (result.problems.length) process.exitCode = 1
}
