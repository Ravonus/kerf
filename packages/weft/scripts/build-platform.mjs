// Build the prebuilt compiler packages: what .github/workflows/compiler-release.yml runs per platform, and what runs
// here without it. Nothing is published. Output is dist/platform/<name>/, ready for `npm pack` or `npm publish`.
//
//   node scripts/build-platform.mjs [--target <name>[,<name>…]|host|all] [--out <dir>]
//   node scripts/build-platform.mjs --verify [--out <dir>]     every package there against weft's optionalDependencies
//
// A target other than the host goes through `cargo zigbuild` (Linux, needs zig and cargo-zigbuild) or `cargo xwin`
// (Windows, needs cargo-xwin). macOS only needs `rustup target add` on a Mac.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hostPlatform, writePlatformPackage } from './platform-package.mjs'

const { platforms } = createRequire(import.meta.url)('../platforms.cjs')
const here = dirname(fileURLToPath(import.meta.url))
const crate = join(here, '..', '..', '..', 'crates', 'weft-compiler')
const argv = process.argv.slice(2)
const flag = name => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined)
const out = resolve(flag('out') ?? join(here, '..', 'dist', 'platform'))

/** The dir each table entry lands in. */
const dirOf = p => join(out, p.name)

function build(p, host) {
  const library = p.os === 'win32' ? 'weft_compiler.dll' : p.os === 'darwin' ? 'libweft_compiler.dylib' : 'libweft_compiler.so'
  const tool = p.target === host ? ['build'] : p.os === 'linux' ? ['zigbuild'] : p.os === 'win32' ? ['xwin', 'build'] : ['build']
  const env = { ...process.env }
  // A cdylib needs the dynamic C runtime Node itself links, on musl too. gnu targets a glibc as old as Node 26 supports.
  if (p.libc === 'musl') env.RUSTFLAGS = `${env.RUSTFLAGS ?? ''} -C target-feature=-crt-static`.trim()
  const target = p.libc === 'glibc' && p.target !== host ? `${p.target}.2.28` : p.target
  execFileSync('cargo', [...tool, '--release', '--lib', '--features', 'node', '--target', target], { cwd: crate, stdio: 'inherit', env })
  const binary = join(process.env.CARGO_TARGET_DIR ?? join(crate, 'target'), p.target, 'release', library)
  writePlatformPackage(p, binary, dirOf(p))
  console.log(`${p.name}: ${(statSync(binary).size / 1e6).toFixed(2)} MB`)
}

function verify() {
  const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'))
  const wanted = Object.keys(pkg.optionalDependencies ?? {}).sort()
  const table = platforms.map(p => `@weft-js/compiler-${p.name}`).sort()
  const bad = []
  if (wanted.join() !== table.join()) bad.push(`optionalDependencies and platforms.cjs disagree: ${wanted} / ${table}`)
  for (const [name, version] of Object.entries(pkg.optionalDependencies ?? {})) if (version !== pkg.version) bad.push(`${name} is pinned to ${version}, @weft-js/core is ${pkg.version}`)
  for (const p of platforms) {
    const file = join(dirOf(p), 'package.json')
    if (!existsSync(file)) bad.push(`${p.name}: not built`)
    else if (JSON.parse(readFileSync(file, 'utf8')).version !== pkg.version) bad.push(`${p.name}: a different version from weft`)
    else if (!existsSync(join(dirOf(p), 'weft-compiler.node'))) bad.push(`${p.name}: no addon`)
  }
  if (!existsSync(join(here, '..', 'native', 'weft-compiler.wasm'))) bad.push('no native/weft-compiler.wasm')
  for (const line of bad) console.error(line)
  if (bad.length) process.exit(1)
  console.log(`${platforms.length} platforms and the WASM build agree with weft ${pkg.version}`)
}

if (argv.includes('--verify')) verify()
else {
  const wanted = flag('target') ?? 'host'
  const host = /host: (\S+)/.exec(execFileSync('rustc', ['-vV'], { cwd: crate, encoding: 'utf8' }))[1]
  const names = wanted === 'all' ? platforms.map(p => p.name) : wanted === 'host' ? [hostPlatform().name] : wanted.split(',')
  for (const name of names) {
    const p = platforms.find(x => x.name === name)
    if (!p) throw new Error(`no platform ${name}; have ${platforms.map(x => x.name).join(', ')}`)
    build(p, host)
  }
}
