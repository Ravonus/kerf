import { createHash } from 'node:crypto'
import { toJson } from '../shape.mjs'

const tagsOf = (t) => (typeof t === 'function' ? 'dynamic' : [...(t ?? [])])

/** The first string or array in a JSON Schema with no upper bound, as a path. */
function unbounded(s, path = 'input') {
  if (!s || typeof s !== 'object') return
  if (s.type === 'string' && s.maxLength === undefined && !s.enum && s.const === undefined)
    return path
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
  return Object.values(def ?? schema).some((v) => oneWay(v, seen)) // arrays and `shape` hold schemas too
}

/** The first union in a JSON Schema with two object or array arms, as a path: typify has no faithful type for one. */
function plainUnion(s, path) {
  if (!s || typeof s !== 'object') return
  const arms = s.anyOf?.filter((x) => x.type !== 'null')
  if (arms?.length > 1 && arms.some((x) => x.type === 'object' || x.type === 'array' || x.$ref))
    return path
  for (const [k, v] of Object.entries(s.properties ?? {})) {
    const hit = plainUnion(v, `${path}.${k}`)
    if (hit) return hit
  }
  for (const v of [
    s.items,
    ...(s.prefixItems ?? []),
    ...(s.anyOf ?? []),
    ...(s.oneOf ?? []),
    ...Object.values(s.$defs ?? {}),
  ]) {
    const hit = plainUnion(v, path)
    if (hit) return hit
  }
}

const CODEC =
  '`z.codec(z.iso.datetime(), z.date(), { decode, encode })` for a date, `z.codec(z.string(), z.bigint(), …)` for a bigint'

/**
 * A function with `impl`, as a sidecar sees it (research 36 §3). The wire is the *input* side of every schema: TS sends
 * parsed input encoded back, and parses what comes back, so codecs and transforms on an output are TS's business.
 */
function implOf(f, report) {
  const { impl, input, output, errors = {} } = f.def
  const r101 = (why) => report({ code: 'R101', severity: 'error', why: `\`${f.$id}\`: ${why}` })
  const wire = (schema, what) => {
    const json = toJson(schema, 'input')
    if (!json)
      r101(`${what} has a type JSON can't carry, so no Rust type can be generated. Use ${CODEC}.`)
    return json ?? {}
  }
  if (input) wire(input, '`input`')
  if (input && oneWay(input))
    r101(
      "`input` has a one-way `.transform()`, so its parsed value can't be sent. Use `z.codec(…)`, or do it in Rust.",
    )
  if (!output)
    r101(
      'a function with `impl` needs `output`: it\'s the contract for what comes back, and `z.null()` says "nothing".',
    )
  return {
    kind: impl.kind,
    target: impl.target,
    service: impl.service,
    ctx:
      f.def.cache && f.def.cache.scope !== 'user'
        ? 'shared'
        : f.def.auth && f.def.auth !== 'public'
          ? 'user'
          : 'ctx',
    output: output ? wire(output, '`output`') : {},
    errors: Object.fromEntries(
      Object.entries(errors).map(([code, schema]) => [code, wire(schema, `error \`${code}\``)]),
    ),
  }
}

/** What a sidecar is built from, per service: a binary whose hash differs was built from another contract (R103). */
function services(functions) {
  const out = {}
  for (const f of functions)
    if (f.impl)
      (out[f.impl.service] ??= {
        kind: f.impl.kind,
        hash: createHash('sha256'),
        functions: [],
      }).functions.push(f.id)
  for (const f of functions)
    if (f.impl) out[f.impl.service].hash.update(JSON.stringify([f.id, f.kind, f.input, f.impl]))
  return Object.fromEntries(
    Object.entries(out).map(([k, v]) => [
      k,
      { kind: v.kind, hash: v.hash.digest('hex').slice(0, 16), functions: v.functions },
    ]),
  )
}

/** Presets with no file for an addon or a `.wasm` to be read from. */
function channelDescription(f, bound) {
  const part = (key) => (f.def[key] ? (toJson(f.def[key], 'input') ?? {}) : undefined)
  const messages = (list) =>
    Object.fromEntries(Object.entries(list ?? {}).map(([k, s]) => [k, toJson(s, 'input') ?? {}]))
  const client = f.kind === 'shared' ? { value: part('value') } : messages(f.def.client)
  bound(part(f.kind === 'shared' ? 'key' : 'params'), f.kind === 'shared' ? 'key' : 'params')
  for (const [k, json] of Object.entries(client)) bound(json, `client.${k}`)
  return {
    id: f.$id,
    name: f.$id.replace(/\..*$/, ''),
    kind: f.kind,
    input: part(f.kind === 'shared' ? 'key' : 'params') ?? null,
    output: null,
    client,
    server: messages(f.def.server),
    auth: 'authorize',
    errors: ['R011', 'Q002'],
  }
}

function describeFunction(f, rust, diagnostics) {
  const schema = (key, side) => {
    const s = f.def[key]
    if (!s) return undefined
    const json = toJson(s, side)
    if (!json)
      diagnostics.push({
        code: 'C001',
        severity: 'warning',
        why: `\`${f.$id}\`'s \`${key}\` schema can't become JSON Schema: the contract says \`{}\`.`,
      })
    return json ?? {}
  }
  const errors = [
    ...(f.def.input ? ['Q002'] : []),
    ...(f.def.auth && f.def.auth !== 'public' ? ['A002'] : []),
    ...(typeof f.def.auth === 'object' ? ['A006'] : []),
    ...(f.kind === 'mutation' ? ['Q010'] : []),
    ...Object.keys(f.def.errors ?? {}),
  ]
  const impl = f.def.impl && implOf(f, (d) => diagnostics.push(d))
  const input = impl
    ? f.def.input
      ? (toJson(f.def.input, 'input') ?? {})
      : null
    : (schema('input', 'input') ?? null)
  if (impl && rust.unions !== 'allow') {
    const hit = [
      ['input', input],
      ['output', impl.output],
      ...Object.entries(impl.errors).map(([k, v]) => [`error ${k}`, v]),
    ]
      .map(([name, s]) => plainUnion(s, name))
      .find(Boolean)
    if (hit)
      diagnostics.push({
        code: 'R102',
        severity: 'error',
        why: `\`${f.$id}\`'s \`${hit}\` is a plain \`z.union\` of objects: it has no tag, so Rust can't tell its arms apart reliably. Use \`z.discriminatedUnion\`, or set \`rust: { unions: 'allow' }\` in kerf.config.ts.`,
      })
  }
  const bound = (json, path) => {
    const hit = unbounded(json, path)
    if (hit)
      diagnostics.push({
        code: 'R005',
        severity: 'warning',
        why: `\`${f.$id}\`'s \`${hit}\` has no upper bound: a client decides how much the server holds. Add \`.max()\`.`,
      })
  }
  if (f.kind === 'stream') bound(input)
  if (f.kind === 'channel' || f.kind === 'shared') return channelDescription(f, bound)

  return {
    id: f.$id,
    name: f.$id.replace(/\..*$/, ''),
    kind: f.kind,
    input,
    output: impl
      ? impl.output
      : (schema(f.kind === 'stream' ? 'message' : 'output', 'output') ?? null),
    ...(impl && { impl }),
    ...(f.kind === 'query'
      ? { tags: tagsOf(f.def.tags), cache: f.def.cache ?? null }
      : f.kind === 'mutation'
        ? { invalidates: tagsOf(f.def.invalidates) }
        : {}),
    auth:
      typeof f.def.auth === 'object'
        ? 'role' in f.def.auth
          ? { role: [f.def.auth.role].flat() }
          : 'policy'
        : (f.def.auth ?? (f.kind === 'mutation' ? 'default' : 'public')),
    errors,
  }
}

/** @param {Map<string, any>} fns @param {{ unions?: 'allow' }} [rust] the config's `rust` */
export function describe(fns, rust = {}) {
  const diagnostics = []
  const functions = [...fns.values()]
    .sort((a, b) => a.$id.localeCompare(b.$id))
    .map((f) => describeFunction(f, rust, diagnostics))
  const rusts = services(functions)
  for (const f of functions)
    if (f.impl && f.impl.kind !== rusts[f.impl.service].kind)
      diagnostics.push({
        code: 'R109',
        severity: 'error',
        why: `\`${f.impl.service}\` is named by both \`remote()\` and \`native()\`: a crate is one or the other. Rename one.`,
      })
  return {
    version: 1,
    ...(Object.keys(rusts).length && { services: rusts }),
    functions,
    diagnostics,
  }
}
