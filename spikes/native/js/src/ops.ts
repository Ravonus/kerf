// Encodes host ops into one buffer per flush. Layout: little-endian u32 words; strings are UTF-8 padded to 4
// bytes; numbers are one float64 (8 bytes). The spec is protocol/ops.json.
import { Op, Prop, type EventName, type NodeTypeName, type PropName, NodeType, Event } from './protocol.gen'

// Bare engines (JavaScriptCore without WebKit, Hermes) have no TextEncoder, so strings are encoded here.
function utf8(s: string): Uint8Array {
  const out = new Uint8Array(s.length * 3)
  let n = 0
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i)
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1)
      if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++ }
    }
    if (c < 0x80) out[n++] = c
    else if (c < 0x800) { out[n++] = 0xc0 | (c >> 6); out[n++] = 0x80 | (c & 63) }
    else if (c < 0x10000) { out[n++] = 0xe0 | (c >> 12); out[n++] = 0x80 | ((c >> 6) & 63); out[n++] = 0x80 | (c & 63) }
    else { out[n++] = 0xf0 | (c >> 18); out[n++] = 0x80 | ((c >> 12) & 63); out[n++] = 0x80 | ((c >> 6) & 63); out[n++] = 0x80 | (c & 63) }
  }
  return out.subarray(0, n)
}

export class OpWriter {
  private buf = new ArrayBuffer(4096)
  private view = new DataView(this.buf)
  private at = 0
  /** Ops written since the last `take()`. */
  count = 0

  private reserve(bytes: number) {
    if (this.at + bytes <= this.buf.byteLength) return
    let size = this.buf.byteLength * 2
    while (size < this.at + bytes) size *= 2
    const next = new ArrayBuffer(size)
    new Uint8Array(next).set(new Uint8Array(this.buf, 0, this.at))
    this.buf = next
    this.view = new DataView(next)
  }

  private words(...ws: number[]) {
    this.reserve(ws.length * 4)
    for (const w of ws) {
      this.view.setUint32(this.at, w, true)
      this.at += 4
    }
    this.count++
  }

  create(id: number, type: NodeTypeName) { this.words(Op.CREATE, id, NodeType[type]) }
  remove(id: number) { this.words(Op.REMOVE, id) }
  insert(parent: number, id: number, before = 0) { this.words(Op.INSERT, parent, id, before) }
  root(id: number) { this.words(Op.ROOT, id) }
  listen(id: number, event: EventName) { this.words(Op.LISTEN, id, Event[event]) }
  setBool(id: number, prop: PropName, value: boolean) { this.words(Op.SET_BOOL, id, Prop[prop], value ? 1 : 0) }

  setStr(id: number, prop: PropName, value: string) {
    const bytes = utf8(value)
    const padded = (bytes.length + 3) & ~3
    this.words(Op.SET_STR, id, Prop[prop], bytes.length)
    this.reserve(padded)
    new Uint8Array(this.buf, this.at, padded).fill(0).set(bytes)
    this.at += padded
  }

  setNum(id: number, prop: PropName, value: number) {
    this.words(Op.SET_NUM, id, Prop[prop])
    this.reserve(8)
    this.view.setFloat64(this.at, value, true)
    this.at += 8
  }

  get pending() { return this.at > 0 }

  /** Returns this batch's bytes (a copy, so the host may keep it) and resets. */
  take(): { bytes: Uint8Array; ops: number } {
    const out = { bytes: new Uint8Array(this.buf.slice(0, this.at)), ops: this.count }
    this.at = 0
    this.count = 0
    return out
  }
}

export type Decoded =
  | { op: 'CREATE'; id: number; type: NodeTypeName }
  | { op: 'REMOVE'; id: number }
  | { op: 'INSERT'; parent: number; id: number; before: number }
  | { op: 'SET'; id: number; prop: PropName; value: string | number | boolean }
  | { op: 'LISTEN'; id: number; event: EventName }
  | { op: 'ROOT'; id: number }

const invert = <T extends Record<string, number>>(o: T) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k])) as Record<number, keyof T>
const typeName = invert(NodeType)
const propName = invert(Prop)
const eventName = invert(Event)
let utf8d: TextDecoder | undefined

/** Reference decoder. The Swift and Kotlin hosts implement the same loop. */
export function decode(bytes: Uint8Array): Decoded[] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out: Decoded[] = []
  let at = 0
  const u = () => { const w = v.getUint32(at, true); at += 4; return w }
  while (at < bytes.byteLength) {
    const code = u()
    switch (code) {
      case Op.CREATE: out.push({ op: 'CREATE', id: u(), type: typeName[u()] }); break
      case Op.REMOVE: out.push({ op: 'REMOVE', id: u() }); break
      case Op.INSERT: out.push({ op: 'INSERT', parent: u(), id: u(), before: u() }); break
      case Op.ROOT: out.push({ op: 'ROOT', id: u() }); break
      case Op.LISTEN: out.push({ op: 'LISTEN', id: u(), event: eventName[u()] }); break
      case Op.SET_BOOL: out.push({ op: 'SET', id: u(), prop: propName[u()], value: u() === 1 }); break
      case Op.SET_NUM: {
        const id = u(), prop = propName[u()]
        out.push({ op: 'SET', id, prop, value: v.getFloat64(at, true) })
        at += 8
        break
      }
      case Op.SET_STR: {
        const id = u(), prop = propName[u()], len = u()
        out.push({ op: 'SET', id, prop, value: (utf8d ??= new TextDecoder()).decode(bytes.subarray(at, at + len)) })
        at += (len + 3) & ~3
        break
      }
      default: throw new Error(`unknown op ${code} at byte ${at - 4}`)
    }
  }
  return out
}
