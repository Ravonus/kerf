#!/usr/bin/env node
// Generate transient category overrides and check them for drift.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (
    !(args.length === 1 && args[0] === '--generate') &&
    !(args.length === 2 && args[0] === '--check')
  ) {
    console.error('Usage: category-overrides.mjs --generate | --check <config.json>')
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
    else {
      const config = JSON.parse(readFileSync(resolve(args[1]), 'utf8'))
      if (configDrift(config, files)) {
        console.error(`Category override drift: ${args[1]} (${files.length} tracked JS/TS paths)`)
        process.exitCode = 1
      } else console.log(`Category overrides match ${files.length} tracked JS/TS paths`)
    }
  }
}
