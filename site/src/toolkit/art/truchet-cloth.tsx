import { Canvas, type CanvasFrame as Frame } from '@weft-js/warp'
import { inks, rng, smooth, type ArtProps, type Meta } from './shared'
import code from './truchet-cloth.tsx?raw'

export const meta: Meta = {
  name: 'Truchet Cloth',
  description:
    'A single square, two arcs, turned or not. One tile at a time the knot rewrites itself. Hover to turn the nearest.',
  kind: 'generative',
  code,
}

const SIZE = 30,
  TWEEN = 0.5,
  { PI } = Math
const colours = inks({
  line: '--warp-color-text-subtle',
  ground: '--warp-color-accent-soft',
  accent: '--warp-color-sweep',
  soft: '--warp-color-page',
})

function tile(ctx: CanvasRenderingContext2D, i: number, { r, cols }: { r: number; cols: number }) {
  const x = (i % cols) * SIZE + SIZE / 2,
    y = Math.floor(i / cols) * SIZE + SIZE / 2,
    c = Math.cos(r),
    s = Math.sin(r),
    h = SIZE / 2
  // the arcs' centres, turned by hand: a path is cheaper than a transform per tile
  const ax = x - h * c + h * s,
    ay = y - h * s - h * c,
    bx = x + h * c - h * s,
    by = y + h * s + h * c
  ctx.moveTo(ax + h * c, ay + h * s)
  ctx.arc(ax, ay, h, r, r + PI / 2)
  ctx.moveTo(bx - h * c, by - h * s)
  ctx.arc(bx, by, h, r + PI, r + PI * 1.5)
}
type Ribbon = { width: number; ink: string; ground: string; turns: Float32Array; cols: number }

function ribbon(ctx: CanvasRenderingContext2D, list: number[], o: Ribbon) {
  const { width, ink, ground, turns, cols } = o
  ctx.lineCap = 'butt'
  for (const [wide, colour] of [
    [width, ink],
    [width - 2, ground],
  ] as const) {
    ctx.beginPath()
    for (const i of list) tile(ctx, i, { r: turns[i]!, cols })
    ctx.lineWidth = wide
    ctx.strokeStyle = colour
    ctx.stroke()
  }
}

export default function TruchetCloth({ live = true }: ArtProps) {
  let cols = 0,
    rows = 0,
    turns = new Float32Array(0),
    targets = new Uint8Array(0),
    active = -1,
    phase = 0,
    wait = 0,
    last = -1
  const random = rng(3)
  const all: number[] = []
  const draw = ({ ctx, width, height, dt, still, pointer, tier }: Frame) => {
    const c = colours(ctx.canvas),
      nc = Math.ceil(width / SIZE),
      nr = Math.ceil(height / SIZE)
    if (nc !== cols || nr !== rows) {
      cols = nc
      rows = nr
      turns = new Float32Array(cols * rows)
      targets = new Uint8Array(cols * rows)
      all.length = 0
      for (let i = 0; i < turns.length; i++) {
        targets[i] = random() < 0.5 ? 0 : 1
        turns[i] = targets[i]! * (PI / 2)
        all.push(i)
      }
    }
    const over = pointer.in
      ? Math.floor(pointer.y / SIZE) * cols + Math.floor(pointer.x / SIZE)
      : -1
    if (active < 0 && over >= 0 && over !== last && over < turns.length) {
      active = last = over
      phase = 0
    }
    if (!still && active < 0 && (wait -= dt * tier.speed) < 0) {
      active = (random() * turns.length) | 0
      phase = 0
      wait = 0.14
    }
    if (active >= 0) {
      phase += dt / TWEEN
      if (phase >= 1) {
        targets[active]! ^= 1
        turns[active] = targets[active]! * (PI / 2)
        active = -1
      } else turns[active] = targets[active]! * (PI / 2) + smooth(0, 1, phase) * (PI / 2)
    }
    ctx.clearRect(0, 0, width, height)
    ribbon(ctx, all, { width: 12, ink: c.line, ground: c.ground, turns, cols })
    if (active >= 0) {
      ctx.fillStyle = c.soft
      ctx.fillRect((active % cols) * SIZE, Math.floor(active / cols) * SIZE, SIZE, SIZE)
      ribbon(ctx, [active], { width: 12, ink: c.accent, ground: c.ground, turns, cols })
    }
    return active >= 0
  }
  return (
    <Canvas
      draw={draw}
      animate={live}
      fps={30}
      pointer
      onTheme={colours.reset}
      label="A knot of ribbons that rewrites itself tile by tile"
    />
  )
}
