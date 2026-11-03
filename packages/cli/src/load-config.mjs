// Find, load and validate weft.config (TypeScript, JSON or YAML, one schema: research 34 §2). Plugins run only their pure
// `contribute()` (plugins.mjs); `slots` is data.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import nodeModule, { createRequire } from 'node:module'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { z } from 'zod'
import { diagnostic, locate } from './diag.mjs'
import { checkSite } from './site.mjs'
import { contributions } from './contributions.mjs'
import { bindSlots } from './slots.mjs'

export const configNames = ['weft.config.ts', 'weft.config.mts', 'weft.config.js', 'weft.config.mjs', 'weft.config.json', 'weft.config.yaml', 'weft.config.yml']
export const builtinNames = ['add', 'map', 'dev', 'build', 'start', 'db', 'test', 'check', 'doctor', 'fix', 'tokens', 'browser', 'mcp', 'tasks', 'run', 'create', 'docs', 'agents-md', 'plugins']

const configModule = pathToFileURL(join(fileURLToPath(new URL('.', import.meta.url)), 'config.mjs')).href
const nativeRequire = createRequire(import.meta.url)
/** Node's sync module hooks. Bun has none, and Deno's break `.node` requires, like Rolldown's; both read TypeScript without help (`importConfig`). */
const registerHooks = process.versions.bun || process.versions.deno ? null : nodeModule.registerHooks
/** `weft.config.ts.weft-load-<n>`: a fresh module id per load, so a long-lived `weft mcp` sees edits. */
const tag = /\.weft-load-\d+$/
let hooked = false

const transpile = path =>
  ts.transpileModule(readFileSync(path, 'utf8'), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText

/**
 * Sync module hooks, so loading is Node's own `require(esm)` and works inside test runners' vm contexts too.
 * `@weft-js/core/config` resolves to the project's weft when it ships one, else to ours; `.ts` is transpiled, not stripped.
 */
function hook() {
  if (hooked) return
  hooked = true
  registerHooks({
    resolve(specifier, context, next) {
      if (tag.test(specifier)) return { url: pathToFileURL(specifier).href, format: 'module', shortCircuit: true }
      if (specifier === '@weft-js/core/config' || specifier === '@weft-js/cli/config') {
        try {
          return next(specifier, context)
        } catch {
          return { url: configModule, shortCircuit: true }
        }
      }
      return next(specifier, context)
    },
    load(url, context, next) {
      if (!url.startsWith('file:')) return next(url, context)
      const path = fileURLToPath(url)
      if (tag.test(path)) {
        const real = path.replace(tag, '')
        return { format: 'module', source: /\.[mc]?ts$/.test(real) ? transpile(real) : readFileSync(real, 'utf8'), shortCircuit: true }
      }
      if (/\.[mc]?ts$/.test(path) && !path.includes('/node_modules/')) return { format: 'module', source: transpile(path), shortCircuit: true }
      return next(url, context)
    },
  })
}

/**
 * The config on Bun and Deno: their own TypeScript, with a query for a fresh module per load. When the project has no
 * `@weft-js/core/config` of its own, a copy next to the config, so its relative imports still resolve, imports ours instead.
 */
async function importConfig(file) {
  try {
    return (await import(`${pathToFileURL(file).href}?weft-load=${generation++}`)).default ?? {}
  } catch (error) {
    if (!/weft\/config|@weft-js\/cli\/config/.test(error.message)) throw error
  }
  const copy = `${file}.weft-load-${generation++}.mjs`
  writeFileSync(copy, transpile(file).replace(/(['"])(?:weft\/config|@weft-js\/cli\/config)\1/g, JSON.stringify(configModule)))
  try {
    return (await import(pathToFileURL(copy).href)).default ?? {}
  } finally {
    rmSync(copy, { force: true })
  }
}

const zodSchema = z.custom(v => v != null && typeof v === 'object' && ('_zod' in v || '~standard' in v))
const globs = z.array(z.string())

const task = z.strictObject({
  run: z.string().min(1),
  description: z.string().optional(),
  sideEffects: z.array(z.string()).optional(),
  env: z.array(z.string()).optional(),
  args: z.union([zodSchema, z.record(z.string(), z.unknown())]).optional(),
})

const pluginEntry = z.looseObject({
  name: z.string().min(1),
  version: z.string().optional(),
  provides: z.array(z.union([z.string(), z.strictObject({ slot: z.string(), key: z.string() })])).optional(),
})

const image = z.strictObject({ url: z.string().min(1), width: z.int().positive().optional(), height: z.int().positive().optional(), alt: z.string().optional() })

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: 'must be #rrggbb' })
const colors = { background: hex.optional(), text: hex.optional(), subtle: hex.optional(), accent: hex.optional() }
const cardFont = z.strictObject({ family: z.string().regex(/^[\w -]+$/, { error: 'must be a font family name' }), src: z.string().min(1), weight: z.number().optional() })
const card = z.strictObject({ ...colors, scheme: z.enum(['dark', 'light']).optional(), dark: z.strictObject(colors).optional(), light: z.strictObject(colors).optional(), fonts: z.strictObject({ display: cardFont.optional(), body: cardFont.optional() }).optional() })

const site = z.strictObject({
  headers: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  name: z.string().min(1).optional(),
  url: z.url({ protocol: /^https?$/, error: 'must be an absolute http(s) URL' }).optional(),
  title: z.string().includes('%s', { error: 'must contain `%s` (the page title)' }).optional(),
  description: z.string().optional(),
  locale: z.string().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, { error: 'must look like `en_US`' }).optional(),
  inlineCss: z.boolean().optional(),
  criticalCss: z.boolean().optional(),
  criticalKeep: z.array(z.string()).optional(),
  image: z.union([z.literal('auto'), z.literal(false), z.string().min(1), image]).optional(),
  card: card.optional(),
  head: z.string().optional(),
  twitter: z
    .strictObject({ card: z.enum(['summary', 'summary_large_image', 'app', 'player']).optional(), site: z.string().optional(), creator: z.string().optional() })
    .optional(),
})

export const configSchema = z.strictObject({
  scope: z.strictObject({ write: globs.optional(), read: globs.optional(), forbid: globs.optional() }).optional(),
  tasks: z.record(z.string(), task).optional(),
  environments: z.record(z.string(), z.looseObject({ url: z.string().optional() })).optional(),
  test: z
    .strictObject({
      include: globs.optional(),
      lanes: z.array(z.enum(['fast', 'browser', 'e2e'])).optional(),
      gate: z.strictObject({ mutationBudgetSec: z.number().positive().optional(), maxMutants: z.number().int().positive().optional() }).optional(),
    })
    .optional(),
  check: z.strictObject({ include: globs.optional(), exclude: globs.optional(), design: z.boolean().optional(), routes: z.boolean().optional(), props: z.union([z.boolean(), z.literal('manual')]).optional() }).optional(),
  plugins: z.array(pluginEntry).optional(),
  slots: z.record(z.string(), z.union([z.string(), z.record(z.string(), z.string())])).optional(),
  site: site.optional(),
  runtime: z.enum(['node', 'bun', 'deno']).optional(),
  hydration: z.enum(['lazy', 'partial', 'full']).optional(),
  rust: z.strictObject({
    unions: z.literal('allow').optional(),
    services: z.record(z.string(), z.strictObject({ crate: z.string().optional(), external: z.boolean().optional(), wasm: z.literal(false).optional() })).optional(),
  }).optional(),
  /** Named targets for a query's `live: { verify: 'staging' }`. `db` is an env var's name. */
  live: z.strictObject({
    targets: z.record(z.string(), z.strictObject({ url: z.string().optional(), db: z.string().optional(), production: z.boolean().optional() })).optional(),
  }).optional(),
  trust: z.enum(['enforce', 'warn']).optional(),
})

/** What a JSON or YAML file may hold: data, so a plugin is `name` or `[name, options]`. Also the editor schema. */
const dataSchema = configSchema.extend({
  $schema: z.string().optional(),
  plugins: z.array(z.union([z.string(), z.tuple([z.string(), z.unknown()]), pluginEntry])).optional(),
})

export const isDataConfig = file => /\.(json|ya?ml)$/.test(file)

const configFiles = root => configNames.map(name => join(root, name)).filter(existsSync)

export function findConfig(root) {
  return configFiles(root)[0] ?? null
}

/** The schema `$schema` points at, for completion in `weft.config.json` and `.yaml`. */
export function writeConfigSchema(root) {
  mkdirSync(join(root, '.weft'), { recursive: true })
  writeFileSync(join(root, '.weft', 'config.schema.json'), `${JSON.stringify(z.toJSONSchema(dataSchema, { unrepresentable: 'any' }), null, 2)}\n`)
}

/** `@weft-js/text` → `text`, `@weft-js/db/plugin-native` → `native`: the name a plugin's named export goes by. */
export const pluginName = pkg => pkg.replace(/^@[^/]+\/(?:[^/]+\/)?/, '').replace(/^plugin-/, '').replace(/[^a-zA-Z0-9]+(.)?/g, (_, c = '') => c.toUpperCase())

/** A plugin module's factory, and its import name: the default, or a named export (`surface-keel` may export `keel`). */
export function pluginFactory(mod, pkg) {
  if (typeof mod.default === 'function') return { value: mod.default, name: pluginName(pkg), named: false }
  const name = [pluginName(pkg), pkg.split('-').at(-1)].find(n => typeof mod[n] === 'function')
  return name ? { value: mod[name], name, named: true } : null
}

/** A data plugin from the project's own install: `<name>/plugin` when the package has one, else its main entry. */
function loadPlugin(root, entry) {
  if (typeof entry !== 'string' && !Array.isArray(entry)) return entry
  const [name, options] = [entry].flat()
  const require = createRequire(join(root, 'package.json'))
  for (const spec of [`${name}/plugin`, name]) {
    let path
    try {
      path = require.resolve(spec)
    } catch {
      continue
    }
    const factory = pluginFactory(nativeRequire(path), name)
    if (!factory) throw new Error(`plugin \`${name}\` exports no factory to call`)
    return factory.value(options)
  }
  throw new Error(`plugin \`${name}\` isn't installed`)
}

/** A JSON or YAML config as what a `.ts` one evaluates to. */
function readDataConfig(root, file, text) {
  const data = file.endsWith('.json') ? JSON.parse(text) : nativeRequire('yaml').parse(text)
  const { $schema: _schema, ...config } = data ?? {}
  if (Array.isArray(config.plugins)) config.plugins = config.plugins.map(p => loadPlugin(root, p))
  return config
}

let generation = 0

/**
 * @param {string} root project root
 * @returns {Promise<{ file: string | null, config: import('./config').WeftConfig, diagnostics: object[], slots: object, contributions: ReturnType<typeof contributions> }>}
 */
export async function loadConfig(root) {
  const file = findConfig(root)
  const diagnostics = []
  const rel = file ? relative(root, file).split('\\').join('/') : 'weft.config.ts'
  const text = file ? readFileSync(file, 'utf8') : ''
  const report = (code, why, near, extra) => diagnostics.push(diagnostic({ code, file: rel, why, ...locate(text, near), ...extra }))
  const others = configFiles(root).slice(1).map(f => relative(root, f))
  if (others.length) report('P010', `\`${rel}\` is the config in use, and \`${others.join('`, `')}\` would be ignored.`, null)

  let config = {}
  if (file) {
    if (registerHooks) hook()
    try {
      config = isDataConfig(file) ? readDataConfig(root, file, text) : registerHooks ? (nativeRequire(`${file}.weft-load-${generation++}`).default ?? {}) : await importConfig(file)
    } catch (error) {
      // A plugin factory rejecting its options throws while the config module evaluates (@weft-js/core/plugin).
      if (error?.code === 'P115') report('P115', error.message.split('\n')[0], error.message.match(/^`([^`]+)`/)?.[1] ?? null)
      else report('P007', `weft.config could not be loaded: ${error.message.split('\n')[0]}`, null)
      return { file, config: {}, diagnostics, slots: bindSlots({}, () => {}), contributions: [] }
    }
    const parsed = configSchema.safeParse(config)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.')
        report('P007', `\`${path || '(root)'}\`: ${issue.message}`, String(issue.path.at(-1) ?? ''), { help: 'Fix the key at the path shown (see `weft docs config`).' })
      }
      return { file, config, diagnostics, slots: bindSlots({}, () => {}), contributions: [] }
    }
  }

  const tasks = config.tasks ?? {}
  const commands = new Map()
  for (const [name, t] of Object.entries(tasks)) {
    if (builtinNames.includes(name)) report('P003', `Task \`${name}\` has the same name as the built-in \`weft ${name}\`.`, name)
    const twin = commands.get(t.run.trim())
    if (twin) report('P003', `Task \`${name}\` runs the same command as \`${twin}\` (\`${t.run}\`).`, name)
    else commands.set(t.run.trim(), name)
    const missing = [!t.description?.trim() && '`description`', !t.sideEffects && '`sideEffects`'].filter(Boolean)
    if (missing.length) report('P004', `Task \`${name}\` has no ${missing.join(' or ')}.`, name)
    for (const env of t.env ?? []) {
      if (config.environments && !(env in config.environments)) report('P007', `Task \`${name}\` allows environment \`${env}\`, which \`environments\` does not define.`, name)
    }
  }

  const seen = new Set()
  for (const p of config.plugins ?? []) {
    if (seen.has(p.name)) report('P116', `Plugin \`${p.name}\` is listed twice in \`plugins\`.`, p.name)
    seen.add(p.name)
  }
  const unique = (config.plugins ?? []).filter((p, i, all) => all.findIndex(q => q.name === p.name) === i)
  const contributed = contributions(unique, report, { root })
  const slots = bindSlots({ ...config, plugins: unique }, report)
  if (config.site) checkSite(config.site, report)
  return { file, config, diagnostics, slots, contributions: contributed }
}
