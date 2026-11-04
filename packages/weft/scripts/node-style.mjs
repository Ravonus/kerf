// Node won't strip types under node_modules, so what `@weft-js/core/vite` and the CLI load in Node ships as JS: `node/*.mjs`,
// generated from src/style (position-preserving, so line numbers match). `--check` fails when they've drifted.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

const src = new URL('../src/style/', import.meta.url)
const out = new URL('../node/', import.meta.url)
const check = process.argv.includes('--check')

mkdirSync(out, { recursive: true })
let stale = 0
for (const name of ['css', 'matrix', 'vocab']) {
  const code = stripTypeScriptTypes(readFileSync(new URL(`${name}.ts`, src), 'utf8')).replace(
    /(from '\.\/\w+)\.ts'/g,
    "$1.mjs'",
  )
  const file = new URL(`${name}.mjs`, out)
  if (!check) writeFileSync(file, code)
  else if (readFileSync(file, 'utf8') !== code) {
    stale++
    console.error(`node/${name}.mjs is stale: run node scripts/node-style.mjs`)
  }
}
process.exit(stale ? 1 : 0)
