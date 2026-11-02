import { Canvas, type CanvasFrame as Frame } from '@weft-js/warp'
import { inks, rng, type ArtProps, type Meta } from './shared'
import code from './selvedge-plan.tsx?raw'

export const meta: Meta = { name: 'Selvedge Plan', description: 'A floor plan with nothing to do: hairlines, seeded ratios, a few cells in colour. Click to re-split, and the walls spring to their new places.', kind: 'generative', code, rest: true }

const DEPTH = 5
const colours = inks({ line: '--warp-color-text-subtle', soft: '--warp-color-accent-soft', mid: '--warp-color-accent-border', solid: '--warp-color-accent-solid', ground: '--warp-color-page' })

// One fixed binary tree. Re-splitting only moves its ratios, so every wall has somewhere to spring from.
const NODES = (1 << (DEPTH + 1)) - 1

export default function SelvedgePlan(_: ArtProps) {
  const at = new Float32Array(NODES), to = new Float32Array(NODES), speed = new Float32Array(NODES), tone = new Uint8Array(NODES)
  let seed = 5
  function roll() {
    const r = rng(seed++ * 7919)
    for (let i = 0; i < NODES; i++) { to[i] = 0.3 + r() * 0.4; tone[i] = r() < 0.09 ? 1 : r() < 0.04 ? 2 : 0 }
    tone[12 + (seed % 16)] = 3
  }
  roll()
  at.set(to)
  const stroke = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => { ctx.moveTo(x, y); ctx.lineTo(x + w, y + h) }

  function room(ctx: CanvasRenderingContext2D, c: ReturnType<typeof colours>, gain: number, n: number, x: number, y: number, w: number, h: number, depth: number, lines: number[]) {
    if (depth === DEPTH || (w < 34 && h < 34)) {
      const t = tone[n]!
      if (t === 3 && gain < 0.9) return
      if (t) { ctx.fillStyle = t === 1 ? c.soft : t === 2 ? c.mid : c.solid; ctx.fillRect(x, y, w, h) }
      return
    }
    const r = at[n]!
    if (w > h * 0.8) {
      const a = w * r
      lines.push(x + a, y, 0, h)
      room(ctx, c, gain, n * 2 + 1, x, y, a, h, depth + 1, lines)
      room(ctx, c, gain, n * 2 + 2, x + a, y, w - a, h, depth + 1, lines)
    } else {
      const a = h * r
      lines.push(x, y + a, w, 0)
      room(ctx, c, gain, n * 2 + 1, x, y, w, a, depth + 1, lines)
      room(ctx, c, gain, n * 2 + 2, x, y + a, w, h - a, depth + 1, lines)
    }
  }
  const draw = ({ ctx, width, height, tier, dt }: Frame) => {
    const c = colours(ctx.canvas), m = 18, lines: number[] = []
    let moving = false
    for (let i = 0; i < NODES; i++) {
      const d = to[i]! - at[i]!
      speed[i] = (speed[i]! + d * dt * 90) * Math.exp(-dt * 11)
      at[i]! += speed[i]! * dt * 14
      if (Math.abs(d) > 0.0008 || Math.abs(speed[i]!) > 0.0008) moving = true
      else at[i] = to[i]!
    }
    ctx.clearRect(0, 0, width, height)
    room(ctx, c, tier.gain, 0, m, m, width - m * 2, height - m * 2, 0, lines)
    ctx.beginPath()
    for (let i = 0; i < lines.length; i += 4) stroke(ctx, lines[i]!, lines[i + 1]!, lines[i + 2]!, lines[i + 3]!)
    ctx.rect(m, m, width - m * 2, height - m * 2)
    ctx.strokeStyle = c.line
    ctx.lineWidth = 1
    ctx.stroke()
    return moving && tier.reach > 0
  }
  return <Canvas draw={draw} pointer onPointerDown={roll} onTheme={colours.reset} label="Hairline rectangles split by seeded ratios" />
}
