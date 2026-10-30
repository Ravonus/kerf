// `weft dev`, `weft build` and `weft routes` for an app with src/routes: they run @weft/start (research 25 §6–7).
// @weft/start resolves from the app first (its own version), then from this workspace.

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { diagnostic, locate } from './diag.mjs'
import { loadConfig } from './load-config.mjs'
import { sync } from './plugins.mjs'

async function start(root, sub) {
  let file
  try {
    file = createRequire(join(root, 'package.json')).resolve(`@weft/start/${sub}`)
  } catch {
    const sibling = new URL(`../../start/src/${sub}.mjs`, import.meta.url)
    if (!existsSync(sibling)) throw Object.assign(new Error('@weft/start is not installed in this project'), { code: 'E_USAGE' })
    file = sibling
  }
  return import(typeof file === 'string' ? pathToFileURL(file).href : file.href)
}

/** The config's `site` (metadata defaults), and the config diagnostics. Slot files are synced first, so weft/vite
 * finds the build-side providers (`.weft/slots/<id>.build.json`, research 26 §3.1). */
async function site(root) {
  const loaded = await loadConfig(root)
  if (!loaded.diagnostics.some(d => d.code === 'P007') && loaded.config?.plugins?.length) sync(root, loaded)
  return { site: loaded.config?.site ?? {}, diagnostics: loaded.diagnostics }
}

/** `runtime` in weft.config.ts or `--runtime`, as a Nitro preset (research 28 §5). */
export const PRESETS = { node: 'node', bun: 'bun', deno: 'deno_server' }

export async function devCommand(root, { port } = {}) {
  // Production takes the host's environment; dev takes `.env`. What's already set wins.
  if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))
  const { dev } = await start(root, 'app')
  const server = await dev({ root, ...(await site(root)), port })
  return server
}

export async function buildCommand(root, { preset, runtime } = {}) {
  const { build } = await start(root, 'app')
  const { writeContract } = await start(root, 'contract')
  const t = performance.now()
  const config = await site(root)
  const chosen = runtime ?? (await loadConfig(root)).config?.runtime ?? 'node'
  if (!preset && !PRESETS[chosen]) throw Object.assign(new Error(`unknown runtime "${chosen}": use ${Object.keys(PRESETS).join(', ')}`), { code: 'E_USAGE' })
  preset ??= PRESETS[chosen]
  // A build holds no secrets: an app's env check stands down, and server modules load without a database.
  const held = process.env.WEFT_BUILD
  process.env.WEFT_BUILD = '1'
  try {
    const { output } = await build({ root, ...config, preset, logLevel: 'warn' })
    const contract = await writeContract({ root, site: config.site })
    return { ok: true, preset, output, contract: contract.path, functions: contract.functions, diagnostics: contract.diagnostics.map(d => diagnostic({ ...d, file: '.weft/contract.json' })), ms: Math.round(performance.now() - t) }
  } finally {
    if (held === undefined) delete process.env.WEFT_BUILD
    else process.env.WEFT_BUILD = held
  }
}

/** The built server's command for each runtime: `.env` for a local run, the host's environment otherwise. */
const SERVERS = { node: ['node', ['--disable-warning=ExperimentalWarning']], bun: ['bun', ['run']], deno: ['deno', ['run', '-A']] }

/** `weft start`: run `.output/` on the runtime it was built for. Resolves with the exit code. */
export async function startCommand(root, { runtime } = {}) {
  const chosen = runtime ?? (await loadConfig(root)).config?.runtime ?? 'node'
  if (!SERVERS[chosen]) throw Object.assign(new Error(`unknown runtime "${chosen}": use ${Object.keys(SERVERS).join(', ')}`), { code: 'E_USAGE' })
  if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))
  const [cmd, flags] = SERVERS[chosen]
  const child = spawn(cmd, [...flags, join('.output', 'server', 'index.mjs')], { cwd: root, stdio: 'inherit' })
  process.once('SIGINT', () => child.kill('SIGINT'))
  return new Promise(ok => child.on('close', code => ok(code ?? 0)))
}

/** The hash `weft db generate` records and Q015 compares. */
export const schemaHash = text => createHash('sha256').update(text).digest('hex').slice(0, 16)

/** `weft db generate`: drizzle-kit's diff of the schema into `drizzle/`, on Node like all of dev (research 28 §2). */
export function dbCommand(root, sub) {
  if (sub !== 'generate') throw Object.assign(new Error(`weft db ${sub ?? ''}: use generate (new migrations apply on the next request)`), { code: 'E_USAGE' })
  let bin
  try {
    const req = createRequire(join(root, 'package.json'))
    bin = join(dirname(req.resolve('drizzle-kit')), 'bin.cjs')
  } catch {
    throw Object.assign(new Error('drizzle-kit is not installed in this project'), { code: 'E_USAGE' })
  }
  const r = spawnSync(process.execPath, [bin, 'generate'], { cwd: root, encoding: 'utf8' })
  if (r.status !== 0) throw Object.assign(new Error(`drizzle-kit generate failed:\n${r.stdout}${r.stderr}`), { code: 'E_INTERNAL' })
  const schema = join(root, 'src', 'db', 'schema.ts')
  if (existsSync(schema)) writeFileSync(join(root, 'drizzle', '.schema-hash'), schemaHash(readFileSync(schema)) + '\n')
  return { ok: true, output: r.stdout.trim() }
}

/** Every route's merged metadata, tags and card mode (`--meta`), or just the route table. */
export async function routesCommand(root, { meta, preset } = {}) {
  const config = await site(root)
  if (meta) {
    const { routesMeta } = await start(root, 'inspect')
    const result = await routesMeta({ root, site: config.site, preset })
    const text = f => { try { return readFileSync(join(root, f), 'utf8') } catch { return '' } }
    const own = result.diagnostics.map(({ code, severity, file, route, why }) =>
      ({ ...diagnostic({ code, severity, file, why, ...locate(text(file), 'meta') }), route }))
    return { ...result, diagnostics: [...config.diagnostics, ...own] }
  }
  const { scanRoutes, filePath } = await start(root, 'routes')
  const manifest = scanRoutes(root)
  return {
    version: 1, ok: true, problems: manifest.problems,
    routes: manifest.routes.map(r => ({ path: r.kind === 'page' ? filePath(manifest, r) : r.kind, kind: r.kind, file: r.file, layouts: r.layouts, params: r.params, card: r.card ?? null })),
    diagnostics: config.diagnostics,
  }
}
