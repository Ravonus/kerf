// Find, load and validate weft.config.ts. Plugins run only their pure `contribute()` (plugins.mjs); `slots` is data.

import { existsSync, readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { z } from 'zod'
import { diagnostic, locate } from './diag.mjs'
import { checkSite } from './site.mjs'
import { contributions } from './plugins.mjs'
import { bindSlots } from './slots.mjs'

export const configNames = ['weft.config.ts', 'weft.config.mts', 'weft.config.js', 'weft.config.mjs']
export const builtinNames = ['dev', 'build', 'test', 'check', 'fix', 'browser', 'mcp', 'tasks', 'run', 'create', 'docs', 'agents-md', 'plugins']

const configModule = pathToFileURL(join(fileURLToPath(new URL('.', import.meta.url)), 'config.mjs')).href
const nativeRequire = createRequire(import.meta.url)
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
 * `weft/config` resolves to the project's weft when it ships one, else to ours; `.ts` is transpiled, not stripped.
 */
function hook() {
  if (hooked) return
  hooked = true
  registerHooks({
    resolve(specifier, context, next) {
      if (tag.test(specifier)) return { url: pathToFileURL(specifier).href, format: 'module', shortCircuit: true }
      if (specifier === 'weft/config' || specifier === '@weft/cli/config') {
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

const site = z.strictObject({
  name: z.string().min(1).optional(),
  url: z.url({ protocol: /^https?$/, error: 'must be an absolute http(s) URL' }).optional(),
  title: z.string().includes('%s', { error: 'must contain `%s` (the page title)' }).optional(),
  description: z.string().optional(),
  locale: z.string().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, { error: 'must look like `en_US`' }).optional(),
  image: z.union([z.literal('auto'), z.string().min(1), image]).optional(),
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
  check: z.strictObject({ include: globs.optional(), exclude: globs.optional() }).optional(),
  plugins: z.array(pluginEntry).optional(),
  slots: z.record(z.string(), z.union([z.string(), z.record(z.string(), z.string())])).optional(),
  site: site.optional(),
})

export function findConfig(root) {
  for (const name of configNames) if (existsSync(join(root, name))) return join(root, name)
  return null
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

  let config = {}
  if (file) {
    hook()
    try {
      const mod = nativeRequire(`${file}.weft-load-${generation++}`)
      config = mod.default ?? {}
    } catch (error) {
      // A plugin factory rejecting its options throws while the config module evaluates (weft/plugin).
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
