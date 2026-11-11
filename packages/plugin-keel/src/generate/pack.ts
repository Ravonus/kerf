// A generator's result as one buffer for Cache Storage, and back: the JSON of its plain parts, then each typed array's
// bytes, 8-aligned. And the buffers a result can hand over to another thread without a copy.

type Typed =
  | Float32Array
  | Float64Array
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Uint32Array
  | Int32Array
const KINDS = {
  Float32Array,
  Float64Array,
  Uint8Array,
  Uint8ClampedArray,
  Uint16Array,
  Uint32Array,
  Int32Array,
}
type Kind = keyof typeof KINDS

const typed = (value: unknown): value is Typed =>
  ArrayBuffer.isView(value) && !(value instanceof DataView)

/** Each typed array's buffer under `value`, once. */
export function transferables(value: unknown, out = new Set<ArrayBuffer>()): ArrayBuffer[] {
  if (typed(value)) {
    if (value.buffer instanceof ArrayBuffer) out.add(value.buffer)
  } else if (value && typeof value === 'object')
    for (const v of Object.values(value)) transferables(v, out)
  return [...out]
}

/** `value` as one buffer: a length, the JSON with each typed array as `{ $: kind, at, n }`, then their bytes. */
export function pack(value: unknown): ArrayBuffer {
  const parts: Typed[] = []
  let at = 0
  const json = JSON.stringify(value, (_key, v: unknown) => {
    if (!typed(v)) return v
    const ref = { $: v.constructor.name as Kind, at, n: v.length }
    parts.push(v)
    at += Math.ceil(v.byteLength / 8) * 8
    return ref
  })
  const head = new TextEncoder().encode(json)
  const start = Math.ceil((4 + head.length) / 8) * 8
  const out = new Uint8Array(start + at)
  new DataView(out.buffer).setUint32(0, head.length)
  out.set(head, 4)
  let offset = start
  for (const p of parts) {
    out.set(new Uint8Array(p.buffer, p.byteOffset, p.byteLength), offset)
    offset += Math.ceil(p.byteLength / 8) * 8
  }
  return out.buffer
}

/** What `pack` wrote, its typed arrays as views on `buffer`. */
export function unpack<T>(buffer: ArrayBuffer): T {
  const length = new DataView(buffer).getUint32(0)
  const json = new TextDecoder().decode(new Uint8Array(buffer, 4, length))
  const start = Math.ceil((4 + length) / 8) * 8
  return JSON.parse(json, (_key, v: { $?: Kind; at: number; n: number } | null) =>
    v && typeof v === 'object' && v.$ && v.$ in KINDS
      ? new KINDS[v.$](buffer, start + v.at, v.n)
      : v,
  ) as T
}
