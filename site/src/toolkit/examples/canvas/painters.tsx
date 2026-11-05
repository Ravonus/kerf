import type { StagePainter } from '@weft-js/warp'
import type { Style, PaintColor, PaintRing, PaintLift, PaintBody } from './paint-primitives'
import { stroke, paint, outline, seedOf, rng } from './paint-primitives'

export function fieldPainters(
  st: Style,
  c: PaintColor,
  lift: PaintLift,
  body: PaintBody,
): Record<string, StagePainter> {
  return {
    bar(p, s) {
      const ctx = s.ctx
      ctx.beginPath()
      for (let y = p.y + 3; y < p.y + p.h - 2; y += 4) {
        ctx.moveTo(p.x + 6, y)
        ctx.lineTo(p.x + p.w - 6, y)
      }
      stroke(ctx, c(s, st.soft), 1, st)
    },
    field(p, s) {
      const line = p.invalid
        ? c(s, '--warp-color-critical-solid')
        : c(s, p.focus > 0.5 ? st.accent : st.soft)
      body(p, s, c(s, st.paper), line, 1.5 + p.focus, true)
      if (p.el.tagName === 'SELECT' || p.el.getAttribute('aria-haspopup') === 'listbox') {
        const ctx = s.ctx,
          x = p.x + p.w - 18,
          y = p.y + p.h / 2,
          d = p.on > 0.5 ? -3 : 3
        ctx.beginPath()
        ctx.moveTo(x - 5, y - d)
        ctx.lineTo(x, y + d)
        ctx.lineTo(x + 5, y - d)
        stroke(ctx, c(s, st.ink), 1.6, st)
      }
    },
    // A StageSelect's list, in a stage of its own: a panel on a short lift, and the row under the keys or pointer filled.
    menu(p, s) {
      lift(p, s, 6)
      body(p, s, c(s, st.paper), c(s, st.rough ? st.ink : st.soft), 1.5, true)
    },
    option(p, s) {
      if (p.hover > 0.5) body(p, s, c(s, st.accent), c(s, st.accent), 1)
      else if (p.on > 0.5) {
        const ctx = s.ctx
        ctx.beginPath()
        ctx.moveTo(p.x + 3, p.y + 8)
        ctx.lineTo(p.x + 3, p.y + p.h - 8)
        stroke(ctx, c(s, st.accent), 3, st)
      }
    },
  }
}

export function checkPainters(
  st: Style,
  c: PaintColor,
  ring: PaintRing,
  body: PaintBody,
): Record<string, StagePainter> {
  return {
    check(p, s) {
      const ctx = s.ctx,
        radio = (p.el as HTMLInputElement).type === 'radio',
        round = radio ? p.w / 2 : 5
      body(
        { ...p, r: round },
        s,
        c(s, p.hover ? st.soft : st.paper),
        c(s, st.rough ? st.ink : p.on > 0.5 ? st.accent : st.soft),
        1.6,
      )
      if (p.on > 0) {
        if (radio) {
          ctx.beginPath()
          ctx.arc(p.x + p.w / 2, p.y + p.h / 2, (p.w / 4) * p.on, 0, Math.PI * 2)
          paint(ctx, c(s, st.accent), { ...st, hatch: false }, [p.x, p.y, p.w, p.h])
        } else {
          // The tick draws itself on as `on` eases in.
          ctx.beginPath()
          ctx.moveTo(p.x + p.w * 0.22, p.y + p.h * 0.52)
          ctx.lineTo(p.x + p.w * 0.42, p.y + p.h * 0.72)
          ctx.lineTo(p.x + p.w * 0.8, p.y + p.h * 0.28)
          ctx.setLineDash([40 * p.on, 40])
          stroke(ctx, c(s, st.accent), 2.6, st)
          ctx.setLineDash([])
        }
      }
      ring({ ...p, r: round }, s)
    },
  }
}

export function switchPainters(
  st: Style,
  c: PaintColor,
  ring: PaintRing,
  body: PaintBody,
): Record<string, StagePainter> {
  return {
    switch(p, s) {
      const ctx = s.ctx,
        d = p.h - 6,
        kx = p.x + 3 + (p.w - p.h) * p.on
      body(
        { ...p, r: p.h / 2 },
        s,
        p.on > 0.5 ? c(s, st.accent) : c(s, st.soft),
        c(s, st.rough ? st.ink : st.soft),
        1.4,
      )
      ctx.beginPath()
      ctx.arc(kx + d / 2, p.y + 3 + d / 2, d / 2, 0, Math.PI * 2)
      ctx.fillStyle = c(s, st.paper)
      ctx.fill()
      stroke(ctx, c(s, st.ink), 1.2, st)
      ring({ ...p, r: p.h / 2 }, s)
    },
  }
}

export function rangeMeterPainters(
  st: Style,
  c: PaintColor,
  ring: PaintRing,
  body: PaintBody,
): Record<string, StagePainter> {
  return {
    range(p, s) {
      const ctx = s.ctx,
        y = p.y + p.h / 2,
        kx = p.x + 8 + (p.w - 16) * p.value
      ctx.beginPath()
      ctx.moveTo(p.x + 2, y)
      ctx.lineTo(p.x + p.w - 2, y)
      stroke(ctx, c(s, st.soft), 4, st)
      ctx.beginPath()
      ctx.moveTo(p.x + 2, y)
      ctx.lineTo(kx, y)
      stroke(ctx, c(s, st.accent), 4, st)
      ctx.beginPath()
      ctx.arc(kx, y, 8 + p.hover * 2, 0, Math.PI * 2)
      ctx.fillStyle = c(s, st.paper)
      ctx.fill()
      stroke(ctx, c(s, st.accent), 2.5, st)
      if (p.focus > 0.5) ring({ ...p, x: kx - 10, y: y - 10, w: 20, h: 20, r: 10 }, s)
    },
    meter(p, s) {
      body({ ...p, r: p.h / 2 }, s, c(s, st.paper), c(s, st.soft), 1.2)
      const ctx = s.ctx
      outline(ctx, p.x, p.y, Math.max(p.h, p.w * p.value), p.h, p.h / 2, st, seedOf(p.el) + 5)
      paint(ctx, c(s, st.accent), st, [p.x, p.y, p.w * p.value, p.h])
    },
  }
}

export function chipRulePainters(
  st: Style,
  c: PaintColor,
  ring: PaintRing,
  body: PaintBody,
): Record<string, StagePainter> {
  return {
    chip(p, s) {
      body(
        { ...p, r: p.h / 2 },
        s,
        c(s, p.on > 0.5 ? st.accent : p.hover ? st.soft : st.paper),
        c(s, p.on > 0.5 ? st.accent : st.soft),
        1.2,
      )
      ring({ ...p, r: p.h / 2 }, s)
    },
    rule(p, s) {
      const ctx = s.ctx,
        y = p.y + p.h / 2,
        j = rng(seedOf(p.el))
      ctx.beginPath()
      ctx.moveTo(p.x, y)
      for (let x = p.x; x <= p.x + p.w; x += 24) ctx.lineTo(x, y + j() * st.rough * 1.5)
      stroke(ctx, c(s, st.soft), 1.5, st)
    },
  }
}

export function detailPainters(st: Style, c: PaintColor): Record<string, StagePainter> {
  return {
    clear(p, s) {
      const ctx = s.ctx
      ctx.beginPath()
      ctx.roundRect(p.x - 4, p.y - 4, p.w + 8, p.h + 8, 8)
      ctx.globalAlpha = 0.86
      ctx.fillStyle = c(s, st.paper)
      ctx.fill()
    },
    type: st.type,
    art: st.art,
  }
}
