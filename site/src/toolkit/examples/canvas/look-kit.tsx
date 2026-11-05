import type { Scene, StagePiece, StagePainter } from '@weft-js/warp'
import type { Style } from './paint-primitives'
import { outline, seedOf, stroke, paint, painters1, rng } from './paint-primitives'
import { painters2, painters3, painters4, painters5 } from './painters'

export function lookKit(st: Style) {
  const c = (s: Scene, name: string) => s.color(name)
  const ring = (p: StagePiece, s: Scene) => {
    if (p.focus < 0.5) return
    const ctx = s.ctx
    ctx.setLineDash([6, 5])
    ctx.lineDashOffset = -s.time * 24
    outline(ctx, p.x - 4, p.y - 4, p.w + 8, p.h + 8, p.r + 4, st, seedOf(p.el) + 3)
    stroke(ctx, c(s, st.accent), 2, st)
    ctx.setLineDash([])
  }
  const lift = (p: StagePiece, s: Scene, depth: number) => {
    const ctx = s.ctx
    if (st.shadow === 'soft') {
      ctx.shadowColor = 'rgb(0 0 0 / 0.2)'
      ctx.shadowBlur = depth * 3
      ctx.shadowOffsetY = depth
      outline(ctx, p.x, p.y, p.w, p.h, p.r, st, seedOf(p.el))
      ctx.fillStyle = c(s, st.paper)
      ctx.fill()
      ctx.shadowColor = 'transparent'
    }
    if (st.shadow === 'offset') {
      outline(ctx, p.x + depth, p.y + depth, p.w, p.h, p.r, st, seedOf(p.el) + 1)
      paint(ctx, c(s, st.soft), st, [p.x + depth, p.y + depth, p.w, p.h], 0.7)
    }
  }
  // `solid` keeps a surface's paper whole: a panel or a list floats over the page, and a field's words need clean ground.
  const body = (
    p: StagePiece,
    s: Scene,
    fill: string,
    line: string,
    width = 1.5,
    solid = false,
  ) => {
    const ctx = s.ctx
    outline(ctx, p.x, p.y, p.w, p.h, p.r, st, seedOf(p.el))
    paint(ctx, fill, solid ? { ...st, hatch: false } : st, [p.x, p.y, p.w, p.h])
    outline(ctx, p.x, p.y, p.w, p.h, p.r, st, seedOf(p.el))
    stroke(ctx, line, width, st)
  }
  const painters: Record<string, StagePainter> = {
    ...painters1(st, c, ring, lift, body),
    ...painters2(st, c, lift, body),
    ...painters3(st, c, ring, body),
    ...painters4(st, c, ring, body),
    ...painters5(st, c),
  }
  const overlay = (s: Scene) => {
    const ctx = s.ctx
    for (const press of s.presses) {
      ctx.globalAlpha = 1 - press.age
      ctx.beginPath()
      ctx.arc(press.x, press.y, 6 + press.age * 60, 0, Math.PI * 2)
      stroke(ctx, c(s, st.accent), 2, st)
    }
    ctx.globalAlpha = 1
    if (s.rail) {
      ctx.beginPath()
      ctx.roundRect(s.rail.x, s.rail.top, s.rail.w, s.rail.len, s.rail.w / 2)
      ctx.fillStyle = c(s, s.rail.drag ? st.accent : st.soft)
      ctx.fill()
    }
  }
  const plain = (s: Scene) => {
    s.ctx.fillStyle = c(s, st.paper)
    s.ctx.fillRect(0, 0, s.width, s.height)
  }
  // A modal's stage covers the page with a wash that fades in each time it opens.
  const veil = (s: Scene) => {
    s.ctx.globalAlpha = Math.min(1, s.live ? s.shown / 0.2 : 1) * 0.5
    s.ctx.fillStyle = '#000'
    s.ctx.fillRect(0, 0, s.width, s.height)
    s.ctx.globalAlpha = 1
  }
  return { stage: { painters, overlay, background: st.ground }, plain, veil, style: st }
}

// Words where the DOM set them, painted by the look: the page keeps them as text for selection and screen readers.
export const words = (
  p: StagePiece,
  s: Scene,
  fill: (ctx: CanvasRenderingContext2D) => void,
  tilt = 0,
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

// The colours a look starts from: an app's --stage-* if it set one, else warp's tokens, which follow light and dark.
export const TOKENS = {
  ink: 'var(--stage-ink, var(--warp-color-text))',
  paper: 'var(--stage-paper, var(--warp-color-surface))',
  accent: 'var(--stage-accent, var(--warp-color-accent-solid))',
}
