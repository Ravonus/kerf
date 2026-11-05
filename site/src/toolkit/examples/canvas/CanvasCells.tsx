import type { CanvasFrame } from '@weft-js/warp'
import { Canvas } from '@weft-js/warp'
import { token, STAGE } from './paint-primitives'

export function drawCells({ ctx, width, height, time }: CanvasFrame) {
  ctx.fillStyle = token(ctx, '--warp-color-surface-hover')
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = token(ctx, '--warp-color-accent-solid')
  for (let x = 0; x < width; x++) {
    const top = Math.floor(height / 2 + Math.sin(x / 6 + time) * height * 0.3)
    ctx.fillRect(x, top, 1, height - top)
  }
}

export const CanvasCells = () => <Canvas draw={drawCells} animate fps={12} cell={8} style={STAGE} />
