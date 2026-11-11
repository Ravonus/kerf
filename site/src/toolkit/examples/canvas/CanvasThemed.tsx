import type { CanvasFrame } from '@kerf/veneer'
import { Canvas } from '@kerf/veneer'
import { token, STAGE } from './paint-primitives'

// Colours read once and kept, then read again only when
// the theme changes: `onTheme` drops the cache.
export const TONES_DRAWN = [
  '--veneer-color-accent-solid',
  '--veneer-color-positive-solid',
  '--veneer-color-caution-solid',
  '--veneer-color-critical-solid',
  '--veneer-color-info-solid',
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
      label="Five rings in veneer's tones"
      style={STAGE}
    />
  )
}
