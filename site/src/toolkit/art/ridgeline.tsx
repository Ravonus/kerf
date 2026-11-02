import { Canvas, type CanvasFrame as Frame } from '@weft/warp'
import { fbm, inks, smooth, type ArtProps, type Meta } from './shared'
import code from './ridgeline.tsx?raw'

export const meta: Meta = { name: 'Ridgeline', description: 'Forty ridges of noise, drawn back to front so each one hides what stands behind it. The pointer lifts the land under it.', kind: 'generative', code, wide: true }

const LINES = 40, POINTS = 150
const colours = inks({ line: '--warp-color-text', ground: '--warp-color-page', accent: '--warp-color-accent-text' })

export default function Ridgeline({ live = true }: ArtProps) {
  let px = 0, lift = 0
  const ys = new Float32Array(POINTS + 1)
  const draw = ({ ctx, width, height, time, tier, pointer, dt }: Frame) => {
    const c = colours(ctx.canvas), inset = width * 0.11, span = width - inset * 2, gap = (height * 0.74) / LINES, t = 30 + time * tier.speed * 0.05, relief = height * 0.34
    lift += ((pointer.in ? 1 : 0) - lift) * Math.min(1, dt * 5)
    if (pointer.in) px += (pointer.x - px) * Math.min(1, dt * 9)
    ctx.clearRect(0, 0, width, height)
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    for (let i = 0; i < LINES; i++) {
      const base = height * 0.2 + i * gap
      for (let n = 0; n <= POINTS; n++) {
        const u = n / POINTS, x = inset + u * span, centre = smooth(0, 0.42, u) * smooth(1, 0.58, u), peak = centre * centre
        const h = fbm(u * 5.5 + 3, i * 0.13 + t, 3), lifted = lift ? Math.exp(-(((x - px) / 70) ** 2)) * lift * smooth(0, 1, 1 - Math.abs(pointer.y - base) / 180) : 0
        ys[n] = base - (0.03 + 1.1 * (h * h) * peak + 0.12 * peak * h) * relief * (1 + lifted * 0.9)
      }
      ctx.beginPath()
      ctx.moveTo(inset, ys[0]!)
      for (let n = 1; n <= POINTS; n++) ctx.lineTo(inset + (n / POINTS) * span, ys[n]!)
      ctx.lineTo(inset + span, base + 40)
      ctx.lineTo(inset, base + 40)
      ctx.closePath()
      ctx.fillStyle = c.ground
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(inset, ys[0]!)
      for (let n = 1; n <= POINTS; n++) ctx.lineTo(inset + (n / POINTS) * span, ys[n]!)
      ctx.strokeStyle = i === 27 ? c.accent : c.line
      ctx.stroke()
    }
    return lift > 0.01 && lift < 0.99
  }
  return <Canvas draw={draw} animate={live} fps={30} pointer onTheme={colours.reset} label="Forty ridges of a hidden-line landscape" />
}
