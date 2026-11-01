// The WASM build of crates/weft-compiler (src/wasm.rs), behind the same `transform(source, optionsJson)` as the addon.
// It has no imports, so plain `WebAssembly` runs it on Node, Bun and Deno. Instantiated at the first compile.
const { readFileSync } = require('node:fs')

const posix = path => path.replaceAll('\\', '/')
const posixKeys = map => map && Object.fromEntries(Object.entries(map).map(([k, v]) => [posix(k), v]))

/** The build has no filesystem to ask, and only ever sees `/`: the working directory, and Windows paths written its way. */
exports.wasmOptions = (options = {}) => {
  const cwd = posix(process.cwd())
  if (process.platform !== 'win32') return { cwd, ...options }
  return { cwd, ...options, filename: options.filename && posix(options.filename), groups: posixKeys(options.groups), shapes: posixKeys(options.shapes) }
}

exports.loadWasm = file => {
  const module = new WebAssembly.Module(readFileSync(file))
  const encoder = new TextEncoder()
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true })
  let wasm = null
  const put = bytes => {
    const at = wasm.alloc(bytes.length) >>> 0
    new Uint8Array(wasm.memory.buffer, at, bytes.length).set(bytes)
    return at
  }
  return {
    transform(source, optionsJson) {
      wasm ??= new WebAssembly.Instance(module).exports
      try {
        const text = encoder.encode(source), options = encoder.encode(optionsJson)
        const out = BigInt.asUintN(64, wasm.transform(put(text), text.length, put(options), options.length))
        const at = Number(out >> 32n), length = Number(out & 0xffffffffn)
        const json = decoder.decode(new Uint8Array(wasm.memory.buffer, at, length))
        wasm.free(at, length)
        return json
      } catch (e) {
        wasm = null // a trap leaves the instance mid-compile: the next file gets a new one
        throw e
      }
    },
  }
}
