import { Canvas, type CanvasFrame as Frame } from '@kerf/veneer'
import { inks, rng, type ArtProps, type Meta } from './shared'
import code from './selvedge-plan.tsx?raw'

export const meta: Meta = {
  name: 'Selvedge Plan',
  description:
    'A floor plan with nothing to do: hairlines, seeded ratios, a few cells in colour. Click to re-split, and the walls spring to their new places.',
  kind: 'generative',
  code,
  rest: true,
}

const DEPTH = 5
const colours = inks({
  line: '--veneer-color-text-subtle',
  soft: '--veneer-color-accent-soft',
  mid: '--veneer-color-accent-border',
  solid: '--veneer-color-accent-solid',
  ground: '--veneer-color-page',
})

// One fixed binary tree. Re-splitting only moves its ratios, so every wall has somewhere to spring from.
const NODES = (1 << (DEPTH + 1)) - 1

export default function SelvedgePlan(_: ArtProps) {
  const at = new Float32Array(NODES),
    to = new Float32Array(NODES),
    speed = new Float32Array(NODES),
    tone = new Uint8Array(NODES)
  const walls = { at, to, speed }
  let seed = 5
  function roll() {
    const r = rng(seed++ * 7919)
    for (let i = 0; i < NODES; i++) {
      to[i] = 0.3 + r() * 0.4
      tone[i] = r() < 0.09 ? 1 : r() < 0.04 ? 2 : 0
    }
    tone[12 + (seed % 16)] = 3
  }
  roll()
  at.set(to)

  const draw = ({ ctx, width, height, tier, dt }: Frame) => {
    const c = colours(ctx.canvas),
      m = 18,
      lines: number[] = []
    const moving = moveWalls(walls, dt)
    ctx.clearRect(0, 0, width, height)
    const plan = { at, tone, ctx, c, gain: tier.gain, lines }
    room(plan, { n: 0, x: m, y: m, w: width - m * 2, h: height - m * 2, depth: 0 })
    ctx.beginPath()
    for (let i = 0; i < lines.length; i += 4)
      stroke(ctx, { x: lines[i]!, y: lines[i + 1]!, w: lines[i + 2]!, h: lines[i + 3]! })
    ctx.rect(m, m, width - m * 2, height - m * 2)
    ctx.strokeStyle = c.line
    ctx.lineWidth = 1
    ctx.stroke()
    return moving && tier.reach > 0
  }
  return (
    <Canvas
      draw={draw}
      pointer
      onPointerDown={roll}
      onTheme={colours.reset}
      label="Hairline rectangles split by seeded ratios"
    />
  )
}

type Rect = { x: number; y: number; w: number; h: number }

const stroke = (ctx: CanvasRenderingContext2D, { x, y, w, h }: Rect) => {
  ctx.moveTo(x, y)
  ctx.lineTo(x + w, y + h)
}

function moveWalls(walls: { at: Float32Array; to: Float32Array; speed: Float32Array }, dt: number) {
  const { at, to, speed } = walls
  let moving = false
  for (let i = 0; i < NODES; i++) {
    const d = to[i]! - at[i]!
    speed[i] = (speed[i]! + d * dt * 90) * Math.exp(-dt * 11)
    at[i]! += speed[i]! * dt * 14
    if (Math.abs(d) > 0.0008 || Math.abs(speed[i]!) > 0.0008) moving = true
    else at[i] = to[i]!
  }
  return moving
}

type Plan = {
  at: Float32Array
  tone: Uint8Array
  ctx: CanvasRenderingContext2D
  c: ReturnType<typeof colours>
  gain: number
  lines: number[]
}

function room(plan: Plan, cell: Rect & { n: number; depth: number }) {
  const { at, tone, lines } = plan
  const { n, x, y, w, h, depth } = cell
  if (depth === DEPTH || (w < 34 && h < 34)) {
    fillRoom(plan, tone[n]!, cell)
    return
  }
  const r = at[n]!
  if (w > h * 0.8) {
    const a = w * r
    lines.push(x + a, y, 0, h)
    room(plan, { n: n * 2 + 1, x, y, w: a, h, depth: depth + 1 })
    room(plan, { n: n * 2 + 2, x: x + a, y, w: w - a, h, depth: depth + 1 })
  } else {
    const a = h * r
    lines.push(x, y + a, w, 0)
    room(plan, { n: n * 2 + 1, x, y, w, h: a, depth: depth + 1 })
    room(plan, { n: n * 2 + 2, x, y: y + a, w, h: h - a, depth: depth + 1 })
  }
}

function fillRoom({ ctx, c, gain }: Plan, t: number, { x, y, w, h }: Rect) {
  if (t === 3 && gain < 0.9) return
  if (t) {
    ctx.fillStyle = t === 1 ? c.soft : t === 2 ? c.mid : c.solid
    ctx.fillRect(x, y, w, h)
  }
}
