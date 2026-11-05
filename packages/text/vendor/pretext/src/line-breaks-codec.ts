// Table decoding moved from @chenglou/pretext 1.0.0 line-breaks.ts.
import type { ClassTable } from './line-breaks.js'

// The generated tables of bytes ship packed, in base64: the unpacked length, then runs of literal
// bytes, each followed by a copy of earlier bytes (length - 4, then distance back), every count a
// little-endian base-128 varint. Packing keeps the tables a page parses small; a page unpacks only
// its engine's tables.
export function unpackTable(packed: string): Uint8Array {
  const input = atob(packed)
  let at = 0
  const varint = (): number => {
    let value = 0
    let scale = 1
    let byte: number
    do {
      byte = input.charCodeAt(at++)
      value += (byte & 0x7f) * scale
      scale *= 0x80
    } while (byte >= 0x80)
    return value
  }
  const bytes = new Uint8Array(varint())
  let out = 0
  while (at < input.length) {
    for (let n = varint(); n > 0; n--) bytes[out++] = input.charCodeAt(at++)
    if (at >= input.length) break
    const length = varint() + 4
    const from = out - varint()
    // A copy that overlaps the bytes it writes repeats them, so it goes one byte at a time.
    if (from + length <= out) bytes.copyWithin(out, from, from + length)
    else for (let k = 0; k < length; k++) bytes[out + k] = bytes[from + k]!
    out += length
  }
  if (out !== bytes.length) throw new Error('A packed table unpacked to the wrong length')
  return bytes
}

// The little-endian base-128 varints a table in base64 holds. Tables of varints ship without
// unpackTable's packing, which saves them nothing once the bundle is compressed.
export function unpackVarints(base64: string): Int32Array {
  const input = atob(base64)
  const values = new Int32Array(input.length)
  let count = 0
  for (let i = 0; i < input.length;) {
    let byte = input.charCodeAt(i++)
    let value = byte & 0x7f
    for (let shift = 7; byte >= 0x80; shift += 7) {
      byte = input.charCodeAt(i++)
      value |= (byte & 0x7f) << shift
    }
    values[count++] = value
  }
  return values.subarray(0, count)
}

// The maps ship as one list of runs over U+0000..U+10FFFF, each run a length - 1 and a joint class:
// the joint classes are the classes all the maps together tell apart, so code points that the
// engines class alike are stored once. `remap` has one map's class for each joint class, and
// `blocks` is how many blocks its table takes. Throws for a list that doesn't end at U+10FFFF, an
// empty one included.
export function unpackClassRuns(runs: Int32Array, remap: Uint8Array, blocks: number): ClassTable {
  const index = new Uint16Array(0x1100)
  const values = new Uint8Array(blocks << 8)
  // The block each class fills whole, once a run covers one.
  const whole = new Int32Array(0x100).fill(-1)
  let count = 0
  let c = 0
  let end = 0
  let value = -1
  for (let r = 0; r <= runs.length; r += 2) {
    // Runs of joint classes that are one class in this map make one run, [c, end), written once
    // the next run's class differs or no run is left.
    const following = r < runs.length ? remap[runs[r + 1]!]! : -1
    if (following !== value) {
      while (c < end) {
        const block = c >> 8
        if ((c & 0xff) === 0 && end - c >= 0x100) {
          if (whole[value]! < 0) {
            whole[value] = count
            values.fill(value, count << 8, ++count << 8)
          }
          index.fill(whole[value]!, block, end >> 8)
          c = end & ~0xff
        } else {
          // A block that several runs share is its own: the first of them starts it.
          if ((c & 0xff) === 0) index[block] = count++
          const stop = Math.min(end, (block + 1) << 8)
          const shift = (index[block]! - block) << 8
          values.fill(value, c + shift, stop + shift)
          c = stop
        }
      }
      value = following
    }
    if (r < runs.length) end += runs[r]! + 1
  }
  if (end !== 0x110000) throw new Error('The class runs don\'t cover U+0000..U+10FFFF')
  return { index, values }
}
