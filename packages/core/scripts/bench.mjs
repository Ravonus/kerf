// Compile-speed bench through compiler.cjs (what Vite pays), single-threaded, on the generated corpus. KERF_COMPILER=wasm
// benches that build.
// Usage: node scripts/bench.mjs [dir=bench/corpus] [runs=7] [--solid path/to/@solidjs/compiler]
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const args = process.argv.slice(2)
const solidAt = args.indexOf('--solid')
const solidPath = solidAt >= 0 ? args.splice(solidAt, 2)[1] : null
const [dir = 'bench/corpus', runs = '7'] = args
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.tsx'))
  .sort()
  .map((f) => [join(dir, f), readFileSync(join(dir, f), 'utf8')])

function time(label, fn) {
  const ms = []
  for (let r = 0; r < Number(runs); r++) {
    const t = performance.now()
    for (const [filename, source] of files) fn(source, filename)
    ms.push(performance.now() - t)
  }
  ms.sort((a, b) => a - b)
  console.log(
    JSON.stringify({
      label,
      files: files.length,
      minMs: +ms[0].toFixed(1),
      medianMs: +ms[ms.length >> 1].toFixed(1),
    }),
  )
}

const { transform } = require('../compiler.cjs')
const { backend } = require('../compiler.cjs')
time(`kerf (${backend.kind}, full)`, (source, filename) => transform(source, { filename }))
time(`kerf (${backend.kind}, check only)`, (source, filename) =>
  transform(source, { filename, checkOnly: true }),
)
if (solidPath) {
  const solid = require(solidPath)
  time('@solidjs/compiler (napi, no kerf pre-pass)', (source, filename) =>
    solid.transform(source, { filename, moduleName: '@kerf-js/core/dom' }),
  )
}
