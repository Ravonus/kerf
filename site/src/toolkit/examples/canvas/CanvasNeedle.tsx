import type { CanvasFrame } from '@kerf/veneer'
import { Canvas } from '@kerf/veneer'
import { token, STAGE } from './paint-primitives'

// A needle that eases toward the pointer and stops asking
// for frames once it arrives: no `animate` needed.
export function drawNeedle(
  { ctx, width, height, pointer, dt }: CanvasFrame,
  needle: { at: number },
) {
  const goal = pointer.in
    ? Math.min(1, Math.max(0, pointer.x / width))
    : 0.35
  needle.at += (goal - needle.at) * Math.min(1, dt * 8)
  const cx = width / 2,
    cy = height - 24,
    r = Math.min(width / 2, height) - 40
  ctx.clearRect(0, 0, width, height)
  ctx.lineWidth = 12
  ctx.strokeStyle = token(
    ctx,
    '--veneer-color-surface-sunken',
  )
  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI, 0)
  ctx.stroke()
  ctx.strokeStyle = token(
    ctx,
    needle.at > 0.8
      ? '--veneer-color-critical-solid'
      : '--veneer-color-accent-solid',
  )
  ctx.beginPath()
  ctx.arc(
    cx,
    cy,
    r,
    Math.PI,
    Math.PI + needle.at * Math.PI,
  )
  ctx.stroke()
  const a = Math.PI + needle.at * Math.PI
  ctx.lineWidth = 3
  ctx.strokeStyle = token(ctx, '--veneer-color-text')
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(
    cx + Math.cos(a) * (r - 18),
    cy + Math.sin(a) * (r - 18),
  )
  ctx.stroke()
  return Math.abs(goal - needle.at) > 0.002
}

export const CanvasNeedle = () => {
  const needle = { at: 0 }
  return (
    <Canvas
      draw={(f) => drawNeedle(f, needle)}
      pointer
      label="A gauge that follows the pointer across it"
      style={STAGE}
    />
  )
}
