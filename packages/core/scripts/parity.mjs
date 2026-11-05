// The gate that keeps one source of truth: every .tsx in the repo, in every output mode, through the addon and the WASM
// build, compared as the JSON text each returns (code, map, diagnostics, facts). test/compiler-parity.test.ts runs this.
// As a script it takes more trees, to try a real app:
//   node scripts/parity.mjs [--also <dir>]…
import { repoRoot } from '../../../scripts/lib/helpers.mjs'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { loadWasm, wasmOptions } = require('../compiler-wasm.cjs')
const here = dirname(fileURLToPath(import.meta.url))
const pkg = join(here, '..')
const repo = repoRoot
const SKIP = new Set([
  'node_modules',
  'dist',
  'target',
  'build',
  '.output',
  '.weft',
  '.git',
  '.nitro',
  'coverage',
])

const MODES = {
  dom: {},
  ssr: { generate: 'ssr' },
  hydrate: { hydratable: true },
  'ssr hydrate': { generate: 'ssr', hydratable: true, taggedParts: true },
  dev: { dev: true, hmr: true, sourceMap: true },
  'dev ssr': { dev: true, generate: 'ssr' },
  explain: { explain: true, sourceMap: true },
  shapes: { shapes: {} },
  check: { checkOnly: true },
}

/** What a corpus of real files doesn't hold: the edges where a text boundary or a pointer width would show. */
const EDGES = {
  'empty.tsx': '',
  'bom.tsx': '﻿export const A = () => <p>x</p>\n',
  'crlf.tsx': 'export function A() {\r\n  return <p>a</p>\r\n}\r\n',
  // oxlint-disable no-template-curly-in-string -- the `${` is the case: source text the compilers have to agree on
  'unicode.tsx':
    'export const A = () => <p title="日本語 🎉 é">שלום 𝒳   x</p>\n/* 🎉 */ const b = <div>{`é${1}🎉`}</div>\n' /* oxlint-enable no-template-curly-in-string */,
  'lone-surrogate.tsx': 'export const s = "\\ud800"; export const A = () => <p>{"\uD800"}</p>\n',
  'syntax-error.tsx': 'export const A = () => <div><span></div>\n',
  'after-unicode-error.tsx': 'const é = "🎉🎉"; const b = <div>;\n',
  'not-ts.ts': 'export const a: number = 1\n',
  'big.tsx': Array.from(
    { length: 2000 },
    (_, i) => `export const C${i} = (p: { a: string }) => <div class="c${i}">{p.a} ${i}</div>`,
  ).join('\n'),
  'nested.tsx': `export const A = () => ${'<div>'.repeat(1000)}x${'</div>'.repeat(1000)}\n`,
  'parens.ts': `export const a = ${'('.repeat(500)}1${')'.repeat(500)}\n`,
}

const GROUP = `import { group } from '@weft-js/core/style'\nexport const card = group('order-card', { base: { gap: 'tight' }, axes: { status: { late: { gap: 'loose' } } } })\n`
const GROUP_USE = `import { card } from './card'\nexport const Row = () => <p {...card({ status: 'late' })}>x</p>\n`

function walk(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      // .tmp-* are other packages' test scratch dirs, made and removed while this runs alongside them
      if (!SKIP.has(e.name) && !e.name.startsWith('.tmp-')) walk(join(dir, e.name), out)
    } else if (e.name.endsWith('.tsx') && !e.name.endsWith('.d.tsx')) out.push(join(dir, e.name))
  }
  return out
}

/** `{ files, compared, bytes, ms: { native, wasm }, mismatches: [{ file, mode, at, native, wasm }] }`. Throws when a build is missing. */
export function parity({ also = [], limit } = {}) {
  const addon = join(pkg, 'native', `weft-compiler.${process.platform}-${process.arch}.node`)
  const wasmFile = join(pkg, 'native', 'weft-compiler.wasm')
  for (const f of [addon, wasmFile])
    if (!existsSync(f)) throw new Error(`no ${f}; run \`npm run build:native\` in packages/core`)
  const native = require(addon)
  const wasm = loadWasm(wasmFile)
  const cwd = process.cwd()
  // Vite's ids: forward slashes on every platform.
  const id = (file) => file.replaceAll('\\', '/')
  const corpus = [
    ...[repo, ...also].flatMap((dir) => walk(dir, []).map((f) => [id(f), readFileSync(f, 'utf8')])),
    ...Object.entries(EDGES).map(([f, s]) => [id(join(cwd, 'edge', f)), s]),
  ]
  const cases = limit ? corpus.slice(0, limit) : corpus
  const report = {
    files: cases.length,
    modes: Object.keys(MODES).length,
    compared: 0,
    bytes: 0,
    ms: { native: 0, wasm: 0 },
    mismatches: [],
  }
  for (const [filename, source] of cases) {
    for (const [mode, options] of Object.entries(MODES)) {
      let t = performance.now()
      const a = native.transform(source, JSON.stringify({ filename, ...options }))
      report.ms.native += performance.now() - t
      t = performance.now()
      const b = wasm.transform(source, JSON.stringify(wasmOptions({ filename, ...options })))
      report.ms.wasm += performance.now() - t
      report.compared++
      report.bytes += a.length
      if (a === b) continue
      let at = 0
      while (at < a.length && a[at] === b[at]) at++
      report.mismatches.push({
        file: filename,
        mode,
        at,
        native: a.slice(Math.max(0, at - 40), at + 80),
        wasm: b.slice(Math.max(0, at - 40), at + 80),
      })
    }
  }
  // A group from another file: its key is a `path.resolve`d one (vite.mjs), which reads differently on Windows.
  const definition = JSON.parse(
    native.transform(
      GROUP,
      JSON.stringify({ filename: join(cwd, 'edge', 'card.ts'), checkOnly: true }),
    ),
  ).facts.groups[0]
  const options = {
    filename: id(join(cwd, 'edge', 'page.tsx')),
    groups: {
      [`${join(cwd, 'edge', 'card')}#card`]: { name: definition.name, def: definition.def },
    },
  }
  const a = native.transform(GROUP_USE, JSON.stringify(options))
  const b = wasm.transform(GROUP_USE, JSON.stringify(wasmOptions(options)))
  report.compared++
  if (!a.includes('data-g=')) throw new Error(`the imported group didn't apply: ${a}`)
  if (a !== b)
    report.mismatches.push({
      file: 'imported group',
      mode: 'groups',
      at: 0,
      native: a.slice(0, 300),
      wasm: b.slice(0, 300),
    })
  return report
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const also = args.flatMap((a, i) => (a === '--also' ? [args[i + 1]] : []))
  const r = parity({ also })
  console.log(JSON.stringify({ ...r, mismatches: r.mismatches.length }))
  for (const m of r.mismatches.slice(0, 5)) console.log(m)
  process.exit(r.mismatches.length ? 1 : 0)
}
