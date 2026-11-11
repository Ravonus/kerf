import type { CanvasFrame } from '@kerf/veneer'
import { Canvas } from '@kerf/veneer'
import { token, STAGE } from './paint-primitives'

// A still picture that covers every pixel: an opaque
// context skips blending with the page.
export function drawNight({
  ctx,
  width,
  height,
}: CanvasFrame) {
  const sky = ctx.createLinearGradient(0, 0, 0, height)
  sky.addColorStop(
    0,
    token(ctx, '--veneer-color-info-solid'),
  )
  sky.addColorStop(
    1,
    token(ctx, '--veneer-color-accent-solid'),
  )
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, width, height)
  let seed = 7
  const rand = () =>
    (seed = (seed * 16807) % 2147483647) / 2147483647
  ctx.fillStyle = '#fff'
  for (let i = 0; i < 160; i++) {
    ctx.globalAlpha = 0.3 + rand() * 0.7
    ctx.fillRect(
      rand() * width,
      rand() * height * 0.75,
      rand() < 0.1 ? 2 : 1,
      rand() < 0.1 ? 2 : 1,
    )
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = token(ctx, '--veneer-color-surface')
  ctx.beginPath()
  ctx.moveTo(0, height)
  for (let x = 0; x <= width; x += 8)
    ctx.lineTo(
      x,
      height -
        40 -
        Math.sin(x / 70) * 18 -
        Math.sin(x / 23) * 6,
    )
  ctx.lineTo(width, height)
  ctx.fill()
}

export const CanvasNight = () => (
  <Canvas
    draw={drawNight}
    context={{ alpha: false }}
    label="Stars over a ridge"
    style={STAGE}
  />
)
