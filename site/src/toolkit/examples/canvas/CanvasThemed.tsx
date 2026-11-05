import type { CanvasFrame } from '@weft-js/warp'
import { Canvas } from '@weft-js/warp'
import { token, STAGE } from './paint-primitives'

// Colours read once and kept, then read again only when the theme changes: `onTheme` drops the cache.
export const TONES_DRAWN = [
  '--warp-color-accent-solid',
  '--warp-color-positive-solid',
  '--warp-color-caution-solid',
  '--warp-color-critical-solid',
  '--warp-color-info-solid',
]

export const CanvasThemed = () => {
  let inks: string[] | undefined
  const draw = ({ ctx, width, height }: CanvasFrame) => {
    inks ??= TONES_DRAWN.map((name) => token(ctx, name))
    ctx.clearRect(0, 0, width, height)
    const r = Math.min(width, height) / 2 - 16
    inks.forEach((ink, i) => {
      ctx.strokeStyle = ink
      ctx.lineWidth = 14
      ctx.beginPath()
      ctx.arc(
        width / 2,
        height / 2,
        r - i * 20,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * (0.9 - i * 0.14),
      )
      ctx.stroke()
    })
  }
  return (
    <Canvas
      draw={draw}
      onTheme={() => (inks = undefined)}
      label="Five rings in warp's tones"
      style={STAGE}
    />
  )
}
