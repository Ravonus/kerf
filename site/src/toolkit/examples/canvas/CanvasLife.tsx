import type { CanvasFrame } from '@weft-js/warp'
import { Canvas } from '@weft-js/warp'
import { token, STAGE } from './paint-primitives'

// Conway's Life in whole cells, stepped eight times a second; the board starts again when it resizes or dies out.
export function drawLife(
  { ctx, width, height }: CanvasFrame,
  life: { cells: Uint8Array; w: number; h: number; seed: number },
) {
  if (life.w !== width || life.h !== height || !life.cells.includes(1)) {
    life.w = width
    life.h = height
    life.cells = Uint8Array.from({ length: width * height }, (_, i) =>
      (Math.imul(i + life.seed++, 2654435761) >>> 0) % 7 < 2 ? 1 : 0,
    )
  }
  const next = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let n = 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (dx || dy)
            n += life.cells[((y + dy + height) % height) * width + ((x + dx + width) % width)]!
      next[y * width + x] = n === 3 || (n === 2 && life.cells[y * width + x]) ? 1 : 0
    }
  }
  life.cells = next
  ctx.fillStyle = token(ctx, '--warp-color-surface-sunken')
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = token(ctx, '--warp-color-positive-solid')
  for (let i = 0; i < next.length; i++)
    if (next[i]) ctx.fillRect(i % width, Math.floor(i / width), 1, 1)
}

export const CanvasLife = () => {
  const life = { cells: new Uint8Array(0), w: 0, h: 0, seed: 1 }
  return (
    <Canvas
      draw={(f) => drawLife(f, life)}
      animate
      fps={8}
      cell={6}
      label="Conway's Game of Life"
      style={STAGE}
    />
  )
}
