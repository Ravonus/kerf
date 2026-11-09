import type { StagePainter } from '@weft-js/warp'
import type { Style, Hands } from './paint-primitives'
import {
  stroke,
  paint,
  outline,
  seedOf,
  rng,
} from './paint-primitives'

export function fieldPainters(
  st: Style,
  hands: Hands,
): Record<string, StagePainter> {
  const { c, lift, body } = hands
  return {
    bar(p, s) {
      const ctx = s.ctx
      ctx.beginPath()
      for (let y = p.y + 3; y < p.y + p.h - 2; y += 4) {
        ctx.moveTo(p.x + 6, y)
        ctx.lineTo(p.x + p.w - 6, y)
      }
      stroke(ctx, st, { color: c(s, st.soft), width: 1 })
    },
    field(p, s) {
      const line = p.invalid
        ? c(s, '--warp-color-critical-solid')
        : c(s, p.focus > 0.5 ? st.accent : st.soft)
      body(p, s, {
        fill: c(s, st.paper),
        line,
        width: 1.5 + p.focus,
        solid: true,
      })
      if (
        p.el.tagName === 'SELECT' ||
        p.el.getAttribute('aria-haspopup') === 'listbox'
      ) {
        const ctx = s.ctx,
          x = p.x + p.w - 18,
          y = p.y + p.h / 2,
          d = p.on > 0.5 ? -3 : 3
        ctx.beginPath()
        ctx.moveTo(x - 5, y - d)
        ctx.lineTo(x, y + d)
        ctx.lineTo(x + 5, y - d)
        stroke(ctx, st, {
          color: c(s, st.ink),
          width: 1.6,
        })
      }
    },
    // A StageSelect's list, in a stage of its own: a
    // panel on a short lift, and the row under the keys
    // or pointer filled.
    menu(p, s) {
      lift(p, s, 6)
      body(p, s, {
        fill: c(s, st.paper),
        line: c(s, st.rough ? st.ink : st.soft),
        width: 1.5,
        solid: true,
      })
    },
    option(p, s) {
      if (p.hover > 0.5)
        body(p, s, {
          fill: c(s, st.accent),
          line: c(s, st.accent),
          width: 1,
        })
      else if (p.on > 0.5) {
        const ctx = s.ctx
        ctx.beginPath()
        ctx.moveTo(p.x + 3, p.y + 8)
        ctx.lineTo(p.x + 3, p.y + p.h - 8)
        stroke(ctx, st, {
          color: c(s, st.accent),
          width: 3,
        })
      }
    },
  }
}

export function checkPainters(
  st: Style,
  hands: Hands,
): Record<string, StagePainter> {
  const { c, ring, body } = hands
  return {
    check(p, s) {
      const ctx = s.ctx,
        radio =
          (p.el as HTMLInputElement).type === 'radio',
        round = radio ? p.w / 2 : 5
      body({ ...p, r: round }, s, {
        fill: c(s, p.hover ? st.soft : st.paper),
        line: c(
          s,
          st.rough
            ? st.ink
            : p.on > 0.5
              ? st.accent
              : st.soft,
        ),
        width: 1.6,
      })
      if (p.on > 0) {
        if (radio) {
          ctx.beginPath()
          ctx.arc(
            p.x + p.w / 2,
            p.y + p.h / 2,
            (p.w / 4) * p.on,
            0,
            Math.PI * 2,
          )
          paint(
            ctx,
            { ...st, hatch: false },
            {
              color: c(s, st.accent),
              box: [p.x, p.y, p.w, p.h],
            },
          )
        } else {
          // The tick draws itself on as `on` eases in.
          ctx.beginPath()
          ctx.moveTo(p.x + p.w * 0.22, p.y + p.h * 0.52)
          ctx.lineTo(p.x + p.w * 0.42, p.y + p.h * 0.72)
          ctx.lineTo(p.x + p.w * 0.8, p.y + p.h * 0.28)
          ctx.setLineDash([40 * p.on, 40])
          stroke(ctx, st, {
            color: c(s, st.accent),
            width: 2.6,
          })
          ctx.setLineDash([])
        }
      }
      ring({ ...p, r: round }, s)
    },
  }
}

export function switchPainters(
  st: Style,
  hands: Hands,
): Record<string, StagePainter> {
  const { c, ring, body } = hands
  return {
    switch(p, s) {
      const ctx = s.ctx,
        d = p.h - 6,
        kx = p.x + 3 + (p.w - p.h) * p.on
      body({ ...p, r: p.h / 2 }, s, {
        fill:
          p.on > 0.5 ? c(s, st.accent) : c(s, st.soft),
        line: c(s, st.rough ? st.ink : st.soft),
        width: 1.4,
      })
      ctx.beginPath()
      ctx.arc(
        kx + d / 2,
        p.y + 3 + d / 2,
        d / 2,
        0,
        Math.PI * 2,
      )
      ctx.fillStyle = c(s, st.paper)
      ctx.fill()
      stroke(ctx, st, { color: c(s, st.ink), width: 1.2 })
      ring({ ...p, r: p.h / 2 }, s)
    },
  }
}

export function rangeMeterPainters(
  st: Style,
  hands: Hands,
): Record<string, StagePainter> {
  const { c, ring, body } = hands
  return {
    range(p, s) {
      const ctx = s.ctx,
        y = p.y + p.h / 2,
        kx = p.x + 8 + (p.w - 16) * p.value
      ctx.beginPath()
      ctx.moveTo(p.x + 2, y)
      ctx.lineTo(p.x + p.w - 2, y)
      stroke(ctx, st, { color: c(s, st.soft), width: 4 })
      ctx.beginPath()
      ctx.moveTo(p.x + 2, y)
      ctx.lineTo(kx, y)
      stroke(ctx, st, {
        color: c(s, st.accent),
        width: 4,
      })
      ctx.beginPath()
      ctx.arc(kx, y, 8 + p.hover * 2, 0, Math.PI * 2)
      ctx.fillStyle = c(s, st.paper)
      ctx.fill()
      stroke(ctx, st, {
        color: c(s, st.accent),
        width: 2.5,
      })
      if (p.focus > 0.5)
        ring(
          {
            ...p,
            x: kx - 10,
            y: y - 10,
            w: 20,
            h: 20,
            r: 10,
          },
          s,
        )
    },
    meter(p, s) {
      body({ ...p, r: p.h / 2 }, s, {
        fill: c(s, st.paper),
        line: c(s, st.soft),
        width: 1.2,
      })
      const ctx = s.ctx
      outline(
        ctx,
        {
          ...p,
          w: Math.max(p.h, p.w * p.value),
          r: p.h / 2,
          seed: seedOf(p.el) + 5,
        },
        st,
      )
      paint(ctx, st, {
        color: c(s, st.accent),
        box: [p.x, p.y, p.w * p.value, p.h],
      })
    },
  }
}

export function chipRulePainters(
  st: Style,
  hands: Hands,
): Record<string, StagePainter> {
  const { c, ring, body } = hands
  return {
    chip(p, s) {
      body({ ...p, r: p.h / 2 }, s, {
        fill: c(
          s,
          p.on > 0.5
            ? st.accent
            : p.hover
              ? st.soft
              : st.paper,
        ),
        line: c(s, p.on > 0.5 ? st.accent : st.soft),
        width: 1.2,
      })
      ring({ ...p, r: p.h / 2 }, s)
    },
    rule(p, s) {
      const ctx = s.ctx,
        y = p.y + p.h / 2,
        j = rng(seedOf(p.el))
      ctx.beginPath()
      ctx.moveTo(p.x, y)
      for (let x = p.x; x <= p.x + p.w; x += 24)
        ctx.lineTo(x, y + j() * st.rough * 1.5)
      stroke(ctx, st, {
        color: c(s, st.soft),
        width: 1.5,
      })
    },
  }
}

export function detailPainters(
  st: Style,
  hands: Hands,
): Record<string, StagePainter> {
  const { c } = hands
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
