// Every package as a tarball, and an app's package.json pointed at them: what the packed gates and `local.mjs` share.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const pkgs = fileURLToPath(new URL('../../', import.meta.url))

/** Pack each package into `dest`. Returns `{ name: 'file:…tgz' }`. */
export function packAll(dest) {
  mkdirSync(dest, { recursive: true })
  const tarballs = {}
  for (const dir of readdirSync(pkgs)) {
    const file = join(pkgs, dir, 'package.json')
    if (!existsSync(file)) continue
    const { name } = JSON.parse(readFileSync(file, 'utf8'))
    const packed = execFileSync('npm', ['pack', '--silent', '--pack-destination', dest], { cwd: join(pkgs, dir), encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32' }) // npm is npm.cmd there
    tarballs[name] = `file:${join(dest, packed.trim().split('\n').pop())}`
  }
  return tarballs
}

/** `pkg` with its weft dependencies on the tarballs. The overrides reach the ones packages declare for each other. */
export function pin(pkg, tarballs) {
  for (const deps of [pkg.dependencies, pkg.devDependencies]) for (const name in deps) if (tarballs[name]) deps[name] = tarballs[name]
  return { ...pkg, overrides: { ...pkg.overrides, ...tarballs } }
}
