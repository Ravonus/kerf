import type { CanvasFrame } from '@weft-js/warp'
import { Canvas } from '@weft-js/warp'
import { token, STAGE } from './paint-primitives'

// The expression dial where the canvas sits: `frame.tier` says how much to move and how far to reach.
export function drawOrbits({ ctx, width, height, time, tier }: CanvasFrame) {
  const count = Math.round(4 + tier.reach * 14),
    cx = width / 2,
    cy = height / 2
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = token(ctx, '--warp-color-accent-solid')
  for (let i = 0; i < count; i++) {
    const ring = 30 + (i % 4) * 22,
      a = time * (0.3 + tier.speed) * (i % 2 ? 1 : -0.7) + (i / count) * Math.PI * 2
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * ring * 1.8, cy + Math.sin(a) * ring, 3 + (i % 3), 0, Math.PI * 2)
    ctx.fill()
  }
}

export const CanvasOrbits = () => <Canvas draw={drawOrbits} animate style={STAGE} />
