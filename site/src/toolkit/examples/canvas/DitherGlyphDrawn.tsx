import { DitherGlyph } from '@weft-js/warp'

export const drawDiamond = (ctx: CanvasRenderingContext2D, cols: number, rows: number) => {
  const size = rows * 0.42
  ctx.beginPath()
  ctx.moveTo(cols / 2, rows / 2 - size)
  ctx.lineTo(cols / 2 + size, rows / 2)
  ctx.lineTo(cols / 2, rows / 2 + size)
  ctx.lineTo(cols / 2 - size, rows / 2)
  ctx.fill()
}

export const DitherGlyphDrawn = () => (
  <DitherGlyph draw={drawDiamond} label="A diamond" ratio="3 / 1" ramp="highlight" />
)
