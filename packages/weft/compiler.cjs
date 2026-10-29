// Loads the native weft compiler (crates/weft-compiler, napi). Text in, JSON text out.
const { join } = require('node:path')
const { existsSync } = require('node:fs')

const file = join(__dirname, 'native', `weft-compiler.${process.platform}-${process.arch}.node`)
if (!existsSync(file)) throw new Error(`weft: no native compiler at ${file}; run \`npm run build:native\` in packages/weft`)
const binding = require(file)

/** @returns {{ code: string | null, diagnostics: Array<{ code: string, severity: 'error' | 'warning', message: string, help: string, line: number, column: number, fix?: object }> }} */
exports.transform = (source, options) => JSON.parse(binding.transform(source, JSON.stringify(options ?? {})))
