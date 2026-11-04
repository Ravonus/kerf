// `crate/` in a packed @weft-js/start: the `weft` crate isn't on crates.io, so an app's Cargo.toml points here. It's the
// version its TS speaks, which is the point. A linked package has crates/weft next to it and needs none of this.
import { cpSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const out = fileURLToPath(new URL('../crate', import.meta.url))
const from = fileURLToPath(new URL('../../../crates/weft/', import.meta.url))
rmSync(out, { recursive: true, force: true })
if (!process.argv.includes('--clean'))
  cpSync(from, out, {
    recursive: true,
    filter: (f) => !/[\\/](target|tests)([\\/]|$)/.test(f.slice(from.length - 1)),
  })
