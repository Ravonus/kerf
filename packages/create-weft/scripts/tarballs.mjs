// Every package as a tarball, and an app's package.json pointed at them: what the packed gates and `local.mjs` share.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const pkgs = fileURLToPath(new URL('../../', import.meta.url))

/** Write the install policy and tarball overrides for a fresh pnpm workspace. */
export function writePackedPolicy(dir, tarballs = {}, packages = []) {
  const policy = readFileSync(
    new URL('../../../pnpm-workspace.yaml', import.meta.url),
    'utf8',
  ).replace(/^packages:\n(?:[ \t].*\n)*/m, '')
  const overrides = Object.entries(tarballs)
    .map(([name, spec]) => `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}\n`)
    .join('')
  writeFileSync(
    join(dir, 'pnpm-workspace.yaml'),
    `${packages.length ? `packages:\n${packages.map((name) => `  - ${JSON.stringify(name)}\n`).join('')}` : ''}${policy}\n${overrides ? `overrides:\n${overrides}` : ''}`,
  )
}

/** Pack one package to a known path, independent of lifecycle output. */
export function pack(dir, dest) {
  const { name, version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const file = join(resolve(dest), `${name.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`)
  execFileSync('pnpm', ['pack', '--out', file], {
    cwd: dir,
    stdio: ['ignore', 'pipe', 'inherit'],
    shell: process.platform === 'win32',
  })
  if (!existsSync(file)) throw new Error(`pnpm pack did not create ${file}`)
  return `file:${file}`
}

/** Pack each package into `dest`. Returns `{ name: 'file:…tgz' }`. */
export function packAll(dest) {
  mkdirSync(dest, { recursive: true })
  const tarballs = {}
  for (const dir of readdirSync(pkgs)) {
    const file = join(pkgs, dir, 'package.json')
    if (!existsSync(file)) continue
    const { name } = JSON.parse(readFileSync(file, 'utf8'))
    tarballs[name] = pack(join(pkgs, dir), dest)
  }
  return tarballs
}

/** `pkg` with its weft dependencies on the tarballs. The overrides reach the ones packages declare for each other. */
export function pin(pkg, tarballs) {
  for (const deps of [pkg.dependencies, pkg.devDependencies])
    for (const name in deps) if (tarballs[name]) deps[name] = tarballs[name]
  return {
    ...pkg,
    overrides: { ...pkg.overrides, ...tarballs },
    pnpm: { ...pkg.pnpm, overrides: { ...pkg.pnpm?.overrides, ...tarballs } },
  }
}
