#!/usr/bin/env node
// Moves every weft package to the @weft-js scope and readies the manifests for 0.1.0. Repeatable and idempotent: run it on
// a fresh tree, or again on a tree already renamed, and the second run changes nothing. Package directories keep their
// names (packages/weft stays packages/weft); only what npm and module resolution see changes. The product stays "weft" in
// prose and so do the `weft` and `create-weft` bins, `weft.config.ts`, `.weft/`, `/_weft/`, `weft:` virtual ids and the
// `weft` Rust crate.
//
//   node scripts/rename-scope.mjs [--root <dir>]   apply
//   node scripts/rename-scope.mjs --dry            say what would change, write nothing
//   node scripts/rename-scope.mjs --audit          print what still looks like an old name, and what was left on purpose
//
// A `patch` below that no longer finds its text fails the run: the tree moved under it, and a silent miss here is a
// package that installs and doesn't work. Fix the patch rather than the output.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const flag = name => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined)
const root = resolve(flag('root') ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
const dry = argv.includes('--dry')
const audit = argv.includes('--audit')

export const SCOPE = '@weft-js'
export const VERSION = '0.1.0'
const CORE = `${SCOPE}/core`
const CREATE = `${SCOPE}/create`

const SKIP_DIRS = new Set(['node_modules', '.git', 'target', 'dist', '.output', 'coverage', '.vite'])
const SKIP_PATHS = [/^packages\/weft\/native\//, /^evals\/results\//, /^scripts\/rename-scope\.mjs$/, /^scripts\/release\.mjs$/, /^packages\/text-engine\/vendor\//, /^packages\/plugin-surface-keel\/vendor\//, /^packages\/start\/crate\//]
const TEXT = /\.(mjs|cjs|js|jsx|ts|tsx|mts|cts|json|jsonc|md|mdx|html|css|rs|toml|yml|yaml|kt|swift|sh|txt)$/
/** Docs that record what was decided at the time: names change, commands in them aren't run. */
const HISTORY = /^docs\/(research|design|PLAN|REVIEW)/

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(join(dir, e.name))
    } else if (e.isFile()) yield join(dir, e.name)
  }
}
const relOf = file => relative(root, file).split(sep).join('/')

/** weft's subpaths, read from its manifest so a merge that adds one is picked up. Longest first: `test/plugins` before `test`. */
const subpaths = Object.keys(JSON.parse(readFileSync(join(root, 'packages/weft/package.json'), 'utf8')).exports)
  .filter(k => k !== '.').map(k => k.slice(2)).sort((a, b) => b.length - a.length)
/** `@weft/<x>` for the packages that exist. Anything else (`@weft/zag`, a plan that never shipped) stays, and --audit lists it. */
const dirs = readdirSync(join(root, 'packages')).filter(d => existsSync(join(root, 'packages', d, 'package.json')))
const scoped = [...dirs.filter(d => !['weft', 'create-weft', 'icons'].includes(d)), 'compiler-'].sort((a, b) => b.length - a.length)

const Q = String.raw`\\?['"\x60]` // a quote, escaped or not: Rust and template fixtures carry \"weft\"
const SUB = subpaths.map(s => s.replace(/\//g, '/')).join('|')
const SUB_RE = subpaths.map(s => s.replace(/\//g, String.raw`\\/`)).join('|')
const NOT_PATH = String.raw`(?<![\w@./:\\-])` // `packages/weft/test`, `.weft/`, `virtual:weft/` aren't specifiers
const NOT_DEEPER = String.raw`(?![\w-]|\.\w|/\w)` // `weft/test/fixtures` and `weft/src.ts` are paths

/** Names that aren't just the new scope. Old spellings stay here so a branch merged later still lands right. */
const RENAMED = [
  [/@weft\/icons\b/g, `${SCOPE}/warp-icons`],
  [/@weft(-js)?\\\/icons\b/g, `${SCOPE}\\/warp-icons`],
  [/@weft\/plugin-db-(native|prisma)\b/g, `${SCOPE}/db/plugin-$1`],
  [/@weft\/db-(sql|kysely|prisma|mongo|dynamodb|firestore)\b/g, `${SCOPE}/db/$1`],
  [/@weft\/plugin-pay-stripe\b/g, `${SCOPE}/pay/stripe`],
  [/@weft\/plugin-text\b/g, `${SCOPE}/text`],
  [/@weft\/text-engine\b/g, `${SCOPE}/text/engine`],
]

const rules = [
  ...RENAMED,
  // Scoped names. All of them, in prose too: a `@weft/x` was only ever a package.
  [new RegExp(String.raw`@weft/(?=(?:${scoped.join('|')}))`, 'g'), `${SCOPE}/`],
  [/@weft\/(?=\$\{)/g, `${SCOPE}/`], // `@weft/${dir}`
  [/@weft\/(?=['"`])/g, `${SCOPE}/`], // startsWith('@weft/')
  [/@weft\\\//g, `${SCOPE}\\/`], // the same in a regex
  [/@weft(?=['"`])/g, SCOPE], // join('node_modules', '@weft', …)

  // create-weft, the package. The bin keeps the name, and `npx create-weft` isn't ours, so commands move too.
  [/\bnpm create weft(?=@|\b)/g, `npm create ${SCOPE}`],
  [/\b(pnpm|yarn|bun) create weft\b/g, `$1 create ${SCOPE}`],
  [/\bcreate-weft@/g, `${CREATE}@`],
  [/\bnpm:create-weft\b/g, `npm:${CREATE}`],
  [/(['"`])create-weft\/stack\1/g, `$1${CREATE}/stack$1`],
  [/"create-weft"(\s*:\s*"(?:file:|\*|\^|~|\d))/g, `"${CREATE}"$1`],
  [/'create-weft'(\s*:\s*'file:)/g, `'${CREATE}'$1`],
  [/"name"(\s*:\s*)"create-weft"/g, `"name"$1"${CREATE}"`],
  [/(?<![\w/-])node_modules\/create-weft(?=[/"])/g, `node_modules/${CREATE}`],

  // weft, the package, where the text says so.
  [/"name"(\s*:\s*)"weft"/g, `"name"$1"${CORE}"`],
  [/(?<!serverInfo: \{ )\bname: 'weft'(?=, *(?:version|exports))/g, `name: '${CORE}'`],
  [/"weft"(\s*:\s*"(?:file:|\*|\^|~|\d|link:|workspace:|npm:|latest))/g, `"${CORE}"$1`],
  [/(?<![\w/.-])node_modules\/weft(?=[/"'`\s]|$)/gm, `node_modules/${CORE}`],
  [/\bnpm:weft\b/g, `npm:${CORE}`],
  [new RegExp(String.raw`\b(from|import)(\s*\(?\s*)(${Q})weft(${Q})`, 'g'), (_, a, b, c, d) => `${a}${b}${c}${CORE}${d}`],
  [new RegExp(String.raw`\b(require(?:\.resolve)?\(|import\(|vi\.(?:mock|doMock|unmock|importActual)\(|declare module )(${Q})weft(${Q})`, 'g'), (_, a, b, c) => `${a}${b}${CORE}${c}`],
  [new RegExp(String.raw`(jsxImportSource['"]?\s*[:=]\s*)(${Q})weft(${Q})`, 'g'), (_, a, b, c) => `${a}${b}${CORE}${c}`],
  [/(@jsxImportSource\s+)weft\b/g, `$1${CORE}`],
  [new RegExp(String.raw`\b(source|spec|specifier|module|from)(\s*[!=]==?\s*)(${Q})weft(${Q})`, 'g'), (_, a, b, c, d) => `${a}${b}${c}${CORE}${d}`],
  [/\bname === 'weft'( \|\| name\.startsWith)/g, `name === '${CORE}'$1`],
  [/\bname === 'weft' \? 'weft'/g, `name === '${CORE}' ? 'weft'`],
  [/\/\^weft\$\//g, `/^${CORE.replace('/', '\\/')}$/`],
  [/\^weft\$/g, `^${CORE.replace('/', '\\/')}$`],
  [/\^\(weft\|@weft-js\\\/start\)/g, String.raw`^@weft-js\/(?:core|start)`],
  [/\^weft\\\/\(/g, String.raw`^@weft-js\/core\/(`],
  [/(?<!\.replace\()(['"]@weft-js\/[\w-]+['"],\s*)'weft'/g, `$1'${CORE}'`], // an array of packages
  [/(?<=[[(\s])'weft'(?=,\s*['"]@weft-js\/)/g, `'${CORE}'`],
  [/((?:dependencies|devDependencies|peerDependencies)\s*:\s*\{[^}\n]*?)(?<![\w'"-])weft:(?= )/g, `$1'${CORE}':`],
  [/(?<![\w.'"-])weft: (?=pkg\(|version\b|'file:|'\d)/g, `'${CORE}': `],

  // Subpaths, wherever they stand as one: strings, prose, comments, Rust, regexes.
  [new RegExp(`${NOT_PATH}weft/(${SUB})${NOT_DEEPER}`, 'g'), `${CORE}/$1`],
  [new RegExp(String.raw`${NOT_PATH}weft\\/(${SUB_RE})(?![\w-]|\\/\w)`, 'g'), `${CORE.replace('/', '\\/')}\\/$1`],
]

/** Only in docs a reader follows. Research records keep `create-weft --ui …` as the name of the tool they're about. */
const docRules = [
  [/(^|\s|`)create-weft (?=(?:--|<|\[|my-))/gm, `$1npm create ${SCOPE} -- `],
  [/`create-weft`/g, `\`npm create ${SCOPE}\``],
]
const DOCS = /^(README\.md|docs\/getting-started\.md|site\/content\/|packages\/[^/]+\/(README\.md|docs\/))/

/** Citations of an internal review in shipped comments. The name isn't part of this project. */
const shippedComments = [[/ ?\(agorix [^)]*\)/g, ''], [/\(agorix [^)]*, /g, '('], [/\bagorix \d+ §\d+(, H\d+)?/g, 'the list contract'], [/ \(agorix [A-Z]\d+(, [A-Z]\d+)*\)/g, '']]

/**
 * Text no rule can tell from its neighbours. `from` must be there on a first run, `to` on a later one; neither means the
 * tree changed, and the run fails. `any` patches may match nothing.
 */
const R = String.raw
const patches = [
  // The Rust compiler: what it emits and what it recognises.
  ['crates/weft-compiler/src/transform.rs', 't.import("weft", &imports)', `t.import("${CORE}", &imports)`],
  // The Vite plugin. A package in node_modules no longer has `weft` as a path segment.
  ['*', R`@weft-js\/(icons|warp)`, R`@weft-js\/(warp-icons|warp)`, 'any'],
  ['site/arena/build.mjs', "'../node_modules/weft/vite.mjs'", "'../node_modules/@weft-js/core/vite.mjs'", 'all'],
  ['packages/weft/vite.mjs', R`[\\/]node_modules[\\/]weft[\\/]/`, R`[\\/]node_modules[\\/]@weft-js[\\/]core[\\/]/`],
  ['packages/weft/vite.mjs', R`filter: { id: /[\\/]weft[\\/]src[\\/]flags\.ts$/ }`, R`filter: { id: /[\\/](?:weft|@weft-js[\\/]core)[\\/]src[\\/]flags\.ts$/ }`],
  ['packages/weft/node/hydration.mjs', "const PURE = { weft: new Set", `const PURE = { '${CORE}': new Set`],
  ['packages/weft/node/hydration.mjs', "  weft: new Set(['state'", `  '${CORE}': new Set(['state'`],
  ['packages/weft/test/hmr.test.ts', "  weft: { ...core,", `  '${CORE}': { ...core,`],
  ['packages/weft/test/style-matrix.test.ts', "external: [/^weft/]", R`external: [/^@weft-js\/core/]`],
  ['packages/cli/test/check.test.mjs', "[1, 23, 1, 40]", "[1, 23, 1, 36]"],
  ['packages/cli/test/docs.test.mjs', "Status in weft@0\\.0\\.0", "Status in weft@0\\.1\\.0"],
  ['packages/cli/src/agents-md.mjs', "info.exports.weft ?? []", `info.exports['${CORE}'] ?? []`],
  // Where a name is built, not written.
  ['packages/cli/src/weft.mjs', `out[sub === '.' ? 'weft' : \`weft/\${sub.slice(2)}\`]`, `out[sub === '.' ? '${CORE}' : \`${CORE}/\${sub.slice(2)}\`]`],
  ['packages/cli/src/tests.mjs', "spec.startsWith('weft/')", `spec.startsWith('${CORE}/')`],
  ['packages/icons/compile.mjs', R`@weft-js\/(icons|warp)`, R`@weft-js\/(warp-icons|warp)`],
  ['packages/weft/vite.mjs', "exclude: ['weft'], include: can ? ['weft > @testing-library/dom', 'weft > @testing-library/user-event', 'weft > dom-accessibility-a", `exclude: ['${CORE}'], include: can ? ['${CORE} > @testing-library/dom', '${CORE} > @testing-library/user-event', '${CORE} > dom-accessibility-a`],
  ['packages/warp-core/test/agnostic.test.mjs', "toEqual(['weft'])", `toEqual(['${CORE}'])`],
  ['packages/warp-core/test/agnostic.test.mjs', "toEqual(['weft', '../src/store'])", `toEqual(['${CORE}', '../src/store'])`],
  ['packages/cli/test/trust.test.mjs', "dependencies: ['left-pad', 'weft']", `dependencies: ['${CORE}', 'left-pad']`],
  ['packages/cli/test/docs.test.mjs', '/^- `weft`: `Boundary`', `/^- \`${CORE.replace('/', '\\/')}\`: \`Boundary\``.replace('\\`Boundary\\`', '`Boundary`')],
  ['evals/apps/stacks.json', '"detect": ["weft"', `"detect": ["${CORE}"`],
  ['crates/weft-compiler/tests/helper_contract.rs', '("weft", exports_of', `("${CORE}", exports_of`],
  ['.github/workflows/runtime-matrix.yml', '"dependencies.weft=file:', `"dependencies.${CORE}=file:`],
  ['.github/workflows/runtime-matrix.yml', '"dependencies.@weft/$p=', `"dependencies.${SCOPE}/$p=`],
  ['packages/create-weft/test/scaffold.test.mjs', R`/^(weft$|@weft-js\/)/`, R`/^@weft-js\//`],
  ['packages/multiplayer/scripts/e2e-browsers.mjs', "LINKED = ['weft',", `LINKED = ['${CORE}',`],
  // Packages and the directory they live in differ now.
  ['*', "name.replace('@weft-js/', '')", "name.replace('@weft-js/core', 'weft').replace('@weft-js/create', 'create-weft').replace('@weft-js/warp-icons', 'icons').replace('@weft-js/', '')", 'any'],
  // A scaffold pins the version it shipped with, not a literal.
  ['packages/create-weft/src/index.mjs', "version = '0.0.0', db = 'none'", "version = VERSION, db = 'none'"],
  ['packages/create-weft/src/stack.mjs', "layer = 'drizzle', version = '0.0.0' }", "layer = 'drizzle', version = VERSION }"],
  ['packages/create-weft/src/stack.mjs', 'export function stackDeps(', "/** Every scaffold pins what it shipped with: this package and weft's others go out at one version. */\nexport const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version\n\nexport function stackDeps(", 'once:export const VERSION'],
  ['packages/cli/src/mcp.mjs', "serverInfo: { name: 'weft', version: '0.0.0' }", `serverInfo: { name: 'weft', version: '${VERSION}' }`],
  ['packages/cli/test/check.test.mjs', "expect(r.weft.version).toBe('0.0.0')", `expect(r.weft.version).toBe('${VERSION}')`],
  ['packages/cli/test/docs.test.mjs', "toContain('weft@0.0.0')", `toContain('weft@${VERSION}')`],
  // Commands.
  ['packages/create-weft/bin/create-weft.mjs', 'const usage = `Usage: create-weft [dir]', `const usage = \`Usage: npm create ${SCOPE} -- [dir]`],
  // The registry for the packed gates answers for the new scope.
  ['packages/create-weft/scripts/registry.mjs', "name.startsWith('@weft-js/compiler-') || name.startsWith('@weft-js/')", "name.startsWith('@weft-js/')", 'any'],
  // The private repo isn't a link a published package should carry.
  ['packages/weft/scripts/platform-package.mjs', "    repository: { type: 'git', url: 'git+https://github.com/Ravonus/weft.git' },\n", "    publishConfig: { access: 'public' },\n"],
  ['packages/weft/scripts/platform-package.mjs', 'weft installs it by itself', '@weft-js/core installs it by itself'],
  ['packages/weft/scripts/build-platform.mjs', `is pinned to \${version}, weft is \${pkg.version}`, `is pinned to \${version}, @weft-js/core is \${pkg.version}`, 'any'],
]

/** `import` lines a patch's new code needs. */
const imports = [
  ['packages/create-weft/src/stack.mjs', "import { readFileSync } from 'node:fs'\n"],
  ['packages/create-weft/src/index.mjs', 'VERSION'],
]

const LICENSE = `MIT License\n\nCopyright (c) 2026 weft contributors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated\ndocumentation files (the "Software"), to deal in the Software without restriction, including without limitation the\nrights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit\npersons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the\nSoftware.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE\nWARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR\nCOPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR\nOTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n`

const applyRules = (text, set) => {
  let out = text
  for (const [re, to] of set) out = out.replace(re, to)
  return out
}

/** `"bin": { "weft": … }` looks like a dependency to a text rule. */
function withoutBins(text, run) {
  const kept = []
  const hidden = text.replace(/"bin"\s*:\s*\{[^}]*\}/g, m => `\0${kept.push(m) - 1}\0`)
  return run(hidden).replace(/\0(\d+)\0/g, (_, i) => kept[i])
}

/** What 0.1.0 publishes, by directory. Everything else is renamed too, but stays `private`: add-ons that come later. */
export const PUBLIC = ['weft', 'cli', 'create-weft', 'start', 'warp-core', 'warp', 'icons', 'db']

const DESCRIPTIONS = {
  weft: 'weft: a fine-grained reactive TSX framework. Runtime, compiler binding, Vite plugin and test utilities.',
  'create-weft': 'Scaffold a weft app: npm create @weft-js',
  cli: 'The weft command: dev, build, check, the agent layer and the MCP server',
  start: 'weft Start: file routes, server functions, streaming SSR, a database and auth',
  warp: 'warp, the UI toolkit for weft: components over @weft-js/warp-core',
  'warp-core': 'warp core: tokens, CSS and framework-agnostic behaviour',
  icons: 'Icons for warp and weft',
}

const DEFAULT_FILES = ['src', 'plugin.mjs', 'plugin.d.mts', 'README.md', 'LICENSE']
/** What each package ships. A package with `src` and its plugin takes the default. */
const FILES = {
  weft: ['src', 'node', 'native/weft-compiler.wasm', 'scripts/native-stamp.cjs', 'assets.mjs', 'client.d.ts', 'compiler.cjs', 'compiler-wasm.cjs', 'media-probe.mjs', 'platforms.cjs', 'vite.mjs', 'README.md', 'LICENSE'],
  cli: ['bin', 'src', 'docs', 'ts-plugin', 'README.md', 'LICENSE'],
  'create-weft': ['bin', 'src', 'scripts/tarballs.mjs', 'README.md', 'LICENSE'],
  icons: ['src', 'plugin.mjs', 'compile.mjs', 'README.md', 'LICENSE'],
  start: ['src', 'crate', 'README.md', 'LICENSE'],
  warp: ['src', 'plugin.mjs', 'plugin.d.mts', 'tailwind.css', 'tokens', 'README.md', 'LICENSE'],
  'warp-core': ['src', 'styles', 'bindings', 'scripts/contrast-check.mjs', 'README.md', 'LICENSE'],
  text: ['dist', 'plugin', 'vendor/pretext/LICENSE', 'README.md', 'LICENSE'],
  'plugin-surface-keel': ['src', 'vendor', 'README.md', 'LICENSE'],
  pay: ['src', 'docs', 'plugin.mjs', 'plugin.d.mts', 'stripe-plugin.mjs', 'stripe-plugin.d.mts', 'README.md', 'LICENSE'],
  db: ['src', 'plugins', 'README.md', 'LICENSE'],
}

/** package-lock.json: rules for names, then the versions of our own entries. */
function lockfile(text) {
  const named = withoutBins(text, t => applyRules(t, rules))
  const lock = JSON.parse(named)
  const ours = n => n === CORE || n === CREATE || n?.startsWith(`${SCOPE}/`)
  const pinCompilers = e => { for (const k of Object.keys(e?.optionalDependencies ?? {})) if (k.startsWith(`${SCOPE}/compiler-`)) e.optionalDependencies[k] = VERSION }
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    pinCompilers(entry)
    const name = entry.name ?? path.split('node_modules/').pop()
    if (entry.link) continue
    if (ours(name) || (!path.includes('node_modules/') && path !== '' && entry.version === '0.0.0')) entry.version = VERSION
    if (path === '' && ours(lock.name)) entry.version = VERSION
    if (ours(entry.name)) delete entry.private
  }
  if (ours(lock.name)) lock.version = VERSION
  return `${JSON.stringify(lock, null, 2)}\n`
}

function pluginVersions(rel, text) {
  if (!/^packages\/[^/]+\/(plugin\.mjs|src\/index\.mjs)$/.test(rel)) return text
  return text.replace(/^(\s*)version: '0\.0\.0',$/m, `$1version: '${VERSION}',`)
}

function transform(rel, text) {
  let out = text
  if (rel.endsWith('package-lock.json')) return lockfile(out)
  if (rel.endsWith('package.json')) out = withoutBins(out, t => applyRules(t, rules))
  else out = applyRules(out, rules)
  if (DOCS.test(rel) && !HISTORY.test(rel)) out = applyRules(out, docRules)
  if (rel.startsWith('packages/')) out = applyRules(out, shippedComments)
  return pluginVersions(rel, out)
}

// ---- run ----

const missed = []
const counts = { files: 0, changed: 0 }
const files = new Map()
for (const file of walk(root)) {
  const rel = relOf(file)
  if (!TEXT.test(rel) || SKIP_PATHS.some(re => re.test(rel))) continue
  const text = readFileSync(file, 'utf8')
  if (text.includes('\0')) continue
  files.set(rel, text)
}

const out = new Map()
for (const [rel, text] of files) out.set(rel, transform(rel, text))

for (const [where, from, to, mode] of patches) {
  const targets = where === '*' ? [...out.keys()] : [where]
  let hit = false, present = false
  for (const rel of targets) {
    if (!out.has(rel)) continue
    const text = out.get(rel)
    if (mode?.startsWith('once:')) {
      if (text.includes(mode.slice(5))) { present = true; continue }
      if (text.includes(from)) { out.set(rel, text.replace(from, to)); hit = true }
      continue
    }
    if (text.includes(to)) present = true // a `to` can hold its `from`, so it comes first
    else if (text.includes(from)) { out.set(rel, text.replaceAll(from, to)); hit = true }
  }
  if (!hit && !present && mode !== 'any') missed.push(`${where}: ${from}`)
}

for (const [rel, line] of imports) {
  const text = out.get(rel)
  if (text === undefined) { missed.push(`${rel}: no file for its import`); continue }
  if (line === 'VERSION') {
    if (!/\bVERSION\b[^\n]*from '\.\/stack\.mjs'/.test(text)) {
      const next = text.replace(/import \{([^}]*)\} from '\.\/stack\.mjs'/, (m, names) => `import {${names.trimEnd().replace(/,$/, '')}, VERSION } from './stack.mjs'`)
      if (next === text) missed.push(`${rel}: no import from ./stack.mjs to add VERSION to`)
      out.set(rel, next)
    }
  } else if (!text.includes(line)) out.set(rel, text.replace(/^(\/\/[^\n]*\n)*/, m => `${m}${line}`))
}

/** The release fields. Names are done by now, so this only adds to what's there. */
for (const [rel, text] of out) {
  if (!/^packages\/[^/]+\/package\.json$/.test(rel)) continue
  const dir = rel.split('/')[1]
  const pkg = JSON.parse(text)
  pkg.version = VERSION
  if (PUBLIC.includes(dir)) delete pkg.private
  else pkg.private = true
  if (PUBLIC.includes(dir)) pkg.publishConfig = { access: 'public' }
  for (const k of Object.keys(pkg.optionalDependencies ?? {})) if (k.startsWith(`${SCOPE}/compiler-`)) pkg.optionalDependencies[k] = VERSION
  if (DESCRIPTIONS[dir]) pkg.description = DESCRIPTIONS[dir]
  pkg.engines = { node: '>=26', ...pkg.engines }
  pkg.keywords ??= ['weft']
  pkg.files = FILES[dir] ?? DEFAULT_FILES
  out.set(rel, `${JSON.stringify(pkg, null, 2)}\n`)
}

/** Each published package carries the licence and says it's early, in its README's first lines. */
const NOTE = "> **Early release (0.1.0).** APIs will change between minor versions. weft isn't on npm yet."
const extra = new Map()
for (const dir of PUBLIC) {
  const name = JSON.parse(out.get(`packages/${dir}/package.json`)).name
  const rel = `packages/${dir}/README.md`
  const before = out.get(rel) ?? (existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : `# ${name}\n\nPart of weft, a fine-grained reactive TSX framework. Start a new app with \`npm create ${SCOPE}\`.\n`)
  const after = before.includes(NOTE) ? before : before.replace(/^(# [^\n]*\n)/, `$1\n${NOTE}\n`)
  extra.set(rel, after)
  if (!existsSync(join(root, 'packages', dir, 'LICENSE'))) extra.set(`packages/${dir}/LICENSE`, LICENSE)
}
if (!existsSync(join(root, 'LICENSE'))) extra.set('LICENSE', LICENSE)

if (audit) {
  const report = (title, re, filter = () => true) => {
    const hits = []
    for (const [rel, text] of out) {
      if (rel.endsWith('package-lock.json')) continue
      text.split('\n').forEach((line, i) => { if (re.test(line) && filter(rel, line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 170)}`) })
    }
    console.log(`\n## ${title} (${hits.length})`)
    for (const h of hits) console.log(h)
  }
  report("quoted bare 'weft' in code", /(?<![\w/.:-])['"`]weft['"`]/, rel => /\.(mjs|cjs|js|jsx|ts|tsx|mts|rs)$/.test(rel))
  report('@weft/ that is not a package', /@weft\//)
  report('weft/<x> not an export (a plan, or a path)', new RegExp(`${NOT_PATH}weft/[a-z]`), rel => !HISTORY.test(rel))
  report('agorix in anything that ships', /agorix/i, rel => rel.startsWith('packages/'))
  report('create-weft, not a path or the bin', /create-weft/, rel => !HISTORY.test(rel) && !/packages\/create-weft|github\/workflows/.test(rel))
}

for (const [rel, text] of out) {
  counts.files++
  if (text === files.get(rel)) continue
  counts.changed++
  if (dry) console.log(`would change ${rel}`)
  else if (!audit) writeFileSync(join(root, rel), text)
}
for (const [rel, text] of extra) {
  const had = out.get(rel) ?? (existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : null)
  if (had === text) continue
  counts.changed++
  if (dry) console.log(`would change ${rel}`)
  else if (!audit) writeFileSync(join(root, rel), text)
}
console.log(`${dry || audit ? 'would change' : 'changed'} ${counts.changed} of ${counts.files} files`)
if (missed.length) {
  console.error(`\n${missed.length} patch(es) found neither their old nor their new text:`)
  for (const m of missed) console.error(`  ${m}`)
  process.exit(1)
}
