import { ditherField, ditherImage, ditherStage, type Algorithm, type FieldOptions, type Gradient, type MaskSource, type Ramp, type DitherStageOptions } from '@weft-js/warp-core/dither'
import { derived } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import './styles'
import '@weft-js/warp-core/styles/canvas/dither.css'
import '@weft-js/warp-core/styles/canvas/stage.css'

export type { Algorithm, Brush, DitherPainter, DitherPiece, Field as FieldFn, FieldName, Gradient, MaskSource, Pattern, PointerMode, Ramp, Skin } from '@weft-js/warp-core/dither'
export { LEVEL, PAINTERS } from '@weft-js/warp-core/dither'

const box = (ratio: string | number | undefined, style: unknown) => [ratio === undefined ? undefined : `aspect-ratio:${ratio}`, style].filter(Boolean).join(';') || undefined

/** Props for DitherField. */
export interface DitherFieldProps extends FieldOptions {
  /** Fills the nearest positioned ancestor: a section's background. */
  fill?: boolean
  /** CSS aspect-ratio. Default 16 / 9 unless `fill`. */
  ratio?: string | number
  /** Names the field (role="img"). Without one it is decorative. */
  label?: string | undefined
  children?: unknown
  [attr: string]: unknown
}

/** A live dithered field (08 §6.7): moves at vivid and balanced, holds still at quiet and under reduced motion. Children sit over it. */
export function DitherField({ kind, smooth, ramp, spark, pattern, cell, inks, speed, gain, seed, spread, pointer, mask, fade, reveal, fps, fill, ratio, label, children, style, ...rest }: DitherFieldProps) {
  let node: HTMLCanvasElement | undefined
  use(ditherField, () => node, () => ({ kind, smooth, ramp, spark, pattern, cell, inks, speed, gain, seed, spread, pointer, mask, fade, reveal, fps }))
  return (
    <div {...rest} data-scope="dither" data-fill={fill ? '' : undefined} role={label ? 'img' : undefined} aria-label={label} style={box(ratio ?? (fill ? undefined : '16 / 9'), style)}>
      <canvas ref={n => (node = n)} aria-hidden="true"></canvas>
      {children}
    </div>
  )
}

/** Props for Dither. */
export interface DitherProps {
  /** An image to dither. The real <img> stays underneath, for alt text, for no script and for a cross-origin failure. */
  src?: string
  /** The image's alt text, kept on the real <img> underneath. */
  alt?: string
  /** The image's CORS mode. A cross-origin image needs it to be read and dithered. */
  crossorigin?: 'anonymous' | 'use-credentials'
  /** With no `src`: the gradient to dither. Default a soft diagonal. */
  gradient?: Gradient | undefined
  /** `atkinson` by default for images, `bayer8` for gradients. */
  algorithm?: Algorithm
  /** The inks: a tone such as `accent`, or your own list of colours. */
  ramp?: Ramp
  /** CSS pixels per dither cell. Larger cells give a coarser, chunkier picture. */
  cell?: number
  /** How many inks of the ramp to use. Default: the tier's. */
  inks?: number
  contrast?: number
  invert?: boolean
  /** Fills the nearest positioned parent instead of keeping a ratio, for a section background. */
  fill?: boolean
  ratio?: string | number
  label?: string | undefined
  [attr: string]: unknown
}

/** A still image or gradient, dithered to warp's inks once, and again only when its size or theme changes (08 §6.7). */
export function Dither({ src, alt, crossorigin, gradient, algorithm, ramp, cell, inks, contrast, invert, fill, ratio, label, style, ...rest }: DitherProps) {
  let node: HTMLCanvasElement | undefined
  let img: HTMLImageElement | undefined
  use(ditherImage, () => node, () => ({ source: img, gradient, algorithm, ramp, cell, inks, contrast, invert }))
  return (
    <div {...rest} data-scope="dither" data-fill={fill ? '' : undefined} role={label ? 'img' : undefined} aria-label={label} style={box(ratio ?? (fill ? undefined : '16 / 9'), style)}>
      {src && <img ref={n => (img = n)} src={src} alt={alt ?? ''} crossorigin={crossorigin} loading="lazy" decoding="async" />}
      <canvas ref={n => (node = n)} aria-hidden="true"></canvas>
    </div>
  )
}

/** Props for DitherGlyph. */
export interface DitherGlyphProps extends Omit<FieldOptions, 'mask'> {
  /** The word to set. It stays in the page as real text for readers and for search. */
  text?: string | undefined
  /** Or an SVG path and the size of its box, for a logo or an icon. */
  path?: string
  box?: [width: number, height: number]
  /** Stroke width in the box's units, for a path made of lines. */
  stroke?: number | undefined
  /** Or any drawing, in cells. */
  draw?: (ctx: CanvasRenderingContext2D, cols: number, rows: number) => void
  /** Names a `path` or `draw` glyph. */
  label?: string | undefined
  font?: string
  weight?: number | string
  /** Share of the box the shape fills, 0–1. */
  fit?: number | undefined
  ratio?: string | number
  [attr: string]: unknown
}

/** A word or a logo woven out of a dithered field (08 §6.7). */
export function DitherGlyph({ text, path, box: viewBox, stroke, draw, label, font, weight, fit, cell = 4, ratio, kind = 'flow', ...rest }: DitherGlyphProps) {
  const mask = derived<MaskSource>(() => draw ?? (path ? { path, box: viewBox ?? [24, 24], fit, stroke } : { text: text ?? '', font, weight, fit }))
  return (
    <DitherField {...rest} kind={kind} cell={cell} mask={mask.value} ratio={ratio ?? '3 / 1'} label={text ? undefined : label}>
      {text && <span data-part="glyph-text">{text}</span>}
    </DitherField>
  )
}

/** Props for DitherStage. */
export interface DitherStageProps extends DitherStageOptions {
  /** `box` paints its own block; `scroll` is a scroller whose view it paints; `page` paints the viewport, for a whole page. */
  layout?: DitherStageOptions['layout']
  children?: unknown
  [attr: string]: unknown
}

/**
 * A CanvasStage in the dither look (08 §6.8). Mark any element `data-skin="button"`, `card`, `field` and so on: it keeps
 * its layout, focus, typing and semantics, and the stage draws it in dithered cells, states and all.
 */
export function DitherStage({ layout = 'box', ramp, kind, ground, pattern, cell, speed, drift, rail, veil, ripple, painters, fps, children, ...rest }: DitherStageProps) {
  let node: HTMLCanvasElement | undefined
  use(ditherStage, () => node, () => ({ layout, ramp, kind, ground, pattern, cell, speed, drift, rail, veil, ripple, painters, fps }))
  return (
    <div {...rest} data-scope="stage" data-paint="dither" data-layout={layout} data-rail={rail ? '' : undefined} data-veil={veil ? '' : undefined}>
      <div data-part="paint" aria-hidden="true"><canvas ref={n => (node = n)}></canvas></div>
      {children}
    </div>
  )
}
