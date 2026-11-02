#!/usr/bin/env node
// `npm run setup`: from a fresh clone to a tree that passes. Each package has its own lockfile, so each gets its own `npm ci`.
//
// Needs Node (.nvmrc) and Rust (rustup reads rust-toolchain.toml in each crate, including the wasm target).
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const windows = process.platform === 'win32'
const run = (cwd, cmd, ...args) => {
  console.log(`[setup] ${cwd}: ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { cwd: join(root, cwd), stdio: ['ignore', 'ignore', 'inherit'], shell: windows })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

// Core first: the rest depend on it with `file:` links.
const packages = readdirSync(join(root, 'packages')).filter(d => existsSync(join(root, 'packages', d, 'package-lock.json'))).sort((a, b) => (b === 'weft') - (a === 'weft'))
for (const dir of packages) run(`packages/${dir}`, 'npm', 'ci', '--no-audit', '--no-fund')
run('site', 'npm', 'ci', '--no-audit', '--no-fund')
run('packages/weft', 'npm', 'run', 'build:native')
run('packages/text', 'node', 'scripts/specialize.mjs')
process.env.DATABASE_URL ??= 'file:./setup.db' // prisma wants one to generate, and never opens it
run('packages/db', 'npx', 'prisma', 'generate') // tests and their types read the client
// The site's types read what these generate.
run('site/arena', 'npm', 'ci', '--no-audit', '--no-fund')
run('site', 'node', 'arena/build.mjs')
run('site', 'npx', 'weft', 'plugins', 'sync')
run('site', 'npx', 'weft', 'run', 'content')
console.log('[setup] done. `npm run check` runs everything.')
