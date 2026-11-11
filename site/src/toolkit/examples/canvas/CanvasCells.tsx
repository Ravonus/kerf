import type { CanvasFrame } from '@kerf-js/veneer'
import { Canvas } from '@kerf-js/veneer'
import { token, STAGE } from './paint-primitives'

export function drawCells({
  ctx,
  width,
  height,
  time,
}: CanvasFrame) {
  ctx.fillStyle = token(ctx, '--veneer-color-surface-hover')
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = token(ctx, '--veneer-color-accent-solid')
  for (let x = 0; x < width; x++) {
    const top = Math.floor(
      height / 2 + Math.sin(x / 6 + time) * height * 0.3,
    )
    ctx.fillRect(x, top, 1, height - top)
  }
}

export const CanvasCells = () => (
  <Canvas
    draw={drawCells}
    animate
    fps={12}
    cell={8}
    style={STAGE}
  />
)
