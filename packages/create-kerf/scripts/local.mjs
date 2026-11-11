#!/usr/bin/env node
// Use this checkout from any app on this machine, without publishing: the packages go in as tarballs from one directory
// (`~/.kerf/local`, or KERF_LOCAL_DIR), so an app sees what a consumer would (docs/getting-started.md).
//
//   node packages/create-kerf/scripts/local.mjs pack                       build what's stale and pack
//   node packages/create-kerf/scripts/local.mjs new <dir> [create-kerf flags]    that, then an app wired to the tarballs
//   node packages/create-kerf/scripts/local.mjs refresh [dir] [--packed]   that, then put the new tarballs in an app
//                                                                          (--packed: the store's as they are, no pack)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packWithAddon } from './pack-all.mjs'
import { pin, pkgs } from './tarballs.mjs'

const store = resolve(process.env.KERF_LOCAL_DIR ?? join(homedir(), '.kerf/local'))
const tgz = join(store, 'tgz')
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32' && cmd === 'npm',
  }) // npm is npm.cmd there
const OTHER_LOCKS = ['pnpm-lock.yaml', 'bun.lock', 'bun.lockb', 'yarn.lock']

/** The compiler's addon and WASM builds, when a stamp no longer matches the crate. */
function buildNative() {
  const { sourceStamp, stampFile } = createRequire(import.meta.url)(
    join(pkgs, 'core/scripts/native-stamp.cjs'),
  )
  const stamped = (file) =>
    existsSync(stampFile(file)) && readFileSync(stampFile(file), 'utf8').trim() === sourceStamp()
  const built = [
    `kerf-compiler.${process.platform}-${process.arch}.node`,
    'kerf-compiler.wasm',
  ].map((f) => join(pkgs, 'core/native', f))
  if (built.every(stamped)) return
  console.log('[local] building the compiler')
  run('npm', ['run', '--silent', 'build:native'], join(pkgs, 'core'))
}

/** dist/ is gitignored and it's all @kerf/text/engine exports, so it's built every time rather than trusted. */
function buildTextEngine() {
  const dir = join(pkgs, 'text')
  if (!existsSync(join(dir, 'node_modules'))) run('npm', ['ci', '--silent'], dir)
  run('npm', ['run', '--silent', 'build'], dir)
}

/** Build and pack, then swap the store in whole, so a failed pack leaves the last good one. Returns the name map. */
function pack() {
  buildNative()
  buildTextEngine()
  const next = `${tgz}.next`
  rmSync(next, { recursive: true, force: true })
  const packed = packWithAddon(next)
  rmSync(tgz, { recursive: true, force: true })
  renameSync(next, tgz)
  const tarballs = Object.fromEntries(
    Object.entries(packed).map(([name, spec]) => [name, spec.replace(next, tgz)]),
  )
  writeFileSync(join(store, 'tarballs.json'), JSON.stringify(tarballs, null, 2))
  console.log(`[local] ${Object.keys(tarballs).length} packages in ${tgz}`)
  return tarballs
}

/** npm keeps a tarball's hash and treats a same-version package as satisfied, so what's being replaced has to go first. */
function forget(app, tarballs) {
  const installed = (name, path) =>
    path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`)
  const file = join(app, 'package-lock.json')
  const lock = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { packages: {} }
  for (const path of Object.keys(lock.packages)) {
    if (!Object.keys(tarballs).some((name) => installed(name, path))) continue
    delete lock.packages[path]
    rmSync(join(app, path), { recursive: true, force: true })
  }
  if (existsSync(file)) writeFileSync(file, JSON.stringify(lock, null, 2))
  for (const stale of ['.package-lock.json', '.vite'])
    rmSync(join(app, 'node_modules', stale), { recursive: true, force: true })
}

function refresh(dir, packed) {
  const app = resolve(dir)
  const file = join(app, 'package.json')
  if (!existsSync(file)) throw new Error(`${app} has no package.json`)
  const other = OTHER_LOCKS.find((lock) => existsSync(join(app, lock)))
  if (other) throw new Error(`${app} has ${other}; this works with npm only`)
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  if (!pkg.dependencies?.['@kerf/core'] && !pkg.devDependencies?.['@kerf/core'])
    throw new Error(`${app} doesn't depend on @kerf/core; start one with \`local.mjs new\``)
  const tarballs = packed ? JSON.parse(readFileSync(join(store, 'tarballs.json'), 'utf8')) : pack()
  forget(app, tarballs)
  writeFileSync(file, JSON.stringify(pin(pkg, tarballs), null, 2))
  run('npm', ['install', '--silent'], app)
  console.log(`[local] ${app} is on this checkout`)
}

const [command, ...rest] = process.argv.slice(2)
try {
  if (Number(process.versions.node.split('.')[0]) < 26)
    throw new Error(`kerf needs Node 26; this is ${process.version}`)
  mkdirSync(store, { recursive: true })
  if (command === 'pack') pack()
  else if (command === 'refresh')
    refresh(rest.find((a) => !a.startsWith('-')) ?? '.', rest.includes('--packed'))
  else if (command === 'new' && rest[0] && !rest[0].startsWith('-')) {
    pack()
    // Last, so they win: the tarballs are wired up through npm's overrides, and the app is no use uninstalled.
    run(process.execPath, [
      fileURLToPath(new URL('../bin/create-kerf.mjs', import.meta.url)),
      ...rest,
      '--tarballs',
      store,
      '--pm',
      'npm',
      '--install',
    ])
  } else {
    console.error(
      'usage: local.mjs pack | new <dir> [create-kerf flags] | refresh [dir] [--packed]',
    )
    process.exit(1)
  }
} catch (e) {
  if (!e.status) console.error(`local: ${e.message}`) // a child that failed has already said why
  process.exit(e.status || 1)
}
