// Loads weft's compiler (crates/weft-compiler). Text in, JSON text out. One crate, reached the fastest way this machine
// has: the Node addon built in this checkout, else the prebuilt addon for this platform (an optional dependency), else
// the WASM build shipped in this package, which runs anywhere and emits the same bytes. Rust is never needed to use weft.
// `WEFT_COMPILER=native|wasm` pins one, for the parity gate and the bench.
const { join } = require('node:path')
const { existsSync, readFileSync } = require('node:fs')
const { sourceStamp, stampFile } = require('./scripts/native-stamp.cjs')
const { forHost } = require('./platforms.cjs')
const { loadWasm, wasmOptions } = require('./compiler-wasm.cjs')

const key = `${process.platform}-${process.arch}`
const addon = join(__dirname, 'native', `weft-compiler.${key}.node`)
const wasm = join(__dirname, 'native', 'weft-compiler.wasm')
const pinned = process.env.WEFT_COMPILER
const want = sourceStamp()

// In the repo, the binary must match its crate: a stale one compiles against an older runtime contract.
const checkStamp = (file) => {
  if (want === null) return
  const have = existsSync(stampFile(file)) ? readFileSync(stampFile(file), 'utf8').trim() : null
  if (have !== want) {
    throw new Error(
      `weft: ${file} is ${have ? 'older than' : 'unstamped against'} crates/weft-compiler (pulled or edited since it was built); run \`npm run build:native\` in packages/core`,
    )
  }
}

/** This platform's prebuilt addons that are installed and load, as `[backend, why the others didn't]`. */
function prebuilt() {
  const version = require('./package.json').version
  const skipped = []
  for (const { name } of forHost()) {
    const pkg = `@weft-js/compiler-${name}`
    try {
      const found = require(`${pkg}/package.json`).version
      // Pinned exactly by weft's optionalDependencies; an override that breaks that gets the WASM build, which matches.
      if (found !== version) {
        skipped.push(`${pkg} is ${found}, weft is ${version}`)
        continue
      }
      const file = require.resolve(pkg)
      return [{ binding: require(file), info: { kind: 'native', file, package: pkg } }, skipped]
    } catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND') skipped.push(`${pkg}: ${e.message}`)
    }
  }
  return [null, skipped]
}

function load() {
  const skipped = []
  if (pinned !== 'wasm') {
    if (existsSync(addon)) {
      checkStamp(addon)
      try {
        return { binding: require(addon), info: { kind: 'native', file: addon } }
      } catch (e) {
        if (pinned === 'native' || want !== null) throw e
        skipped.push(`${addon}: ${e.message}`)
      }
    }
    if (want === null) {
      const [found, why] = prebuilt()
      if (found) return found
      skipped.push(...why)
    }
    if (pinned === 'native')
      throw new Error(
        `weft: WEFT_COMPILER=native, and no addon for ${key} loads. ${skipped.join('; ')}`,
      )
  }
  if (!existsSync(wasm)) {
    throw new Error(
      `weft: no compiler at ${wasm}${want === null ? '' : '; run `npm run build:native` in packages/core'}`,
    )
  }
  checkStamp(wasm)
  return {
    binding: loadWasm(wasm),
    wasm: true,
    info: {
      kind: 'wasm',
      file: wasm,
      wanted: forHost().map((p) => `@weft-js/compiler-${p.name}`),
      skipped,
    },
  }
}

const { binding, wasm: isWasm, info } = load()

/** Which build this process compiles with: `kind` ('native' or 'wasm') and `file`, for `weft doctor` and cache keys. */
exports.backend = info

/** @returns {{ code: string | null, diagnostics: Array<{ code: string, severity: 'error' | 'warning', message: string, help: string, line: number, column: number, fix?: object }> }} */
exports.transform = (source, options) =>
  JSON.parse(
    binding.transform(source, JSON.stringify(isWasm ? wasmOptions(options) : (options ?? {}))),
  )
