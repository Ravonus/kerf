// Per-stage drawing state and frame rendering.
import type { Scene } from '../stage'
import { FIELDS, sample, stepFor, type FieldName } from './fields'
import { palette, type Ramp } from './ramp'
import { clamp, glow, inRound, LEVEL, PAINTERS, type Box } from './stage-painters'
import type { Brush, Cells, DitherPiece, DitherStageOptions, Line, Skin } from './stage'
import type { tile } from './tiles'

export type StageState = {
  o: DitherStageOptions
  host: HTMLElement
  cols: number
  rows: number
  time: number
  clock: number
  seenAt: number
  tone: Float32Array
  ink: Uint8Array
  ground: Float32Array
  out: Uint32Array
  image: ImageData | undefined
  pattern: ReturnType<typeof tile>
  ramps: Map<string, number>
  inks: Uint32Array[]
  masks: WeakMap<HTMLElement, { key: string; shape: Float32Array }>
  arts: WeakMap<HTMLElement, Float32Array>
  current: DitherPiece | undefined
  scene: Scene | undefined
  paper: number
}

const { soft: S, edge: E, tone: T, ink: K } = LEVEL
const VEIL: Ramp = ['none', '--warp-color-text']
const PAPER: Ramp = ['--warp-color-surface']
const CONTROLS = new Set(['button', 'option', 'check', 'switch', 'range', 'meter', 'type'])
type RampId = (r: Ramp) => number

function stageRamps(st: StageState) {
  function rampId(r: Ramp) {
    const key = typeof r === 'string' ? r : r.join('|')
    let id = st.ramps.get(key)
    if (id === undefined) {
      st.ramps.set(key, (id = st.inks.length))
      st.inks.push(palette(st.host, r, 4))
    }
    return id
  }
  const retheme = () => {
    st.ramps = new Map()
    st.inks = []
    st.masks = new WeakMap()
  }

  return { rampId, retheme }
}

function stageDrawing(st: StageState) {
  const threshold = (x: number, y: number) =>
    st.pattern.t[(y & (st.pattern.n - 1)) * st.pattern.n + (x & (st.pattern.n - 1))]!
  function set(x: number, y: number, v: number, r?: number) {
    if (x < 0 || y < 0 || x >= st.cols || y >= st.rows) return
    const p = st.current
    if (p && p.seen < 1 && threshold(x, y) >= p.seen) return
    // A piece that clears a cell lays the page's surface there, so whatever is under the stage, a modal's page say, stays hidden.
    const i = y * st.cols + x
    st.tone[i] = v
    st.ink[i] = v === 0 && p ? st.paper : (r ?? p?.ramp ?? 0)
  }
  const cells = ({ x, y, w, h }: Cells): Box => [
    Math.round(x),
    Math.round(y),
    Math.round(w),
    Math.round(h),
  ]
  function paint(box: Cells, v: number | ((x: number, y: number) => number), r?: number) {
    const outer = cells(box),
      [X, Y, W, H] = outer,
      R = box.r ?? 0,
      y1 = Math.min(st.rows, Y + H),
      x1 = Math.min(st.cols, X + W),
      fn = typeof v === 'function' ? v : undefined
    for (let y = Math.max(0, Y); y < y1; y++)
      for (let x = Math.max(0, X); x < x1; x++) {
        if (R > 0 && !inRound(x, y, outer, R)) continue
        const t = fn ? fn(x, y) : (v as number)
        if (t >= 0) set(x, y, t, r)
      }
  }
  function ring(box: Cells, v: number, { t = 1, ramp: r, dash }: Line = {}) {
    const outer = cells(box),
      [X, Y, W, H] = outer,
      R = box.r ?? 0,
      inner: Box = [X + t, Y + t, W - t * 2, H - t * 2],
      step = dash ? Math.floor(st.time * 10) : 0,
      y1 = Math.min(st.rows, Y + H),
      x1 = Math.min(st.cols, X + W)
    for (let y = Math.max(0, Y); y < y1; y++)
      for (let x = Math.max(0, X); x < x1; x++) {
        if (!inRound(x, y, outer, R) || inRound(x, y, inner, Math.max(0, R - t))) continue
        if (!dash || (x + y + step) % dash < dash / 2) set(x, y, v, r)
      }
  }
  return { threshold, set, paint, ring }
}

function stageSurface(st: StageState, rampId: RampId) {
  const { threshold, set, paint, ring } = stageDrawing(st)
  const brush: Brush = {
    cols: 0,
    rows: 0,
    time: 0,
    set,
    paint,
    ring,
    threshold,
    ramp: rampId,
    field: (x, y) =>
      x < 0 || y < 0 || x >= st.cols || y >= st.rows ? 0 : st.ground[y * st.cols + x]!,
  }

  function grow(w: number, h: number) {
    st.cols = brush.cols = w
    st.rows = brush.rows = h
    st.tone = new Float32Array(w * h)
    st.ink = new Uint8Array(w * h)
    st.ground = new Float32Array(w * h)
    st.image = new ImageData(w, h)
    st.out = new Uint32Array(st.image.data.buffer)
    st.masks = new WeakMap()
  }

  return { brush, grow, threshold, set, paint, ring }
}

function stageDetails(st: StageState, paint: Brush['paint'], ring: Brush['ring']) {
  // Display type: the stage's words, drawn at three times the grid and averaged into coverage per cell.
  function typeMask(p: DitherPiece) {
    const key = `${p.w}x${p.h}:${p.el.textContent}`,
      had = st.masks.get(p.el)
    if (had?.key === key) return had.shape
    const SS = 3,
      c = document.createElement('canvas')
    c.width = Math.max(1, p.w * SS)
    c.height = Math.max(1, p.h * SS)
    const g = c.getContext('2d', { willReadFrequently: true })
    if (!g || !st.scene) return
    g.fillStyle = '#fff'
    g.scale(SS, SS)
    for (const w of st.scene.words(p.el)) {
      g.font = w.font
      if ('letterSpacing' in g) g.letterSpacing = `${w.spacing}px`
      g.fillText(w.text, w.x - p.x, w.y - p.y)
    }
    const px = g.getImageData(0, 0, c.width, c.height).data,
      shape = new Float32Array(p.w * p.h)
    for (let i = 3, q = 0; i < px.length; i += 4, q++)
      shape[Math.floor(q / c.width / SS) * p.w + Math.floor((q % c.width) / SS)]! +=
        px[i]! / (255 * SS * SS)
    st.masks.set(p.el, { key, shape })
    return shape
  }

  function paintType(p: DitherPiece) {
    const shape = typeMask(p)
    if (!shape) return
    // Strokes are solid ink cut at a hard edge, so letters read as pixels rather than noise. Cells that
    // only graze a stroke clear to paper, which keeps a one-cell halo between the letters and the ground.
    paint({ x: p.x, y: p.y, w: p.w, h: p.h }, (x, y) => {
      const c = shape[(y - p.y) * p.w + (x - p.x)] ?? 0
      return c >= 0.4 ? T : c > 0.04 ? 0 : -1
    })
  }

  function paintArt(p: DitherPiece) {
    const kind = (p.el.dataset.kind as FieldName | undefined) ?? 'flow',
      cells = Math.max(0, p.w * p.h)
    let buf = st.arts.get(p.el)
    if (!buf || buf.length !== cells) st.arts.set(p.el, (buf = new Float32Array(cells)))
    sample(
      FIELDS[kind] ?? FIELDS.flow,
      { cols: p.w, rows: p.h },
      12 + st.clock + p.hover,
      buf,
      stepFor(cells),
    )
    paint(p, (x, y) => {
      const v = buf[(y - p.y) * p.w + (x - p.x)]!
      return clamp(v * v * (1.05 + p.hover * 0.3) + glow(p, x, y) * 0.3)
    })
    ring(p, E, { ramp: 0 })
  }

  return { paintType, paintArt }
}

function paintGround(st: StageState, sc: Scene) {
  // The ground: the field, travelling with the scroll so the page moves through it.
  const strength = st.o.ground ?? 0.5
  if (strength > 0) {
    const f = st.o.kind ?? 'weave',
      fn = typeof f === 'function' ? f : FIELDS[f],
      off = ((sc.scroll?.top ?? 0) * (st.o.drift ?? 0.35)) / sc.unit / st.rows
    sample(
      off ? (x, y, t) => fn(x, y + off, t) : fn,
      st,
      12 + st.clock,
      st.ground,
      stepFor(st.cols * st.rows),
    )
    for (let i = 0; i < st.tone.length; i++) {
      const g = st.ground[i]!
      st.tone[i] = g * g * strength
      st.ink[i] = 0
    }
  } else {
    st.tone.fill(0)
    st.ink.fill(0)
  }
}

function paintVeil(
  st: StageState,
  sc: Scene,
  live: boolean,
  rampId: RampId,
  threshold: Brush['threshold'],
) {
  let moving = false
  if (st.o.veil) {
    const veil = live ? Math.min(1, sc.shown / 0.35) : 1,
      id = rampId(VEIL),
      dense = st.o.veil * veil
    if (veil < 1) moving = true
    for (let y = 0, i = 0; y < st.rows; y++)
      for (let x = 0; x < st.cols; x++, i++)
        if (threshold(x, y) < dense) {
          st.tone[i] = 1
          st.ink[i] = id
        }
  }

  return moving
}

function paintPieces(
  st: StageState,
  sc: Scene,
  rampId: RampId,
  brush: Brush,
  {
    paintType,
    paintArt,
  }: { paintType: (p: DitherPiece) => void; paintArt: (p: DitherPiece) => void },
) {
  for (const piece of sc.pieces) {
    const p = piece as DitherPiece,
      d = p.el.dataset.ramp
    p.ramp = d ? rampId(d as Ramp) : CONTROLS.has(p.skin) ? rampId('accent') : 0
    st.current = p
    const own = st.o.painters?.[p.skin]
    if (own) own(p, brush)
    else if (p.skin === 'type') paintType(p)
    else if (p.skin === 'art') paintArt(p)
    else PAINTERS[p.skin as Skin]?.(p, brush)
  }
  st.current = undefined
}

function paintOverlay(st: StageState, sc: Scene, rampId: RampId, brush: Brush) {
  // A press rings out from where it landed, over everything, in the ripple's inks.
  if (st.o.ripple !== false) {
    const id = rampId(st.o.ripple ?? 'accent')
    for (const { x: px, y: py, age } of sc.presses) {
      const rad = 3 + age * 36,
        reach = Math.ceil(rad + 2)
      for (let y = Math.max(0, Math.floor(py - reach)); y < Math.min(st.rows, py + reach); y++)
        for (let x = Math.max(0, Math.floor(px - reach)); x < Math.min(st.cols, px + reach); x++) {
          if (Math.abs(Math.hypot(x - px, y - py) - rad) < 1.4 && brush.threshold(x, y) > age)
            brush.set(x, y, 1, id)
        }
    }
  }
  if (sc.rail) {
    const { x, top, len, drag } = sc.rail
    brush.paint({ x: st.cols - 3, y: 0, w: 2, h: st.rows }, (_, y) => (y & 1 ? -1 : S))
    brush.paint(
      { x: Math.min(x, st.cols - 3), y: top, w: 2, h: len },
      drag ? K : T,
      rampId('accent'),
    )
  }
}

function paintOutput(st: StageState, ctx: CanvasRenderingContext2D) {
  const n = st.pattern.n,
    m = n - 1,
    t = st.pattern.t
  for (let y = 0, i = 0; y < st.rows; y++) {
    const row = (y & m) * n
    for (let x = 0; x < st.cols; x++, i++) {
      const pal = st.inks[st.ink[i]!]!,
        top = pal.length - 1,
        at = st.tone[i]! * top + t[row + (x & m)]! * 0.9 + 0.05
      st.out[i] = pal[at >= top ? top : at <= 0 ? 0 : at | 0]!
    }
  }
  ctx.putImageData(st.image!, 0, 0)
}

export function stageRenderer(st: StageState) {
  const { rampId, retheme } = stageRamps(st)
  const { brush, grow, threshold } = stageSurface(st, rampId)
  const details = stageDetails(st, brush.paint, brush.ring)
  function paint(sc: Scene) {
    const { ctx, width, height, time: now, live } = sc
    st.scene = sc
    if (width !== st.cols || height !== st.rows) grow(width, height)
    if (!st.inks.length) rampId(st.o.ramp ?? 'neutral')
    st.paper = rampId(PAPER)
    if (!st.image || !st.cols) return
    st.time = brush.time = now
    st.clock += (now - st.seenAt) * (st.o.speed ?? 1) * (live ? 1 : 0) * 2
    st.seenAt = now
    paintGround(st, sc)
    const moving = paintVeil(st, sc, live, rampId, threshold)
    paintPieces(st, sc, rampId, brush, details)
    paintOverlay(st, sc, rampId, brush)
    paintOutput(st, ctx)
    return moving
  }
  return { paint, retheme }
}
