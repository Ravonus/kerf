import { lookKit, TOKENS, words } from './look-kit'
import {
  rng,
  seedOf,
  outline,
  stroke,
} from './paint-primitives'
import type { LookName } from './paint-primitives'

export const LOOKS = {
  flat: lookKit({
    ...TOKENS,
    soft: 'var(--stage-soft, var(--warp-color-border))',
    onFill: 'var(--warp-color-accent-on-solid)',
    rough: 0,
    glow: 0,
    hatch: false,
    shadow: 'soft',
    ground(s) {
      // Dots that scroll with the page, painted under
      // everything.
      const ctx = s.ctx,
        gap = 28,
        off = (s.scroll?.top ?? 0) % gap
      ctx.fillStyle = s.color(
        '--warp-color-surface-sunken',
      )
      ctx.fillRect(0, 0, s.width, s.height)
      ctx.fillStyle = s.color('--warp-color-border')
      for (let y = -off; y < s.height; y += gap)
        for (let x = gap / 2; x < s.width; x += gap)
          ctx.fillRect(x, y, 2, 2)
    },
    art(p, s) {
      const ctx = s.ctx,
        t = s.time * 0.4
      ctx.beginPath()
      ctx.roundRect(p.x, p.y, p.w, p.h, p.r)
      ctx.clip()
      ctx.fillStyle = s.color('--warp-color-accent-soft')
      ctx.fillRect(p.x, p.y, p.w, p.h)
      for (const [i, tone] of [
        '--warp-color-accent-solid',
        '--warp-color-info-solid',
        '--warp-color-highlight-solid',
      ].entries()) {
        const cx =
            p.x +
            p.w * (0.5 + Math.sin(t + i * 2.1) * 0.3),
          cy =
            p.y +
            p.h * (0.5 + Math.cos(t * 1.3 + i) * 0.3),
          g = ctx.createRadialGradient(
            cx,
            cy,
            0,
            cx,
            cy,
            p.w * 0.45,
          )
        g.addColorStop(0, s.color(tone))
        g.addColorStop(1, 'transparent')
        ctx.globalAlpha = 0.75
        ctx.fillStyle = g
        ctx.fillRect(p.x, p.y, p.w, p.h)
      }
    },
    type(p, s) {
      words(p, s, (ctx) => {
        const g = ctx.createLinearGradient(
          p.x,
          p.y,
          p.x + p.w,
          p.y + p.h,
        )
        g.addColorStop(0, s.color(TOKENS.accent))
        g.addColorStop(
          1,
          s.color('--warp-color-info-solid'),
        )
        ctx.fillStyle = g
      })
    },
  }),
  sketch: lookKit({
    ...TOKENS,
    soft:
      'var(--stage-soft, ' +
      'var(--warp-color-text-subtle))',
    onFill: 'var(--warp-color-text)',
    rough: 2.2,
    glow: 0,
    hatch: true,
    shadow: 'offset',
    ground(s) {
      // Ruled paper: the lines are fixed to the page, so
      // they scroll with it, and a margin rule runs down
      // the side.
      const ctx = s.ctx,
        gap = 30,
        off = (s.scroll?.top ?? 0) % gap
      ctx.fillStyle = s.color(TOKENS.paper)
      ctx.fillRect(0, 0, s.width, s.height)
      ctx.strokeStyle = s.color(
        '--warp-color-info-border',
      )
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let y = gap - off; y < s.height; y += gap) {
        ctx.moveTo(0, y + 0.5)
        ctx.lineTo(s.width, y + 0.5)
      }
      ctx.stroke()
      ctx.strokeStyle = s.color(
        '--warp-color-critical-border',
      )
      ctx.beginPath()
      ctx.moveTo(18.5, 0)
      ctx.lineTo(18.5, s.height)
      ctx.stroke()
    },
    art(p, s) {
      const ctx = s.ctx,
        j = rng(seedOf(p.el)),
        cx = p.x + p.w / 2,
        cy = p.y + p.h / 2
      ctx.strokeStyle = s.color(TOKENS.ink)
      ctx.lineWidth = 1.4
      for (
        let r = 8;
        r < Math.min(p.w, p.h) / 2;
        r += 9
      ) {
        ctx.beginPath()
        for (let a = 0; a <= Math.PI * 2.05; a += 0.3)
          ctx.lineTo(
            cx + Math.cos(a) * (r + j() * 3),
            cy + Math.sin(a) * (r + j() * 3),
          )
        ctx.stroke()
      }
      outline(
        ctx,
        p.x,
        p.y,
        p.w,
        p.h,
        0,
        LOOKS.sketch.style,
        seedOf(p.el),
      )
      stroke(
        ctx,
        s.color(TOKENS.ink),
        1.5,
        LOOKS.sketch.style,
      )
    },
    type(p, s) {
      words(
        p,
        s,
        (ctx) => (ctx.fillStyle = s.color(TOKENS.ink)),
        0.04,
      )
    },
  }),
  neon: lookKit({
    // Its own colours, a pair for each theme: an app's
    // --stage-* still wins over them.
    ink: 'var(--stage-ink, light-dark(#3a1060, #f4ecff))',
    paper:
      'var(--stage-paper, light-dark(#fff2fa, #120a24))',
    accent:
      'var(--stage-accent, light-dark(#d81b78, #ff3ea5))',
    soft:
      'var(--stage-soft, ' +
      'light-dark(#e3b8ef, #4a3a7a))',
    onFill: '#fff',
    rough: 0,
    glow: 14,
    hatch: false,
    shadow: 'none',
    ground(s) {
      // A horizon and a floor grid that rolls toward you
      // as the page scrolls and time passes.
      const ctx = s.ctx,
        w = s.width,
        h = s.height,
        hz = h * 0.42,
        sky = ctx.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(
        0,
        s.color('light-dark(#fff2fa, #07021a)'),
      )
      sky.addColorStop(
        0.42,
        s.color('light-dark(#ffd1ec, #2a0b4a)'),
      )
      sky.addColorStop(
        1,
        s.color('light-dark(#fff2fa, #07021a)'),
      )
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = ctx.shadowColor = s.color(
        'light-dark(#c86bff, #7b2cff)',
      )
      ctx.lineWidth = 1
      ctx.shadowBlur = 8
      const roll =
        ((s.scroll?.top ?? 0) / 40 + s.time * 0.6) % 1
      ctx.beginPath()
      for (let i = 0; i < 14; i++) {
        const z = (i + roll) / 14,
          y = hz + (h - hz) * z * z
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
      }
      for (let i = -12; i <= 12; i++) {
        ctx.moveTo(w / 2 + i * 12, hz)
        ctx.lineTo(w / 2 + i * w * 0.18, h)
      }
      ctx.stroke()
      ctx.shadowBlur = 0
    },
    art(p, s) {
      // A striped sun setting into the floor.
      const ctx = s.ctx,
        cx = p.x + p.w / 2,
        cy = p.y + p.h * 0.62,
        r = Math.min(p.w, p.h) * 0.38,
        g = ctx.createLinearGradient(0, cy - r, 0, cy + r)
      ctx.beginPath()
      ctx.roundRect(p.x, p.y, p.w, p.h, p.r)
      ctx.clip()
      g.addColorStop(0, '#ffd23f')
      g.addColorStop(1, s.color(LOOKS.neon.style.accent))
      ctx.shadowColor = s.color(LOOKS.neon.style.accent)
      ctx.shadowBlur = 30
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(
        cx,
        cy,
        r * (1 + p.hover * 0.06),
        0,
        Math.PI * 2,
      )
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.fillStyle = s.color(LOOKS.neon.style.paper)
      for (let i = 0; i < 6; i++) {
        const y =
          cy +
          r * (0.1 + i * 0.16) -
          ((s.time * 6) % (r * 0.16))
        ctx.fillRect(p.x, y, p.w, 2 + i * 1.2)
      }
    },
    type(p, s) {
      s.ctx.shadowColor = s.color(LOOKS.neon.style.accent)
      s.ctx.shadowBlur = 18
      words(p, s, (ctx) => {
        const g = ctx.createLinearGradient(
          p.x,
          p.y,
          p.x,
          p.y + p.h,
        )
        g.addColorStop(
          0,
          s.color('light-dark(#0aa6c9, #28e7ff)'),
        )
        g.addColorStop(
          1,
          s.color(LOOKS.neon.style.accent),
        )
        ctx.fillStyle = g
      })
    },
  }),
} satisfies Record<LookName, ReturnType<typeof lookKit>>
