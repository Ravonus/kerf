#!/usr/bin/env node
// The darwin-x64 install, proved on an Apple Silicon Mac: an Intel Node under Rosetta installs the packed tarballs and uses the
// Intel compiler package, with no Rust in reach. One command:
//
//   node scripts/intel/proof.mjs <dir of .tgz, with the darwin-x64 compiler package>
//
// Intel Node comes from NODE_X64 (a directory holding bin/node), or is downloaded to .release/node-x64 and checked against
// nodejs.org's SHASUMS256.txt. The tarballs come from `node scripts/release.mjs` after `build-platform` for darwin-x64.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const tarballs = resolve(process.argv[2] ?? join(root, '.release'))
if (process.platform !== 'darwin' || process.arch !== 'arm64')
  throw new Error(
    'this proof is for an Apple Silicon Mac: elsewhere, run scripts/release-e2e.mjs itself',
  )
if (!readdirSync(tarballs).some((f) => /compiler-darwin-x64/.test(f)))
  throw new Error(
    `no darwin-x64 compiler package in ${tarballs}: build it with packages/core/scripts/build-platform.mjs`,
  )

async function intelNode() {
  if (process.env.NODE_X64) return resolve(process.env.NODE_X64)
  const version = process.version,
    name = `node-${version}-darwin-x64`,
    dir = join(root, '.release', 'node-x64', name)
  if (existsSync(join(dir, 'bin', 'node'))) return dir
  const base = `https://nodejs.org/dist/${version}`
  console.log(`[intel] downloading ${name}`)
  const [sums, tgz] = await Promise.all([
    fetch(`${base}/SHASUMS256.txt`).then((r) => r.text()),
    fetch(`${base}/${name}.tar.gz`).then(async (r) => Buffer.from(await r.arrayBuffer())),
  ])
  const wanted = sums
    .split('\n')
    .find((l) => l.endsWith(`  ${name}.tar.gz`))
    ?.split(/\s+/)[0]
  if (!wanted || createHash('sha256').update(tgz).digest('hex') !== wanted)
    throw new Error(`${name}.tar.gz doesn't match SHASUMS256.txt`)
  mkdirSync(dirname(dir), { recursive: true })
  const file = join(dirname(dir), `${name}.tar.gz`)
  writeFileSync(file, tgz)
  if (spawnSync('tar', ['xzf', file, '-C', dirname(dir)], { stdio: 'inherit' }).status !== 0)
    throw new Error(`couldn't unpack ${file}`)
  rmSync(file)
  return dir
}

const node = await intelNode()
const arch = spawnSync('arch', ['-x86_64', join(node, 'bin', 'node'), '-p', 'process.arch'], {
  encoding: 'utf8',
}).stdout.trim()
if (arch !== 'x64')
  throw new Error(
    `Rosetta didn't give an Intel Node (got ${arch || 'nothing'}): is Rosetta installed?`,
  )
const empty = mkdtempSync(join(tmpdir(), 'weft-intel-'))
const r = spawnSync(
  'arch',
  [
    '-x86_64',
    'env',
    `PATH=${join(node, 'bin')}:${process.env.PATH}`,
    `CHROME=${join(root, 'scripts/intel/chrome-arm64.sh')}`,
    'node',
    join(root, 'scripts/release-e2e.mjs'),
    tarballs,
    join(empty, 'run'),
    '--no-rust',
    '--expect-backend',
    'native',
  ],
  { stdio: 'inherit' },
)
if (r.status === 0) rmSync(empty, { recursive: true, force: true })
else console.error(`[intel] failed: the app is in ${empty}`)
process.exit(r.status ?? 1)
