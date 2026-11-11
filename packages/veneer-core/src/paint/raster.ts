// A small grid of cells that shapes paint in flat bands of a ramp, then ring in a darker shade of themselves: pixel art
// that reads hand-painted. A shaded shape's band seams waver along one slow brush stroke shared by the whole picture,
// so its bands bend together the way one brush laid them; nothing is dithered. It is plain loops over a typed array,
// cheap enough to paint once per picture in the browser and keep as an image.
import { darken, mix, type Ramp } from './color'
import { cylinder, flat, sphere, type Shader } from './shade'

/** How a shape is painted. */
export interface Ink {
  ramp: Ramp
  /** The tone across the shape. Defaults: sphere for ellipses and rings, cylinder for polygons, flat 0.6 for rects. */
  shade?: Shader | undefined
  /** No ring around it: shadows, highlights, marks on top of a surface. */
  bare?: boolean | undefined
  /** Straight seams, no brush: brick, trim, lettering. */
  ruled?: boolean | undefined
}

/** A dot's or a line's options. */
export interface Mark {
  bare?: boolean | undefined
  ruled?: boolean | undefined
  /** A line's width in painter units. 1 by default. */
  thick?: number | undefined
}

/** An ellipse: its centre and its two radii. */
export interface Oval {
  x: number
  y: number
  rx: number
  ry: number
}
/** A point in painter space. */
export type Point = readonly [number, number]

/** How a raster paints. */
export interface RasterOptions {
  /** How far band seams lean, in tone: 0 rules them straight. 0.16 by default. */
  brush?: number | undefined
}

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const inOval = (o: Oval, x: number, y: number) =>
  ((x - o.x) / o.rx) ** 2 + ((y - o.y) / o.ry) ** 2 <= 1

/** A grid of cells that shapes paint in flat, brushed bands and then ring: one picture. */
export class Raster {
  /** The cells, packed 0xAABBGGRR, row by row. 0 is empty. */
  readonly px: Uint32Array
  /** The ring colour each painted cell asks for, 0 for none. */
  readonly edge: Uint32Array
  private readonly brush: number
  // Painters draw in a space of their own; `at` places it on this grid at any size.
  private tx = 0
  private ty = 0
  private k = 1

  constructor(
    readonly w: number,
    readonly h: number,
    options: RasterOptions = {},
  ) {
    this.px = new Uint32Array(w * h)
    this.edge = new Uint32Array(w * h)
    this.brush = options.brush ?? 0.16
  }

  /** Where the painter's origin lands on the grid, and how many cells one of its units covers. */
  at(x: number, y: number, k = 1) {
    this.tx = x
    this.ty = y
    this.k = k
    return this
  }

  /** Whether the cell under a painter-space point has paint on it. */
  painted(x: number, y: number) {
    const cx = Math.floor(this.tx + x * this.k),
      cy = Math.floor(this.ty + y * this.k)
    return cx >= 0 && cy >= 0 && cx < this.w && cy < this.h && this.px[cy * this.w + cx] !== 0
  }

  /** Paints the cell under a painter-space point in the band of `ramp` nearest `tone`. */
  dot(p: Point, ramp: Ramp, tone: number, mark?: Mark) {
    this.put(
      Math.floor(this.tx + p[0] * this.k),
      Math.floor(this.ty + p[1] * this.k),
      ramp,
      tone,
      mark,
    )
  }

  /** The brush stroke at a cell: how far a seam leans there. */
  private lean(x: number, y: number) {
    return this.brush * Math.sin(x * 0.5 + y * 1.1) * Math.sin(y * 0.37 - x * 0.23 + 1.3)
  }

  private put(x: number, y: number, ramp: Ramp, tone: number, mark?: Mark) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    const top = ramp.length - 1
    const v = clamp(tone) * top
    const b = Math.floor(v)
    const step = mark?.ruled ? Math.round(v) : v - b > 0.5 - this.lean(x, y) ? b + 1 : b
    const i = y * this.w + x
    const col = ramp[Math.min(top, step)]!
    const under = this.px[i]!
    if (col >>> 24 < 255 && under >>> 24 > 200) {
      // glass over something: see it through the glass, and keep its ring
      this.px[i] = mix(under, col, (col >>> 24) / 255)
      return
    }
    this.px[i] = col
    this.edge[i] = mark?.bare ? 0 : darken(ramp[0]!, 0.62) | 0xff000000
  }

  /**
   * Visits every cell whose centre, in painter space, is inside the box and passes `inside`; `paint` gets that centre
   * and the cell itself.
   */
  each(
    box: { x0: number; y0: number; x1: number; y1: number },
    inside: (x: number, y: number) => boolean,
    paint: (x: number, y: number, cx: number, cy: number) => void,
  ) {
    const { k, tx, ty } = this
    const c0 = Math.max(0, Math.floor(tx + box.x0 * k)),
      c1 = Math.min(this.w - 1, Math.ceil(tx + box.x1 * k))
    const r0 = Math.max(0, Math.floor(ty + box.y0 * k)),
      r1 = Math.min(this.h - 1, Math.ceil(ty + box.y1 * k))
    for (let cy = r0; cy <= r1; cy++)
      for (let cx = c0; cx <= c1; cx++) {
        const x = (cx + 0.5 - tx) / k,
          y = (cy + 0.5 - ty) / k
        if (inside(x, y)) paint(x, y, cx, cy)
      }
  }

  ellipse(o: Oval, ink: Ink) {
    const sh = ink.shade ?? sphere
    this.each(
      { x0: o.x - o.rx, y0: o.y - o.ry, x1: o.x + o.rx, y1: o.y + o.ry },
      (x, y) => inOval(o, x, y),
      (x, y, gx, gy) =>
        this.put(gx, gy, ink.ramp, sh((x - o.x) / o.rx, (y - o.y) / o.ry, gx, gy), ink),
    )
  }

  /** An ellipse less a smaller one with the same centre (`ix`, `iy` its radii). */
  ring(o: Oval & { ix: number; iy: number }, ink: Ink) {
    const hole = { x: o.x, y: o.y, rx: o.ix, ry: o.iy }
    const sh = ink.shade ?? sphere
    this.each(
      { x0: o.x - o.rx, y0: o.y - o.ry, x1: o.x + o.rx, y1: o.y + o.ry },
      (x, y) => inOval(o, x, y) && !inOval(hole, x, y),
      (x, y, gx, gy) =>
        this.put(gx, gy, ink.ramp, sh((x - o.x) / o.rx, (y - o.y) / o.ry, gx, gy), ink),
    )
  }

  /** A polygon, shaded across each row (u) and down the whole shape (v). */
  poly(pts: readonly Point[], ink: Ink) {
    const xs = pts.map((p) => p[0]),
      ys = pts.map((p) => p[1])
    const box = {
      x0: Math.min(...xs),
      x1: Math.max(...xs),
      y0: Math.min(...ys),
      y1: Math.max(...ys),
    }
    const inside = (x: number, y: number) => {
      let c = false
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]!,
          [xj, yj] = pts[j]!
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
      }
      return c
    }
    // each row's extent first, so the shading runs across what's actually there
    const rows = new Map<number, [number, number]>()
    this.each(box, inside, (x, _y, _gx, gy) => {
      const e = rows.get(gy)
      if (!e) rows.set(gy, [x, x])
      else {
        e[0] = Math.min(e[0], x)
        e[1] = Math.max(e[1], x)
      }
    })
    const sh = ink.shade ?? cylinder
    this.each(box, inside, (x, y, gx, gy) => {
      const [a, b] = rows.get(gy)!
      const half = Math.max(0.5, (b - a) / 2 + 0.5 / this.k)
      const v = ((y - box.y0) / (box.y1 - box.y0 || 1)) * 2 - 1
      this.put(gx, gy, ink.ramp, sh((x - (a + b) / 2) / half, v, gx, gy), ink)
    })
  }

  rect(r: { x: number; y: number; w: number; h: number }, ink: Ink) {
    const { x, y, w, h } = r
    const corners: Point[] = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ]
    this.poly(corners, { ...ink, shade: ink.shade ?? flat(0.6) })
  }

  /** A stroke from `a` to `b`; `tone` may vary along it (t from 0 to 1). */
  line(
    a: Point,
    b: Point,
    ink: { ramp: Ramp; tone: number | ((t: number) => number) },
    mark?: Mark,
  ) {
    const k = this.k
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * k * 2))
    const th = Math.max(1, Math.round((mark?.thick ?? 1) * k))
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const gx = this.tx + (a[0] + (b[0] - a[0]) * t) * k,
        gy = this.ty + (a[1] + (b[1] - a[1]) * t) * k
      const tone = typeof ink.tone === 'number' ? ink.tone : ink.tone(t)
      for (let dy = 0; dy < th; dy++)
        for (let dx = 0; dx < th; dx++)
          this.put(
            Math.floor(gx + dx - (th - 1) / 2),
            Math.floor(gy + dy - (th - 1) / 2),
            ink.ramp,
            tone,
            mark,
          )
    }
  }

  /** A ground shadow under what's already painted: a darker core in a lighter rim, two flat washes of `color`. */
  shadow(o: Oval, color: number, strength = 1) {
    this.each(
      { x0: o.x - o.rx, y0: o.y - o.ry, x1: o.x + o.rx, y1: o.y + o.ry },
      (x, y) => inOval(o, x, y),
      (x, y, gx, gy) => {
        const i = gy * this.w + gx
        if (this.px[i]) return
        const core = ((x - o.x) / o.rx) ** 2 + ((y - o.y) / o.ry) ** 2 < 0.42
        this.px[i] =
          ((color & 0x00ffffff) | (Math.round((core ? 0.3 : 0.15) * strength * 255) << 24)) >>> 0
      },
    )
  }

  /** Rings every shape that asked for one in a darker shade of itself, one cell outside it. */
  outline() {
    const { w, h, px, edge } = this
    const add = new Uint32Array(w * h)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        // only empty cells and faint shadow take a ring; glass and anything solid keep their own colour
        if (px[i] && (edge[i] || px[i] >>> 24 > 80)) continue
        const e =
          (y > 0 && edge[i - w]) ||
          (x > 0 && edge[i - 1]) ||
          (x < w - 1 && edge[i + 1]) ||
          (y < h - 1 && edge[i + w])
        if (e) add[i] = e
      }
    for (let i = 0; i < add.length; i++) if (add[i]) px[i] = add[i]!
    return this
  }

  /** The cells as RGBA bytes, a copy. */
  bytes() {
    return new Uint8ClampedArray(this.px.buffer.slice(0) as ArrayBuffer)
  }

  /** The cells as ImageData, for `putImageData` (in a browser or worker). */
  image() {
    return new ImageData(this.bytes(), this.w, this.h)
  }
}
