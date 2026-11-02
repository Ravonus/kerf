// `weft add`: what the wizard offers, on an app that already exists (research 34 §7). It installs a plugin and adds it to
// the config, whichever format that is. It only ever inserts, and stops rather than guess at a config it can't read.

import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { addRust } from './add-rust.mjs'
import { writeAgentsMd } from './agents-md.mjs'
import { findConfig, loadConfig, pluginFactory, pluginName } from './load-config.mjs'
import { sync } from './plugins.mjs'
import { cssEntry, packages, viteConfig } from './tailwind.mjs'
import { database } from './map.mjs'
import { dbLayer } from './db-layer.mjs'
import { packageOf, trustStatus } from './trust.mjs'

const usageError = message => Object.assign(new Error(message), { code: 'E_USAGE' })
const refused = message => Object.assign(new Error(message), { code: 'E_ADD' })

const ALIASES = { warp: '@weft-js/warp', icons: '@weft-js/warp-icons', text: '@weft-js/text', media: '@weft-js/plugin-media', 'media-ffmpeg': '@weft-js/plugin-media-ffmpeg', 'surface-keel': '@weft-js/plugin-surface-keel', redis: '@weft-js/realtime-redis', nats: '@weft-js/realtime-nats', pay: '@weft-js/pay', 'pay-stripe': '@weft-js/pay/stripe' }

/** Add-ons that aren't on npm yet. A checkout's tarballs still reach them: `local.mjs` pins each with an override. */
const UNPUBLISHED = new Set(['@weft-js/text', '@weft-js/pay', '@weft-js/plugin-media', '@weft-js/plugin-media-ffmpeg', '@weft-js/plugin-surface-keel', '@weft-js/multiplayer', '@weft-js/realtime-durable-object', '@weft-js/realtime-livekit', '@weft-js/realtime-nats', '@weft-js/realtime-redis', '@weft-js/realtime-socketio', '@weft-js/realtime-webrtc'])

const INSTALL = { 'pnpm-lock.yaml': ['pnpm', 'add'], 'bun.lock': ['bun', 'add'], 'yarn.lock': ['yarn', 'add'], 'deno.lock': ['deno', 'add'], 'package-lock.json': ['npm', 'install'] }

function installer(root) {
  const lock = Object.keys(INSTALL).find(f => existsSync(join(root, f)))
  return INSTALL[lock] ?? (process.versions.deno ? INSTALL['deno.lock'] : process.versions.bun ? INSTALL['bun.lock'] : INSTALL['package-lock.json'])
}

/** What to install: for an app on local tarballs (`local.mjs`) those go straight in `package.json`, since npm refuses any
 *  spec for them that isn't spelled exactly as their override is. */
export function pinned(root, specs) {
  const file = join(root, 'package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  const local = {}
  const rest = specs.filter(spec => {
    const name = spec.replace(/(?<=.)@.*$/, '')
    const override = pkg.overrides?.[name]
    if (typeof override !== 'string' || !override.startsWith('file:')) return true
    local[name] = override
    return false
  })
  if (Object.keys(local).length) writeFileSync(file, JSON.stringify({ ...pkg, dependencies: { ...pkg.dependencies, ...local } }, null, 2))
  return rest
}

/** Is `name` pinned to a local tarball in this app (`local.mjs`, the packed gates)? */
function localOverride(root, name) {
  const file = join(root, 'package.json')
  const override = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).overrides?.[name] : undefined
  return typeof override === 'string' && override.startsWith('file:')
}

function installSpecs(root, manager, verb, specs) {
  const rest = pinned(root, specs)
  execFileSync(manager, [verb, ...(manager === 'deno' ? rest.map(spec => `npm:${spec}`) : rest)], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' }) // npm is npm.cmd there
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

/** The config names the package already (imported or listed), which a read can tell without loading it. */
const names = (text, pkg) => new RegExp(`['"]${pkg.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(/[\\w-]+)?['"]`).test(text)

const VITE = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs']

/** The app's Vite config with Tailwind in it. Stops rather than guess at one it can't place the plugin in. */
function viteWithTailwind(file, text) {
  if (text.includes('@tailwindcss/vite')) return text
  if (!/plugins:\s*\[/.test(text)) throw refused(`${file} has no \`plugins: [\` to add Tailwind to. Add \`tailwindcss()\` from @tailwindcss/vite there, then run this again. Nothing was changed.`)
  return `import tailwindcss from '@tailwindcss/vite'\n${text.replace(/plugins:\s*\[/, '$&tailwindcss(), ')}`
}

/** Tailwind's packages, the Vite plugin, and the top of src/app.css, imported first by the root layout. */
function addTailwind(root, { dryRun, install }) {
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
    if (!dryRun) installSpecs(root, manager, verb, specs)
  }
  const warp = '@weft-js/warp' in { ...pkg.dependencies, ...pkg.devDependencies }
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
const LAYER_PLUGIN = { prisma: '@weft-js/db/plugin-prisma', native: '@weft-js/db/plugin-native' }

/** A database on an app that has none: the wiring a scaffold writes, with no todo app. Never touches what's there. */
async function addDb(root, engine = 'sqlite', { layer = 'drizzle', dryRun, install }) {
  if (!ENGINES.includes(engine)) throw usageError(`weft add db takes ${ENGINES.join(', ')}, not \`${engine}\``)
  if (!['drizzle', ...Object.keys(LAYER_PLUGIN)].includes(layer)) throw usageError(`--layer takes drizzle, prisma or native, not \`${layer}\``)
  if (await dbLayer(root)) throw refused('This app already has a database. Changing engine or layer changes your queries, so it\'s yours to do. Nothing was changed.')
  const { stackDeps, stackFiles } = await import('@weft-js/create/stack')
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
    if (!dryRun) installSpecs(root, manager, verb, specs)
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

/** Better Auth on an app with a database. Its tables go beside yours, and your own routes stay as they are. */
async function addAuth(root, { dryRun, install }) {
  const layer = await dbLayer(root)
  if (!layer) throw refused('Better Auth keeps users in a database: run `weft add db` first. Nothing was changed.')
  if (existsSync(join(root, 'src/auth.server.ts'))) throw refused('src/auth.server.ts already exists, so this app has an auth provider. Nothing was changed.')
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const db = database(root, layer).engine
  const ui = '@weft-js/warp' in { ...pkg.dependencies, ...pkg.devDependencies } ? 'warp' : 'none'
  const { authFiles, stackDeps } = await import('@weft-js/create/stack')
  const { files, context, tables } = authFiles({ db, layer: layer.layer, ui })
  const contextFile = join(root, 'src/context.server.ts')
  if (existsSync(contextFile) && !/export default \(\) => \(\{ db \}\)/.test(readFileSync(contextFile, 'utf8'))) throw refused('src/context.server.ts has been changed. Spread `session(auth, request)` from @weft-js/start/auth into it, then run this again. Nothing was changed.')
  const taken = Object.keys(files).filter(f => existsSync(join(root, f)))
  if (taken.length) throw refused(`${taken.join(', ')} already exist. Nothing was changed.`)
  const envModule = join(root, 'src/env.server.ts')
  const envText = existsSync(envModule) ? readFileSync(envModule, 'utf8') : ''
  if (!envText.includes('BETTER_AUTH_SECRET') && !/server: \{\n/.test(envText)) throw refused('src/env.server.ts has no `server: {` block to add BETTER_AUTH_SECRET to. Nothing was changed.')

  const actions = []
  const [manager, verb] = installer(root)
  const wanted = stackDeps({ db, layer: layer.layer, auth: true }).deps
  const specs = Object.entries(wanted).filter(([name]) => !(name in (pkg.dependencies ?? {}))).map(([n, v]) => `${n}@${v}`)
  if (install && specs.length) {
    actions.push(`install ${specs.join(' ')} with ${manager}`)
    if (!dryRun) installSpecs(root, manager, verb, specs)
  }
  const edits = { ...files, 'src/context.server.ts': context }
  if (!envText.includes('BETTER_AUTH_SECRET')) edits['src/env.server.ts'] = envText.replace('server: {\n', 'server: {\n    BETTER_AUTH_SECRET: z.string().min(32),\n')
  if (layer.layer === 'drizzle') {
    edits['src/db/auth.schema.ts'] = tables
    edits['src/db/schema.ts'] = `${readFileSync(join(root, 'src/db/schema.ts'), 'utf8').trimEnd()}\n\nexport * from './auth.schema'\n`
  } else if (layer.layer === 'prisma') {
    edits['prisma/schema.prisma'] = `${readFileSync(join(root, 'prisma/schema.prisma'), 'utf8').trimEnd()}\n${tables}`
  } else {
    const next = existsSync(join(root, 'migrations')) ? readdirSync(join(root, 'migrations')).filter(f => f.endsWith('.sql')).length : 0
    edits[`migrations/${String(next).padStart(4, '0')}_auth.sql`] = tables
  }
  actions.push(...Object.keys(edits).map(f => `write ${f}`))
  if (!dryRun) {
    for (const [file, text] of Object.entries(edits)) {
      mkdirSync(dirname(join(root, file)), { recursive: true })
      writeFileSync(join(root, file), text)
    }
    const env = join(root, '.env')
    if (!(existsSync(env) && readFileSync(env, 'utf8').includes('BETTER_AUTH_SECRET'))) writeFileSync(env, `${existsSync(env) ? `${readFileSync(env, 'utf8').trimEnd()}\n` : ''}BETTER_AUTH_SECRET=${randomBytes(32).toString('base64')}\nBETTER_AUTH_URL=http://localhost:5173\n`)
  }
  actions.push('add BETTER_AUTH_SECRET to .env', ...(layer.schema ? ['next: `weft db generate`'] : []), 'next: `weft db migrate`', "next: add `auth: 'user'` to what needs a user, and link to /login")
  return { ok: true, package: `Better Auth on ${layer.layer}`, actions, ...(dryRun && { dryRun: true }) }
}

/** The plugin's `setup`, once the package is installed: a plain import, since the package can't run anything by being read. */
async function setupOf(root, pkg) {
  let path
  try {
    path = createRequire(join(root, 'package.json')).resolve(`${pkg}/plugin`)
  } catch {
    return undefined // no plugin entry, or a dry run before the install
  }
  const mod = await import(pathToFileURL(path).href)
  const make = mod.default ?? Object.values(mod).find(v => typeof v === 'function')
  return make?.().contribute({ command: 'check', mode: 'development', root }).setup
}

/** What `setup` wants, checked in full before anything is written, so a refusal changes nothing. */
async function planSetup(root, setup) {
  const layer = await dbLayer(root)
  if (setup.needs?.includes('db') && !layer) throw refused('This needs a database: run `weft add db` first. Nothing was changed.')
  if (setup.needs?.includes('auth') && !existsSync(join(root, 'src/auth.server.ts'))) throw refused('This needs users: run `weft add auth` first. Nothing was changed.')
  const read = rel => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : undefined)
  let plan
  try {
    plan = setup.run({ engine: layer ? database(root, layer).engine : null, layer: layer?.layer ?? null, read })
  } catch (error) {
    throw refused(`${error.message}. Nothing was changed.`)
  }
  const taken = Object.keys(plan.files ?? {}).filter(f => existsSync(join(root, f)))
  if (taken.length) throw refused(`${taken.join(', ')} already exist. Nothing was changed.`)
  return plan
}

function applySetup(root, plan) {
  for (const [file, text] of Object.entries({ ...plan.files, ...plan.edits })) {
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), text)
  }
  for (const name of ['.env', '.env.example']) {
    const file = join(root, name)
    const had = existsSync(file) ? readFileSync(file, 'utf8') : ''
    const lines = Object.entries(plan.env ?? {}).filter(([k]) => !had.includes(`${k}=`)).map(([k, v]) => `${k}=${v}\n`)
    if (lines.length) writeFileSync(file, `${had && `${had.trimEnd()}\n`}${lines.join('')}`)
  }
}

const setupActions = plan => [...Object.keys({ ...plan.files, ...plan.edits }).map(f => `write ${f}`), ...(plan.env ? [`add ${Object.keys(plan.env).join(', ')} to .env and .env.example`] : []), ...(plan.next ?? []).map(n => `next: ${n}`)]

export async function addCommand(root, feature, { dryRun = false, install = true, engine, layer, remote = false } = {}) {
  root = resolve(root)
  if (!feature) throw usageError(`weft add needs a feature: db, auth, tailwind, rust, ${Object.keys(ALIASES).join(', ')}, or a package name`)
  if (feature === 'rust') {
    const [manager, verb] = installer(root)
    return addRust(root, engine, { remote, dryRun, install, installSpecs: specs => installSpecs(root, manager, verb, specs) })
  }
  if (feature === 'tailwind') return addTailwind(root, { dryRun, install })
  if (feature === 'db') return addDb(root, engine, { layer, dryRun, install })
  if (feature === 'auth') return addAuth(root, { dryRun, install })
  const pkg = ALIASES[feature] ?? (UNPUBLISHED.has(`@weft-js/${feature}`) ? `@weft-js/${feature}` : feature)
  const file = findConfig(root) ?? join(root, 'weft.config.ts')
  const config = relative(root, file)
  const text = existsSync(file) ? readFileSync(file, 'utf8') : "import { defineConfig } from '@weft-js/core/config'\n\nexport default defineConfig({})\n"
  const named = names(text, pkg)
  // A config can name a package that isn't installed yet, and importing it then would leave this process's module
  // resolver sure the package has no `exports`, so the load after the install would fail too. Load it once it's there.
  const present = existsSync(join(root, 'node_modules', packageOf(pkg), 'package.json'))
  if (present && (named || listed((await loadConfig(root)).config, pkg))) return { ok: true, already: true, package: pkg, config, actions: [] }

  const home = packageOf(pkg)
  if (install && !present && UNPUBLISHED.has(home) && !localOverride(root, home)) throw refused(`${home} isn't on npm yet: this release of weft ships the core packages, and this add-on comes later. Nothing was changed.`)

  const actions = []
  const [manager, verb] = installer(root)
  if (install) {
    actions.push(`install ${home} with ${manager}`)
    if (!dryRun) installSpecs(root, manager, verb, [home])
  }
  const setup = await setupOf(root, pkg)
  const plan = setup && await planSetup(root, setup)
  const next = named ? text : /\.(json|ya?ml)$/.test(file) ? addToData(file, text, pkg) : addToTs(root, file, text, pkg)
  if (!named) actions.push(`add ${pkg} to ${config}`)
  if (dryRun) return { ok: true, package: pkg, config, actions: [...actions, ...(plan ? setupActions(plan) : [])], dryRun: true }

  writeFileSync(file, next)
  const after = await loadConfig(root)
  const failed = after.diagnostics.filter(d => d.severity === 'error')
  if (failed.length) {
    writeFileSync(file, text)
    throw refused(`${config} doesn't load with ${pkg} in it${install ? ', though the package installed' : ''}, so it's back as it was: ${failed[0].code} ${failed[0].why}`)
  }
  sync(root, after)
  actions.push('regenerate .weft/slots')
  if (plan) {
    for (const other of setup.with ?? []) actions.push(...(await addCommand(root, other, { install })).actions)
    applySetup(root, plan)
    actions.push(...setupActions(plan))
  }
  // Never approved here: installing a plugin isn't having read what it asks for.
  const trust = trustStatus(root, after).plugins.find(p => p.name === pkg)
  if (existsSync(join(root, 'AGENTS.md'))) {
    await writeAgentsMd(root)
    actions.push('regenerate AGENTS.md')
  }
  actions.push(...(after.contributions?.find(c => c.name === pkg)?.manifest?.notes ?? []))
  if (trust?.blocked) actions.push(`${pkg} asks for ${[...trust.added, ...trust.hidden.map(n => `${n} (undeclared)`)].join(', ') || 'a code change'}; \`weft check\` stops until you run \`weft plugins approve ${pkg}\``)
  return { ok: true, package: pkg, config, actions, ...(trust?.blocked && { approve: { added: trust.added, undeclared: trust.hidden } }) }
}
