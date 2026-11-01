// `weft dev`, `weft build` and `weft routes` for an app with src/routes: they run @weft/start (research 25 §6–7).
// @weft/start resolves from the app first (its own version), then from this workspace.

import { writeMap } from './map.mjs'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { diagnostic, locate } from './diag.mjs'
import { loadConfig } from './load-config.mjs'
import { sync } from './plugins.mjs'
import { requireTrust } from './trust.mjs'

export async function start(root, sub) {
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
  // A build on a config that doesn't load would quietly drop every plugin: fonts, tokens and slots.
  const bad = loaded.diagnostics.find(d => d.code === 'P007')
  if (bad) throw Object.assign(new Error(`P007: ${bad.message ?? bad.why}`), { code: 'E_USAGE' })
  return { site: loaded.config?.site ?? {}, hydration: loaded.config?.hydration, diagnostics: loaded.diagnostics }
}

/** `runtime` in weft.config.ts or `--runtime`, as a Nitro preset (research 28 §5). */
export const PRESETS = { node: 'node', bun: 'bun', deno: 'deno_server' }

export async function devCommand(root, { port } = {}) {
  // Production takes the host's environment; dev takes `.env`. What's already set wins.
  if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))
  requireTrust(root, await loadConfig(root))
  const { dev } = await start(root, 'app')
  await writeMap(root)
  const config = await site(root)
  const rust = (await loadConfig(root)).config?.rust
  const { devSidecars, usesRemote } = await start(root, 'sidecar')
  // Before the dev server: its worker inherits the addresses, and a request can't reach a sidecar that's still building.
  const sidecars = usesRemote(root) ? await devSidecars({ root, site: config.site, rust }) : undefined
  const server = await dev({ root, ...config, port })
  if (sidecars) {
    sidecars.attach(server)
    const close = server.close.bind(server)
    server.close = async () => (await sidecars.close(), close())
  }
  return server
}

export async function buildCommand(root, { preset, runtime } = {}) {
  requireTrust(root, await loadConfig(root))
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
    const rust = (await loadConfig(root)).config?.rust
    const refuse = d => { throw Object.assign(new Error(`${d.code}: ${d.why}${d.rendered ? `\n${d.rendered}` : ''}`), { code: /^R0[12]\d$/.test(d.code) ? 'E_LIVE' : 'E_USAGE' }) }
    // What the preset can't do fails now, not after a build: a verify runs at the end, against a target that's up.
    const { readLivePlan } = await start(root, 'contract')
    const plan = await readLivePlan({ root, site: config.site, preset, live: (await loadConfig(root)).config?.live, verify: false })
    const unlive = plan.diagnostics.find(d => d.severity === 'error')
    if (unlive) refuse(unlive)
    const { buildSidecars, shipSidecars, startSidecars, usesRemote } = await start(root, 'sidecar')
    const contracted = () => writeContract({ root, site: config.site, preset, rust })
    let warned = []
    // Sidecars first: prerendering a share card runs its route's `load`, which may read one.
    const running = usesRemote(root) ? await contracted().then(async c => {
      const stop = c.diagnostics.find(d => d.severity === 'error')
      if (stop) refuse(stop)
      const built = await buildSidecars({ root, contract: c.contract, rust, preset })
      const failed = built.diagnostics.find(d => d.severity === 'error')
      if (failed) refuse(failed)
      warned = built.diagnostics
      return startSidecars({ root, built: true, log: () => {} })
    }) : undefined
    const before = { ...process.env }
    Object.assign(process.env, running?.env)
    let output
    try {
      ({ output } = await build({ root, ...config, preset, logLevel: 'warn' }))
    } finally {
      running?.close()
      for (const k of Object.keys(running?.env ?? {})) before[k] === undefined ? delete process.env[k] : (process.env[k] = before[k])
    }
    const contract = await writeContract({ root, site: config.site, preset, rust, live: (await loadConfig(root)).config?.live, verify: true })
    const refused = contract.diagnostics.find(d => d.severity === 'error')
    if (refused) refuse(refused)
    if (running) shipSidecars(root)
    await writeMap(root)
    return { ok: true, preset, output, contract: contract.path, functions: contract.functions, diagnostics: [...contract.diagnostics, ...warned].map(d => diagnostic({ file: '.weft/contract.json', ...d })), ms: Math.round(performance.now() - t) }
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
  // Sidecars first: the server's environment has their addresses, and they outlive a crash of either side.
  const { startSidecars } = await start(root, 'sidecar')
  const sidecars = await startSidecars({ root })
  const child = spawn(cmd, [...flags, join('.output', 'server', 'index.mjs')], { cwd: root, stdio: 'inherit', env: { ...process.env, ...sidecars.env } })
  process.once('SIGINT', () => child.kill('SIGINT'))
  process.once('SIGTERM', () => child.kill('SIGTERM'))
  return new Promise(ok => child.on('close', code => (sidecars.close(), ok(code ?? 0))))
}

/** The hash `weft db generate` records and Q015 compares. */
export const schemaHash = text => createHash('sha256').update(text).digest('hex').slice(0, 16)

/** The app's data layer: the plugin that declares one, or Drizzle, which is built in. Null with no database. */
export async function dbLayer(root, loaded) {
  const { contributions = [] } = loaded ?? await loadConfig(root)
  const plugin = contributions.find(c => c.manifest.db)?.manifest.db
  if (plugin) return plugin
  // Drizzle has no plugin to say so: its config file, or a client from `@weft/start/db/*`, does.
  const entry = join(root, 'src/db/index.server.ts')
  return existsSync(join(root, 'drizzle.config.ts')) || (existsSync(entry) && readFileSync(entry, 'utf8').includes('@weft/start/db/')) ? DRIZZLE : null
}

const DRIZZLE = {
  layer: 'drizzle',
  schema: 'src/db/schema.ts',
  migrations: 'drizzle',
  generate(root) {
    let bin
    try {
      const req = createRequire(join(root, 'package.json'))
      bin = join(dirname(req.resolve('drizzle-kit')), 'bin.cjs')
    } catch {
      throw Object.assign(new Error('drizzle-kit is not installed in this project'), { code: 'E_USAGE' })
    }
    const r = spawnSync(process.execPath, [bin, 'generate'], { cwd: root, encoding: 'utf8' })
    if (r.status !== 0) throw Object.assign(new Error(`drizzle-kit generate failed:\n${r.stdout}${r.stderr}`), { code: 'E_INTERNAL' })
    return r.stdout.trim()
  },
}

/** `weft db generate [name]`: the data layer's migration, on Node like all of dev (research 28 §2, 34 §4). */
export async function dbCommand(root, sub, name) {
  if (sub === 'live') return dbLive(root)
  if (sub === 'listen') return dbListen(root)
  if (sub !== 'generate') throw Object.assign(new Error(`weft db ${sub ?? ''}: use generate (new migrations apply on the next request), live or listen`), { code: 'E_USAGE' })
  const layer = await dbLayer(root)
  if (!layer) throw Object.assign(new Error('this app has no database: `weft add db` adds one'), { code: 'E_USAGE' })
  const output = layer.generate(root, name)
  const schema = layer.schema && join(root, layer.schema)
  if (schema && existsSync(schema)) writeFileSync(join(root, layer.migrations, '.schema-hash'), schemaHash(readFileSync(schema)) + '\n')
  return { ok: true, output }
}

/** `weft db live`: a migration that adds change triggers to the tables in `changes` (Postgres, SQLite, MySQL). */
async function dbLive(root) {
  const held = process.env.WEFT_BUILD
  process.env.WEFT_BUILD = '1'
  const config = await site(root)
  const { withRealtime } = await start(root, 'contract')
  const { changeSql } = await start(root, 'changes-sql')
  let sql, tables
  try {
    ({ sql, tables } = await withRealtime({ root, site: config.site }, async ({ changes }) => {
      if (!changes?.defs) throw Object.assign(new Error('`src/realtime.server.ts` has no `changes: dbChanges(db, [tables])`'), { code: 'E_USAGE' })
      const defs = await changes.defs()
      return { sql: changeSql(changes.dialect, defs), tables: defs.map(t => t.name) }
    }))
  } finally {
    if (held === undefined) delete process.env.WEFT_BUILD
    else process.env.WEFT_BUILD = held
  }
  const layer = await dbLayer(root)
  if (layer?.layer !== 'drizzle') return { ok: true, output: `${sql}\n-- add this to a migration of your data layer` }
  const req = createRequire(join(root, 'package.json'))
  const bin = join(dirname(req.resolve('drizzle-kit')), 'bin.cjs')
  const r = spawnSync(process.execPath, [bin, 'generate', '--custom', '--name=weft_live'], { cwd: root, encoding: 'utf8' })
  if (r.status !== 0) throw Object.assign(new Error(`drizzle-kit generate failed:\n${r.stdout}${r.stderr}`), { code: 'E_INTERNAL' })
  const { entries } = JSON.parse(readFileSync(join(root, layer.migrations, 'meta', '_journal.json'), 'utf8'))
  const file = join(layer.migrations, `${entries.at(-1).tag}.sql`)
  writeFileSync(join(root, file), sql)
  return { ok: true, output: `${file}: change triggers for ${tables.join(', ')}. They apply on the next request.` }
}

/** `weft db listen`: the change feed as its own process, for an app on functions. Runs until SIGINT or SIGTERM. */
async function dbListen(root) {
  if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))
  const config = await site(root)
  const { withRealtime } = await start(root, 'contract')
  const { listen } = await start(root, 'listen')
  await withRealtime({ root, site: config.site }, async ({ changes, bus }) => {
    if (!changes) throw Object.assign(new Error('`src/realtime.server.ts` has no `changes`'), { code: 'E_USAGE' })
    const stop = await listen({ changes, bus: bus ?? { name: 'memory' } })
    await new Promise(ok => { process.once('SIGINT', ok); process.once('SIGTERM', ok) })
    await stop()
  })
  return { ok: true, output: 'weft db listen: stopped' }
}

/** `weft doctor`: what live data does on this deploy target, and what to do about what it can't. */
export async function doctorCommand(root, { preset, runtime } = {}) {
  const config = await site(root)
  const chosen = runtime ?? (await loadConfig(root)).config?.runtime ?? 'node'
  const held = process.env.WEFT_BUILD
  process.env.WEFT_BUILD = '1'
  try {
    const { readLivePlan } = await start(root, 'contract')
    const plan = await readLivePlan({ root, site: config.site, preset: preset ?? PRESETS[chosen], live: (await loadConfig(root)).config?.live, verify: false })
    return { ...plan, diagnostics: plan.diagnostics.map(d => diagnostic({ file: 'src/realtime.server.ts', ...d })) }
  } finally {
    if (held === undefined) delete process.env.WEFT_BUILD
    else process.env.WEFT_BUILD = held
  }
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
