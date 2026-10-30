// Loads the native weft compiler (crates/weft-compiler, napi). Text in, JSON text out.
const { join } = require('node:path')
const { existsSync, readFileSync } = require('node:fs')
const { sourceStamp, stampFile } = require('./scripts/native-stamp.cjs')

const file = join(__dirname, 'native', `weft-compiler.${process.platform}-${process.arch}.node`)
if (!existsSync(file)) throw new Error(`weft: no native compiler at ${file}; run \`npm run build:native\` in packages/weft`)
// In the repo, the binary must match its crate: a stale one compiles against an older runtime contract.
const want = sourceStamp()
if (want !== null) {
  const have = existsSync(stampFile(file)) ? readFileSync(stampFile(file), 'utf8').trim() : null
  if (have !== want) {
    throw new Error(`weft: the native compiler is ${have ? 'older than' : 'unstamped against'} crates/weft-compiler (pulled or edited since it was built); run \`npm run build:native\` in packages/weft`)
  }
}
const binding = require(file)

/** @returns {{ code: string | null, diagnostics: Array<{ code: string, severity: 'error' | 'warning', message: string, help: string, line: number, column: number, fix?: object }> }} */
exports.transform = (source, options) => JSON.parse(binding.transform(source, JSON.stringify(options ?? {})))
