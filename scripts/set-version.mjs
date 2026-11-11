// Every published package at one version, with the core's pins on its compilers (`workspace:*` deps stay: the
// release writes the version in). Run it before building compilers: a platform package takes the core's version.
//   node scripts/set-version.mjs 0.1.5            a release
//   node scripts/set-version.mjs --nightly <n>    0.1.5-nightly.<date>.<n>
import { repoRoot } from './lib/helpers.mjs'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const files = readdirSync(join(repoRoot, 'packages'))
  .map((dir) => join(repoRoot, 'packages', dir, 'package.json'))
  .filter(existsSync)
  .filter((file) => !JSON.parse(readFileSync(file, 'utf8')).private)
const core = join(repoRoot, 'packages/core/package.json')
const current = JSON.parse(readFileSync(core, 'utf8')).version

/** `0.1.4` → `0.1.5-nightly.20261111.7`. A nightly of a nightly counts from the same release. */
function nightly(n) {
  const [major, minor, patch] = current.split('-')[0].split('.').map(Number)
  const next = current.includes('-') ? patch : patch + 1
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  return `${major}.${minor}.${next}-nightly.${day}.${n}`
}

const version = argv[0] === '--nightly' ? nightly(Number(argv[1] ?? 0)) : argv[0]
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version ?? ''))
  throw new Error('usage: set-version.mjs <version> | --nightly <n>')

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const pkg = JSON.parse(text)
  pkg.version = version
  for (const name of Object.keys(pkg.optionalDependencies ?? {}))
    if (name.startsWith('@kerf-js/compiler-')) pkg.optionalDependencies[name] = version
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
}
console.log(version)
