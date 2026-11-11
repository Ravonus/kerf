// Let .github/workflows/nightly.yml publish every package, by npm's trusted publishing. Run once from a terminal
// logged in to npm (`npm login --auth-type=web`); npm asks for your passkey. Safe to run again.
//
//   node scripts/trust-nightly.mjs [--dry-run]
//
// A package that isn't on npm yet can't be trusted: publish it by hand once (scripts/release.mjs), then run this.
import { repoRoot } from './lib/helpers.mjs'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const dry = process.argv.includes('--dry-run')
const { platforms } = createRequire(import.meta.url)(join(repoRoot, 'packages/core/platforms.cjs'))
const names = [
  ...readdirSync(join(repoRoot, 'packages'))
    .map((dir) => join(repoRoot, 'packages', dir, 'package.json'))
    .filter(existsSync)
    .map((file) => JSON.parse(readFileSync(file, 'utf8')))
    .filter((pkg) => !pkg.private)
    .map((pkg) => pkg.name),
  ...platforms.map((p) => `@kerf/compiler-${p.name}`),
]
const npmRun = (args, stdio = 'pipe') =>
  spawnSync(npm, args, { encoding: 'utf8', stdio, shell: process.platform === 'win32' })

const missing = []
for (const name of names) {
  if (!npmRun(['view', name, 'name']).stdout.trim()) {
    missing.push(name)
    continue
  }
  const r = npmRun(
    [
      'trust',
      'github',
      name,
      '--repo',
      'Ravonus/kerf',
      '--file',
      'nightly.yml',
      '--allow-publish',
      '--yes',
      ...(dry ? ['--dry-run'] : []),
    ],
    'inherit',
  )
  if (r.status !== 0) console.log(`[trust] ${name}: refused (already trusted, or see above)`)
}
if (missing.length) console.log(`[trust] not on npm yet, so not trusted: ${missing.join(', ')}`)
