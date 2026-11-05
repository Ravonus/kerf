import type { CanvasFrame } from '@weft-js/warp'
import { Canvas } from '@weft-js/warp'
import { token, STAGE } from './paint-primitives'

// A live latency line with gridlines and a label: text on a canvas takes the page's font through CSS.
export const latency = (t: number) =>
  120 + Math.sin(t * 1.3) * 30 + Math.sin(t * 3.7) * 14 + Math.max(0, Math.sin(t * 0.4) * 60 - 40)

export function drawLive({ ctx, width, height, time }: CanvasFrame) {
  const pad = 28,
    span = 12,
    max = 240,
    y = (v: number) => height - pad - (v / max) * (height - pad * 2)
  ctx.clearRect(0, 0, width, height)
  ctx.font = `12px ${getComputedStyle(ctx.canvas).fontFamily}`
  ctx.strokeStyle = token(ctx, '--warp-color-border')
  ctx.fillStyle = token(ctx, '--warp-color-text-subtle')
  ctx.lineWidth = 1
  for (const v of [0, 80, 160, 240]) {
    ctx.beginPath()
    ctx.moveTo(pad + 24, Math.round(y(v)) + 0.5)
    ctx.lineTo(width, Math.round(y(v)) + 0.5)
    ctx.stroke()
    ctx.fillText(`${v}`, 4, y(v) + 4)
  }
  ctx.strokeStyle = token(ctx, '--warp-color-accent-solid')
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let x = pad + 24; x <= width; x += 3)
    ctx.lineTo(x, y(latency(time - span + ((x - pad - 24) / (width - pad - 24)) * span)))
  ctx.stroke()
  ctx.fillStyle = token(ctx, '--warp-color-text')
  ctx.textAlign = 'right'
  ctx.fillText(`p95 ${Math.round(latency(time))} ms`, width - 8, 16)
  ctx.textAlign = 'left'
}

export const CanvasLive = () => (
  <Canvas
    draw={drawLive}
    animate
    fps={30}
    label="p95 latency over the last twelve seconds"
    style={STAGE}
  />
)
