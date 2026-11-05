import type { CanvasFrame } from '@weft-js/warp'
import { Canvas } from '@weft-js/warp'
import { token, STAGE } from './paint-primitives'

export function drawSpotlight({ ctx, width, height, pointer }: CanvasFrame) {
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = token(ctx, '--warp-color-text-subtle')
  for (let x = 12; x < width; x += 24) {
    for (let y = 12; y < height; y += 24) {
      const near = pointer.in ? Math.max(0, 1 - Math.hypot(x - pointer.x, y - pointer.y) / 120) : 0
      ctx.beginPath()
      ctx.arc(x, y, 1.5 + near * 6, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

export const CanvasPointer = () => <Canvas draw={drawSpotlight} pointer style={STAGE} />
