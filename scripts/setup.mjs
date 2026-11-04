#!/usr/bin/env node
// `pnpm run setup`: from a fresh clone to a tree that passes. The repo is one pnpm workspace (pnpm-workspace.yaml): one
// install at the root covers every package, the site and the arena.
//
// Needs Node (.nvmrc) and Rust (rustup reads rust-toolchain.toml in each crate, including the wasm target).
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const windows = process.platform === 'win32'
const run = (cwd, cmd, ...args) => {
  console.log(`[setup] ${cwd}: ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, {
    cwd: join(root, cwd),
    stdio: ['ignore', 'ignore', 'inherit'],
    shell: windows,
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run('.', 'pnpm', 'install', '--frozen-lockfile')
run('packages/weft', 'pnpm', 'run', 'build:native')
run('packages/text', 'node', 'scripts/specialize.mjs')
process.env.DATABASE_URL ??= 'file:./setup.db' // prisma wants one to generate, and never opens it
run('packages/db', 'pnpm', 'exec', 'prisma', 'generate') // tests and their types read the client
// The site's types read what these generate.
run('site', 'node', 'arena/build.mjs')
run('site', 'pnpm', 'exec', 'weft', 'plugins', 'sync')
run('site', 'pnpm', 'exec', 'weft', 'run', 'content')
console.log('[setup] done. `pnpm run check` runs everything.')
