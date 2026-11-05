// What may import what, followed through the whole import graph. Lint's `no-restricted-imports` sees one file; this sees that a
// browser entry reaches Node two files down.
//
//   node scripts/quality/boundaries.mjs [--json]
import { repoRoot } from '../lib/helpers.mjs'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = repoRoot
const FRAMEWORK =
  /^(?:@weft-js\/|react(?:-dom)?(?:\/|$)|solid-js(?:\/|$)|vue(?:\/|$)|svelte(?:\/|$)|preact(?:\/|$))/
const NODE = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)])

/** Entries that end up in a browser bundle, by package directory. Everything else a package exports runs on a server or in a build. */
export const BROWSER = {
  core: [
    '.',
    './keyed',
    './jsx-runtime',
    './dom',
    './head',
    './markup',
    './persist',
    './history',
    './sync',
    './interaction',
    './browser',
    './style',
    './ds',
    './media',
    './shape',
    './text',
    './surface',
    './hmr',
    './devtools',
    './agent',
  ],
  'warp-core': ['.', './weft', './motion', './charts', './canvas', './dither', './search'],
  warp: ['.', './skeleton', './ui'],
  'warp-icons': ['.', './all', './quiet', './balanced', './vivid', './names', './icon', './late'],
  text: ['./measure'],
  multiplayer: ['.', './ui'],
  start: ['./client'],
}

const manifest = (dir) =>
  JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8'))
const byName = new Map(
  readdirSync(join(root, 'packages'))
    .filter((d) => existsSync(join(root, 'packages', d, 'package.json')))
    .map((d) => [manifest(d).name, d]),
)
const isFile = (f) => existsSync(f) && statSync(f).isFile()
const target = (value) =>
  typeof value === 'string' ? value : (value?.browser ?? value?.import ?? value?.default)

/** The file a package export points at, from the package's directory name and the export's key. */
export function entry(dir, sub) {
  const value = target(manifest(dir).exports?.[sub])
  return value ? join(root, 'packages', dir, value) : undefined
}

function resolveRelative(from, spec) {
  const base = resolve(dirname(from), spec)
  return [
    base,
    ...['.ts', '.tsx', '.mjs', '.js', '.d.ts', '/index.ts', '/index.tsx'].map((e) => base + e),
    base.replace(/\.js$/, '.ts'),
  ].find(isFile)
}

function resolveBare(spec) {
  const parts = spec.split('/'),
    name = parts.slice(0, spec.startsWith('@') ? 2 : 1).join('/'),
    dir = byName.get(name)
  if (!dir) return undefined
  return entry(dir, ['.', ...parts.slice(name.split('/').length)].join('/'))
}

/** The modules a file loads when it runs. Type-only imports and the text of comments don't count. */
function imports(file) {
  const text = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  const out = []
  for (const m of text.matchAll(
    /^(?:import|export)\s+(?!type\b)(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]/gm,
  ))
    out.push({ spec: m[1], lazy: false })
  for (const m of text.matchAll(/\bimport\(\s*(?:\/\*.*?\*\/\s*)?['"]([^'"]+)['"]\s*\)/g))
    out.push({ spec: m[1], lazy: true })
  return out
}

/** The markup entry loads only the two audited string-processing modules. */
export function standaloneMarkup(cwd = root) {
  const core = join(cwd, 'packages/core')
  const value = JSON.parse(readFileSync(join(core, 'package.json'), 'utf8')).exports?.['./markup']
  const sub = typeof value === 'string' ? value : value?.default
  if (
    typeof sub !== 'string' ||
    (typeof value === 'object' &&
      Object.keys(value).some((key) => !['types', 'default'].includes(key)))
  )
    return false
  const allowed = new Set(
    ['markup.mjs', 'markup-shared.mjs'].map((name) => join(core, 'src', name)),
  )
  const start = resolve(core, sub)
  if (!allowed.has(start) || !isFile(start)) return false
  let pure = true
  walk(
    start,
    (file, spec) => {
      const next = spec.startsWith('.') && resolveRelative(file, spec)
      if (!next || !allowed.has(next)) pure = false
    },
    (file) => !allowed.has(file),
  )
  return pure
}

/** Every file `start` loads, however deep: `visit` sees each import; a file `skip` names isn't followed into. */
export function walk(start, visit, skip = () => false) {
  const seen = new Map([[start, undefined]])
  const queue = [start]
  while (queue.length) {
    const file = queue.shift()
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue
    for (const { spec, lazy } of imports(file)) {
      visit(file, spec, lazy, seen)
      const next = spec.startsWith('.') ? resolveRelative(file, spec) : resolveBare(spec)
      if (next && !seen.has(next) && !skip(next)) {
        seen.set(next, file)
        queue.push(next)
      }
    }
  }
  return seen
}

/** How `file` was reached: the chain of imports from the entry. */
export const trail = (seen, file) => {
  const chain = []
  for (let f = file; f; f = seen.get(f)) chain.unshift(relative(root, f))
  return chain.join(' > ')
}

/** Every broken boundary, as `{ rule, file, detail, fix }`. */
export function findProblems() {
  const problems = []
  const pureMarkup = standaloneMarkup()
  if (!pureMarkup)
    problems.push({
      rule: 'markup-runtime',
      file: 'packages/core/package.json',
      detail: 'markup must load only its standalone string-processing modules',
      fix: 'Keep the markup export independent of framework and Node code.',
    })
  for (const [dir, subs] of Object.entries(BROWSER)) {
    for (const sub of subs) {
      const start = entry(dir, sub)
      if (!start || !isFile(start)) {
        problems.push({
          rule: 'browser-entry',
          file: `packages/${dir}`,
          detail: `${sub} is listed as a browser entry but ${dir} doesn't export it`,
          fix: 'Update BROWSER in scripts/quality/boundaries.mjs.',
        })
        continue
      }
      walk(start, (file, spec, lazy, seen) => {
        if (NODE.has(spec))
          problems.push({
            rule: 'browser-reaches-node',
            file: relative(root, file),
            detail: `${manifest(dir).name}${sub.slice(1)} reaches ${spec}${lazy ? ' (lazily)' : ''}: ${trail(seen, file)}`,
            fix: 'Move the Node code behind a server-only entry, or inject it.',
          })
      })
    }
  }
  const core = join(root, 'packages/warp-core/src')
  for (const name of readdirSync(core, { recursive: true })
    .map(String)
    .filter((f) => /\.[cm]?[jt]sx?$/.test(f))) {
    for (const { spec } of imports(join(core, name)))
      if (FRAMEWORK.test(spec) && !(spec === '@weft-js/core/markup' && pureMarkup))
        problems.push({
          rule: 'warp-core-framework',
          file: `packages/warp-core/src/${name}`,
          detail: `imports ${spec}`,
          fix: 'warp-core stays framework-agnostic: put this in bindings/.',
        })
  }
  const seen = new Set()
  return problems.filter((p) => {
    const key = `${p.rule}|${p.file}|${p.detail.split(':')[0]}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = findProblems()
  if (process.argv.includes('--json')) console.log(JSON.stringify(problems))
  else for (const p of problems) console.log(`${p.file}: ${p.detail}\n  fix: ${p.fix}`)
  process.exit(problems.length ? 1 : 0)
}
