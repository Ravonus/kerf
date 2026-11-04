#!/usr/bin/env node
// Collect every tracked or new source file and compare it to the Git-anchored baseline.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compareLengths, validateBaseline } from './length-baseline.mjs'
import { rustFindings } from './length-rust.mjs'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const baselinePath = 'scripts/quality/length-baseline.json'
const git = (args, cwd = root) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const readBaseline = (text) => {
  const value = JSON.parse(text)
  validateBaseline(value)
  return value
}

/** Historical limits remain binding even after main advances or a later commit restores an old limit. */
export function gitBaseline(cwd = root, baseRef = 'origin/main') {
  const base = git(['merge-base', 'HEAD', baseRef], cwd)
  const history = git(['log', '--first-parent', '--format=%H', 'HEAD', '--', baselinePath], cwd)
    .split('\n')
    .filter(Boolean)
    .reverse()
  if (!history.length)
    throw new Error(
      'No committed length baseline in Git. Commit the generated initial baseline before checking.',
    )
  let baseline
  for (const ref of history) {
    const snapshot = readBaseline(git(['show', `${ref}:${baselinePath}`], cwd))
    if (!baseline) {
      baseline = snapshot
      continue
    }
    for (const id of Object.keys(baseline)) {
      if (!Object.hasOwn(snapshot, id)) {
        delete baseline[id]
        continue
      }
      for (const key of ['lines', 'tokens'])
        baseline[id][key] = Math.min(baseline[id][key], snapshot[id][key])
    }
  }
  let ref = base
  try {
    git(['cat-file', '-e', `${base}:${baselinePath}`], cwd)
  } catch {
    ref = history[0]
  }
  return { ref, baseline }
}

/** Find source files without walking dependency or build directories. */
export function sourceFiles(cwd = root) {
  return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .split('\0')
    .filter((path) => /(?:\.[cm]?[jt]sx?|\.rs)$/.test(path) && existsSync(join(cwd, path)))
    .sort()
}

/** Collect findings. A parser failure is a failure of the check, never an ignored file. */
export function collect(cwd = root) {
  const files = sourceFiles(cwd),
    findings = []
  for (const path of files.filter((f) => f.endsWith('.rs')))
    findings.push(...rustFindings(path, readFileSync(join(cwd, path), 'utf8')))
  const js = files.filter((f) => !f.endsWith('.rs'))
  for (const path of js) {
    const text = readFileSync(join(cwd, path), 'utf8')
    for (const directive of text.matchAll(
      /(?:\/\*|\/\/)\s*oxlint-disable(?:-next-line|-line)?([^*\r\n]*)/g,
    )) {
      const rules = directive[1].split(/\s--(?:\s|$)/)[0].trim()
      if (!rules || /\blength\/collect\b/.test(rules))
        throw new Error(`${path}: an Oxlint disable can hide length findings`)
    }
  }
  const oxlint = join(
    cwd,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'oxlint.cmd' : 'oxlint',
  )
  for (let i = 0; i < js.length; i += 200) {
    const result = spawnSync(
      oxlint,
      [
        '-c',
        'scripts/quality/length-config.json',
        '--format',
        'json',
        '--no-ignore',
        '--disable-nested-config',
        '--threads=1',
        ...js.slice(i, i + 200),
      ],
      { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
    if (result.error) throw result.error
    let report
    try {
      report = JSON.parse(result.stdout)
    } catch {
      throw new Error(`length collector failed: ${result.stderr || result.stdout}`)
    }
    if (![0, 1].includes(result.status))
      throw new Error(`length collector failed: ${result.stderr || result.stdout}`)
    if (report.number_of_files !== js.slice(i, i + 200).length)
      throw new Error(`Oxlint did not parse every file in batch ${i / 200 + 1}`)
    for (const diagnostic of report.diagnostics) {
      if (diagnostic.code !== 'length(collect)')
        throw new Error(
          `${diagnostic.filename}: ${diagnostic.code ?? 'parse'} ${diagnostic.message}`,
        )
      const item = JSON.parse(diagnostic.message)
      const path = diagnostic.filename.replaceAll('\\', '/')
      findings.push({
        ...item,
        id: item.kind === 'file' ? `file:${path}` : `function:${path}:${item.id}`,
        path,
      })
    }
  }
  return findings.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export function toBaseline(findings) {
  const result = {}
  for (const finding of findings) {
    if (Object.hasOwn(result, finding.id))
      throw new Error(`duplicate length identity: ${finding.id}`)
    result[finding.id] = { lines: finding.count, tokens: finding.tokens }
  }
  return result
}

export function checkLengths(cwd = root, baseRef = 'origin/main') {
  const findings = collect(cwd),
    current = toBaseline(findings)
  const baseline = readBaseline(readFileSync(join(cwd, baselinePath), 'utf8'))
  const base = gitBaseline(cwd, baseRef)
  return {
    findings,
    baseline,
    base: base.ref,
    problems: compareLengths(current, baseline, base.baseline),
  }
}

/** Whether an Oxlint or Clippy length finding belongs to a collected offender. */
export function matchedLength(findings, path, line, kind) {
  path = path.replaceAll('\\', '/')
  if (path.startsWith(root + '/')) path = relative(root, path)
  return findings.some(
    (f) =>
      f.kind === kind &&
      (kind === 'file'
        ? f.id === `file:${path}`
        : f.id.startsWith(`function:${path}:`) && line >= f.start && line <= f.end),
  )
}

/** A Clippy span must cover the declaration, not merely fall inside a longer function. */
export function matchedRustLength(findings, path, start, end) {
  path = path.replaceAll('\\', '/')
  if (path.startsWith(root + '/')) path = relative(root, path)
  return findings.some(
    (f) =>
      f.kind === 'function' &&
      f.id.startsWith(`function:${path}:`) &&
      f.start >= start &&
      f.start <= end,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--write')) {
      const baseline = toBaseline(collect())
      writeFileSync(join(root, baselinePath), JSON.stringify(baseline, null, 2) + '\n')
      console.log(`Wrote ${Object.keys(baseline).length} length offenders to ${baselinePath}`)
    } else {
      const result = checkLengths()
      console.log(
        `Length baseline: ${result.findings.length} offenders; Git base ${result.base.slice(0, 12)}`,
      )
      for (const problem of result.problems) console.error(problem)
      if (result.problems.length) process.exitCode = 1
    }
  } catch (error) {
    console.error(error.stack ?? error)
    process.exitCode = 1
  }
}
