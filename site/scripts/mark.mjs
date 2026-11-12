// The house mark, from the hero's own geometry (src/lib/loom/threads.ts): a K cut in two, green above the cut and coral
// below. Smooth for the logo files; dithered with the hero's Bayer shading for the share card, where it sits on the field.
import { registerHooks } from 'node:module'
import { deflateSync } from 'node:zlib'

registerHooks({
  resolve(spec, context, next) {
    try {
      return next(spec, context)
    } catch (e) {
      if (spec.startsWith('.')) return next(`${spec}.ts`, context)
      throw e
    }
  },
})
const { PALETTE } = await import('../src/lib/field.ts')
const { CORAL, PIECES, along, pieceAt } = await import('../src/lib/loom/threads.ts')

/** Index 0 is empty; 1–3 the hero's greens, dark to bright; 4–6 its coral, dark to bright. */
export const INKS = [
  [0, 0, 0, 0],
  ...PALETTE.slice(2, 5),
  ...CORAL.slice(1, 4).map((c) => [...c, 255]),
]

const hex = (c) =>
  `#${c
    .slice(0, 3)
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')}`

/** The smooth mark's two inks: the hero's middle green and its brightest coral. */
export const FILLS = [hex(INKS[2]), hex(INKS[6])]

/** Each piece as an SVG path in the 24-unit box. */
export const piecePaths = () => PIECES.map((p) => `M${p.map(([x, y]) => `${x} ${y}`).join('L')}Z`)

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/**
 * The mark dithered in a `size`-square grid of cells: lit from the top left, each piece brighter along the fresh face
 * of the cut, the lower piece a step darker where the upper one shades it. Inks as INKS.
 */
export function markCells(size, { dither = 1.2 } = {}) {
  const s = size / 24
  const out = new Uint8Array(size * size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const ux = (x + 0.5) / s,
        uy = (y + 0.5) / s
      const k = pieceAt(ux, uy)
      if (k < 0) continue
      const t = along(ux, uy)
      // distance from the cut's line, in units: the projection's remainder
      const near = Math.abs((ux - 2) * -9.55 - (uy - 19.35) * 13) / Math.hypot(13, 9.55)
      let lit = 0.62 - (ux + uy - 24) * 0.018 + Math.max(0, 1.4 - near) * 0.25
      if (k === 1) lit += near < 1.2 && t < 1 ? -0.07 : 0.18
      const q = lit * 2.999 + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * dither
      out[y * size + x] = (k ? 4 : 1) + Math.max(0, Math.min(2, Math.floor(q)))
    }
  return out
}

const crcTable = Int32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
const crc = (buf) => {
  let c = -1
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
const chunk = (type, data) => {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc(body))
  return Buffer.concat([head, body, tail])
}
const encode = (width, height, kind, bpp, row) => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = kind
  const raw = Buffer.alloc((width * bpp + 1) * height)
  for (let y = 0; y < height; y++) row(y, raw, y * (width * bpp + 1) + 1)
  return [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), raw]
}
const finish = (head, sig, ihdr, raw) =>
  Buffer.concat([
    sig,
    ihdr,
    ...head,
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])

/** A palette PNG, by hand: a few KB of cells, sized up with `image-rendering: pixelated` where it is shown. */
export function png(width, height, pixel, palette) {
  const [sig, ihdr, raw] = encode(width, height, 3, 1, (y, buf, at) => {
    for (let x = 0; x < width; x++) buf[at + x] = pixel(x, y)
  })
  return finish(
    [
      chunk('PLTE', Buffer.from(palette.flatMap((c) => c.slice(0, 3)))),
      chunk('tRNS', Buffer.from(palette.map((c) => c[3]))),
    ],
    sig,
    ihdr,
    raw,
  )
}

/**
 * The smooth mark as an RGBA PNG, `size` pixels square, the K filling `fill` of it, on `ground` ([r, g, b] or none).
 * Each pixel is 8×8 samples, so the cut's edges are antialiased.
 */
export function smoothPng(size, { fill = 0.8, ground = null } = {}) {
  const inks = [INKS[2], INKS[6]]
  const unit = (size * fill) / 19,
    ox = size / 2 - 12 * unit,
    oy = size / 2 - 12 * unit
  const [sig, ihdr, raw] = encode(size, size, 6, 4, (y, buf, at) => {
    for (let x = 0; x < size; x++) {
      const n = [0, 0]
      for (let sy = 0; sy < 8; sy++)
        for (let sx = 0; sx < 8; sx++) {
          const k = pieceAt((x + (sx + 0.5) / 8 - ox) / unit, (y + (sy + 0.5) / 8 - oy) / unit)
          if (k >= 0) n[k]++
        }
      const a = (n[0] + n[1]) / 64
      const mix = (c) => (n[0] * inks[0][c] + n[1] * inks[1][c]) / Math.max(1, n[0] + n[1])
      const o = at + x * 4
      for (let c = 0; c < 3; c++)
        buf[o + c] = Math.round(ground ? ground[c] * (1 - a) + mix(c) * a : mix(c))
      buf[o + 3] = ground ? 255 : Math.round(a * 255)
    }
  })
  return finish([], sig, ihdr, raw)
}
