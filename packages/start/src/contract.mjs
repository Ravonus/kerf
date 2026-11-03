// `.weft/contract.json` (PLAN §4.1, research 28 §4): every query and mutation as JSON Schema, with tags, cache and auth
// scope. `weft build` writes it; the OpenAPI export, the MCP server and Rust codegen read it. The server modules are
// loaded through Vite, never run: creating a database client connects to nothing.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'
import weft from '@weft-js/core/vite'
import { holdsSockets, literalSecrets, liveTarget, livePlan, refusal, resolveTarget, scanRequired } from './live-target.mjs'
import { readMigrations } from './migrations.mjs'
import { shapeTree, toJson } from './shape.mjs'
import weftStart, { startDir } from './vite.mjs'

const tagsOf = t => (typeof t === 'function' ? 'dynamic' : [...(t ?? [])])

/** The first string or array in a JSON Schema with no upper bound, as a path. */
function unbounded(s, path = 'input') {
  if (!s || typeof s !== 'object') return
  if (s.type === 'string' && s.maxLength === undefined && !s.enum && s.const === undefined) return path
  if (s.type === 'array' && s.maxItems === undefined) return path
  if (s.items) {
    const hit = unbounded(s.items, `${path}[]`)
    if (hit) return hit
  }
  for (const [k, v] of Object.entries(s.properties ?? {})) {
    const hit = unbounded(v, `${path}.${k}`)
    if (hit) return hit
  }
  for (const v of [...(s.anyOf ?? []), ...(s.oneOf ?? [])]) {
    const hit = unbounded(v, path)
    if (hit) return hit
  }
}

/** A one-way `.transform()` or `preprocess` in a Zod schema: parsed input it touched can't be sent on (`encode` throws). */
function oneWay(schema, seen = new Set()) {
  if (!schema || typeof schema !== 'object' || seen.has(schema)) return false
  seen.add(schema)
  const def = schema._zod?.def
  if (def?.type === 'transform') return true
  return Object.values(def ?? schema).some(v => oneWay(v, seen)) // arrays and `shape` hold schemas too
}

/** The first union in a JSON Schema with two object or array arms, as a path: typify has no faithful type for one. */
function plainUnion(s, path) {
  if (!s || typeof s !== 'object') return
  const arms = s.anyOf?.filter(x => x.type !== 'null')
  if (arms?.length > 1 && arms.some(x => x.type === 'object' || x.type === 'array' || x.$ref)) return path
  for (const [k, v] of Object.entries(s.properties ?? {})) {
    const hit = plainUnion(v, `${path}.${k}`)
    if (hit) return hit
  }
  for (const v of [s.items, ...(s.prefixItems ?? []), ...(s.anyOf ?? []), ...(s.oneOf ?? []), ...Object.values(s.$defs ?? {})]) {
    const hit = plainUnion(v, path)
    if (hit) return hit
  }
}

const CODEC = '`z.codec(z.iso.datetime(), z.date(), { decode, encode })` for a date, `z.codec(z.string(), z.bigint(), …)` for a bigint'

/**
 * A function with `impl`, as a sidecar sees it (research 36 §3). The wire is the *input* side of every schema: TS sends
 * parsed input encoded back, and parses what comes back, so codecs and transforms on an output are TS's business.
 */
function implOf(f, report) {
  const { impl, input, output, errors = {} } = f.def
  const r101 = why => report({ code: 'R101', severity: 'error', why: `\`${f.$id}\`: ${why}` })
  const wire = (schema, what) => {
    const json = toJson(schema, 'input')
    if (!json) r101(`${what} has a type JSON can't carry, so no Rust type can be generated. Use ${CODEC}.`)
    return json ?? {}
  }
  if (input) wire(input, '`input`')
  if (input && oneWay(input)) r101('`input` has a one-way `.transform()`, so its parsed value can\'t be sent. Use `z.codec(…)`, or do it in Rust.')
  if (!output) r101('a function with `impl` needs `output`: it\'s the contract for what comes back, and `z.null()` says "nothing".')
  return {
    kind: impl.kind, target: impl.target, service: impl.service,
    ctx: f.def.cache && f.def.cache.scope !== 'user' ? 'shared' : f.def.auth === 'user' ? 'user' : 'ctx',
    output: output ? wire(output, '`output`') : {},
    errors: Object.fromEntries(Object.entries(errors).map(([code, schema]) => [code, wire(schema, `error \`${code}\``)])),
  }
}

/** What a sidecar is built from, per service: a binary whose hash differs was built from another contract (R103). */
function services(functions) {
  const out = {}
  for (const f of functions) if (f.impl) (out[f.impl.service] ??= { kind: f.impl.kind, hash: createHash('sha256'), functions: [] }).functions.push(f.id)
  for (const f of functions) if (f.impl) out[f.impl.service].hash.update(JSON.stringify([f.id, f.kind, f.input, f.impl]))
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { kind: v.kind, hash: v.hash.digest('hex').slice(0, 16), functions: v.functions }]))
}

/** Presets with no file for an addon or a `.wasm` to be read from. */
const NO_FILES = /^(cloudflare|vercel[-_]edge|netlify[-_]edge|deno[-_]deploy|bunny|fastly)/
/** Presets that run where they were built, so the addon from this machine is the right one. */
const LOCAL = /^(node|bun|deno[-_]server)/

/** R104 for a build: `native()` on a preset that has no way to run it. */
export function nativeProblem({ service, preset, wasm }) {
  if (preset && NO_FILES.test(preset)) return `\`native('${service}')\` can't load on the \`${preset}\` preset: it has no file system, so neither an addon nor a \`.wasm\` file reaches it. Use \`remote('rust://${service}')\`, which is the same crate behind \`weft::router\``
  if (wasm === false && preset && !LOCAL.test(preset)) return `\`native('${service}')\` has no WASM, and an addon built here may not fit the \`${preset}\` preset's machines. Drop \`wasm: false\` from \`rust.services.${service}\`, or use \`remote()\``
}

/** @param {Map<string, any>} fns @param {{ unions?: 'allow' }} [rust] the config's `rust` */
export function describe(fns, rust = {}) {
  const diagnostics = []
  const functions = [...fns.values()].sort((a, b) => a.$id.localeCompare(b.$id)).map(f => {
    const schema = (key, side) => {
      const s = f.def[key]
      if (!s) return undefined
      const json = toJson(s, side)
      if (!json) diagnostics.push({ code: 'C001', severity: 'warning', why: `\`${f.$id}\`'s \`${key}\` schema can't become JSON Schema: the contract says \`{}\`.` })
      return json ?? {}
    }
    const errors = [...(f.def.input ? ['Q002'] : []), ...(f.def.auth ? ['A002'] : []), ...(f.kind === 'mutation' ? ['Q010'] : []), ...Object.keys(f.def.errors ?? {})]
    const impl = f.def.impl && implOf(f, d => diagnostics.push(d))
    const input = impl ? (f.def.input ? toJson(f.def.input, 'input') ?? {} : null) : schema('input', 'input') ?? null
    if (impl && rust.unions !== 'allow') {
      const hit = [['input', input], ['output', impl.output], ...Object.entries(impl.errors).map(([k, v]) => [`error ${k}`, v])].map(([name, s]) => plainUnion(s, name)).find(Boolean)
      if (hit) diagnostics.push({ code: 'R102', severity: 'error', why: `\`${f.$id}\`'s \`${hit}\` is a plain \`z.union\` of objects: it has no tag, so Rust can't tell its arms apart reliably. Use \`z.discriminatedUnion\`, or set \`rust: { unions: 'allow' }\` in weft.config.ts.` })
    }
    const bound = (json, path) => {
      const hit = unbounded(json, path)
      if (hit) diagnostics.push({ code: 'R005', severity: 'warning', why: `\`${f.$id}\`'s \`${hit}\` has no upper bound: a client decides how much the server holds. Add \`.max()\`.` })
    }
    if (f.kind === 'stream') bound(input)
    if (f.kind === 'channel' || f.kind === 'shared') {
      const part = key => (f.def[key] ? toJson(f.def[key], 'input') ?? {} : undefined)
      const messages = list => Object.fromEntries(Object.entries(list ?? {}).map(([k, s]) => [k, toJson(s, 'input') ?? {}]))
      const client = f.kind === 'shared' ? { value: part('value') } : messages(f.def.client)
      bound(part(f.kind === 'shared' ? 'key' : 'params'), f.kind === 'shared' ? 'key' : 'params')
      for (const [k, json] of Object.entries(client)) bound(json, `client.${k}`)
      return { id: f.$id, name: f.$id.replace(/\..*$/, ''), kind: f.kind, input: part(f.kind === 'shared' ? 'key' : 'params') ?? null, output: null, client, server: messages(f.def.server), auth: 'authorize', errors: ['R011', 'Q002'] }
    }
    return {
      id: f.$id, name: f.$id.replace(/\..*$/, ''), kind: f.kind,
      input, output: impl ? impl.output : schema(f.kind === 'stream' ? 'message' : 'output', 'output') ?? null,
      ...(impl && { impl }),
      ...(f.kind === 'query' ? { tags: tagsOf(f.def.tags), cache: f.def.cache ?? null } : f.kind === 'mutation' ? { invalidates: tagsOf(f.def.invalidates) } : {}),
      auth: f.def.auth ?? 'public', errors,
    }
  })
  const rusts = services(functions)
  for (const f of functions) if (f.impl && f.impl.kind !== rusts[f.impl.service].kind) diagnostics.push({ code: 'R109', severity: 'error', why: `\`${f.impl.service}\` is named by both \`remote()\` and \`native()\`: a crate is one or the other. Rename one.` })
  return { version: 1, ...(Object.keys(rusts).length && { services: rusts }), functions, diagnostics }
}

/** Presets that run many instances: a process-local bus reaches a fraction of the clients (R002). */
const MULTI = /^(vercel|netlify|aws[-_]|azure|cloudflare|firebase|deno[-_]deploy|digitalocean|render|koyeb|zeabur)/

const usesLive = root => {
  const walk = dir => readdirSync(dir, { withFileTypes: true }).some(d => {
    const f = join(dir, d.name)
    return d.isDirectory() ? walk(f) : /\.[cm]?[jt]sx?$/.test(d.name) && /[\w)\]]\.live\(/.test(readFileSync(f, 'utf8'))
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
  const plan = livePlan({ preset, source: source && { name: source.name, external: source.external, tables: source.tables }, required: scanRequired(root) })
  if (source?.dialect) {
    const sql = readMigrations(root).map(m => m.sql).join('\n')
    const missing = source.tables.filter(t => !new RegExp(`weft_changes_(${t.replace(/\W/g, '_')}_)?upd\\b[^;]*["\`\\s]${t}["\`\\s]`).test(sql))
    if (missing.length) plan.diagnostics.push({ code: 'R018', severity: 'warning', why: `no migration adds change triggers to ${missing.map(t => `\`${t}\``).join(', ')}: run \`weft db live\`. Until then the server falls back to polling.` })
  }
  return plan
}

const verifiedFile = root => join(root, '.weft', 'verify.json')
const readVerified = root => { try { return JSON.parse(readFileSync(verifiedFile(root), 'utf8')) } catch { return {} } }

/**
 * Every query's `live.verify`, run. `strict` is a build: a target that isn't reachable from here fails it, where a
 * check warns and goes on. A pass is kept by the query's contract entry and target, so an unchanged query runs once.
 * @returns {Promise<{ diagnostics: any[], verified: any[] }>}
 */
async function verifyAll({ root, fns, realtime, server, live, strict }) {
  const diagnostics = [], verified = []
  for (const hit of literalSecrets(root)) diagnostics.push({ code: 'R020', severity: 'error', file: hit.file, why: `${hit.file}:${hit.line} has a connection string with a password in it: it would be committed. Read it from the environment: \`verify: { db: process.env.STAGING_DATABASE_URL }\`, or \`db: 'STAGING_DATABASE_URL'\` in a target.` })
  const queries = [...fns.values()].filter(f => f.kind === 'query' && f.def.live?.verify)
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
      diagnostics.push({ code: 'R021', severity: strict ? 'error' : 'warning', why: `\`${name}\` can't be verified on this machine: ${target.missing}${strict ? ' A build needs it, because the query declares it.' : ' Skipped.'}` })
      continue
    }
    const stop = refusal(target, { targets: live?.targets })
    if (stop) {
      diagnostics.push({ code: 'R022', severity: 'error', why: `\`${name}\`: ${stop}.` })
      continue
    }
    const key = createHash('sha256').update(JSON.stringify([contract.find(c => c.id === f.$id), realtime?.changes?.tables, target.name, target.url ?? '', !!target.db])).digest('hex').slice(0, 16)
    if (cache[f.$id]?.key === key && !env.WEFT_VERIFY_FRESH) {
      verified.push({ name, cached: true, ...cache[f.$id].result })
      continue
    }
    const result = await roundTrip({ fn: f, source: realtime?.changes, url: target.url, db: target.db, options, env })
    verified.push({ name, ...result })
    if (result.ok) cache[f.$id] = { key, result, at: new Date().toISOString() }
    else {
      delete cache[f.$id]
      diagnostics.push({ code: 'R019', severity: 'error', why: `\`${name}\` failed its live round trip at \`${result.broke.link}\`: ${result.broke.why}.` })
    }
    if (result.ok && result.untested.length) diagnostics.push({ code: 'R023', severity: 'warning', why: `\`${name}\` passed, with ${result.untested.map(u => `\`${u.link}\``).join(', ')} untested: ${[...new Set(result.untested.map(u => u.why))].join(' ')}` })
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
    const { diagnostics, verified } = await verifyAll({ root, fns, realtime, server, live, strict: false })
    return { ...plan, diagnostics: [...plan.diagnostics, ...diagnostics], verified }
  })
}

/** `src/realtime.server.ts` loaded, for `weft db live` and `weft db listen`. `fn` holds it open as long as it needs. */
export const withRealtime = ({ root, site }, fn) => withFns({ root: resolve(root), site }, async (_, server) => fn((await server.ssrLoadModule('virtual:weft/realtime')).default ?? {}, server))

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
      root, configFile: false, logLevel: 'silent', appType: 'custom',
      server: { middlewareMode: true, hmr: false, ws: false },
      plugins: [weft({ hydratable: true }), weftStart({ root, site })],
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
export const readShapes = options => withFns({ ...options, root: resolve(options.root) }, shapeTable)

/** Load every server module and write `.weft/contract.json`. */
export function writeContract({ root, site = {}, preset, rust, live, verify }) {
  root = resolve(root)
  return withFns({ root, site }, async (fns, server) => {
    const { diagnostics, ...contract } = describe(fns, rust)
    const mod = await server.ssrLoadModule('virtual:weft/realtime')
    const socket = [...fns.values()].find(f => f.kind === 'channel' || f.kind === 'shared')
    // a channel needs the socket itself: on a function host no bus helps, so R024 says where it can run instead of R002
    const unheld = socket && !holdsSockets(preset)
    if (unheld) diagnostics.push({ code: 'R024', severity: 'error', why: `\`${socket.$id.replace(/\..*$/, '')}\` is a ${socket.kind === 'shared' ? 'shared state' : 'channel'}, which needs a WebSocket, and ${liveTarget(preset).host} on \`${preset}\` can't hold one: the page loads, and the channel says \`unavailable\`. \`weft deploy hosts\` lists the hosts that can (Fly, Render).` })
    const bus = busProblem({ preset, bus: mod.default?.bus?.name ?? 'memory', streams: [...fns.values()].some(f => f.kind === 'stream' || (!unheld && (f.kind === 'channel' || f.kind === 'shared'))), root })
    if (bus) diagnostics.push({ code: 'R002', severity: 'error', why: `${bus}. Add \`@weft-js/realtime-redis\` or \`@weft-js/realtime-nats\` to \`plugins\`, or set \`postgresBus\` in \`src/realtime.server.ts\`.` })
    diagnostics.push(...planOf({ root, preset, realtime: mod.default }).diagnostics)
    let verified = []
    if (verify) {
      const done = await verifyAll({ root, fns, realtime: mod.default, server, live, strict: true })
      diagnostics.push(...done.diagnostics)
      verified = done.verified
    }
    for (const [service, s] of Object.entries(contract.services ?? {})) {
      const why = s.kind === 'native' && nativeProblem({ service, preset, wasm: rust?.services?.[service]?.wasm })
      if (why) diagnostics.push({ code: 'R104', severity: 'error', why })
    }
    mkdirSync(join(root, '.weft'), { recursive: true })
    const path = join(root, '.weft', 'contract.json')
    writeFileSync(path, JSON.stringify(contract, null, 2) + '\n')
    return { path, functions: contract.functions.length, diagnostics, contract, verified }
  })
}
