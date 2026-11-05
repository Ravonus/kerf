// `weft dev`, `weft build` and `weft routes` for an app with src/routes: they run @weft-js/start (research 25 §6–7).
// @weft-js/start resolves from the app first (its own version), then from this workspace.

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { dbLayer } from './db-layer.mjs'
import { diagnostic } from './diag.mjs'
import { routeDiagnostics } from './start/routes.mjs'
import { finishBuild, startBuildSidecars, buildPreset } from './start/build.mjs'
import { writeMap } from './map.mjs'

import { loadConfig } from './load-config.mjs'
import { sync } from './plugins.mjs'
import { requireTrust } from './trust.mjs'
import { attachProps } from './props-listener.mjs'

export { routeDiagnostics } from './start/routes.mjs'

export async function start(root, sub) {
  let file
  try {
    file = createRequire(join(root, 'package.json')).resolve(`@weft-js/start/${sub}`)
  } catch {
    const sibling = new URL(`../../start/src/${sub}.mjs`, import.meta.url)
    if (!existsSync(sibling))
      throw Object.assign(new Error('@weft-js/start is not installed in this project'), {
        code: 'E_USAGE',
      })
    file = sibling
  }
  return import(typeof file === 'string' ? pathToFileURL(file).href : file.href)
}

/** The config's `site` (metadata defaults), and the config diagnostics. Slot files are synced first, so @weft-js/core/vite
 * finds the build-side providers (`.weft/slots/<id>.build.json`, research 26 §3.1). */
async function site(root) {
  const loaded = await loadConfig(root)
  if (!loaded.diagnostics.some((d) => d.code === 'P007') && loaded.config?.plugins?.length)
    sync(root, loaded)
  // A build on a config that doesn't load would quietly drop every plugin: fonts, tokens and slots.
  const bad = loaded.diagnostics.find((d) => d.code === 'P007')
  if (bad) throw Object.assign(new Error(`P007: ${bad.message ?? bad.why}`), { code: 'E_REFUSED' }) // the config's fault, not the command's
  return {
    site: siteOf(loaded),
    hydration: loaded.config?.hydration,
    diagnostics: loaded.diagnostics,
  }
}

/** `site` with what plugins know about the app's look (`card` in a manifest): warp's colours, the text plugin's faces. */
export function siteOf(loaded) {
  const base = loaded.config?.site ?? {}
  const given = (loaded.contributions ?? []).map((c) => c.manifest.card).filter(Boolean)
  if (!given.length) return base
  const card = Object.assign({}, ...given)
  return { ...base, card: { ...card, ...base.card, fonts: { ...card.fonts, ...base.card?.fonts } } }
}

/** `runtime` in weft.config.ts or `--runtime`, as a Nitro preset (research 28 §5). */
export const PRESETS = { node: 'node', bun: 'bun', deno: 'deno_server' }
/** With no `runtime` in the config, the one running this: a machine may have only that one. */
export const hostRuntime = () =>
  process.versions.deno ? 'deno' : process.versions.bun ? 'bun' : 'node'

/** `.env` under what's already set. Not `process.loadEnvFile`: on Deno the file wins. */
function loadEnv(root) {
  const file = join(root, '.env')
  if (existsSync(file))
    for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8'))))
      process.env[key] ??= value
}

export async function devCommand(root, { port } = {}) {
  // Production takes the host's environment; dev takes `.env`. What's already set wins.
  loadEnv(root)
  requireTrust(root, await loadConfig(root))
  const { dev } = await start(root, 'app')
  await writeMap(root)
  const config = await site(root)
  const rust = (await loadConfig(root)).config?.rust
  const { devSidecars, usesRemote } = await start(root, 'sidecar')
  // Before the dev server: its worker inherits the addresses, and a request can't reach a sidecar that's still building.
  const sidecars = usesRemote(root)
    ? await devSidecars({ root, site: config.site, rust })
    : undefined
  const server = await dev({ root, ...config, port })
  if (server.watcher) server.weftProps = attachProps(server, root, (await loadConfig(root)).config)
  if (sidecars) {
    sidecars.attach(server)
    const close = server.close.bind(server)
    server.close = async () => (await sidecars.close(), close())
  }
  return server
}

/**
 * `--unsafe-allow` and `build.unsafeAllow`: codes (or a family, `L`, or `all`) a build reports and goes on past instead
 * of failing on. For forcing a deploy you have looked at; each one it lets through is listed, as a warning, every build.
 */
export function unsafeAllowed(flag, config) {
  const reasons = config?.build?.unsafeAllow ?? {}
  const codes = [...String(flag ?? '').split(','), ...Object.keys(reasons)]
    .map((c) => c.trim())
    .filter(Boolean)
  const allows = (d) =>
    codes.some((c) => c === 'all' || c === d.code || (/^[A-Z]$/.test(c) && d.code.startsWith(c)))
  const reason = (d) =>
    reasons[d.code] ?? reasons[d.code[0]] ?? reasons.all ?? (flag ? '--unsafe-allow' : '')
  return {
    allows,
    let: (d) => ({
      ...d,
      severity: 'warning',
      why: `UNSAFE, let through (${reason(d)}): ${d.why}`,
    }),
  }
}

export async function buildCommand(root, { preset, runtime, unsafeAllow } = {}) {
  const loaded = await loadConfig(root)
  requireTrust(root, loaded)
  // A plugin that refused its options contributed nothing: its look or data would go missing from a build that succeeds.
  const declined = loaded.diagnostics.find((d) => d.severity === 'error' && d.owner !== 'core')
  if (declined)
    throw Object.assign(new Error(`${declined.code}: ${declined.why}`), { code: 'E_USAGE' })
  const unsafe = unsafeAllowed(unsafeAllow, loaded.config)
  const forced = []
  const { build } = await start(root, 'app')
  const { writeContract } = await start(root, 'contract')
  const t = performance.now()
  const config = await site(root)
  preset = await buildPreset(root, { preset, runtime, hostRuntime, PRESETS })
  // A build holds no secrets: an app's env check stands down, and server modules load without a database.
  const held = process.env.WEFT_BUILD
  process.env.WEFT_BUILD = '1'
  try {
    const rust = (await loadConfig(root)).config?.rust
    const refuse = (d) => {
      if (unsafe.allows(d)) return void forced.push(unsafe.let(d))
      // a finding, not a misuse: exit 1 with the fix and the way past it, never the usage text
      throw Object.assign(
        new Error(
          `${d.code}: ${d.why}${d.rendered ? `\n${d.rendered}` : ''}\nTo build anyway: --unsafe-allow ${d.code}, or build.unsafeAllow in weft.config.ts with why.`,
        ),
        { code: 'E_REFUSED' },
      )
    }
    // What the preset can't do fails now, not after a build: a verify runs at the end, against a target that's up.
    const { readLivePlan } = await start(root, 'contract')
    const plan = await readLivePlan({
      root,
      site: config.site,
      preset,
      live: (await loadConfig(root)).config?.live,
      verify: false,
    })
    const unlive = plan.diagnostics.find((d) => d.severity === 'error')
    if (unlive) refuse(unlive)
    const { running, warned, shipSidecars } = await startBuildSidecars({
      start,
      root,
      config,
      preset,
      rust,
      refuse,
      writeContract,
    })
    const before = { ...process.env }
    Object.assign(process.env, running?.env)
    let output
    try {
      ;({ output } = await build({ root, ...config, preset, logLevel: 'warn' }))
    } finally {
      running?.close()
      for (const k of Object.keys(running?.env ?? {}))
        before[k] === undefined ? delete process.env[k] : (process.env[k] = before[k])
    }
    return await finishBuild({
      root,
      config,
      preset,
      rust,
      refuse,
      running,
      shipSidecars,
      output,
      warned,
      unsafe,
      forced,
      loaded,
      t,
      writeContract,
    })
  } finally {
    if (held === undefined) delete process.env.WEFT_BUILD
    else process.env.WEFT_BUILD = held
  }
}

/** The built server's command for each runtime: `.env` for a local run, the host's environment otherwise. */
const SERVERS = {
  node: ['node', ['--disable-warning=ExperimentalWarning']],
  bun: ['bun', ['run']],
  deno: ['deno', ['run', '-A']],
}

/** `weft start`: run `.output/` on the runtime it was built for. Resolves with the exit code. */
export async function startCommand(root, { runtime } = {}) {
  const chosen = runtime ?? (await loadConfig(root)).config?.runtime ?? hostRuntime()
  if (!SERVERS[chosen])
    throw Object.assign(
      new Error(`unknown runtime "${chosen}": use ${Object.keys(SERVERS).join(', ')}`),
      { code: 'E_USAGE' },
    )
  loadEnv(root)
  const [cmd, flags] = SERVERS[chosen]
  // Sidecars first: the server's environment has their addresses, and they outlive a crash of either side.
  const { startSidecars } = await start(root, 'sidecar')
  const sidecars = await startSidecars({ root })
  // The running binary when it can be: Deno on Windows doesn't find itself on PATH.
  const child = spawn(
    chosen === hostRuntime() ? process.execPath : cmd,
    [...flags, join('.output', 'server', 'index.mjs')],
    { cwd: root, stdio: 'inherit', env: { ...process.env, ...sidecars.env } },
  )
  process.once('SIGINT', () => child.kill('SIGINT'))
  process.once('SIGTERM', () => child.kill('SIGTERM'))
  return new Promise((ok) => {
    child.on('close', (code) => {
      sidecars.close()
      ok(code ?? 0)
    })
  })
}

/** The hash `weft db generate` records and Q015 compares. */
export const schemaHash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16)

/** What `weft db` takes. There's no `migrate`: new migrations apply on the next request. */
export const DB_COMMANDS = ['generate', 'live', 'listen']

/** `weft db generate [name]`: the data layer's migration, on Node like all of dev (research 28 §2, 34 §4). */
export async function dbCommand(root, sub, name) {
  if (!DB_COMMANDS.includes(sub))
    throw Object.assign(
      new Error(
        `weft db ${sub ?? ''}: use generate (new migrations apply on the next request), live or listen`,
      ),
      { code: 'E_USAGE' },
    )
  if (sub === 'live') return dbLive(root)
  if (sub === 'listen') return dbListen(root)
  const layer = await dbLayer(root)
  if (!layer)
    throw Object.assign(new Error('this app has no database: `weft add db` adds one'), {
      code: 'E_USAGE',
    })
  const output = layer.generate(root, name)
  const schema = layer.schema && join(root, layer.schema)
  if (schema && existsSync(schema))
    writeFileSync(
      join(root, layer.migrations, '.schema-hash'),
      schemaHash(readFileSync(schema)) + '\n',
    )
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
    ;({ sql, tables } = await withRealtime({ root, site: config.site }, async ({ changes }) => {
      if (!changes?.defs)
        throw Object.assign(
          new Error('`src/realtime.server.ts` has no `changes: dbChanges(db, [tables])`'),
          { code: 'E_USAGE' },
        )
      const defs = await changes.defs()
      return { sql: changeSql(changes.dialect, defs), tables: defs.map((t) => t.name) }
    }))
  } finally {
    if (held === undefined) delete process.env.WEFT_BUILD
    else process.env.WEFT_BUILD = held
  }
  const layer = await dbLayer(root)
  if (layer?.layer !== 'drizzle')
    return { ok: true, output: `${sql}\n-- add this to a migration of your data layer` }
  const req = createRequire(join(root, 'package.json'))
  const bin = join(dirname(req.resolve('drizzle-kit')), 'bin.cjs')
  const r = spawnSync(process.execPath, [bin, 'generate', '--custom', '--name=weft_live'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (r.status !== 0)
    throw Object.assign(new Error(`drizzle-kit generate failed:\n${r.stdout}${r.stderr}`), {
      code: 'E_INTERNAL',
    })
  const { entries } = JSON.parse(
    readFileSync(join(root, layer.migrations, 'meta', '_journal.json'), 'utf8'),
  )
  const file = join(layer.migrations, `${entries.at(-1).tag}.sql`)
  writeFileSync(join(root, file), sql)
  return {
    ok: true,
    output: `${file}: change triggers for ${tables.join(', ')}. They apply on the next request.`,
  }
}

/** `weft db listen`: the change feed as its own process, for an app on functions. Runs until SIGINT or SIGTERM. */
async function dbListen(root) {
  if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))
  const config = await site(root)
  const { withRealtime } = await start(root, 'contract')
  await withRealtime({ root, site: config.site }, async ({ changes, bus }, server) => {
    if (!changes)
      throw Object.assign(new Error('`src/realtime.server.ts` has no `changes`'), {
        code: 'E_USAGE',
      })
    const { listen } = await server.ssrLoadModule('@weft-js/start/listen')
    const stop = await listen({ changes, bus: bus ?? { name: 'memory' } })
    await new Promise((ok) => {
      process.once('SIGINT', ok)
      process.once('SIGTERM', ok)
    })
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
    const plan = await readLivePlan({
      root,
      site: config.site,
      preset: preset ?? PRESETS[chosen],
      live: (await loadConfig(root)).config?.live,
      verify: false,
    })
    return {
      ...plan,
      diagnostics: plan.diagnostics.map((d) =>
        diagnostic({ file: 'src/realtime.server.ts', ...d }),
      ),
    }
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
    return {
      ...result,
      diagnostics: [...config.diagnostics, ...routeDiagnostics(root, result.diagnostics)],
    }
  }
  const { scanRoutes, filePath } = await start(root, 'routes')
  const manifest = scanRoutes(root)
  return {
    version: 1,
    ok: true,
    problems: manifest.problems,
    routes: manifest.routes.map((r) => ({
      path: r.kind === 'page' ? filePath(manifest, r) : r.kind,
      kind: r.kind,
      file: r.file,
      layouts: r.layouts,
      params: r.params,
      card: r.card ?? null,
    })),
    diagnostics: config.diagnostics,
  }
}
