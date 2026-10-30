// `.weft/contract.json` (PLAN §4.1, research 28 §4): every query and mutation as JSON Schema, with tags, cache and auth
// scope. `weft build` writes it; the OpenAPI export, the MCP server and Rust codegen read it. The server modules are
// loaded through Vite, never run: creating a database client connects to nothing.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'
import weft from 'weft/vite'
import weftStart, { startDir } from './vite.mjs'

/** A Standard Schema as JSON Schema (draft 2020-12), or undefined when it has no converter or can't be represented. */
function toJson(schema, side) {
  const std = schema?.['~standard']
  try {
    if (std?.jsonSchema) return std.jsonSchema[side]({ target: 'draft-2020-12' })
    if (typeof schema?.toJSONSchema === 'function') return schema.toJSONSchema()
  } catch {}
}

const tagsOf = t => (typeof t === 'function' ? 'dynamic' : [...(t ?? [])])

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
    return {
      id: f.$id, name: f.$id.replace(/\..*$/, ''), kind: f.kind,
      input: schema('input', 'input') ?? null, output: schema('output', 'output') ?? null,
      ...(f.kind === 'query' ? { tags: tagsOf(f.def.tags), cache: f.def.cache ?? null } : { invalidates: tagsOf(f.def.invalidates) }),
      auth: f.def.auth ?? 'public', errors,
    }
  })
  return { version: 1, functions, diagnostics }
}

/** Load every server module and write `.weft/contract.json`. */
export async function writeContract({ root, site = {} }) {
  root = resolve(root)
  const server = await createServer({
    root, configFile: false, logLevel: 'silent', appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false },
    plugins: [weft({ hydratable: true }), weftStart({ root, site })],
  })
  try {
    await server.ssrLoadModule('virtual:weft/fns')
    const { fns } = await server.ssrLoadModule(join(startDir, 'data.ts'))
    const { diagnostics, ...contract } = describe(fns)
    mkdirSync(join(root, '.weft'), { recursive: true })
    const path = join(root, '.weft', 'contract.json')
    writeFileSync(path, JSON.stringify(contract, null, 2) + '\n')
    return { path, functions: contract.functions.length, diagnostics }
  } finally {
    await server.close()
  }
}
