// Packed gates compare resolved package identities because pnpm keeps dependencies in a virtual store.
import { readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve, sep } from 'node:path'

// Equal depth keeps pnpm's tarball-based virtual store identities equal in both builds.
export const parityDirs = { default: 'native/default', wasm: 'wasm/default' }

/** Read every built asset as bytes for the parity check. */
export function readClientAssets(app) {
  const dir = join(app, '.output/public/assets')
  return Object.fromEntries(readdirSync(dir).map((name) => [name, readFileSync(join(dir, name))]))
}

/** Compare asset names and bytes, including compressed assets. */
export function checkClientParity(native, wasm) {
  const names = Object.keys(native).sort()
  const other = Object.keys(wasm).sort()
  if (
    names.length !== other.length ||
    names.some((name, i) => name !== other[i] || !native[name].equals(wasm[name]))
  )
    throw new Error('the same app built with the addon and with WASM differs')
}

/** Both Rust dependency sections must use the crate shipped by the installed start package. */
export function checkPackedCrate(app, manifest) {
  const expected = realpathSync(join(app, 'node_modules/@kerf-js/start/crate'))
  const paths = [...manifest.matchAll(/^\s*kerf\s*=\s*\{\s*path\s*=\s*"([^"]+)"/gm)].map((match) =>
    realpathSync(resolve(app, 'crates/hasher', match[1])),
  )
  if (paths.length !== 2 || paths.some((path) => path !== expected)) {
    throw new Error('rust: dependencies must use the crate shipped by @kerf-js/start')
  }
}

/** Remove only this owned app's resolved native addon so its next compiler load exercises WASM. */
export function forceWasmCompiler(app, addon) {
  const core = realpathSync(join(app, 'node_modules/@kerf-js/core/package.json'))
  const native = createRequire(core).resolve(`@kerf-js/${addon}`)
  if (!native.startsWith(realpathSync(app) + sep))
    throw new Error('Native addon is outside the packed app')
  rmSync(native)
}
