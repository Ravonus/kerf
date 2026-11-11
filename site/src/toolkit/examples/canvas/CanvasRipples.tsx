import type { CanvasFrame } from '@kerf/veneer'
import { Canvas } from '@kerf/veneer'
import { token, STAGE } from './paint-primitives'

// Rings that spread from wherever the pointer presses.
export function drawRipples(
  { ctx, width, height, time, pointer }: CanvasFrame,
  rings: { x: number; y: number; at: number }[],
  held: { down: boolean },
) {
  if (pointer.down && !held.down)
    rings.push({ x: pointer.x, y: pointer.y, at: time })
  held.down = pointer.down
  while (
    rings.length &&
    (time - rings[0]!.at > 1.6 || rings.length > 8)
  )
    rings.shift()
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = token(ctx, '--veneer-color-info-solid')
  ctx.lineWidth = 2
  for (const r of rings) {
    const t = (time - r.at) / 1.6
    ctx.globalAlpha = 1 - t
    for (const lag of [0, 0.15, 0.3]) {
      ctx.beginPath()
      ctx.arc(
        r.x,
        r.y,
        Math.max(0, t - lag) * 160,
        0,
        Math.PI * 2,
      )
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = token(ctx, '--veneer-color-text-subtle')
  const { fontFamily } = getComputedStyle(ctx.canvas)
  ctx.font = `13px ${fontFamily}`
  if (!rings.length)
    ctx.fillText('Press anywhere', 16, 28)
}

export const CanvasRipples = () => {
  const rings: { x: number; y: number; at: number }[] = []
  const held = { down: false }
  return (
    <Canvas
      draw={(f) => drawRipples(f, rings, held)}
      animate
      pointer
      style={STAGE}
    />
  )
}
