// SignaturePad's ink (04 §4): strokes as [x, y, width] with x and y in 0–1, drawn with quadratic smoothing through the
// midpoints, so a resize or a theme change can redraw them.
/** A pen stroke: points in 0–1 of the pad, with pressure. */
export type Stroke = Array<[x: number, y: number, p: number]>

/** The next stroke width: pen pressure when there is one, else slower is wider. */
export function strokeWidth(prev: number, speed: number, pressure?: number) {
  const target = pressure ? 1 + pressure * 3 : Math.max(1.1, Math.min(3.4, 3.6 - speed * 1.4))
  return prev * 0.7 + target * 0.3
}

const segments = (P: Stroke) =>
  P.slice(1).map((b, n) => {
    const a = P[n]!,
      c = P[n + 2] ?? b
    return {
      from: n ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : [a[0], a[1]],
      via: [b[0], b[1]],
      to: [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2],
      width: (a[2] + b[2]) / 2,
    }
  })

/** Draws strokes at a size, with width following pressure. */
export function paintStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  W: number,
  H: number,
) {
  ctx.clearRect(0, 0, W, H)
  ctx.lineCap = ctx.lineJoin = 'round'
  for (const s of strokes) {
    const P = s.map(([x, y, w]) => [x * W, y * H, w]) as Stroke
    if (P.length === 1) {
      ctx.beginPath()
      ctx.arc(P[0]![0], P[0]![1], P[0]![2] / 2, 0, 7)
      ctx.fill()
    }
    for (const g of segments(P)) {
      ctx.beginPath()
      ctx.lineWidth = g.width
      ctx.moveTo(g.from[0]!, g.from[1]!)
      ctx.quadraticCurveTo(g.via[0]!, g.via[1]!, g.to[0]!, g.to[1]!)
      ctx.stroke()
    }
  }
}

const n = (v: number) => +v.toFixed(1)

/** The drawn signature as a self-contained SVG, inked in currentColor. */
export function signatureSvg(strokes: Stroke[], W = 600, H = 200) {
  const d = strokes
    .map((s) => {
      const g = segments(s.map(([x, y, w]) => [x * W, y * H, w]))
      return g.length
        ? `M${n(g[0]!.from[0]!)} ${n(g[0]!.from[1]!)}` +
            g.map((x) => `Q${n(x.via[0]!)} ${n(x.via[1]!)} ${n(x.to[0]!)} ${n(x.to[1]!)}`).join('')
        : `M${n(s[0]![0] * W)} ${n(s[0]![1] * H)}h.1`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}
