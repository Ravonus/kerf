// `.weft/contract.json` (PLAN §4.1, research 28 §4): every query and mutation as JSON Schema, with tags, cache and auth
// scope. `weft build` writes it; the OpenAPI export, the MCP server and Rust codegen read it. The server modules are
// loaded through Vite, never run: creating a database client connects to nothing.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'
import weft from 'weft/vite'
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

export function describe(fns) {
  const diagnostics = []
  const functions = [...fns.values()].sort((a, b) => a.$id.localeCompare(b.$id)).map(f => {
    const schema = (key, side) => {
      const s = f.def[key]
      if (!s) return undefined
      const json = toJson(s, side)
      if (!json) diagnostics.push({ code: 'C001', severity: 'warning', why: `\`${f.$id}\`'s \`${key}\` schema can't become JSON Schema: the contract says \`{}\`.` })
      return json ?? {}
    }
    const errors = [...(f.def.input ? ['Q002'] : []), ...(f.def.auth ? ['A002'] : []), ...(f.kind === 'mutation' ? ['Q010'] : [])]
    const input = schema('input', 'input') ?? null
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
      input, output: schema(f.kind === 'stream' ? 'message' : 'output', 'output') ?? null,
      ...(f.kind === 'query' ? { tags: tagsOf(f.def.tags), cache: f.def.cache ?? null } : f.kind === 'mutation' ? { invalidates: tagsOf(f.def.invalidates) } : {}),
      auth: f.def.auth ?? 'public', errors,
    }
  })
  return { version: 1, functions, diagnostics }
}

/** Presets that run many instances: a process-local bus reaches a fraction of the clients (R002). */
const MULTI = /^(vercel|netlify|aws[-_]|azure|cloudflare|firebase|deno[-_]deploy|digitalocean|render|koyeb|zeabur)/

const usesLive = root => {
  const walk = dir => readdirSync(dir, { withFileTypes: true }).some(d => {
    const f = join(dir, d.name)
    return d.isDirectory() ? walk(f) : /\.[cm]?[jt]sx?$/.test(d.name) && /\.live\(/.test(readFileSync(f, 'utf8'))
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

/** Every query's shape tree (research 31 §3), by id. */
export function shapeTable(fns) {
  const table = {}
  for (const f of fns.values()) {
    const tree = f.kind === 'query' ? shapeTree(f.def) : undefined
    if (tree !== undefined) table[f.$id] = tree
  }
  return table
}

/** `fn(fns, server)` with every server module loaded through a private Vite server. */
async function withFns({ root, site = {} }, fn) {
  const server = await createServer({
    root, configFile: false, logLevel: 'silent', appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false },
    plugins: [weft({ hydratable: true }), weftStart({ root, site })],
  })
  try {
    await server.ssrLoadModule('virtual:weft/fns')
    const { fns } = await server.ssrLoadModule(join(startDir, 'data.ts'))
    return await fn(fns, server)
  } finally {
    await server.close()
  }
}

/** The shape table at build: nothing is running yet, so the server modules load the way the contract's do. */
export const readShapes = options => withFns({ ...options, root: resolve(options.root) }, shapeTable)

/** Load every server module and write `.weft/contract.json`. */
export function writeContract({ root, site = {}, preset }) {
  root = resolve(root)
  return withFns({ root, site }, async (fns, server) => {
    const { diagnostics, ...contract } = describe(fns)
    const mod = await server.ssrLoadModule('virtual:weft/realtime')
    const bus = busProblem({ preset, bus: mod.default?.bus?.name ?? 'memory', streams: [...fns.values()].some(f => f.kind === 'stream' || f.kind === 'channel' || f.kind === 'shared'), root })
    if (bus) diagnostics.push({ code: 'R002', severity: 'error', why: `${bus}. Set a bus in \`src/realtime.server.ts\`: \`postgresBus\`, \`redisBus\` or \`natsBus\`.` })
    mkdirSync(join(root, '.weft'), { recursive: true })
    const path = join(root, '.weft', 'contract.json')
    writeFileSync(path, JSON.stringify(contract, null, 2) + '\n')
    return { path, functions: contract.functions.length, diagnostics }
  })
}
