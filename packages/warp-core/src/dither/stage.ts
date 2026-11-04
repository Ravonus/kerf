// The dither look: a stage (../stage) whose painters draw in whole cells of warp's inks. Each frame rebuilds typed arrays, a
// field first, then the pieces in document order, then presses and the rail, and quantizes them once to the canvas, so a
// piece costs only the cells it covers. Painters draw with a brush in tones 0–1, and the stage decides the inks.
import { LOOKS, stage, type Piece, type Scene, type StageLayout } from '../stage'
import type { Action } from '../store'
import { FIELDS, sample, stepFor, type Field, type FieldName } from './fields'
import { palette, type Ramp } from './ramp'
import { tile, type Pattern } from './tiles'

/** The skins a stage paints itself. Any other name needs a painter of your own. */
export type Skin =
  | 'button'
  | 'card'
  | 'panel'
  | 'bar'
  | 'field'
  | 'menu'
  | 'option'
  | 'check'
  | 'switch'
  | 'range'
  | 'meter'
  | 'chip'
  | 'rule'
  | 'type'
  | 'art'
  | 'clear'

/** A piece as the dither look sees it: in cells, with its ramp's id (`data-ramp`, else accent for controls and the stage's ramp for the rest). */
export interface DitherPiece extends Piece {
  ramp: number
}

/** What a painter draws with. Tones run 0–1 over a ramp's inks, and 0 clears a cell to the page underneath. */
export interface Brush {
  cols: number
  rows: number
  time: number
  set(x: number, y: number, tone: number, ramp?: number): void
  /** Fills a box, rounded by `r` cells. `tone` can be a function of the cell, returning a negative number to skip it. */
  fill(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    tone: number | ((x: number, y: number) => number),
    ramp?: number,
  ): void
  /** A border `t` cells thick inside the box. With `dash` it marches round as time passes, for focus. */
  ring(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    t: number,
    tone: number,
    ramp?: number,
    dash?: number,
  ): void
  /** The stage's field at a cell, 0–1. */
  field(x: number, y: number): number
  /** The dither threshold at a cell, 0–1: compare a coverage with it for an ordered dissolve. */
  threshold(x: number, y: number): number
  /** A ramp's id, for `set`, `fill` and `ring`. */
  ramp(ramp: Ramp): number
}

/** Paints one skin. It runs every frame the stage paints, so it should only draw. */
export type DitherPainter = (piece: DitherPiece, brush: Brush) => void

/** Options for a dither stage. */
export interface DitherStageOptions {
  layout?: StageLayout | undefined
  /** The field's inks, and the ramp of pieces that name none. Default neutral. */
  ramp?: Ramp | undefined
  /** The ground: a named field or your own function of (x, y, t). */
  kind?: FieldName | Field | undefined
  /** How strong the ground is, 0–1. 0 leaves only the pieces. */
  ground?: number | undefined
  /** The dither: an ordered Bayer matrix (`bayer2`, `bayer4`, the default, `bayer8`), blue noise, or halftone dots. */
  pattern?: Pattern | undefined
  /** CSS pixels per cell. */
  cell?: number | undefined
  /** Multiplies the tier's speed. 0 holds the ground still; pieces still answer. */
  speed?: number | undefined
  /** How far the ground travels for each pixel scrolled, 0–1: parallax. */
  drift?: number | undefined
  /** Paints a scroll rail on the right that can be dragged, in place of the native bar. */
  rail?: boolean | undefined
  /** Covers everything under the pieces with a dithered scrim, this dense: for a modal's stage. */
  veil?: number | undefined
  /** The inks a press rings out in, or false for none. Default accent. */
  ripple?: Ramp | false | undefined
  /** Painters for your own skins, or to replace a built-in one. */
  painters?: Record<string, DitherPainter> | undefined
  /** Caps the frame rate while it animates. Uncapped by default, at the display's rate. */
  fps?: number | undefined
}

/** The tones that land on one ink each, for a tone ramp: soft, border, the tone's text, and the page's text. */
export const LEVEL = { soft: 0.25, edge: 0.5, tone: 0.75, ink: 1 } as const
const { soft: S, edge: E, tone: T, ink: K } = LEVEL
const VEIL: Ramp = ['none', '--warp-color-text']
const PAPER: Ramp = ['--warp-color-surface']
const CONTROLS = new Set(['button', 'option', 'check', 'switch', 'range', 'meter', 'type'])
const INTERACTIVE = 'a[href], button, [tabindex]:not([tabindex="-1"])'

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function inRound(x: number, y: number, X: number, Y: number, W: number, H: number, R: number) {
  if (x < X || y < Y || x >= X + W || y >= Y + H) return false
  if (R <= 0) return true
  const dx = x < X + R ? X + R - x - 0.5 : x >= X + W - R ? x - (X + W - R) + 0.5 : 0
  const dy = y < Y + R ? Y + R - y - 0.5 : y >= Y + H - R ? y - (Y + H - R) + 0.5 : 0
  return dx * dx + dy * dy <= R * R
}

const focusRing = (p: DitherPiece, b: Brush) => {
  if (p.focus > 0.5) b.ring(p.x - 2, p.y - 2, p.w + 4, p.h + 4, p.r + 2, 1, K, undefined, 4)
}

// The pointer's glow over a piece: brightest where it is, gone a little past the piece's middle.
const glow = (p: DitherPiece, x: number, y: number) =>
  p.hover * Math.max(0, 1 - Math.hypot(x - p.x - p.px, y - p.y - p.py) / (Math.max(p.w, p.h) * 0.6))

/** The built-in skins. */
export const PAINTERS: Record<Skin, DitherPainter> = {
  button(p, b) {
    const { x, y, w, h, r } = p,
      outline = p.el.dataset.look === 'outline'
    if (p.disabled) {
      b.fill(x, y, w, h, r, S)
      b.ring(x, y, w, h, r, 1, E)
      return
    }
    // The shadow is where the button sits: a press slides it home, as the element's own translate moves its text.
    const lift = Math.round(Math.max(1, h / 8) * (1 - p.press)),
      shade = b.ramp('neutral')
    if (lift) b.fill(x + lift, y + lift, w, h, r, 0.875, shade)
    b.fill(x, y, w, h, r, (cx, cy) =>
      outline ? glow(p, cx, cy) * 0.45 : T + glow(p, cx, cy) * 0.3,
    )
    b.ring(x, y, w, h, r, 1, K, outline ? undefined : shade)
    focusRing(p, b)
  },
  card(p, b) {
    const { x, y, w, h, r } = p,
      live = p.el.matches(INTERACTIVE),
      chosen = p.on > 0.5,
      off = 2 + Math.round((live ? p.hover : 0) * 2)
    b.fill(x + off, y + off, w, h, r, chosen ? 0.625 : 0.375)
    b.fill(x, y, w, h, r, live ? (cx, cy) => glow(p, cx, cy) * 0.2 : 0)
    b.ring(x, y, w, h, r, chosen ? 2 : 1, chosen || (live && p.hover > 0.5) ? K : E)
    focusRing(p, b)
  },
  panel(p, b) {
    const { x, y, w, h, r } = p
    b.fill(x + 4, y + 4, w, h, r, 0.625)
    b.fill(x, y, w, h, r, 0)
    b.ring(x, y, w, h, r, 1, K)
  },
  // A title bar in the old way: every other row inked, with the label on clean ground.
  bar(p, b) {
    b.fill(p.x, p.y, p.w, p.h, 0, (_, cy) => ((cy - p.y) & 1 ? 0 : E))
  },
  field(p, b) {
    const { x, y, w, h, r } = p,
      ramp = p.invalid ? b.ramp('critical') : p.ramp
    // The inside stays clean paper, so the caret, the selection and the words never sit on grain; focus thickens the ring.
    b.fill(x, y, w, h, r, 0)
    b.ring(
      x,
      y,
      w,
      h,
      r,
      p.focus > 0.5 ? 2 : 1,
      p.disabled ? S : p.focus > 0.5 || p.invalid ? K : p.hover > 0.5 ? T : E,
      p.focus > 0.5 && !p.invalid ? b.ramp('accent') : ramp,
    )
    // A select, native or a listbox button, gets a chevron that turns over while its list is open.
    if (p.el.tagName === 'SELECT' || p.el.getAttribute('aria-haspopup') === 'listbox') {
      const cx = x + w - Math.round(h / 2) - 1,
        cy = y + (h >> 1) - 1,
        up = p.on > 0.5
      for (let i = 0; i < 3; i++)
        b.fill(cx - 2 + i, cy + (up ? 2 - i : i), 5 - i * 2, 1, 0, K, ramp)
    }
  },
  // A select's list: a panel on a short shadow, and its options, the one under the pointer or the keys filled solid.
  menu(p, b) {
    const { x, y, w, h, r } = p
    b.fill(x + 2, y + 2, w, h, r, 0.625)
    b.fill(x, y, w, h, r, 0)
    b.ring(x, y, w, h, r, 1, K)
  },
  option(p, b) {
    const { x, y, w, h } = p
    if (p.hover > 0.5 || p.focus > 0.5) b.fill(x, y, w, h, 0, T)
    else if (p.on > 0.5) b.fill(x, y + 2, 2, h - 4, 0, K)
  },
  check(p, b) {
    const { x, y, w, h } = p,
      radio = (p.el as HTMLInputElement).type === 'radio',
      r = radio ? w / 2 : Math.min(p.r, 1),
      inset = Math.max(2, Math.round(w / 5))
    b.ring(x, y, w, h, r, 1, p.disabled ? E : K)
    // Checking dissolves the mark in, cell by cell, in the dither's own order.
    b.fill(
      x + inset,
      y + inset,
      w - inset * 2,
      h - inset * 2,
      radio ? (w - inset * 2) / 2 : 0,
      (cx, cy) => (b.threshold(cx, cy) < p.on ? T : p.hover * S),
    )
    focusRing(p, b)
  },
  switch(p, b) {
    const { x, y, w, h } = p,
      knob = h - 4,
      kx = x + 2 + Math.round((w - h) * p.on)
    b.fill(x, y, w, h, h / 2, (cx, cy) => (b.threshold(cx, cy) < p.on ? T : p.hover * S))
    b.ring(x, y, w, h, h / 2, 1, p.disabled ? E : K)
    b.fill(kx, y + 2, knob, knob, knob / 2, p.on > 0.5 ? 0 : K)
    b.ring(kx, y + 2, knob, knob, knob / 2, 1, K)
    focusRing(p, b)
  },
  range(p, b) {
    const { x, y, w, h } = p,
      kw = Math.max(4, Math.round(h * 0.55)),
      kh = Math.round(h * (0.7 + p.hover * 0.2)),
      kx = x + Math.round((w - kw) * p.value),
      ty = y + (h >> 1) - 1
    b.fill(x, ty, w, 2, 0, (cx, cy) => ((cx + cy) & 1 ? E : S))
    b.fill(x, ty, kx - x, 2, 0, T)
    b.fill(kx, y + ((h - kh) >> 1), kw, kh, 1, p.press > 0.5 ? T : K)
    if (p.focus > 0.5)
      b.ring(kx - 2, y + ((h - kh) >> 1) - 2, kw + 4, kh + 4, 2, 1, K, undefined, 4)
  },
  // A meter fills to its value with a dithered leading edge, as if still pouring.
  meter(p, b) {
    const { x, y, w, h, r } = p,
      end = x + w * p.value
    b.fill(x, y, w, h, r, (cx) => (cx < end - 6 ? T : clamp((end - cx) / 6) * T))
    b.ring(x, y, w, h, r, 1, E)
  },
  chip(p, b) {
    const { x, y, w, h, r } = p
    b.fill(x, y, w, h, r, (cx, cy) => (p.on > 0.5 ? T : S + glow(p, cx, cy) * 0.25))
    b.ring(x, y, w, h, r, 1, p.on > 0.5 ? K : E)
    focusRing(p, b)
  },
  rule(p, b) {
    b.fill(p.x, p.y + (p.h >> 1), p.w, 1, 0, (cx) => ((cx >> 1) & 1 ? -1 : E))
  },
  type() {}, // painted by the stage, which keeps its masks
  art() {},
  clear(p, b) {
    // Clean ground for text, with an edge that dithers into the field instead of stopping hard.
    b.fill(p.x - 3, p.y - 3, p.w + 6, p.h + 6, p.r + 3, (cx, cy) =>
      inRound(cx, cy, p.x, p.y, p.w, p.h, p.r) || b.threshold(cx, cy) < 0.5 ? 0 : -1,
    )
  },
}

/** A stage in the dither look. The canvas sits in a paint layer that is the stage's first child. */
export function ditherStage(
  canvas: HTMLCanvasElement,
  options: DitherStageOptions = {},
): Action<DitherStageOptions> {
  let o = options
  const host = canvas.parentElement?.parentElement ?? canvas
  let cols = 0,
    rows = 0,
    time = 0,
    clock = 0,
    seenAt = 0
  let tone = new Float32Array(0),
    ink = new Uint8Array(0),
    ground = new Float32Array(0),
    out = new Uint32Array(0),
    image: ImageData | undefined
  let pattern = tile(o.pattern ?? 'bayer4'),
    ramps = new Map<string, number>(),
    inks: Uint32Array[] = []
  let masks = new WeakMap<HTMLElement, { key: string; shape: Float32Array }>()
  const arts = new WeakMap<HTMLElement, Float32Array>()
  let current: DitherPiece | undefined,
    scene: Scene | undefined,
    paper = 0

  function rampId(r: Ramp) {
    const key = typeof r === 'string' ? r : r.join('|')
    let id = ramps.get(key)
    if (id === undefined) {
      ramps.set(key, (id = inks.length))
      inks.push(palette(host, r, 4))
    }
    return id
  }
  const retheme = () => {
    ramps = new Map()
    inks = []
    masks = new WeakMap()
  }

  const threshold = (x: number, y: number) =>
    pattern.t[(y & (pattern.n - 1)) * pattern.n + (x & (pattern.n - 1))]!
  function set(x: number, y: number, v: number, r?: number) {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return
    const p = current
    if (p && p.seen < 1 && threshold(x, y) >= p.seen) return
    // A piece that clears a cell lays the page's surface there, so whatever is under the stage, a modal's page say, stays hidden.
    const i = y * cols + x
    tone[i] = v
    ink[i] = v === 0 && p ? paper : (r ?? p?.ramp ?? 0)
  }
  function fill(
    X: number,
    Y: number,
    W: number,
    H: number,
    R: number,
    v: number | ((x: number, y: number) => number),
    r?: number,
  ) {
    X = Math.round(X)
    Y = Math.round(Y)
    W = Math.round(W)
    H = Math.round(H)
    const y1 = Math.min(rows, Y + H),
      x1 = Math.min(cols, X + W),
      fn = typeof v === 'function' ? v : undefined
    for (let y = Math.max(0, Y); y < y1; y++)
      for (let x = Math.max(0, X); x < x1; x++) {
        if (R > 0 && !inRound(x, y, X, Y, W, H, R)) continue
        const t = fn ? fn(x, y) : (v as number)
        if (t >= 0) set(x, y, t, r)
      }
  }
  function ring(
    X: number,
    Y: number,
    W: number,
    H: number,
    R: number,
    t: number,
    v: number,
    r?: number,
    dash?: number,
  ) {
    X = Math.round(X)
    Y = Math.round(Y)
    W = Math.round(W)
    H = Math.round(H)
    const step = dash ? Math.floor(time * 10) : 0,
      y1 = Math.min(rows, Y + H),
      x1 = Math.min(cols, X + W)
    for (let y = Math.max(0, Y); y < y1; y++)
      for (let x = Math.max(0, X); x < x1; x++) {
        if (
          !inRound(x, y, X, Y, W, H, R) ||
          inRound(x, y, X + t, Y + t, W - t * 2, H - t * 2, Math.max(0, R - t))
        )
          continue
        if (!dash || (x + y + step) % dash < dash / 2) set(x, y, v, r)
      }
  }
  const brush: Brush = {
    cols: 0,
    rows: 0,
    time: 0,
    set,
    fill,
    ring,
    threshold,
    ramp: rampId,
    field: (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? 0 : ground[y * cols + x]!),
  }

  function grow(w: number, h: number) {
    cols = brush.cols = w
    rows = brush.rows = h
    tone = new Float32Array(w * h)
    ink = new Uint8Array(w * h)
    ground = new Float32Array(w * h)
    image = new ImageData(w, h)
    out = new Uint32Array(image.data.buffer)
    masks = new WeakMap()
  }

  // Display type: the stage's words, drawn at three times the grid and averaged into coverage per cell.
  function typeMask(p: DitherPiece) {
    const key = `${p.w}x${p.h}:${p.el.textContent}`,
      had = masks.get(p.el)
    if (had?.key === key) return had.shape
    const SS = 3,
      c = document.createElement('canvas')
    c.width = Math.max(1, p.w * SS)
    c.height = Math.max(1, p.h * SS)
    const g = c.getContext('2d', { willReadFrequently: true })
    if (!g || !scene) return
    g.fillStyle = '#fff'
    g.scale(SS, SS)
    for (const w of scene.words(p.el)) {
      g.font = w.font
      if ('letterSpacing' in g) g.letterSpacing = `${w.spacing}px`
      g.fillText(w.text, w.x - p.x, w.y - p.y)
    }
    const px = g.getImageData(0, 0, c.width, c.height).data,
      shape = new Float32Array(p.w * p.h)
    for (let i = 3, q = 0; i < px.length; i += 4, q++)
      shape[Math.floor(q / c.width / SS) * p.w + Math.floor((q % c.width) / SS)]! +=
        px[i]! / (255 * SS * SS)
    masks.set(p.el, { key, shape })
    return shape
  }

  function paintType(p: DitherPiece) {
    const shape = typeMask(p)
    if (!shape) return
    // Strokes are solid ink cut at a hard edge, so letters read as pixels rather than noise. Cells that
    // only graze a stroke clear to paper, which keeps a one-cell halo between the letters and the ground.
    fill(p.x, p.y, p.w, p.h, 0, (x, y) => {
      const c = shape[(y - p.y) * p.w + (x - p.x)] ?? 0
      return c >= 0.4 ? T : c > 0.04 ? 0 : -1
    })
  }

  function paintArt(p: DitherPiece) {
    const kind = (p.el.dataset.kind as FieldName | undefined) ?? 'flow',
      cells = Math.max(0, p.w * p.h)
    let buf = arts.get(p.el)
    if (!buf || buf.length !== cells) arts.set(p.el, (buf = new Float32Array(cells)))
    sample(FIELDS[kind] ?? FIELDS.flow, p.w, p.h, 12 + clock + p.hover, buf, stepFor(cells))
    fill(p.x, p.y, p.w, p.h, p.r, (x, y) => {
      const v = buf[(y - p.y) * p.w + (x - p.x)]!
      return clamp(v * v * (1.05 + p.hover * 0.3) + glow(p, x, y) * 0.3)
    })
    ring(p.x, p.y, p.w, p.h, p.r, 1, E, 0)
  }

  function paint(sc: Scene) {
    const { ctx, width, height, time: now, live } = sc
    scene = sc
    if (width !== cols || height !== rows) grow(width, height)
    if (!inks.length) rampId(o.ramp ?? 'neutral')
    paper = rampId(PAPER)
    if (!image || !cols) return
    time = brush.time = now
    clock += (now - seenAt) * (o.speed ?? 1) * (live ? 1 : 0) * 2
    seenAt = now

    // The ground: the field, travelling with the scroll so the page moves through it.
    const strength = o.ground ?? 0.5
    if (strength > 0) {
      const f = o.kind ?? 'weave',
        fn = typeof f === 'function' ? f : FIELDS[f],
        off = ((sc.scroll?.top ?? 0) * (o.drift ?? 0.35)) / sc.unit / rows
      sample(
        off ? (x, y, t) => fn(x, y + off, t) : fn,
        cols,
        rows,
        12 + clock,
        ground,
        stepFor(cols * rows),
      )
      for (let i = 0; i < tone.length; i++) {
        const g = ground[i]!
        tone[i] = g * g * strength
        ink[i] = 0
      }
    } else {
      tone.fill(0)
      ink.fill(0)
    }

    let moving = false
    if (o.veil) {
      const veil = live ? Math.min(1, sc.shown / 0.35) : 1,
        id = rampId(VEIL),
        dense = o.veil * veil
      if (veil < 1) moving = true
      for (let y = 0, i = 0; y < rows; y++)
        for (let x = 0; x < cols; x++, i++)
          if (threshold(x, y) < dense) {
            tone[i] = 1
            ink[i] = id
          }
    }

    for (const piece of sc.pieces) {
      const p = piece as DitherPiece,
        d = p.el.dataset.ramp
      p.ramp = d ? rampId(d as Ramp) : CONTROLS.has(p.skin) ? rampId('accent') : 0
      current = p
      const own = o.painters?.[p.skin]
      if (own) own(p, brush)
      else if (p.skin === 'type') paintType(p)
      else if (p.skin === 'art') paintArt(p)
      else PAINTERS[p.skin as Skin]?.(p, brush)
    }
    current = undefined

    // A press rings out from where it landed, over everything, in the ripple's inks.
    if (o.ripple !== false) {
      const id = rampId(o.ripple ?? 'accent')
      for (const { x: px, y: py, age } of sc.presses) {
        const rad = 3 + age * 36,
          reach = Math.ceil(rad + 2)
        for (let y = Math.max(0, Math.floor(py - reach)); y < Math.min(rows, py + reach); y++)
          for (let x = Math.max(0, Math.floor(px - reach)); x < Math.min(cols, px + reach); x++) {
            if (Math.abs(Math.hypot(x - px, y - py) - rad) < 1.4 && threshold(x, y) > age)
              set(x, y, 1, id)
          }
      }
    }
    if (sc.rail) {
      const { x, top, len, drag } = sc.rail
      fill(cols - 3, 0, 2, rows, 0, (_, y) => (y & 1 ? -1 : S))
      fill(Math.min(x, cols - 3), top, 2, len, 0, drag ? K : T, rampId('accent'))
    }

    const n = pattern.n,
      m = n - 1,
      t = pattern.t
    for (let y = 0, i = 0; y < rows; y++) {
      const row = (y & m) * n
      for (let x = 0; x < cols; x++, i++) {
        const pal = inks[ink[i]!]!,
          top = pal.length - 1,
          at = tone[i]! * top + t[row + (x & m)]! * 0.9 + 0.05
        out[i] = pal[at >= top ? top : at <= 0 ? 0 : at | 0]!
      }
    }
    ctx.putImageData(image, 0, 0)
    return moving
  }

  const core = () => ({
    layout: o.layout,
    cell: o.cell ?? 3,
    rail: o.rail,
    fps: o.fps,
    animate: (o.ground ?? 0.5) > 0 && (o.speed ?? 1) > 0,
    paint,
    onTheme: retheme,
  })
  const s = stage(canvas, core())
  // A float out of this stage, a select's list, is dithered too: clean paper, no rail, veil or ripple.
  LOOKS.set(host, (c) => {
    const f = ditherStage(c, {
      ...o,
      layout: 'box',
      rail: false,
      veil: undefined,
      ripple: false,
      ground: 0,
    })
    return { update() {}, destroy: () => f.destroy() }
  })
  void document.fonts?.ready.then(() => {
    masks = new WeakMap()
  })
  return {
    update(next) {
      o = next
      pattern = tile(o.pattern ?? 'bayer4')
      retheme()
      s.update(core())
    },
    destroy: () => s.destroy(),
  }
}
