// A small PNG decoder for what models and the mock hand back: 8-bit gray, gray and alpha, RGB and RGBA, not
// interlaced, every row filter. The encoder is `png()` in `../paint.mjs`.
import { inflateSync } from 'node:zlib'

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
/** Channels per colour type. */
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 }

const paeth = (a, b, c) => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** Undoes each row's filter, giving the bare rows. */
function unfilter(data, height, stride, bpp) {
  const rows = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)]
    const src = data.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const row = rows.subarray(y * stride, (y + 1) * stride)
    const up = y ? rows.subarray((y - 1) * stride, y * stride) : new Uint8Array(stride)
    if (filter > 4) throw new Error(`png: row ${y} has an unknown filter ${filter}`)
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0
      const b = up[x]
      let add = 0
      if (filter === 1) add = a
      else if (filter === 2) add = b
      else if (filter === 3) add = (a + b) >> 1
      else if (filter === 4) add = paeth(a, b, x >= bpp ? up[x - bpp] : 0)
      row[x] = (src[x] + add) & 255
    }
  }
  return rows
}

/** A PNG's size from its header, without decoding it. */
export function pngSize(bytes) {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (buf.length < 24 || SIGNATURE.some((b, i) => buf[i] !== b)) throw new Error('png: not a PNG')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

/** A PNG's pixels as RGBA rows: `{ width, height, rgba }`. */
export function decodePng(bytes) {
  pngSize(bytes)
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let head
  const idat = []
  for (let at = 8; at + 8 <= buf.length;) {
    const length = buf.readUInt32BE(at)
    const type = buf.toString('latin1', at + 4, at + 8)
    const data = buf.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') head = data
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    at += 12 + length
  }
  if (!head) throw new Error('png: no IHDR')
  const width = head.readUInt32BE(0)
  const height = head.readUInt32BE(4)
  const [depth, color, , , interlace] = head.subarray(8, 13)
  const channels = CHANNELS[color]
  if (depth !== 8 || !channels || interlace)
    throw new Error(
      `png: only 8-bit, non-interlaced gray or RGB(A); this is ${depth}-bit type ${color}`,
    )
  const rows = unfilter(inflateSync(Buffer.concat(idat)), height, width * channels, channels)
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const p = rows.subarray(i * channels, (i + 1) * channels)
    const gray = channels < 3
    rgba[i * 4] = p[0]
    rgba[i * 4 + 1] = gray ? p[0] : p[1]
    rgba[i * 4 + 2] = gray ? p[0] : p[2]
    rgba[i * 4 + 3] = channels === 2 ? p[1] : channels === 4 ? p[3] : 255
  }
  return { width, height, rgba }
}
