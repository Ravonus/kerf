// Built-in dither skin painters.
import type { Brush, DitherPainter, DitherPiece, Skin } from './stage'

/** The tones that land on one ink each, for a tone ramp: soft, border, the tone's text, and the page's text. */
export const LEVEL = { soft: 0.25, edge: 0.5, tone: 0.75, ink: 1 } as const
const { soft: S, edge: E, tone: T, ink: K } = LEVEL
const INTERACTIVE = 'a[href], button, [tabindex]:not([tabindex="-1"])'

export const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export type Box = [number, number, number, number]

export function inRound(x: number, y: number, [X, Y, W, H]: Box, R: number) {
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
export const glow = (p: DitherPiece, x: number, y: number) =>
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
    const box: Box = [p.x, p.y, p.w, p.h]
    b.fill(p.x - 3, p.y - 3, p.w + 6, p.h + 6, p.r + 3, (cx, cy) =>
      inRound(cx, cy, box, p.r) || b.threshold(cx, cy) < 0.5 ? 0 : -1,
    )
  },
}
