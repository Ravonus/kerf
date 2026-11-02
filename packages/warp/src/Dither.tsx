import { ditherField, ditherImage, type Algorithm, type FieldOptions, type Gradient, type MaskSource, type Ramp } from '@weft/warp-core/dither'
import { derived } from 'weft'
import { use } from '@weft/warp-core/weft'
import './styles'
import '@weft/warp-core/styles/canvas/dither.css'

export type { Algorithm, Field as FieldFn, FieldName, Gradient, MaskSource, Pattern, PointerMode, Ramp } from '@weft/warp-core/dither'

const box = (ratio: string | number | undefined, style: unknown) => [ratio === undefined ? undefined : `aspect-ratio:${ratio}`, style].filter(Boolean).join(';') || undefined

export interface DitherFieldProps extends FieldOptions {
  /** Fills the nearest positioned ancestor: a section's background. */
  fill?: boolean
  /** CSS aspect-ratio. Default 16 / 9 unless `fill`. */
  ratio?: string | number
  /** Names the field (role="img"). Without one it is decorative. */
  label?: string
  children?: unknown
  [attr: string]: unknown
}

/** A live dithered field (08 §6.7): moves at vivid and balanced, holds still at quiet and under reduced motion. Children sit over it. */
export function DitherField({ kind, smooth, ramp, spark, pattern, cell, inks, speed, gain, seed, spread, pointer, mask, fade, reveal, fps, fill, ratio, label, children, style, ...rest }: DitherFieldProps) {
  let node: HTMLCanvasElement | undefined
  use(ditherField, () => node, () => ({ kind, smooth, ramp, spark, pattern, cell, inks, speed, gain, seed, spread, pointer, mask, fade, reveal, fps }))
  return (
    <div {...rest} data-scope="dither" data-fill={fill ? '' : undefined} role={label ? 'img' : undefined} aria-label={label} style={box(ratio ?? (fill ? undefined : '16 / 9'), style)}>
      <canvas ref={(n: any) => (node = n)} aria-hidden="true"></canvas>
      {children}
    </div>
  )
}

export interface DitherProps {
  /** An image to dither. The real <img> stays underneath, for alt text, for no script and for a cross-origin failure. */
  src?: string
  alt?: string
  crossorigin?: 'anonymous' | 'use-credentials'
  /** With no `src`: the gradient to dither. Default a soft diagonal. */
  gradient?: Gradient
  /** `atkinson` by default for images, `bayer8` for gradients. */
  algorithm?: Algorithm
  ramp?: Ramp
  cell?: number
  inks?: number
  contrast?: number
  invert?: boolean
  fill?: boolean
  ratio?: string | number
  label?: string
  [attr: string]: unknown
}

/** A still image or gradient, dithered to warp's inks once, and again only when its size or theme changes (08 §6.7). */
export function Dither({ src, alt, crossorigin, gradient, algorithm, ramp, cell, inks, contrast, invert, fill, ratio, label, style, ...rest }: DitherProps) {
  let node: HTMLCanvasElement | undefined
  let img: HTMLImageElement | undefined
  use(ditherImage, () => node, () => ({ source: img, gradient, algorithm, ramp, cell, inks, contrast, invert }))
  return (
    <div {...rest} data-scope="dither" data-fill={fill ? '' : undefined} role={label ? 'img' : undefined} aria-label={label} style={box(ratio ?? (fill ? undefined : '16 / 9'), style)}>
      {src && <img ref={(n: any) => (img = n)} src={src} alt={alt ?? ''} crossorigin={crossorigin} loading="lazy" decoding="async" />}
      <canvas ref={(n: any) => (node = n)} aria-hidden="true"></canvas>
    </div>
  )
}

export interface DitherGlyphProps extends Omit<FieldOptions, 'mask'> {
  /** The word to set. It stays in the page as real text for readers and for search. */
  text?: string
  /** Or an SVG path and the size of its box, for a logo or an icon. */
  path?: string
  box?: [width: number, height: number]
  /** Stroke width in the box's units, for a path made of lines. */
  stroke?: number
  /** Or any drawing, in cells. */
  draw?: (ctx: CanvasRenderingContext2D, cols: number, rows: number) => void
  /** Names a `path` or `draw` glyph. */
  label?: string
  font?: string
  weight?: number | string
  /** Share of the box the shape fills, 0–1. */
  fit?: number
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
