// A query's result shape from its `output` schema (research 31 §3). The client never gets the schema: the plugin puts
// this tree in the query's stub, and the server computes the same one, so a streamed fallback hydrates cleanly.
// weft/shape's `fill` turns a tree into a placeholder value.

/** A Standard Schema as JSON Schema (draft 2020-12), or undefined when it has no converter or can't be represented. */
export function toJson(schema, side) {
  const std = schema?.['~standard']
  try {
    if (std?.jsonSchema) return std.jsonSchema[side]({ target: 'draft-2020-12' })
    if (typeof schema?.toJSONSchema === 'function') return schema.toJSONSchema()
  } catch {}
}

/** Typical lengths by field name, for strings with no hint (research 11 §7.1). */
const NAMES = { title: 40, name: 16, label: 16, email: 22, body: 200, content: 200, text: 120, description: 120, summary: 120, slug: 24, url: 40, id: 8 }
const FORMATS = { email: 22, uuid: 36, url: 40, uri: 40, 'date-time': 24, date: 10, time: 8 }
/** A string with no hint: X036 if a skeleton shows one. */
const UNHINTED = 16

function string(s, name) {
  if (s.minLength !== undefined && s.minLength === s.maxLength) return { $s: s.minLength }
  if (s.maxLength !== undefined) return { $s: Math.round(((s.minLength ?? 0) + s.maxLength) / 2) }
  const known = FORMATS[s.format] ?? NAMES[name]
  if (known !== undefined) return { $s: known }
  if (s.minLength !== undefined) return { $s: s.minLength }
  return { $u: UNHINTED }
}

/** JSON Schema → shape tree. `name` is the field it's under. */
export function schemaTree(s, name = '') {
  if (!s || typeof s !== 'object') return null
  const example = s.example ?? s.examples?.[0]
  if (example !== undefined) return example
  if (s.const !== undefined) return s.const
  if (s.enum) return s.enum[0]
  const union = s.anyOf ?? s.oneOf
  if (union) {
    const some = union.filter(x => x.type !== 'null')
    return some.length < union.length && !(s.probability >= 0.5) ? null : schemaTree(some[0], name)
  }
  switch (s.type) {
    case 'string':
      return string(s, name)
    case 'number':
    case 'integer':
      return s.minimum ?? 0
    case 'boolean':
      return false
    case 'array':
      return { ...(s.maxItems !== undefined ? { $a: s.maxItems } : {}), $of: schemaTree(s.items, name) }
    case 'object': {
      const out = {}
      for (const [k, v] of Object.entries(s.properties ?? {})) if (s.required?.includes(k) || v.probability >= 0.5) out[k] = schemaTree(v, k)
      return out
    }
  }
  return null
}

/** `example` (a declared `shape`) over `tree`. */
function merge(tree, example) {
  if (example === undefined) return tree
  if (Array.isArray(example)) return example.length > 1 || !tree?.$of ? example : { ...tree, $of: merge(tree.$of, example[0]) }
  if (example && typeof example === 'object') return Object.fromEntries([...Object.entries(tree ?? {}), ...Object.entries(example).map(([k, v]) => [k, merge(tree?.[k], v)])])
  return example
}

/** A definition's tree: its `output`, with its declared `shape` over it. Undefined when it declares neither. */
export function shapeTree(def) {
  const json = def.output && toJson(def.output, 'output')
  if (!json) return def.shape
  return merge(schemaTree(json), def.shape)
}
