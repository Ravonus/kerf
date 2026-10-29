// Build crates/weft-compiler as a Node addon and copy it next to compiler.cjs.
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const crate = join(here, '..', '..', '..', 'crates', 'weft-compiler')
execFileSync('cargo', ['build', '--release', '--lib', '--features', 'node'], { cwd: crate, stdio: 'inherit' })
const lib = { darwin: 'libweft_compiler.dylib', linux: 'libweft_compiler.so', win32: 'weft_compiler.dll' }[process.platform]
mkdirSync(join(here, '..', 'native'), { recursive: true })
copyFileSync(join(crate, 'target', 'release', lib), join(here, '..', 'native', `weft-compiler.${process.platform}-${process.arch}.node`))
console.log('built native/weft-compiler.' + process.platform + '-' + process.arch + '.node')
