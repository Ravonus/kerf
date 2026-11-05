// Node won't strip types under node_modules, so what `@weft-js/core/vite` and the CLI load in Node ships as JS,
// generated from src/style (position-preserving, so line numbers match). `--check` fails when they've drifted.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = new URL('../src/style/', import.meta.url)
const out = new URL('../node/', import.meta.url)
const check = process.argv.includes('--check')

function helpers(dir) {
  const path = new URL(`${dir}/`, src)
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const name = `${dir}/${entry.name}`
    return entry.isDirectory() ? helpers(name) : name.endsWith('.ts') ? [name] : []
  })
}

const files = ['css.ts', 'matrix.ts', 'vocab.ts', ...helpers('css'), ...helpers('matrix')]
let stale = 0
for (const name of files) {
  let code = stripTypeScriptTypes(readFileSync(new URL(name, src), 'utf8')).replace(
    /((?:from\s+|import\s*)['"]\.\.?\/[^'"]+)\.ts(['"])/g,
    '$1.mjs$2',
  )
  // Keep the existing vocab mirror unchanged; the split files also need clean Git diffs.
  if (name !== 'vocab.ts')
    code = code
      .replace(/[\t \u00a0\u2000-\u200a]+$/gm, '')
      .replace(/\n(?=\n$)/, '\n// Types are erased.')
  const file = new URL(name.replace(/\.ts$/, '.mjs'), out)
  if (!check) {
    mkdirSync(dirname(fileURLToPath(file)), { recursive: true })
    writeFileSync(file, code)
  } else if (!existsSync(file) || readFileSync(file, 'utf8') !== code) {
    stale++
    console.error(
      `node/${name.replace(/\.ts$/, '.mjs')} is stale or missing: run node scripts/node-style.mjs`,
    )
  }
}
process.exit(stale ? 1 : 0)
