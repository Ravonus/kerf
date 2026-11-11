import type {
  Scene,
  StagePiece,
  StagePainter,
} from '@kerf-js/veneer'

export const STAGE = 'block-size:240px'

// A token can hold light-dark(), which a canvas can't
// read, so let CSS resolve it first.
export const token = (
  ctx: CanvasRenderingContext2D,
  name: string,
) => {
  ctx.canvas.style.color = `var(${name})`
  return getComputedStyle(ctx.canvas).color
}

export const SOFT = { angle: 30 }

// A look is a set of painters plus a background and an
// overlay. This kit makes three from one set of shapes:
// clean
// vector, pencil on paper, and neon. Only how a line and
// a fill are drawn changes between them.
export type LookName = 'flat' | 'sketch' | 'neon'

export type Style = {
  ink: string
  paper: string
  accent: string
  soft: string
  /** Text on a filled button or chip. */
  onFill: string
  /** Pixels of wobble: 0 draws clean lines. */
  rough: number
  /** Glow, in pixels of blur. */
  glow: number
  /** Fills as pencil hatching instead of solid. */
  hatch: boolean
  shadow: 'soft' | 'offset' | 'none'
  ground: (s: Scene) => void
  art: (p: StagePiece, s: Scene) => void
  type: (p: StagePiece, s: Scene) => void
}

// Seeded per element, so a sketchy line wobbles the same
// way every frame instead of boiling.
export const seeds = new WeakMap<Element, number>()

export let seedNext = 1

export const seedOf = (el: Element) => {
  let v = seeds.get(el)
  if (v === undefined)
    seeds.set(el, (v = seedNext++ * 7919))
  return v
}

export const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647 - 0.5
}

type Pt = [number, number]

export type Box = {
  x: number
  y: number
  w: number
  h: number
  r: number
  seed: number
}

export function outline(
  ctx: CanvasRenderingContext2D,
  box: Box,
  st: Style,
) {
  const { x, y, w, h, r, seed } = box
  ctx.beginPath()
  if (!st.rough) {
    ctx.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2))
    return
  }
  const j = rng(seed),
    k = st.rough,
    pts: Pt[] = []
  const edge = (a: Pt, b: Pt) => {
    const n = Math.max(
      2,
      Math.round(
        Math.hypot(b[0] - a[0], b[1] - a[1]) / 28,
      ),
    )
    for (let i = 0; i < n; i++)
      pts.push([
        a[0] + ((b[0] - a[0]) * i) / n + j() * k,
        a[1] + ((b[1] - a[1]) * i) / n + j() * k,
      ])
  }
  edge([x, y], [x + w, y])
  edge([x + w, y], [x + w, y + h])
  edge([x + w, y + h], [x, y + h])
  edge([x, y + h], [x, y])
  ctx.moveTo(pts[0]![0], pts[0]![1])
  for (let i = 1; i <= pts.length; i++) {
    const [px, py] = pts[i % pts.length]!
    ctx.lineTo(px, py)
  }
  ctx.lineTo(pts[0]![0] + j() * k, pts[0]![1] + j() * k)
}

export function stroke(
  ctx: CanvasRenderingContext2D,
  st: Style,
  pen: { color: string; width: number },
) {
  const { color, width } = pen
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineJoin = ctx.lineCap = 'round'
  if (st.glow) {
    ctx.shadowColor = color
    ctx.shadowBlur = st.glow
  }
  ctx.stroke()
  ctx.shadowBlur = 0
}

export function paint(
  ctx: CanvasRenderingContext2D,
  st: Style,
  fill: {
    color: string
    box: [number, number, number, number]
    density?: number
  },
) {
  const { color, box, density = 1 } = fill
  if (!st.hatch) {
    ctx.fillStyle = color
    ctx.fill()
    return
  }
  // Pencil hatching: the shape clips a run of diagonal
  // strokes.
  const [x, y, w, h] = box,
    gap = 7 / density
  ctx.save()
  ctx.clip()
  ctx.beginPath()
  for (let d = -h; d < w; d += gap) {
    ctx.moveTo(x + d, y + h)
    ctx.lineTo(x + d + h, y)
  }
  ctx.strokeStyle = color
  ctx.lineWidth = 1.6
  ctx.globalAlpha = 0.55
  ctx.stroke()
  ctx.restore()
}

export type PaintColor = (
  s: Scene,
  name: string,
) => string
export type PaintRing = (p: StagePiece, s: Scene) => void
export type PaintLift = (
  p: StagePiece,
  s: Scene,
  depth: number,
) => void
export type PaintBody = (
  p: StagePiece,
  s: Scene,
  look: {
    fill: string
    line: string
    width?: number
    solid?: boolean
  },
) => void

export type Hands = {
  c: PaintColor
  ring: PaintRing
  lift: PaintLift
  body: PaintBody
}

export function surfacePainters(
  st: Style,
  hands: Hands,
): Record<string, StagePainter> {
  const { c, ring, lift, body } = hands
  return {
    button(p, s) {
      const outlineOnly = p.el.dataset.look === 'outline',
        y = p.press * 2
      lift({ ...p, y: p.y + y }, s, 4 - p.press * 3)
      const at = { ...p, y: p.y + y }
      body(at, s, {
        fill: outlineOnly
          ? c(s, p.hover ? st.soft : st.paper)
          : c(s, p.disabled ? st.soft : st.accent),
        line: c(
          s,
          outlineOnly || st.rough ? st.ink : st.accent,
        ),
        width: outlineOnly ? 1.5 : 1,
      })
      if (p.hover && !st.hatch && !outlineOnly) {
        const g = s.ctx.createRadialGradient(
          p.x + p.px,
          p.y + p.py,
          0,
          p.x + p.px,
          p.y + p.py,
          p.w * 0.7,
        )
        g.addColorStop(
          0,
          `rgb(255 255 255 / ${0.28 * p.hover})`,
        )
        g.addColorStop(1, 'rgb(255 255 255 / 0)')
        outline(s.ctx, { ...at, seed: seedOf(p.el) }, st)
        s.ctx.fillStyle = g
        s.ctx.fill()
      }
      ring(p, s)
    },
    card(p, s) {
      const live = p.el.matches('a[href], button'),
        chosen = p.on > 0.5
      lift(p, s, 6 + (live ? p.hover * 6 : 0))
      body(p, s, {
        fill: c(s, st.paper),
        line: c(
          s,
          chosen
            ? st.accent
            : st.rough
              ? st.ink
              : st.soft,
        ),
        width: chosen ? 3 : 1.5,
      })
      ring(p, s)
    },
    panel(p, s) {
      lift(p, s, 14)
      body(p, s, {
        fill: c(s, st.paper),
        line: c(s, st.ink),
        width: 1.5,
        solid: true,
      })
    },
  }
}
