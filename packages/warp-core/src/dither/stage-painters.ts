// Built-in dither skin painters.
import type { Brush, Cells, DitherPainter, DitherPiece, Skin } from './stage'

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

/** A box grown by `n` cells on every side, its rounding with it. */
const grow = ({ x, y, w, h, r = 0 }: Cells, n: number): Cells => ({
  x: x - n,
  y: y - n,
  w: w + n * 2,
  h: h + n * 2,
  r: r + n,
})
/** The same box, moved by `d` cells down and right: a shadow. */
const shift = ({ x, y, w, h, r }: Cells, d: number): Cells => ({ x: x + d, y: y + d, w, h, r })

const focusRing = (p: DitherPiece, b: Brush) => {
  if (p.focus > 0.5) b.ring(grow(p, 2), K, { dash: 4 })
}

// The pointer's glow over a piece: brightest where it is, gone a little past the piece's middle.
export const glow = (p: DitherPiece, x: number, y: number) =>
  p.hover * Math.max(0, 1 - Math.hypot(x - p.x - p.px, y - p.y - p.py) / (Math.max(p.w, p.h) * 0.6))

/** The built-in skins. */
export const PAINTERS: Record<Skin, DitherPainter> = {
  button(p, b) {
    const { h } = p,
      outline = p.el.dataset.look === 'outline'
    if (p.disabled) {
      b.paint(p, S)
      b.ring(p, E)
      return
    }
    // The shadow is where the button sits: a press slides it home, as the element's own translate moves its text.
    const lift = Math.round(Math.max(1, h / 8) * (1 - p.press)),
      shade = b.ramp('neutral')
    if (lift) b.paint(shift(p, lift), 0.875, shade)
    b.paint(p, (cx, cy) => (outline ? glow(p, cx, cy) * 0.45 : T + glow(p, cx, cy) * 0.3))
    b.ring(p, K, { ramp: outline ? undefined : shade })
    focusRing(p, b)
  },
  card(p, b) {
    const live = p.el.matches(INTERACTIVE),
      chosen = p.on > 0.5,
      off = 2 + Math.round((live ? p.hover : 0) * 2)
    b.paint(shift(p, off), chosen ? 0.625 : 0.375)
    b.paint(p, live ? (cx, cy) => glow(p, cx, cy) * 0.2 : 0)
    b.ring(p, chosen || (live && p.hover > 0.5) ? K : E, { t: chosen ? 2 : 1 })
    focusRing(p, b)
  },
  panel(p, b) {
    b.paint(shift(p, 4), 0.625)
    b.paint(p, 0)
    b.ring(p, K)
  },
  // A title bar in the old way: every other row inked, with the label on clean ground.
  bar(p, b) {
    b.paint({ x: p.x, y: p.y, w: p.w, h: p.h }, (_, cy) => ((cy - p.y) & 1 ? 0 : E))
  },
  field(p, b) {
    const { x, y, w, h } = p,
      ramp = p.invalid ? b.ramp('critical') : p.ramp
    // The inside stays clean paper, so the caret, the selection and the words never sit on grain; focus thickens the ring.
    b.paint(p, 0)
    b.ring(p, p.disabled ? S : p.focus > 0.5 || p.invalid ? K : p.hover > 0.5 ? T : E, {
      t: p.focus > 0.5 ? 2 : 1,
      ramp: p.focus > 0.5 && !p.invalid ? b.ramp('accent') : ramp,
    })
    // A select, native or a listbox button, gets a chevron that turns over while its list is open.
    if (p.el.tagName === 'SELECT' || p.el.getAttribute('aria-haspopup') === 'listbox') {
      const cx = x + w - Math.round(h / 2) - 1,
        cy = y + (h >> 1) - 1,
        up = p.on > 0.5
      for (let i = 0; i < 3; i++)
        b.paint({ x: cx - 2 + i, y: cy + (up ? 2 - i : i), w: 5 - i * 2, h: 1 }, K, ramp)
    }
  },
  // A select's list: a panel on a short shadow, and its options, the one under the pointer or the keys filled solid.
  menu(p, b) {
    b.paint(shift(p, 2), 0.625)
    b.paint(p, 0)
    b.ring(p, K)
  },
  option(p, b) {
    const { x, y, w, h } = p
    if (p.hover > 0.5 || p.focus > 0.5) b.paint({ x, y, w, h }, T)
    else if (p.on > 0.5) b.paint({ x, y: y + 2, w: 2, h: h - 4 }, K)
  },
  check(p, b) {
    const { x, y, w, h } = p,
      radio = (p.el as HTMLInputElement).type === 'radio',
      r = radio ? w / 2 : Math.min(p.r, 1),
      inset = Math.max(2, Math.round(w / 5))
    b.ring({ x, y, w, h, r }, p.disabled ? E : K)
    // Checking dissolves the mark in, cell by cell, in the dither's own order.
    const mark = w - inset * 2
    b.paint(
      { x: x + inset, y: y + inset, w: mark, h: h - inset * 2, r: radio ? mark / 2 : 0 },
      (cx, cy) => (b.threshold(cx, cy) < p.on ? T : p.hover * S),
    )
    focusRing(p, b)
  },
  switch(p, b) {
    const { x, y, w, h } = p,
      knob = h - 4,
      kx = x + 2 + Math.round((w - h) * p.on)
    const track = { x, y, w, h, r: h / 2 },
      thumb = { x: kx, y: y + 2, w: knob, h: knob, r: knob / 2 }
    b.paint(track, (cx, cy) => (b.threshold(cx, cy) < p.on ? T : p.hover * S))
    b.ring(track, p.disabled ? E : K)
    b.paint(thumb, p.on > 0.5 ? 0 : K)
    b.ring(thumb, K)
    focusRing(p, b)
  },
  range(p, b) {
    const { x, y, w, h } = p,
      kw = Math.max(4, Math.round(h * 0.55)),
      kh = Math.round(h * (0.7 + p.hover * 0.2)),
      kx = x + Math.round((w - kw) * p.value),
      ty = y + (h >> 1) - 1
    const thumb = { x: kx, y: y + ((h - kh) >> 1), w: kw, h: kh, r: 1 }
    b.paint({ x, y: ty, w, h: 2 }, (cx, cy) => ((cx + cy) & 1 ? E : S))
    b.paint({ x, y: ty, w: kx - x, h: 2 }, T)
    b.paint(thumb, p.press > 0.5 ? T : K)
    if (p.focus > 0.5) b.ring(grow(thumb, 2), K, { dash: 4 })
  },
  // A meter fills to its value with a dithered leading edge, as if still pouring.
  meter(p, b) {
    const end = p.x + p.w * p.value
    b.paint(p, (cx) => (cx < end - 6 ? T : clamp((end - cx) / 6) * T))
    b.ring(p, E)
  },
  chip(p, b) {
    b.paint(p, (cx, cy) => (p.on > 0.5 ? T : S + glow(p, cx, cy) * 0.25))
    b.ring(p, p.on > 0.5 ? K : E)
    focusRing(p, b)
  },
  rule(p, b) {
    b.paint({ x: p.x, y: p.y + (p.h >> 1), w: p.w, h: 1 }, (cx) => ((cx >> 1) & 1 ? -1 : E))
  },
  type() {}, // painted by the stage, which keeps its masks
  art() {},
  clear(p, b) {
    // Clean ground for text, with an edge that dithers into the field instead of stopping hard.
    const box: Box = [p.x, p.y, p.w, p.h]
    b.paint(grow(p, 3), (cx, cy) =>
      inRound(cx, cy, box, p.r) || b.threshold(cx, cy) < 0.5 ? 0 : -1,
    )
  },
}
