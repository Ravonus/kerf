import type { CanvasFrame } from '@weft-js/warp'
import { Canvas } from '@weft-js/warp'
import { token, STAGE } from './paint-primitives'

// The pointer's recent path, fading as it ages: `pointer` repaints on every move, and `animate` finishes the fade.
export function drawTrail(
  { ctx, width, height, time, pointer }: CanvasFrame,
  trail: { x: number; y: number; at: number }[],
) {
  if (pointer.in) trail.push({ x: pointer.x, y: pointer.y, at: time })
  while (trail.length && (time - trail[0]!.at > 1.2 || trail.length > 120)) trail.shift()
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = token(ctx, '--warp-color-accent-solid')
  ctx.lineCap = 'round'
  for (let i = 1; i < trail.length; i++) {
    const age = (time - trail[i]!.at) / 1.2
    ctx.globalAlpha = 1 - age
    ctx.lineWidth = 2 + (1 - age) * 10
    ctx.beginPath()
    ctx.moveTo(trail[i - 1]!.x, trail[i - 1]!.y)
    ctx.lineTo(trail[i]!.x, trail[i]!.y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = token(ctx, '--warp-color-text-subtle')
  ctx.font = `13px ${getComputedStyle(ctx.canvas).fontFamily}`
  if (!trail.length) ctx.fillText('Move the pointer across', 16, 28)
}

export const CanvasTrail = () => {
  const trail: { x: number; y: number; at: number }[] = []
  return <Canvas draw={(f) => drawTrail(f, trail)} animate pointer style={STAGE} />
}
