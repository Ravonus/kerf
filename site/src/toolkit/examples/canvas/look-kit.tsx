import type {
  Scene,
  StagePiece,
  StagePainter,
} from '@kerf/veneer'
import type {
  Style,
  PaintColor,
  PaintBody,
} from './paint-primitives'
import {
  outline,
  seedOf,
  stroke,
  paint,
  surfacePainters,
  rng,
} from './paint-primitives'
import {
  fieldPainters,
  checkPainters,
  switchPainters,
  rangeMeterPainters,
  chipRulePainters,
  detailPainters,
} from './painters'

function makeFocusRing(st: Style, c: PaintColor) {
  return (p: StagePiece, s: Scene) => {
    if (p.focus < 0.5) return
    const ctx = s.ctx
    ctx.setLineDash([6, 5])
    ctx.lineDashOffset = -s.time * 24
    outline(
      ctx,
      {
        x: p.x - 4,
        y: p.y - 4,
        w: p.w + 8,
        h: p.h + 8,
        r: p.r + 4,
        seed: seedOf(p.el) + 3,
      },
      st,
    )
    stroke(ctx, st, { color: c(s, st.accent), width: 2 })
    ctx.setLineDash([])
  }
}

function makeSurfaceLift(st: Style, c: PaintColor) {
  return (p: StagePiece, s: Scene, depth: number) => {
    const ctx = s.ctx
    if (st.shadow === 'soft') {
      ctx.shadowColor = 'rgb(0 0 0 / 0.2)'
      ctx.shadowBlur = depth * 3
      ctx.shadowOffsetY = depth
      outline(ctx, { ...p, seed: seedOf(p.el) }, st)
      ctx.fillStyle = c(s, st.paper)
      ctx.fill()
      ctx.shadowColor = 'transparent'
    }
    if (st.shadow === 'offset') {
      outline(
        ctx,
        {
          ...p,
          x: p.x + depth,
          y: p.y + depth,
          seed: seedOf(p.el) + 1,
        },
        st,
      )
      paint(ctx, st, {
        color: c(s, st.soft),
        box: [p.x + depth, p.y + depth, p.w, p.h],
        density: 0.7,
      })
    }
  }
}

type BodyLook = Parameters<PaintBody>[2]

function makeSurfaceBody(st: Style) {
  return (
    p: StagePiece,
    s: Scene,
    { fill, line, width = 1.5, solid = false }: BodyLook,
  ) => {
    const ctx = s.ctx
    outline(ctx, { ...p, seed: seedOf(p.el) }, st)
    paint(ctx, solid ? { ...st, hatch: false } : st, {
      color: fill,
      box: [p.x, p.y, p.w, p.h],
    })
    outline(ctx, { ...p, seed: seedOf(p.el) }, st)
    stroke(ctx, st, { color: line, width })
  }
}

function makeOverlay(st: Style, c: PaintColor) {
  return (s: Scene) => {
    const ctx = s.ctx
    for (const press of s.presses) {
      ctx.globalAlpha = 1 - press.age
      ctx.beginPath()
      ctx.arc(
        press.x,
        press.y,
        6 + press.age * 60,
        0,
        Math.PI * 2,
      )
      stroke(ctx, st, {
        color: c(s, st.accent),
        width: 2,
      })
    }
    ctx.globalAlpha = 1
    if (s.rail) {
      ctx.beginPath()
      ctx.roundRect(
        s.rail.x,
        s.rail.top,
        s.rail.w,
        s.rail.len,
        s.rail.w / 2,
      )
      ctx.fillStyle = c(
        s,
        s.rail.drag ? st.accent : st.soft,
      )
      ctx.fill()
    }
  }
}

function makePlain(st: Style, c: PaintColor) {
  return (s: Scene) => {
    s.ctx.fillStyle = c(s, st.paper)
    s.ctx.fillRect(0, 0, s.width, s.height)
  }
}

function makeVeil() {
  return (s: Scene) => {
    s.ctx.globalAlpha =
      Math.min(1, s.live ? s.shown / 0.2 : 1) * 0.5
    s.ctx.fillStyle = '#000'
    s.ctx.fillRect(0, 0, s.width, s.height)
    s.ctx.globalAlpha = 1
  }
}

export function lookKit(st: Style) {
  const c = (s: Scene, name: string) => s.color(name)
  const ring = makeFocusRing(st, c)
  const lift = makeSurfaceLift(st, c)
  // `solid` keeps a surface's paper whole: a panel or a
  // list floats over the page, and a field's words need
  // clean ground.
  const body = makeSurfaceBody(st)
  const hands = { c, ring, lift, body }
  const painters: Record<string, StagePainter> = {
    ...surfacePainters(st, hands),
    ...fieldPainters(st, hands),
    ...checkPainters(st, hands),
    ...switchPainters(st, hands),
    ...rangeMeterPainters(st, hands),
    ...chipRulePainters(st, hands),
    ...detailPainters(st, hands),
  }
  const overlay = makeOverlay(st, c)
  const plain = makePlain(st, c)
  // A modal's stage covers the page with a wash that
  // fades in each time it opens.
  const veil = makeVeil()
  return {
    stage: { painters, overlay, background: st.ground },
    plain,
    veil,
    style: st,
  }
}

// Words where the DOM set them, painted by the look: the
// page keeps them as text for selection and screen
// readers.
type WordInk = {
  fill: (ctx: CanvasRenderingContext2D) => void
  tilt?: number
}

export const words = (
  p: StagePiece,
  s: Scene,
  { fill, tilt = 0 }: WordInk,
) => {
  const ctx = s.ctx,
    j = rng(seedOf(p.el))
  fill(ctx)
  for (const w of s.words(p.el)) {
    ctx.font = w.font
    ctx.letterSpacing = `${w.spacing}px`
    ctx.save()
    ctx.translate(w.x, w.y)
    ctx.rotate(j() * tilt)
    ctx.fillText(w.text, 0, 0)
    ctx.restore()
  }
}

// The colours a look starts from: an app's --stage-* if
// it set one, else veneer's tokens, which follow light and
// dark.
export const TOKENS = {
  ink: 'var(--stage-ink, var(--veneer-color-text))',
  paper: 'var(--stage-paper, var(--veneer-color-surface))',
  accent:
    'var(--stage-accent, var(--veneer-color-accent-solid))',
}
