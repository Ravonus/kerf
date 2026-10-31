// What Zod 4 emits for each shape a server function might use, and whether it can be sent to and read from Rust.
// `node schemas.mjs` writes schema/schemas.json for the typify run in schema/.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const { z } = createRequire(new URL('../../packages/start/package.json', import.meta.url))('zod')

const Hit = z.object({ id: z.string(), score: z.number() }).meta({ id: 'Hit' })
const stamp = z.codec(z.iso.datetime(), z.date(), { decode: s => new Date(s), encode: d => d.toISOString() })
const cases = {
  plain: z.object({ q: z.string().min(1).max(200), limit: z.int().max(50).default(20), tags: z.array(z.string()).optional() }),
  nullable: z.object({ a: z.string().nullable(), b: z.number().nullish() }),
  enumeration: z.object({ kind: z.enum(['a', 'b']), lit: z.literal('x') }),
  discriminated: z.discriminatedUnion('kind', [z.object({ kind: z.literal('a'), x: z.number() }), z.object({ kind: z.literal('b'), y: z.string() })]),
  union: z.union([z.object({ x: z.number() }), z.object({ y: z.string() })]),
  scalarUnion: z.union([z.string(), z.number()]),
  named: z.array(Hit),
  record: z.record(z.string(), z.number()),
  tuple: z.tuple([z.string(), z.number()]),
  uuid: z.object({ id: z.uuid(), at: z.iso.datetime() }),
  codec: z.object({ at: stamp }),
  transform: z.object({ a: z.string().transform(s => s.length) }),
  trim: z.object({ a: z.string().trim().max(9) }),
  refine: z.object({ a: z.string().refine(s => s.startsWith('x')) }),
  date: z.object({ at: z.date() }),
  bigint: z.object({ n: z.bigint() }),
  unknown: z.object({ meta: z.unknown(), any: z.any() }),
  voided: z.void(),
  nul: z.null(),
}
const out = {}
for (const [name, s] of Object.entries(cases)) {
  const row = out[name] = {}
  for (const io of ['input', 'output']) {
    try { row[io] = z.toJSONSchema(s, { io, target: 'draft-2020-12' }) } catch (e) { row[io + 'Error'] = e.message.split('\n')[0] }
  }
  try {
    const v = name === 'codec' ? { at: new Date(0) } : name === 'plain' ? { q: 'x', limit: 1 } : name === 'trim' ? { a: 'x' } : name === 'transform' ? { a: 3 } : undefined
    if (v) row.encode = z.encode(s, v)
  } catch (e) { row.encodeError = `${e.constructor.name}: ${e.message.split('\n')[0]}` }
}
writeFileSync(new URL('./schema/schemas.json', import.meta.url), JSON.stringify(out, null, 1))
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(14), JSON.stringify({ in: v.inputError ?? 'ok', out: v.outputError ?? 'ok', encode: v.encodeError ?? v.encode }))
