#!/usr/bin/env node
// Format every tracked Rust file without fetching or building dependencies.
import { repoRoot } from '../lib/helpers.mjs'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const root = repoRoot
const args = process.argv.slice(2)
if (args.length > 1 || (args.length && args[0] !== '--write')) {
  console.error('Usage: node scripts/quality/rust-format.mjs [--write]')
  process.exit(2)
}
const tracked = spawnSync('git', ['ls-files', '-z', '--', '*.rs'], { cwd: root, encoding: 'utf8' })
if (tracked.status !== 0) {
  console.error(tracked.stderr || tracked.error?.message || 'Could not list tracked Rust files')
  process.exit(1)
}

function editionFor(file) {
  let dir = dirname(join(root, file))
  while (dir.startsWith(root)) {
    const manifest = join(dir, 'Cargo.toml')
    if (existsSync(manifest)) {
      const text = readFileSync(manifest, 'utf8')
      const section = text.match(/^\[package\]\s*$(.*?)(?=^\[|$(?![\s\S]))/ms)?.[1]
      if (section) {
        const edition = section.match(/^edition\s*=\s*["'](\d+)["']/m)?.[1]
        if (edition) return edition
        if (!/^edition\s*\.\s*workspace\s*=\s*true/m.test(section)) return '2015'
      }
      const workspace = text.match(/^\[workspace\.package\]\s*$(.*?)(?=^\[|$(?![\s\S]))/ms)?.[1]
      const edition = workspace?.match(/^edition\s*=\s*["'](\d+)["']/m)?.[1]
      if (edition) return edition
    }
    if (dir === root) break
    dir = dirname(dir)
  }
  throw new Error(`No manifest edition found for ${file}`)
}

const files = tracked.stdout.split('\0').filter(Boolean)
console.log(`Checking ${files.length} tracked Rust files${args.length ? ' (write)' : ''}.`)
let failed = false
for (const file of files) {
  try {
    const result = spawnSync(
      'rustfmt',
      [
        ...(args.length ? [] : ['--check']),
        '--edition',
        editionFor(file),
        '--config-path',
        join(root, 'crates', 'rustfmt.toml'),
        '--config',
        'skip_children=true',
        file,
      ],
      { cwd: root, stdio: 'inherit' },
    )
    if (result.error) console.error(`${file}: ${result.error.message}`)
    if (result.status !== 0) {
      console.error(`rustfmt failed: ${file}`)
      failed = true
    }
  } catch (error) {
    console.error(error.message)
    failed = true
  }
}
process.exit(failed ? 1 : 0)
