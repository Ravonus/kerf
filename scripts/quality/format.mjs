#!/usr/bin/env node
// Format tracked source without touching generated output or archived results.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { repoRoot as root } from '../lib/helpers.mjs'

const args = process.argv.slice(2)
if (args.some((arg) => arg !== '--write')) {
  console.error('Usage: node scripts/quality/format.mjs [--write]')
  process.exit(2)
}
const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
if (tracked.status !== 0) {
  console.error(tracked.stderr || 'Could not list tracked files')
  process.exit(1)
}
const excluded =
  /^(?:evals\/results|site\/content|packages\/cli\/docs|packages\/warp\/test\/a11y\/gallery\/assets)\/|(?:^|\/)(?:vendor|gen|generated|dist|build|archive|archives|__snapshots__|snapshots)\/|^packages\/core\/node\/(?:css|matrix|vocab)\.mjs$/
const files = tracked.stdout
  .split('\0')
  .filter(
    (file) =>
      /\.(?:js|jsx|ts|tsx|mjs|cjs|mts|cts)$/.test(file) &&
      !/\.(?:gen|generated|min)\.[^.]+$/.test(file) &&
      !excluded.test(file),
  )
console.log(
  `Checking ${files.length} tracked source files${args.includes('--write') ? ' (write)' : ''}.`,
)
const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'oxfmt.cmd' : 'oxfmt')
const result = spawnSync(bin, [args.includes('--write') ? '--write' : '--check', ...files], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
