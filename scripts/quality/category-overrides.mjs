#!/usr/bin/env node
// Generate transient category overrides and check them for drift.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { repoRoot } from '../lib/helpers.mjs'
import { overrides, overrideDrift } from './category-limits.mjs'

/** Generate a standalone warning-only Oxlint configuration. */
export function categoryConfig(files) {
  return { categories: { correctness: 'off', suspicious: 'off' }, overrides: overrides(files) }
}

/** Compare a config to the category table and the supplied paths. */
export function configDrift(config, files) {
  return (
    !config ||
    JSON.stringify(config.categories) !==
      JSON.stringify({ correctness: 'off', suspicious: 'off' }) ||
    overrideDrift(config.overrides, files) ||
    Object.keys(config).some((key) => !['categories', 'overrides'].includes(key))
  )
}

/** Run category warnings with a checked, temporary configuration. */
export function runCategoryLint({ files, cwd, binary, print = console.log }) {
  const configPath = resolve(cwd, `.weft-category-${randomBytes(12).toString('hex')}.json`)
  let created = false
  try {
    writeFileSync(configPath, JSON.stringify(categoryConfig(files)), { flag: 'wx' })
    created = true
    const actual = JSON.parse(readFileSync(configPath, 'utf8'))
    if (configDrift(actual, files)) throw new Error('Category override drift in lint config')
    for (let start = 0; start < files.length; start += 200) {
      const paths = files.slice(start, start + 200).map(({ path }) => path)
      const result = spawnSync(
        binary,
        [
          '-c',
          basename(configPath),
          '--format',
          'json',
          '--no-ignore',
          '--disable-nested-config',
          '--threads=1',
          ...paths,
        ],
        { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
      )
      if (result.error || result.status !== 0)
        throw new Error(
          `Category lint failed: ${result.error || result.stderr || result.stdout || `exit ${result.status}`}`,
        )
      const report = JSON.parse(result.stdout)
      if (report.number_of_files !== paths.length)
        throw new Error(`Category lint parsed ${report.number_of_files}/${paths.length} files`)
      for (const diagnostic of report.diagnostics) {
        if (diagnostic.severity !== 'warning')
          throw new Error(`Category lint error: ${diagnostic.message}`)
        print(
          `${diagnostic.filename}:${diagnostic.labels?.[0]?.span.line ?? 0}: ${diagnostic.code}: ${diagnostic.message}`,
        )
      }
    }
    print(`Category lint checked ${files.length} tracked JS/TS files`)
  } finally {
    if (created) rmSync(configPath, { force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (
    !(args.length === 1 && ['--generate', '--lint'].includes(args[0])) &&
    !(args.length === 2 && args[0] === '--check')
  ) {
    console.error('Usage: category-overrides.mjs --generate | --lint | --check <config.json>')
    process.exitCode = 2
  } else {
    const paths = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
      .split('\0')
      .filter((path) => /\.[cm]?[jt]sx?$/.test(path))
    const files = paths.map((path) => ({
      path,
      content: readFileSync(resolve(repoRoot, path), 'utf8'),
    }))
    if (args[0] === '--generate') console.log(JSON.stringify(categoryConfig(files), null, 2))
    else if (args[0] === '--lint')
      runCategoryLint({
        files,
        cwd: repoRoot,
        binary: resolve(
          repoRoot,
          'node_modules/.bin',
          process.platform === 'win32' ? 'oxlint.cmd' : 'oxlint',
        ),
      })
    else {
      const config = JSON.parse(readFileSync(resolve(args[1]), 'utf8'))
      if (configDrift(config, files)) {
        console.error(`Category override drift: ${args[1]} (${files.length} tracked JS/TS paths)`)
        process.exitCode = 1
      } else console.log(`Category overrides match ${files.length} tracked JS/TS paths`)
    }
  }
}
