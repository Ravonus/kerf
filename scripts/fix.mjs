#!/usr/bin/env node
// `pnpm run fix`: everything a machine can fix safely. What's left, `pnpm run check` explains.
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const windows = process.platform === 'win32'
const run = (cmd, args, cwd = root) => spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: windows })

run(join(root, 'node_modules', '.bin', windows ? 'oxlint.cmd' : 'oxlint'), ['--type-aware', '--fix', '--quiet', 'packages', 'scripts', 'site'])
for (const crate of ['crates/weft-compiler', 'crates/weft-layout', 'crates/weft']) {
  run('cargo', ['clippy', '--fix', '--allow-dirty', '--allow-staged', '--all-targets', '--quiet'], join(root, crate))
  run('cargo', ['fmt'], join(root, crate))
}
console.log('Done. `pnpm run check` shows what is left.')
