// What may import what, followed through the whole import graph. Lint's `no-restricted-imports` sees one file; this sees that a
// browser entry reaches Node two files down.
//
//   node scripts/quality/boundaries.mjs [--json]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FRAMEWORK = /^(?:@weft-js\/|react(?:-dom)?(?:\/|$)|solid-js(?:\/|$)|vue(?:\/|$)|svelte(?:\/|$)|preact(?:\/|$))/
const NODE = new Set([...builtinModules, ...builtinModules.map(m => `node:${m}`)])

/** Entries that end up in a browser bundle, by package directory. Everything else a package exports runs on a server or in a build. */
export const BROWSER = {
  weft: ['.', './keyed', './jsx-runtime', './dom', './head', './persist', './history', './sync', './interaction', './browser', './style', './ds', './media', './shape', './text', './surface', './hmr', './devtools', './agent'],
  'warp-core': ['.', './weft', './motion', './charts', './canvas', './dither', './search'],
  warp: ['.', './skeleton', './ui'],
  icons: ['.', './all', './quiet', './balanced', './vivid', './names', './icon', './late'],
  text: ['./measure'],
  multiplayer: ['.', './ui'],
  start: ['./client'],
}

const manifest = dir => JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8'))
const byName = new Map(readdirSync(join(root, 'packages')).filter(d => existsSync(join(root, 'packages', d, 'package.json'))).map(d => [manifest(d).name, d]))
const isFile = f => existsSync(f) && statSync(f).isFile()
const target = value => (typeof value === 'string' ? value : value?.browser ?? value?.import ?? value?.default)

function entry(dir, sub) {
  const value = target(manifest(dir).exports?.[sub])
  return value ? join(root, 'packages', dir, value) : undefined
}

function resolveRelative(from, spec) {
  const base = resolve(dirname(from), spec)
  return [base, ...['.ts', '.tsx', '.mjs', '.js', '.d.ts', '/index.ts', '/index.tsx'].map(e => base + e), base.replace(/\.js$/, '.ts')].find(isFile)
}

function resolveBare(spec) {
  const parts = spec.split('/'), name = parts.slice(0, spec.startsWith('@') ? 2 : 1).join('/'), dir = byName.get(name)
  if (!dir) return undefined
  return entry(dir, ['.', ...parts.slice(name.split('/').length)].join('/'))
}

/** The modules a file loads when it runs. Type-only imports and the text of comments don't count. */
function imports(file) {
  const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const out = []
  for (const m of text.matchAll(/^(?:import|export)\s+(?!type\b)(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) out.push({ spec: m[1], lazy: false })
  for (const m of text.matchAll(/\bimport\(\s*(?:\/\*.*?\*\/\s*)?['"]([^'"]+)['"]\s*\)/g)) out.push({ spec: m[1], lazy: true })
  return out
}

function walk(start, visit) {
  const seen = new Map([[start, undefined]])
  const queue = [start]
  while (queue.length) {
    const file = queue.shift()
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue
    for (const { spec, lazy } of imports(file)) {
      visit(file, spec, lazy, seen)
      const next = spec.startsWith('.') ? resolveRelative(file, spec) : resolveBare(spec)
      if (next && !seen.has(next)) { seen.set(next, file); queue.push(next) }
    }
  }
}

const trail = (seen, file) => { const chain = []; for (let f = file; f; f = seen.get(f)) chain.unshift(relative(root, f)); return chain.join(' > ') }

/** Every broken boundary, as `{ rule, file, detail, fix }`. */
export function findProblems() {
  const problems = []
  for (const [dir, subs] of Object.entries(BROWSER)) {
    for (const sub of subs) {
      const start = entry(dir, sub)
      if (!start || !isFile(start)) { problems.push({ rule: 'browser-entry', file: `packages/${dir}`, detail: `${sub} is listed as a browser entry but ${dir} doesn't export it`, fix: 'Update BROWSER in scripts/quality/boundaries.mjs.' }); continue }
      walk(start, (file, spec, lazy, seen) => {
        if (NODE.has(spec)) problems.push({ rule: 'browser-reaches-node', file: relative(root, file), detail: `${manifest(dir).name}${sub.slice(1)} reaches ${spec}${lazy ? ' (lazily)' : ''}: ${trail(seen, file)}`, fix: 'Move the Node code behind a server-only entry, or inject it.' })
      })
    }
  }
  const core = join(root, 'packages/warp-core/src')
  for (const name of readdirSync(core, { recursive: true }).map(String).filter(f => /\.[cm]?[jt]sx?$/.test(f))) {
    for (const { spec } of imports(join(core, name))) if (FRAMEWORK.test(spec)) problems.push({ rule: 'warp-core-framework', file: `packages/warp-core/src/${name}`, detail: `imports ${spec}`, fix: 'warp-core stays framework-agnostic: put this in bindings/.' })
  }
  const seen = new Set()
  return problems.filter(p => { const key = `${p.rule}|${p.file}|${p.detail.split(':')[0]}`; if (seen.has(key)) return false; seen.add(key); return true })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = findProblems()
  if (process.argv.includes('--json')) console.log(JSON.stringify(problems))
  else for (const p of problems) console.log(`${p.file}: ${p.detail}\n  fix: ${p.fix}`)
  process.exit(problems.length ? 1 : 0)
}
