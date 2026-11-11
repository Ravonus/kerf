import type { CanvasFrame } from '@kerf/veneer'
import { Canvas } from '@kerf/veneer'
import { token, STAGE } from './paint-primitives'

export function drawWave({
  ctx,
  width,
  height,
  time,
}: CanvasFrame) {
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = token(
    ctx,
    '--veneer-color-accent-solid',
  )
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let x = 0; x <= width; x += 4)
    ctx.lineTo(
      x,
      height / 2 +
        Math.sin(x / 40 + time * 2) *
          Math.sin(x / 160 - time / 2) *
          height *
          0.35,
    )
  ctx.stroke()
}

export const CanvasWave = () => (
  <Canvas
    draw={drawWave}
    animate
    style={STAGE}
  />
)
