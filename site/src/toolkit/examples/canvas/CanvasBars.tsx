import type { CanvasFrame } from '@weft-js/warp'
import { TRAFFIC } from '../../world'
import { Canvas } from '@weft-js/warp'
import { token, STAGE } from './paint-primitives'

// -- Canvas
export function drawRequests({ ctx, width, height, time, still }: CanvasFrame) {
  const bar = width / TRAFFIC.length,
    grow = still ? 1 : Math.min(1, time / 0.8)
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = token(ctx, '--warp-color-accent-solid')
  TRAFFIC.forEach((t, i) => {
    const h = (t.requests / 90) * height * grow
    ctx.fillRect(i * bar + 3, height - h, bar - 6, h)
  })
  return grow < 1
}

export const CanvasBars = () => (
  <Canvas
    draw={drawRequests}
    label="Requests a month, rising from 41 to 86 million"
    style={STAGE}
  />
)
