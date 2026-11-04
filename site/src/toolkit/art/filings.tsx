import { Canvas, type CanvasFrame as Frame } from '@weft-js/warp'
import { inks, type ArtProps, type Meta } from './shared'
import code from './filings.tsx?raw'

export const meta: Meta = {
  name: 'Filings',
  description:
    'Iron filings around two poles. Bring the pointer in as a third, and click to flip it.',
  kind: 'pointer',
  code,
  rest: true,
}

const PITCH = 11,
  LENGTH = 9
const colours = inks({
  near: '--warp-color-text',
  mid: '--warp-color-text-subtle',
  far: '--warp-color-text-faint',
})

export default function Filings(_: ArtProps) {
  let cols = 0,
    rows = 0,
    angle = new Float32Array(0),
    polarity = 1
  const draw = ({ ctx, width, height, dt, pointer, tier }: Frame) => {
    const c = colours(ctx.canvas),
      nc = Math.ceil(width / PITCH),
      nr = Math.ceil(height / PITCH),
      fresh = nc !== cols || nr !== rows
    if (fresh) {
      cols = nc
      rows = nr
      angle = new Float32Array(cols * rows)
    }
    const ax = width * 0.33,
      bx = width * 0.67,
      mid = height / 2,
      poles = [
        [ax, mid, 1],
        [bx, mid, -1],
        ...(pointer.in ? [[pointer.x, pointer.y, 2.2 * polarity]] : []),
      ] as number[][]
    const k = fresh || !dt ? 1 : Math.min(1, dt * (tier.reach > 0 ? 12 : 60)),
      buckets: number[][] = [[], [], []]
    let moving = false
    for (let y = 0, i = 0; y < rows; y++)
      for (let x = 0; x < cols; x++, i++) {
        const px = (x + 0.5) * PITCH,
          py = (y + 0.5) * PITCH
        let fx = 0,
          fy = 0
        for (const [qx, qy, q] of poles) {
          const dx = px - qx!,
            dy = py - qy!,
            d = dx * dx + dy * dy + 80,
            s = (q! * 30000) / d
          fx += (dx / Math.sqrt(d)) * s
          fy += (dy / Math.sqrt(d)) * s
        }
        const want = Math.atan2(fy, fx),
          turn = ((want - angle[i]! + Math.PI * 3) % (Math.PI * 2)) - Math.PI
        if (Math.abs(turn) > 0.01) moving = true
        const now = (angle[i]! += turn * k),
          power = Math.hypot(fx, fy),
          tick = LENGTH * Math.min(1, 0.5 + power * 0.1),
          cos = (Math.cos(now) * tick) / 2,
          sin = (Math.sin(now) * tick) / 2
        buckets[power > 7 ? 0 : power > 1.6 ? 1 : 2]!.push(px - cos, py - sin, px + cos, py + sin)
      }
    ctx.clearRect(0, 0, width, height)
    ctx.lineCap = 'round'
    ;[c.near, c.mid, c.far].forEach((ink, n) => {
      const list = buckets[n]!
      ctx.strokeStyle = ink
      ctx.lineWidth = n ? 1 : 1.3
      ctx.beginPath()
      for (let i = 0; i < list.length; i += 4) {
        ctx.moveTo(list[i]!, list[i + 1]!)
        ctx.lineTo(list[i + 2]!, list[i + 3]!)
      }
      ctx.stroke()
    })
    return moving
  }
  return (
    <Canvas
      draw={draw}
      pointer
      onPointerDown={() => {
        polarity = -polarity
      }}
      onTheme={colours.reset}
      label="Iron filings lined up between two magnetic poles"
    />
  )
}
