// The native compiler's source stamp: a hash of everything in crates/kerf-compiler that changes the binary. The builds
// write it next to the .node and .wasm files; compiler.cjs compares it at load, so a binary older than its crate (a checkout
// that pulled compiler changes without `npm run build:native`) fails at once instead of emitting stale code.
const { createHash } = require('node:crypto')
const { existsSync, readdirSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

const crate = join(__dirname, '..', '..', '..', 'crates', 'kerf-compiler')

/** The crate's stamp, or null outside the repo (an installed package ships no crate). */
exports.sourceStamp = () => {
  if (!existsSync(crate)) return null
  const hash = createHash('sha256')
  const add = (rel) =>
    hash
      .update(rel)
      .update('\0')
      .update(readFileSync(join(crate, rel)))
      .update('\0')
  for (const f of ['Cargo.toml', 'Cargo.lock', 'build.rs', 'rust-toolchain.toml'])
    if (existsSync(join(crate, f))) add(f)
  const walk = (dir) => {
    for (const e of readdirSync(join(crate, dir), { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const rel = `${dir}/${e.name}`
      if (e.isDirectory()) walk(rel)
      else add(rel)
    }
  }
  walk('src')
  return hash.digest('hex')
}

exports.stampFile = (native) => `${native}.stamp`
