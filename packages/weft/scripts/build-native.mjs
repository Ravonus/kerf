// Build crates/weft-compiler as a Node addon and copy it next to compiler.cjs, with its source stamp, then the WASM build
// the parity gate compares it with. --addon-only skips that, for a quick rebuild while working on the compiler.
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { sourceStamp, stampFile } = createRequire(import.meta.url)('./native-stamp.cjs')
const here = dirname(fileURLToPath(import.meta.url))
const crate = join(here, '..', '..', '..', 'crates', 'weft-compiler')
const stamp = sourceStamp() // before the build: an edit made while cargo runs leaves the binary marked stale
execFileSync('cargo', ['build', '--release', '--lib', '--features', 'node'], { cwd: crate, stdio: 'inherit' })
const lib = { darwin: 'libweft_compiler.dylib', linux: 'libweft_compiler.so', win32: 'weft_compiler.dll' }[process.platform]
mkdirSync(join(here, '..', 'native'), { recursive: true })
const out = join(here, '..', 'native', `weft-compiler.${process.platform}-${process.arch}.node`)
// Copy then rename: macOS kills a process that loads a signed binary overwritten in place (a new file is fine).
copyFileSync(join(process.env.CARGO_TARGET_DIR ?? join(crate, 'target'), 'release', lib), `${out}.tmp`)
renameSync(`${out}.tmp`, out)
writeFileSync(stampFile(out), `${stamp}\n`)
console.log('built native/weft-compiler.' + process.platform + '-' + process.arch + '.node')
if (!process.argv.includes('--addon-only')) execFileSync(process.execPath, [join(here, 'build-wasm.mjs'), '--if-stale'], { stdio: 'inherit' })
