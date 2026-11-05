import { Canvas, type CanvasFrame as Frame } from '@weft-js/warp'
import { inks, type ArtProps, type Meta } from './shared'
import code from './pluck.tsx?raw'

export const meta: Meta = {
  name: 'Pluck',
  description:
    'Sixty strings, each a one-dimensional wave equation. Drag across them. When they settle the canvas stops, so at rest it costs nothing.',
  kind: 'pointer',
  code,
  wide: true,
  rest: true,
}

const STRINGS = 60,
  NODES = 44,
  WAVE = 0.3,
  DAMP = 0.996
const colours = inks({
  line: '--warp-color-border-control',
  hot: '--warp-color-accent-text',
  spark: '--warp-color-sweep',
})

export default function Pluck(_: ArtProps) {
  const u = new Float32Array(STRINGS * NODES),
    v = new Float32Array(STRINGS * NODES)
  let lx = -1,
    due = 0,
    ready = false

  const draw = ({ ctx, width, height, dt, tier, pointer }: Frame) => {
    const c = colours(ctx.canvas),
      gap = width / (STRINGS + 1),
      my = 14,
      cell = (height - my * 2) / (NODES - 1)
    if (!ready) {
      chord(u, v)
      ready = true
    }
    if (tier.reach > 0 && pointer.in) {
      if (lx >= 0 && pointer.x !== lx) {
        const a = Math.floor(Math.min(lx, pointer.x) / gap),
          b = Math.floor(Math.max(lx, pointer.x) / gap),
          dir = pointer.x > lx ? 1 : -1
        for (let s = Math.max(0, a); s <= Math.min(STRINGS - 1, b); s++)
          if (s + 1 > Math.min(lx, pointer.x) / gap && s + 1 <= Math.max(lx, pointer.x) / gap)
            bendString(
              u,
              s,
              Math.max(0.1, Math.min(0.9, (pointer.y - my) / (height - my * 2))),
              dir * (pointer.down ? 22 : 13),
            )
      }
      lx = pointer.x
    } else lx = -1
    let peak = 0
    if (tier.reach > 0) {
      due = Math.min(due + dt, 0.05)
      for (; due > 0.004; due -= 0.004) peak = stepStrings(u, v)
    }
    ctx.clearRect(0, 0, width, height)
    paintStrings(ctx, c, u, gap, my, cell)
    return tier.reach > 0 && peak > 0.05
  }
  return (
    <Canvas
      draw={draw}
      pointer
      style="touch-action:pan-y"
      onTheme={colours.reset}
      label="Sixty strings that ring when dragged across"
    />
  )
}

/** Bends string `s` into a soft triangle peaking at `k` along it, the shape a finger leaves. */
function bendString(u: Float32Array, s: number, k: number, size: number) {
  const at = s * NODES
  for (let n = 1; n < NODES - 1; n++) {
    const f = n / (NODES - 1)
    u[at + n] = size * (f < k ? f / k : (1 - f) / (1 - k))
  }
}

function stepStrings(u: Float32Array, v: Float32Array) {
  let peak = 0
  for (let s = 0; s < STRINGS; s++) {
    const at = s * NODES
    for (let n = 1; n < NODES - 1; n++) {
      const i = at + n
      v[i] = (v[i]! + (u[i - 1]! + u[i + 1]! - 2 * u[i]!) * WAVE) * DAMP
    }
  }
  for (let i = 0; i < u.length; i++) {
    u[i]! += v[i]!
    const a = Math.abs(u[i]!) + Math.abs(v[i]!)
    if (a > peak) peak = a
  }
  return peak
}

function paintStrings(
  ctx: CanvasRenderingContext2D,
  c: ReturnType<typeof colours>,
  u: Float32Array,
  gap: number,
  my: number,
  cell: number,
) {
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath()
    for (let s = 0; s < STRINGS; s++) {
      const at = s * NODES,
        x = (s + 1) * gap
      let energy = 0
      for (let n = 1; n < NODES - 1; n += 4) energy += Math.abs(u[at + n]!)
      if (energy > 6 !== !!pass) continue
      ctx.moveTo(x + u[at]!, my)
      for (let n = 1; n < NODES; n++) ctx.lineTo(x + u[at + n]!, my + n * cell)
    }
    ctx.strokeStyle = pass ? c.hot : c.line
    ctx.lineWidth = pass ? 1.25 : 1
    ctx.stroke()
  }
}

// A still is a chord caught mid-ring: the first run of it, frozen.
function chord(u: Float32Array, v: Float32Array) {
  for (let s = 6; s < STRINGS - 6; s += 1)
    bendString(
      u,
      s,
      0.3 + 0.4 * (s / STRINGS),
      26 * Math.sin((s / STRINGS) * Math.PI) ** 3 * Math.sin(s * 0.35) ** 2,
    )
  for (let i = 0; i < 9; i++) stepStrings(u, v)
}
