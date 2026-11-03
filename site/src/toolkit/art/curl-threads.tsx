import { Canvas, type CanvasFrame as Frame } from '@weft-js/warp'
import { fbm, inks, rng, type ArtProps, type Meta } from './shared'
import code from './curl-threads.tsx?raw'

export const meta: Meta = { name: 'Curl Threads', description: 'Six hundred strands combed around eddies you can\'t see. Move the pointer in and it becomes one more.', kind: 'generative', code }

const COUNT = 600, STEP = 1.1
const colours = inks({ line: '--warp-color-text-subtle', accent: '--warp-color-accent-text' })

export default function CurlThreads({ live = true }: ArtProps) {
  const x = new Float32Array(COUNT), y = new Float32Array(COUNT), age = new Float32Array(COUNT), random = rng(4)
  let w = 0, h = 0, drift = 0, prepared = false
  const respawn = (i: number) => { x[i] = random() * w; y[i] = random() * h; age[i] = 90 + random() * 200 }
  const potential = (px: number, py: number) => fbm(px * 0.0052 + drift, py * 0.0052 - drift * 0.5, 2)

  function walk(ctx: CanvasRenderingContext2D, from: number, to: number, px: number, py: number, over: boolean) {
    ctx.beginPath()
    for (let i = from; i < to; i++) {
      const e = 2.5, n1 = potential(x[i]!, y[i]! + e), n2 = potential(x[i]!, y[i]! - e), n3 = potential(x[i]! + e, y[i]!), n4 = potential(x[i]! - e, y[i]!)
      let vx = (n1 - n2) * 130, vy = (n4 - n3) * 130
      if (over) { const dx = x[i]! - px, dy = y[i]! - py, d = dx * dx + dy * dy + 900, k = 2400 / d; vx += -dy * k * 0.05; vy += dx * k * 0.05 }
      const nx = x[i]! + vx * STEP, ny = y[i]! + vy * STEP
      if (--age[i]! < 0 || nx < -8 || ny < -8 || nx > w + 8 || ny > h + 8) { respawn(i); continue }
      ctx.moveTo(x[i]!, y[i]!)
      ctx.lineTo(nx, ny)
      x[i] = nx
      y[i] = ny
    }
    ctx.stroke()
  }
  function strands(ctx: CanvasRenderingContext2D, c: ReturnType<typeof colours>, px: number, py: number, over: boolean) {
    ctx.lineWidth = 0.7
    ctx.strokeStyle = c.line
    walk(ctx, 0, COUNT - 60, px, py, over)
    ctx.lineWidth = 1
    ctx.strokeStyle = c.accent
    walk(ctx, COUNT - 60, COUNT, px, py, over)
  }
  const draw = ({ ctx, width, height, still, tier, pointer, dt }: Frame) => {
    const c = colours(ctx.canvas)
    if (width !== w || height !== h || !prepared) {
      w = width; h = height
      for (let i = 0; i < COUNT; i++) respawn(i)
      ctx.clearRect(0, 0, w, h)
      ctx.globalAlpha = 0.85
      for (let n = 0; n < 46; n++) strands(ctx, c, 0, 0, false)
      ctx.globalAlpha = 1
      prepared = true
    }
    if (still) return
    drift += dt * 0.012 * tier.speed
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = 'rgb(0 0 0 / 0.022)'
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 0.85
    strands(ctx, c, pointer.x, pointer.y, pointer.in)
    ctx.globalAlpha = 1
  }
  return <Canvas draw={draw} animate={live} fps={30} pointer onTheme={() => { colours.reset(); prepared = false }} label="Long strands flowing around invisible eddies" />
}
