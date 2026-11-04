// Packed gates compare resolved package identities because pnpm keeps dependencies in a virtual store.
import { realpathSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve, sep } from 'node:path'

/** Both Rust dependency sections must use the crate shipped by the installed start package. */
export function checkPackedCrate(app, manifest) {
  const expected = realpathSync(join(app, 'node_modules/@weft-js/start/crate'))
  const paths = [...manifest.matchAll(/^\s*weft\s*=\s*\{\s*path\s*=\s*"([^"]+)"/gm)].map((match) =>
    realpathSync(resolve(app, 'crates/hasher', match[1])),
  )
  if (paths.length !== 2 || paths.some((path) => path !== expected)) {
    throw new Error('rust: dependencies must use the crate shipped by @weft-js/start')
  }
}

/** Remove only this owned app's resolved native addon so its next compiler load exercises WASM. */
export function forceWasmCompiler(app, addon) {
  const core = realpathSync(join(app, 'node_modules/@weft-js/core/package.json'))
  const native = createRequire(core).resolve(`@weft-js/${addon}`)
  if (!native.startsWith(realpathSync(app) + sep))
    throw new Error('Native addon is outside the packed app')
  rmSync(native)
}
