// Production bundle sizes (§3.7 budgets are brotli). Usage: node scripts/size.mjs [--json out.json]
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import weft from '../vite.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = join(here, '..')
const fixtures = {
  'hello world': join(pkg, 'bench/fixtures/hello.tsx'),
  counter: join(pkg, 'bench/fixtures/counter.tsx'),
  'runtime (every export)': join(pkg, 'bench/fixtures/runtime-all.ts'),
  'v3 shop app': join(pkg, '../../evals/reference-v3/weft/src/main.tsx'),
  'v3 shop app (defineState)': join(pkg, 'test/fixtures/v3-scope/main.tsx'),
  'v3 shop app (hydrate)': join(pkg, 'bench/fixtures/hydrate-shop.tsx'),
  'Boundary + resource': join(pkg, 'bench/fixtures/async.tsx'),
  'js-framework-benchmark': join(pkg, 'bench/fixtures/jfb.tsx'),
}
const hydratable = new Set(['v3 shop app (hydrate)'])
// Runtime: 10 KB is the gate, 6 KB the target (PLAN §3.7).
const budgets = { 'hello world': 3072, 'runtime (every export)': 10240, 'v3 shop app': 10240, 'v3 shop app (defineState)': 10240, 'v3 shop app (hydrate)': 10240 }

const rows = {}
for (const [name, entry] of Object.entries(fixtures)) {
  const out = await build({
    root: dirname(entry),
    configFile: false,
    logLevel: 'silent',
    plugins: [weft({ hydratable: hydratable.has(name) })],
    resolve: { alias: [{ find: /^weft\/(dom|persist|history)$/, replacement: join(pkg, 'src/$1.ts') }, { find: /^weft$/, replacement: join(pkg, 'src/index.ts') }] },
    build: { write: false, modulePreload: { polyfill: false }, rolldownOptions: { input: entry } },
  })
  const code = [out].flat().flatMap(o => o.output).filter(c => c.type === 'chunk').map(c => c.code).join('\n')
  const br = brotliCompressSync(code, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
  rows[name] = { minBytes: code.length, gzBytes: gzipSync(code, { level: 9 }).length, brBytes: br, budgetBr: budgets[name] ?? null }
}
const kb = n => (n / 1024).toFixed(2) + ' KB'
for (const [name, r] of Object.entries(rows))
  console.log(`${name.padEnd(40)} min ${kb(r.minBytes).padStart(9)}  gz ${kb(r.gzBytes).padStart(8)}  br ${kb(r.brBytes).padStart(8)}${r.budgetBr ? `  budget ${kb(r.budgetBr)} ${r.brBytes <= r.budgetBr ? 'ok' : 'OVER'}` : ''}`)
const i = process.argv.indexOf('--json')
if (i > 0) writeFileSync(process.argv[i + 1], JSON.stringify(rows, null, 2))
