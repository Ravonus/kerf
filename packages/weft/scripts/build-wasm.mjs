// Build crates/weft-compiler for WebAssembly and copy it next to compiler.cjs, with its source stamp: the fallback every
// install has. --if-stale does nothing when the stamp already matches, for `prepack`.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { sourceStamp, stampFile } = createRequire(import.meta.url)('./native-stamp.cjs')
const here = dirname(fileURLToPath(import.meta.url))
const crate = join(here, '..', '..', '..', 'crates', 'weft-compiler')
const out = join(here, '..', 'native', 'weft-compiler.wasm')
const stamp = sourceStamp() // before the build: an edit made while cargo runs leaves the binary marked stale
if (process.argv.includes('--if-stale') && existsSync(stampFile(out)) && readFileSync(stampFile(out), 'utf8').trim() === stamp) process.exit(0)
// The main thread's 8 MB, as the addon gets, so a file that nests deeply compiles the same on both.
const env = { ...process.env, CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUSTFLAGS: '-C target-feature=+simd128 -C link-arg=-zstack-size=8388608' }
execFileSync('cargo', ['build', '--release', '--lib', '--target', 'wasm32-unknown-unknown'], { cwd: crate, stdio: 'inherit', env })
mkdirSync(dirname(out), { recursive: true })
const target = process.env.CARGO_TARGET_DIR ?? join(crate, 'target')
copyFileSync(join(target, 'wasm32-unknown-unknown', 'release', 'weft_compiler.wasm'), `${out}.tmp`)
renameSync(`${out}.tmp`, out)
writeFileSync(stampFile(out), `${stamp}\n`)
console.log('built native/weft-compiler.wasm')
