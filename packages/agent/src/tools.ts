// The tools an agent may see: every query and mutation that opted in with `agent:`, named by export, described by
// `say` and typed by its input schema. The registry is weft's own (`fns`), so a new function with `agent:` is a new
// tool, and nothing else has to know about it.
import { fns } from '@weft-js/start/data'
import { allows, type AgentAccess, type ToolInfo } from './index'

type Def = { agent?: boolean | AgentAccess; input?: unknown; tags?: unknown; invalidates?: unknown }

/** `getMenuItems.3f9a1c` → `getMenuItems`. */
const exportName = (id: string) => id.replace(/\.[0-9a-f]{6}$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')

/** `getMenuItems` → `get menu items`. */
const words = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()

function scopeOf(kind: 'query' | 'mutation', def: Def, name: string) {
  const access = typeof def.agent === 'object' ? def.agent : {}
  if (access.scope) return access.scope
  const tags = kind === 'query' ? def.tags : def.invalidates
  if (Array.isArray(tags) && typeof tags[0] === 'string') return tags[0].split(/[:.]/)[0]!
  return name
}

/** JSON Schema for a Standard Schema input, or an empty object for a function that takes none. */
function inputSchema(schema: unknown): Record<string, unknown> {
  const s = schema as {
    '~standard'?: { jsonSchema?: { input(o: { target: string }): Record<string, unknown> } }
    toJSONSchema?: () => Record<string, unknown>
  }
  if (!s) return { type: 'object', properties: {} }
  try {
    const json =
      s['~standard']?.jsonSchema?.input({ target: 'draft-2020-12' }) ?? s.toJSONSchema?.()
    if (json) {
      const { $schema: _, ...rest } = json
      return rest.type === 'object' ? rest : { type: 'object', properties: { input: rest } }
    }
  } catch {}
  return { type: 'object', properties: {} }
}

/** Every function offered to agents, with or without a grant. */
export function allTools(): ToolInfo[] {
  const out: ToolInfo[] = []
  const seen = new Set<string>()
  for (const fn of fns.values()) {
    if (fn.kind !== 'query' && fn.kind !== 'mutation') continue
    const def = fn.def as Def
    if (!def.agent) continue
    let name = exportName(fn.$id)
    // two files exporting the same name: the second gets its hash, so neither shadows the other
    if (seen.has(name)) name = `${name}_${fn.$id.slice(-6)}`
    seen.add(name)
    const access = typeof def.agent === 'object' ? def.agent : {}
    const scope = scopeOf(fn.kind, def, name)
    out.push({
      name,
      id: fn.$id,
      kind: fn.kind,
      permission: `${scope}.${fn.kind === 'query' ? 'read' : 'write'}`,
      confirm: !!access.confirm,
      description: access.say ?? `${fn.kind === 'query' ? 'Read' : 'Change'}: ${words(name)}`,
      input: inputSchema(def.input),
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** The tools `grants` allow. */
export const toolsFor = (grants: readonly string[]) =>
  allTools().filter((t) => allows(grants, t.permission))

/** The input wrapper `inputSchema` adds for a non-object schema, taken off again. */
export const unwrap = (tool: ToolInfo, input: unknown) =>
  tool.input.properties &&
  'input' in (tool.input.properties as object) &&
  Object.keys(tool.input.properties as object).length === 1 &&
  input &&
  typeof input === 'object' &&
  'input' in input
    ? (input as { input: unknown }).input
    : input

/** Every scope a tool names, for the grants editor: `[{ scope: 'menu', read: [...], write: [...] }]`. */
export function scopes() {
  const by = new Map<string, { scope: string; read: string[]; write: string[] }>()
  for (const t of allTools()) {
    const [scope = '', action] = t.permission.split('.')
    const s = by.get(scope) ?? { scope, read: [], write: [] }
    ;(action === 'read' ? s.read : s.write).push(t.name)
    by.set(scope, s)
  }
  return [...by.values()].sort((a, b) => a.scope.localeCompare(b.scope))
}
