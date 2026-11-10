// `.weft/contract.json` (PLAN §4.1, research 28 §4): every query and mutation as JSON Schema, with tags, cache and auth
// scope. `weft build` writes it; the OpenAPI export, the MCP server and Rust codegen read it. The server modules are
// loaded through Vite, never run: creating a database client connects to nothing.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'
import weft from '@weft-js/core/vite'
import {
  holdsSockets,
  literalSecrets,
  liveTarget,
  livePlan,
  refusal,
  resolveTarget,
  scanRequired,
} from './live-target.mjs'
import { readMigrations } from './migrations.mjs'
import { shapeTree } from './shape.mjs'
import { describe } from './contract/describe.mjs'
import weftStart, { startDir } from './vite.mjs'

export { describe }

const NO_FILES = /^(cloudflare|vercel[-_]edge|netlify[-_]edge|deno[-_]deploy|bunny|fastly)/
/** Presets that run where they were built, so the addon from this machine is the right one. */
const LOCAL = /^(node|bun|deno[-_]server)/

/** R104 for a build: `native()` on a preset that has no way to run it. */
export function nativeProblem({ service, preset, wasm }) {
  if (preset && NO_FILES.test(preset))
    return `\`native('${service}')\` can't load on the \`${preset}\` preset: it has no file system, so neither an addon nor a \`.wasm\` file reaches it. Use \`remote('rust://${service}')\`, which is the same crate behind \`weft::router\``
  if (wasm === false && preset && !LOCAL.test(preset))
    return `\`native('${service}')\` has no WASM, and an addon built here may not fit the \`${preset}\` preset's machines. Drop \`wasm: false\` from \`rust.services.${service}\`, or use \`remote()\``
}

/** Presets that run many instances: a process-local bus reaches a fraction of the clients (R002). */
const MULTI =
  /^(vercel|netlify|aws[-_]|azure|cloudflare|firebase|deno[-_]deploy|digitalocean|render|koyeb|zeabur)/

const usesLive = (root) => {
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).some((d) => {
      const f = join(dir, d.name)
      return d.isDirectory()
        ? walk(f)
        : /\.[cm]?[jt]sx?$/.test(d.name) && /[\w)\]]\.live\(/.test(readFileSync(f, 'utf8'))
    })
  return existsSync(join(root, 'src')) && walk(join(root, 'src'))
}

/**
 * R002 for one build: `bus` is the configured bus's name.
 * @returns {string | undefined} the message when this build would drop messages
 */
export const busProblem = ({ preset, bus, streams, root }) =>
  bus === 'durable-object' && preset !== 'cloudflare_durable'
    ? `\`durableObjectBus\` holds a socket open, and on the \`${preset}\` preset that socket dies with the request that opened it: use the \`cloudflare_durable\` preset`
    : bus === 'memory' && MULTI.test(preset ?? '') && (streams || usesLive(root))
      ? `the \`${preset}\` preset runs many instances, and the memory bus only reaches clients on its own: pokes and messages would be lost`
      : undefined

/** What this deploy gets from live data, with the config loaded. R018 is a table `changes` lists and no migration covers. */
function planOf({ root, preset, realtime }) {
  const source = realtime?.changes
  const plan = livePlan({
    preset,
    source: source && { name: source.name, external: source.external, tables: source.tables },
    required: scanRequired(root),
  })
  if (source?.dialect) {
    const sql = readMigrations(root)
      .map((m) => m.sql)
      .join('\n')
    const missing = source.tables.filter(
      (t) =>
        !new RegExp(
          `weft_changes_(${t.replace(/\W/g, '_')}_)?upd\\b[^;]*["\`\\s]${t}["\`\\s]`,
        ).test(sql),
    )
    if (missing.length)
      plan.diagnostics.push({
        code: 'R018',
        severity: 'warning',
        why: `no migration adds change triggers to ${missing.map((t) => `\`${t}\``).join(', ')}: run \`weft db live\`. Until then the server falls back to polling.`,
      })
  }
  return plan
}

const verifiedFile = (root) => join(root, '.weft', 'verify.json')
const readVerified = (root) => {
  try {
    return JSON.parse(readFileSync(verifiedFile(root), 'utf8'))
  } catch {
    return {}
  }
}

/**
 * Every query's `live.verify`, run. `strict` is a build: a target that isn't reachable from here fails it, where a
 * check warns and goes on. A pass is kept by the query's contract entry and target, so an unchanged query runs once.
 * @returns {Promise<{ diagnostics: any[], verified: any[] }>}
 */
async function verifyAll({ root, fns, realtime, server, live, strict }) {
  const diagnostics = [],
    verified = []
  for (const hit of literalSecrets(root))
    diagnostics.push({
      code: 'R020',
      severity: 'error',
      file: hit.file,
      why: `${hit.file}:${hit.line} has a connection string with a password in it: it would be committed. Read it from the environment: \`verify: { db: process.env.STAGING_DATABASE_URL }\`, or \`db: 'STAGING_DATABASE_URL'\` in a target.`,
    })
  const queries = [...fns.values()].filter((f) => f.kind === 'query' && f.def.live?.verify)
  if (!queries.length) return { diagnostics, verified }
  const { roundTrip } = await server.ssrLoadModule(join(startDir, 'verify.ts'))
  const cache = readVerified(root)
  const contract = describe(fns).functions
  const { env } = process
  for (const f of queries) {
    const name = f.$id.replace(/\..*$/, '')
    const v = f.def.live.verify
    const options = typeof v === 'object' ? v : {}
    const target = resolveTarget(v, { targets: live?.targets, env })
    if (target.missing) {
      diagnostics.push({
        code: 'R021',
        severity: strict ? 'error' : 'warning',
        why: `\`${name}\` can't be verified on this machine: ${target.missing}${strict ? ' A build needs it, because the query declares it.' : ' Skipped.'}`,
      })
      continue
    }
    const stop = refusal(target, { targets: live?.targets })
    if (stop) {
      diagnostics.push({ code: 'R022', severity: 'error', why: `\`${name}\`: ${stop}.` })
      continue
    }
    const key = createHash('sha256')
      .update(
        JSON.stringify([
          contract.find((c) => c.id === f.$id),
          realtime?.changes?.tables,
          target.name,
          target.url ?? '',
          !!target.db,
        ]),
      )
      .digest('hex')
      .slice(0, 16)
    if (cache[f.$id]?.key === key && !env.WEFT_VERIFY_FRESH) {
      verified.push({ name, cached: true, ...cache[f.$id].result })
      continue
    }
    const result = await roundTrip({
      fn: f,
      source: realtime?.changes,
      url: target.url,
      db: target.db,
      options,
      env,
    })
    verified.push({ name, ...result })
    if (result.ok) cache[f.$id] = { key, result, at: new Date().toISOString() }
    else {
      delete cache[f.$id]
      diagnostics.push({
        code: 'R019',
        severity: 'error',
        why: `\`${name}\` failed its live round trip at \`${result.broke.link}\`: ${result.broke.why}.`,
      })
    }
    if (result.ok && result.untested.length)
      diagnostics.push({
        code: 'R023',
        severity: 'warning',
        why: `\`${name}\` passed, with ${result.untested.map((u) => `\`${u.link}\``).join(', ')} untested: ${[...new Set(result.untested.map((u) => u.why))].join(' ')}`,
      })
  }
  mkdirSync(join(root, '.weft'), { recursive: true })
  writeFileSync(verifiedFile(root), JSON.stringify(cache, null, 2) + '\n')
  return { diagnostics, verified }
}

/** The deploy's live plan on its own, for `weft check` and `weft doctor`: no contract is written. */
export const readLivePlan = ({ root, site, preset, live, verify = true }) => {
  root = resolve(root)
  return withFns({ root, site }, async (fns, server) => {
    const realtime = (await server.ssrLoadModule('virtual:weft/realtime')).default
    const plan = planOf({ root, preset, realtime })
    if (!verify) return { ...plan, verified: [] }
    const { diagnostics, verified } = await verifyAll({
      root,
      fns,
      realtime,
      server,
      live,
      strict: false,
    })
    return { ...plan, diagnostics: [...plan.diagnostics, ...diagnostics], verified }
  })
}

/** `src/realtime.server.ts` loaded, for `weft db live` and `weft db listen`. `fn` holds it open as long as it needs. */
export const withRealtime = ({ root, site }, fn) =>
  withFns({ root: resolve(root), site }, async (_, server) =>
    fn((await server.ssrLoadModule('virtual:weft/realtime')).default ?? {}, server),
  )

/** Every query's shape tree (research 31 §3), by id. */
export function shapeTable(fns) {
  const table = {}
  for (const f of fns.values()) {
    const tree = f.kind === 'query' ? shapeTree(f.def) : undefined
    if (tree !== undefined) table[f.$id] = tree
  }
  return table
}

/**
 * `fn(fns, server)` with every server module loaded through a private Vite server. A dev server sets `NODE_ENV` to
 * development when nothing had: that's put back after, or `weft build`, which reads the live plan first, would build
 * with `import.meta.env.DEV` on and ship every dev-only diagnostic.
 */
async function withFns({ root, site = {} }, fn) {
  const env = process.env.NODE_ENV
  let server
  try {
    server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      server: { middlewareMode: true, hmr: false, ws: false },
      plugins: [weft({ hydratable: true, csp: site?.csp }), weftStart({ root, site })],
    })
    await server.ssrLoadModule('virtual:weft/fns')
    const { fns } = await server.ssrLoadModule(join(startDir, 'data.ts'))
    return await fn(fns, server)
  } finally {
    await server?.close()
    if (env === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = env
  }
}

/** The shape table at build: nothing is running yet, so the server modules load the way the contract's do. */
export const readShapes = (options) =>
  withFns({ ...options, root: resolve(options.root) }, shapeTable)

/** Load every server module and write `.weft/contract.json`. */
export function writeContract({ root, site = {}, preset, rust, live, verify }) {
  root = resolve(root)
  return withFns({ root, site }, async (fns, server) => {
    const { diagnostics, ...contract } = describe(fns, rust)
    const mod = await server.ssrLoadModule('virtual:weft/realtime')
    const socket = [...fns.values()].find((f) => f.kind === 'channel' || f.kind === 'shared')
    // a channel needs the socket itself: on a function host no bus helps, so R024 says where it can run instead of R002
    const unheld = socket && !holdsSockets(preset)
    if (unheld)
      diagnostics.push({
        code: 'R024',
        severity: 'error',
        why: `\`${socket.$id.replace(/\..*$/, '')}\` is a ${socket.kind === 'shared' ? 'shared state' : 'channel'}, which needs a WebSocket, and ${liveTarget(preset).host} on \`${preset}\` can't hold one: the page loads, and the channel says \`unavailable\`. \`weft deploy hosts\` lists the hosts that can (Fly, Render).`,
      })
    const bus = busProblem({
      preset,
      bus: mod.default?.bus?.name ?? 'memory',
      streams: [...fns.values()].some(
        (f) => f.kind === 'stream' || (!unheld && (f.kind === 'channel' || f.kind === 'shared')),
      ),
      root,
    })
    if (bus)
      diagnostics.push({
        code: 'R002',
        severity: 'error',
        why: `${bus}. Add \`@weft-js/realtime-redis\` or \`@weft-js/realtime-nats\` to \`plugins\`, or set \`postgresBus\` in \`src/realtime.server.ts\`.`,
      })
    diagnostics.push(...planOf({ root, preset, realtime: mod.default }).diagnostics)
    let verified = []
    if (verify) {
      const done = await verifyAll({ root, fns, realtime: mod.default, server, live, strict: true })
      diagnostics.push(...done.diagnostics)
      verified = done.verified
    }
    for (const [service, s] of Object.entries(contract.services ?? {})) {
      const why =
        s.kind === 'native' &&
        nativeProblem({ service, preset, wasm: rust?.services?.[service]?.wasm })
      if (why) diagnostics.push({ code: 'R104', severity: 'error', why })
    }
    mkdirSync(join(root, '.weft'), { recursive: true })
    const path = join(root, '.weft', 'contract.json')
    writeFileSync(path, JSON.stringify(contract, null, 2) + '\n')
    return { path, functions: contract.functions.length, diagnostics, contract, verified }
  })
}
