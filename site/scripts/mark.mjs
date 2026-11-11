// The house mark as the hero weaves it, cell by cell: four green veneers, two red kerfs going over and under them,
// shaded with the hero's own Bayer dither. One renderer for the logo, the favicon, the header and the share card.
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
const { CORAL, MIDDLE, VENEERS, VENEER_SPAN, KERFS, KERF_SPAN } =
  await import('../src/lib/loom/threads.ts')

/** Index 0 is empty; 1–3 the hero's greens, dark to bright; 4–6 its coral, dark to bright. */
export const INKS = [
  [0, 0, 0, 0],
  ...PALETTE.slice(2, 5),
  ...CORAL.slice(1, 4).map((c) => [...c, 255]),
]

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** The cells a thread covers across its width: centre `c`, width `w`, its first cell a multiple of `step`. */
const span = (c, w, step) => {
  const a = step * Math.round((c - w / 2) / step)
  return { a, b: a + w }
}

function lay(size, scale, width, step) {
  const [ox, oy] = MIDDLE.map((m) => size / 2 - m * scale)
  const across = (o) => (u) => span(o + u * scale, width, step)
  const snap = (o, u) => step * Math.round((o + u * scale) / step)
  const veneers = VENEERS.map(across(ox))
  // The kerfs overhang the outer veneers by the same whole number of cells on each side, whatever the rounding.
  const over = step * Math.round(((VENEERS[0] - KERF_SPAN[0]) * scale - width / 2) / step)
  return {
    veneers,
    kerfs: KERFS.map(across(oy)),
    long: { a: snap(oy, VENEER_SPAN[0]), b: snap(oy, VENEER_SPAN[1]) },
    wide: { a: veneers[0].a - over, b: veneers.at(-1).b + over },
  }
}

const hit = (list, v) => list.findIndex((s) => v >= s.a && v < s.b)
const near = (list, v) => list.findIndex((s) => v >= s.a - 1 && v < s.b + 1)

/** How lit a cell is across its thread: bright at the middle, darker towards the edges, as a round thread is. */
const round = (s, v) => {
  const d = (v + 0.5 - (s.a + s.b) / 2) / (s.b - s.a)
  return 0.5 + 0.4 * (1 - 4 * d * d)
}

/** The light along a thread rises and falls, as it does on the hero's moving field. */
const swell = (along, seed, scale) => Math.sin(along / scale / 1.4 + seed * 2.1) * 0.16

function shade(lit, x, y, dither) {
  const q = lit * 2.999 + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * dither
  return Math.max(0, Math.min(2, Math.floor(q)))
}

/**
 * The mark in a `size`-square grid of cells, `scale` cells to the mark's unit (its box is 24 units), threads `width`
 * cells wide; `step` 2 keeps every edge on an even cell, so a half-size render stays sharp. Veneers carry horizontal fibre lines; where a thread passes under, its edge darkens beside the one on top.
 */
export function markCells(size, scale, width, { dither = 1.2, fibre = 0.36, step = 1 } = {}) {
  const { veneers, kerfs, long, wide } = lay(size, scale, width, step)
  const out = new Uint8Array(size * size)
  const shadows = width > 1
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const k = y >= long.a && y < long.b ? hit(veneers, x) : -1
      const j = x >= wide.a && x < wide.b ? hit(kerfs, y) : -1
      const over = k >= 0 && j >= 0 ? (k + j) % 2 === 0 : j >= 0
      if (j >= 0 && over) {
        const under = shadows && near(veneers, x) >= 0 && (near(veneers, x) + j) % 2 === 1
        const lit = round(kerfs[j], y) + swell(x, j + 4, scale)
        out[y * size + x] = 4 + (under ? 0 : shade(lit, x, y, dither))
      } else if (k >= 0) {
        const beneath = shadows && near(kerfs, y) >= 0 && (k + near(kerfs, y)) % 2 === 0
        const line = y % 2 ? fibre : 0
        const lit = round(veneers[k], x) + swell(y, k, scale) - line
        out[y * size + x] = 1 + (beneath ? 0 : shade(lit, x, y, dither))
      }
    }
  return out
}

const hex = (c) =>
  `#${c
    .slice(0, 3)
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')}`

/** One path per ink, each a run of cells along a row. */
export function markPaths(cells, size) {
  const runs = INKS.map(() => '')
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size;) {
      const ink = cells[y * size + x]
      let n = 1
      while (x + n < size && cells[y * size + x + n] === ink) n++
      if (ink) runs[ink] += `M${x} ${y}h${n}v1h-${n}z`
      x += n
    }
  return runs.flatMap((d, ink) => (d ? [[hex(INKS[ink]), d]] : []))
}

/** A palette PNG, by hand: a few KB of cells, sized up with `image-rendering: pixelated` where it is shown. */
export function png(width, height, pixel, palette) {
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
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 3
  const raw = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = pixel(x, y)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('PLTE', Buffer.from(palette.flatMap((c) => c.slice(0, 3)))),
    chunk('tRNS', Buffer.from(palette.map((c) => c[3]))),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
