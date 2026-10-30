// `weft add`: what the wizard offers, on an app that already exists (research 34 §7). It installs a plugin and adds it to
// the config, whichever format that is. It only ever inserts, and stops rather than guess at a config it can't read.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { writeAgentsMd } from './agents-md.mjs'
import { findConfig, loadConfig, pluginFactory, pluginName } from './load-config.mjs'
import { sync } from './plugins.mjs'
import { cssEntry, packages, viteConfig } from './tailwind.mjs'
import { dbLayer } from './start.mjs'

const usageError = message => Object.assign(new Error(message), { code: 'E_USAGE' })
const refused = message => Object.assign(new Error(message), { code: 'E_ADD' })

const ALIASES = { warp: '@weft/warp', text: '@weft/plugin-text', media: '@weft/plugin-media', 'surface-keel': '@weft/plugin-surface-keel' }
/** Features 3x hasn't built: an honest answer beats treating them as a package name. */
const COMING = { auth: 'auth providers (slice D)' }

const INSTALL = { 'pnpm-lock.yaml': ['pnpm', 'add'], 'bun.lock': ['bun', 'add'], 'yarn.lock': ['yarn', 'add'], 'package-lock.json': ['npm', 'install'] }

function installer(root) {
  const lock = Object.keys(INSTALL).find(f => existsSync(join(root, f)))
  return INSTALL[lock] ?? INSTALL['package-lock.json']
}

/** The import to write: `<pkg>/plugin` when the package has one, and however it exports its factory. */
function pluginImport(root, pkg) {
  const require = createRequire(join(root, 'package.json'))
  const name = pluginName(pkg)
  for (const spec of [`${pkg}/plugin`, pkg]) {
    let path
    try {
      path = require.resolve(spec)
    } catch {
      continue
    }
    const factory = pluginFactory(createRequire(import.meta.url)(path), pkg)
    if (!factory) throw refused(`${spec} exports no plugin factory to call, so nothing was changed.`)
    return { name: factory.name, line: `import ${factory.named ? `{ ${factory.name} }` : factory.name} from '${spec}'` }
  }
  return { name, line: `import ${name} from '${pkg}'` } // not installed yet: only a dry run gets this far
}

/** The object literal `export default` gives, directly or through `defineConfig(…)`. */
function configObject(sf) {
  for (const st of sf.statements) {
    if (!ts.isExportAssignment(st)) continue
    const value = ts.isCallExpression(st.expression) ? st.expression.arguments[0] : st.expression
    if (value && ts.isObjectLiteralExpression(value)) return value
  }
  return null
}

function addToTs(root, file, text, pkg) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const object = configObject(sf)
  if (!object) throw refused(`${file} doesn't export a plain object, so \`weft add\` can't edit it. Add \`${pkg}\` to \`plugins\` by hand.`)
  const { name, line } = pluginImport(root, pkg)
  const prop = object.properties.find(p => p.name?.getText(sf) === 'plugins')
  if (prop && !(ts.isPropertyAssignment(prop) && ts.isArrayLiteralExpression(prop.initializer))) throw refused(`\`plugins\` in ${file} isn't a plain array, so \`weft add\` can't edit it. Add \`${pkg}\` by hand.`)
  const edits = []
  const imports = sf.statements.filter(ts.isImportDeclaration)
  const after = imports.at(-1)?.end ?? 0
  edits.push([after, `${imports.length ? '\n' : ''}${line}${imports.length ? '' : '\n'}`])
  if (prop) {
    const list = prop.initializer
    const last = list.elements.at(-1)
    edits.push(last ? [last.end, `, ${name}()`] : [list.getStart(sf) + 1, `${name}()`])
  } else {
    const last = object.properties.at(-1)
    edits.push(last ? [object.properties.end, `${object.properties.hasTrailingComma ? '' : ','}\n  plugins: [${name}()],`] : [object.getStart(sf) + 1, `\n  plugins: [${name}()],\n`])
  }
  return edits.toSorted((a, b) => b[0] - a[0]).reduce((t, [at, insert]) => t.slice(0, at) + insert + t.slice(at), text)
}

function addToData(file, text, pkg) {
  if (file.endsWith('.json')) {
    const data = JSON.parse(text)
    data.plugins = [...(data.plugins ?? []), pkg]
    return `${JSON.stringify(data, null, 2)}\n`
  }
  const { parseDocument } = createRequire(import.meta.url)('yaml')
  const doc = parseDocument(text)
  if (doc.has('plugins')) doc.addIn(['plugins'], pkg)
  else doc.set('plugins', [pkg])
  return doc.toString()
}

const listed = (config, pkg) => (config.plugins ?? []).some(p => p.name === pkg)

const VITE = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs']

/** The app's Vite config with Tailwind in it. Stops rather than guess at one it can't place the plugin in. */
function viteWithTailwind(file, text) {
  if (text.includes('@tailwindcss/vite')) return text
  if (!/plugins:\s*\[/.test(text)) throw refused(`${file} has no \`plugins: [\` to add Tailwind to. Add \`tailwindcss()\` from @tailwindcss/vite there, then run this again. Nothing was changed.`)
  return `import tailwindcss from '@tailwindcss/vite'\n${text.replace(/plugins:\s*\[/, '$&tailwindcss(), ')}`
}

/** Tailwind's packages, the Vite plugin, and the top of src/app.css, imported first by the root layout. */
async function addTailwind(root, { dryRun, install }) {
  if (!existsSync(join(root, 'package.json'))) throw refused('`weft add tailwind` needs a package.json. Nothing was changed.')
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const cssFile = join(root, 'src/app.css')
  const css = existsSync(cssFile) ? readFileSync(cssFile, 'utf8') : ''
  const viteName = VITE.find(f => existsSync(join(root, f)))
  const vite = viteName ? viteWithTailwind(viteName, readFileSync(join(root, viteName), 'utf8')) : viteConfig
  const layoutFile = join(root, 'src/routes/_layout.tsx')
  const layout = existsSync(layoutFile) ? readFileSync(layoutFile, 'utf8') : null
  const has = /['"]tailwindcss['"]|tailwindcss\/utilities/.test(css)
  if (has && pkg.dependencies?.tailwindcss) return { ok: true, already: true, package: 'tailwindcss', actions: [] }

  const actions = []
  const [manager, verb] = installer(root)
  const specs = Object.entries(packages).map(([name, version]) => `${name}@${version}`)
  if (install) {
    actions.push(`install ${specs.join(' ')} with ${manager}`)
    if (!dryRun) execFileSync(manager, [verb, ...specs], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
  }
  const warp = '@weft/warp' in { ...pkg.dependencies, ...pkg.devDependencies }
  const edits = [[join(root, viteName ?? 'vite.config.ts'), vite], ...(has ? [] : [[cssFile, `${cssEntry(warp)}${css && '\n'}${css}`]])]
  actions.push(`add Tailwind to ${viteName ?? 'vite.config.ts'}`, ...(has ? [] : [`add Tailwind to src/app.css${warp ? ' (without its reset, which would override warp)' : ''}`]))
  if (layout === null) actions.push('import src/app.css from your root layout: there is no src/routes/_layout.tsx')
  else if (!/['"][^'"]*app\.css['"]/.test(layout)) {
    edits.push([layoutFile, `import '../app.css'\n${layout}`])
    actions.push('import src/app.css first in src/routes/_layout.tsx')
  }
  if (dryRun) return { ok: true, package: 'tailwindcss', actions, dryRun: true }
  mkdirSync(join(root, 'src'), { recursive: true })
  for (const [file, text] of edits) writeFileSync(file, text)
  return { ok: true, package: 'tailwindcss', actions }
}

const ENGINES = ['sqlite', 'postgres', 'mysql']
const LAYER_PLUGIN = { prisma: '@weft/plugin-db-prisma', native: '@weft/plugin-db-native' }

/** A database on an app that has none: the wiring a scaffold writes, with no todo app. Never touches what's there. */
async function addDb(root, engine = 'sqlite', { layer = 'drizzle', dryRun, install }) {
  if (!ENGINES.includes(engine)) throw usageError(`weft add db takes ${ENGINES.join(', ')}, not \`${engine}\``)
  if (!['drizzle', ...Object.keys(LAYER_PLUGIN)].includes(layer)) throw usageError(`--layer takes drizzle, prisma or native, not \`${layer}\``)
  if (await dbLayer(root)) throw refused('This app already has a database. Changing engine or layer changes your queries, so it\'s yours to do. Nothing was changed.')
  const { stackDeps, stackFiles } = await import('create-weft/stack')
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const name = String(pkg.name ?? 'app').replace(/^@.*\//, '')
  const files = stackFiles({ db: engine, layer, auth: false, name, secret: '' })
  delete files['src/routes/todos/index.tsx']
  delete files['src/server/todos.ts']
  const taken = Object.keys(files).filter(f => f !== '.env' && f !== '.env.example' && existsSync(join(root, f)))
  if (taken.length) throw refused(`${taken.join(', ')} already exist, so this can't add a database without overwriting them. Nothing was changed.`)

  const { deps, dev } = stackDeps({ db: engine, layer, auth: false })
  const actions = []
  const [manager, verb] = installer(root)
  if (install) {
    const specs = Object.entries({ ...deps, ...dev }).map(([n, v]) => `${n}@${v}`)
    actions.push(`install ${specs.join(' ')} with ${manager}`)
    if (!dryRun) execFileSync(manager, [verb, ...specs], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
  }
  actions.push(...Object.keys(files).map(f => `write ${f}`))
  if (dryRun) return { ok: true, package: `${layer} on ${engine}`, actions, dryRun: true }
  for (const [file, text] of Object.entries(files)) {
    const path = join(root, file)
    mkdirSync(dirname(path), { recursive: true })
    if (file.startsWith('.env') && existsSync(path)) writeFileSync(path, `${readFileSync(path, 'utf8').trimEnd()}\n${text}`)
    else writeFileSync(path, text)
  }
  if (LAYER_PLUGIN[layer]) actions.push(...(await addCommand(root, LAYER_PLUGIN[layer], { install: false })).actions)
  actions.push('next: `weft db generate`')
  return { ok: true, package: `${layer} on ${engine}`, actions }
}

export async function addCommand(root, feature, { dryRun = false, install = true, engine, layer } = {}) {
  root = resolve(root)
  if (!feature) throw usageError(`weft add needs a feature: db, tailwind, ${Object.keys(ALIASES).join(', ')}, or a package name`)
  if (COMING[feature]) throw refused(`\`weft add ${feature}\` isn't built yet: ${COMING[feature]}. Nothing was changed.`)
  if (feature === 'tailwind') return addTailwind(root, { dryRun, install })
  if (feature === 'db') return addDb(root, engine, { layer, dryRun, install })
  const pkg = ALIASES[feature] ?? feature
  const before = await loadConfig(root)
  const file = findConfig(root) ?? join(root, 'weft.config.ts')
  const config = relative(root, file)
  if (listed(before.config, pkg)) return { ok: true, already: true, package: pkg, config, actions: [] }

  const actions = []
  const [manager, verb] = installer(root)
  if (install) {
    actions.push(`install ${pkg} with ${manager}`)
    if (!dryRun) execFileSync(manager, [verb, pkg], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
  }
  const text = existsSync(file) ? readFileSync(file, 'utf8') : "import { defineConfig } from 'weft/config'\n\nexport default defineConfig({})\n"
  const next = /\.(json|ya?ml)$/.test(file) ? addToData(file, text, pkg) : addToTs(root, file, text, pkg)
  actions.push(`add ${pkg} to ${config}`)
  if (dryRun) return { ok: true, package: pkg, config, actions, dryRun: true }

  writeFileSync(file, next)
  const after = await loadConfig(root)
  const failed = after.diagnostics.filter(d => d.severity === 'error')
  if (failed.length) {
    writeFileSync(file, text)
    throw refused(`${pkg} didn't load, so ${config} is back as it was: ${failed[0].code} ${failed[0].why}`)
  }
  sync(root, after)
  actions.push('regenerate .weft/slots')
  if (existsSync(join(root, 'AGENTS.md'))) {
    await writeAgentsMd(root)
    actions.push('regenerate AGENTS.md')
  }
  return { ok: true, package: pkg, config, actions }
}
