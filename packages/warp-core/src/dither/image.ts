// An image or a gradient, dithered once and repainted only when its size, theme or tier changes.
import { surface, type Frame } from '../canvas'
import type { Action } from '../store'
import { diffuse, levels, quantize, type Diffusion } from './quantize'
import { palette, tier, type Ramp } from './ramp'
import { tile, type Pattern } from './tiles'

export type Algorithm = Pattern | Diffusion
export interface Gradient { angle?: number; radial?: boolean; from?: number; to?: number }

export interface ImageOptions {
  /** A loaded or loading image. Without one the surface draws `gradient`. */
  source?: HTMLImageElement | ImageBitmap | HTMLCanvasElement
  gradient?: Gradient
  algorithm?: Algorithm
  ramp?: Ramp
  cell?: number
  inks?: number
  contrast?: number
  /** Light parts of the picture take the strongest ink, which suits dark themes. Default: follows the page's lightness. */
  invert?: boolean
}

const isDiffusion = (a: Algorithm): a is Diffusion => a === 'floyd' || a === 'atkinson'

/** Luma in 0–1 at grid size, cover-fitted. Throws on a cross-origin image without CORS, which a caller shows as is. */
export function tones(source: CanvasImageSource, cols: number, rows: number) {
  const c = document.createElement('canvas')
  c.width = cols
  c.height = rows
  const g = c.getContext('2d', { willReadFrequently: true })!
  const sw = (source as HTMLImageElement).naturalWidth || (source as HTMLCanvasElement).width
  const sh = (source as HTMLImageElement).naturalHeight || (source as HTMLCanvasElement).height
  const k = Math.max(cols / sw, rows / sh), w = sw * k, h = sh * k
  g.imageSmoothingQuality = 'high'
  g.drawImage(source, (cols - w) / 2, (rows - h) / 2, w, h)
  const px = g.getImageData(0, 0, cols, rows).data, out = new Float32Array(cols * rows)
  for (let i = 0; i < out.length; i++) out[i] = (px[i * 4]! * 0.2126 + px[i * 4 + 1]! * 0.7152 + px[i * 4 + 2]! * 0.0722) / 255
  return out
}

export function gradientTones({ angle = 115, radial, from = 0, to = 1 }: Gradient, cols: number, rows: number) {
  const out = new Float32Array(cols * rows), a = (angle * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a)
  const span = Math.abs(dx) * cols + Math.abs(dy) * rows, far = Math.hypot(cols, rows) / 2
  for (let y = 0, i = 0; y < rows; y++) for (let x = 0; x < cols; x++, i++) {
    const cx = x + 0.5 - cols / 2, cy = y + 0.5 - rows / 2
    const s = radial ? 1 - Math.hypot(cx, cy) / far : (cx * dx + cy * dy) / span + 0.5
    out[i] = from + (to - from) * s
  }
  return out
}

export function ditherImage(canvas: HTMLCanvasElement, options: ImageOptions): Action<ImageOptions> {
  let o = options
  const host = canvas.parentElement ?? canvas
  let inks: Uint32Array | undefined, base: Float32Array | undefined, cols = 0, rows = 0

  function draw({ ctx, width, height }: Frame) {
    if (width !== cols || height !== rows) { cols = width; rows = height; base = undefined }
    inks ??= palette(host, o.ramp ?? 'accent', o.inks ?? tier(host).inks + 1)
    const src = o.source
    if (src instanceof Object && 'complete' in src && !src.complete) return
    try {
      base ??= src ? levels(tones(src, cols, rows), o.contrast ?? 1.1) : gradientTones(o.gradient ?? {}, cols, rows)
    } catch {
      return host.setAttribute('data-state', 'error') // a tainted canvas: the <img> underneath stays
    }
    const image = new ImageData(cols, rows), out = new Uint32Array(image.data.buffer), algorithm = o.algorithm ?? (src ? 'atkinson' : 'bayer8')
    const light = o.invert ?? (src ? isDark(host) : false)
    const v = light || !src ? base : base.map(x => 1 - x)
    if (isDiffusion(algorithm)) {
      const picked = diffuse(v, cols, rows, inks.length, algorithm)
      for (let i = 0; i < picked.length; i++) out[i] = inks[picked[i]!]!
    } else quantize(v, cols, rows, tile(algorithm), inks, out)
    ctx.clearRect(0, 0, width, height)
    ctx.putImageData(image, 0, 0)
    host.setAttribute('data-state', 'live')
  }

  const settings = () => ({ draw, cell: o.cell ?? 3, onTheme: () => { inks = undefined } })
  const s = surface(canvas, settings())
  const img = o.source as HTMLImageElement | undefined
  const ready = () => { base = undefined; s.invalidate() }
  const failed = () => host.setAttribute('data-state', 'error')
  img?.addEventListener?.('load', ready)
  img?.addEventListener?.('error', failed)
  return {
    update(next) {
      if (next.source !== o.source || next.gradient !== o.gradient || next.contrast !== o.contrast) base = undefined
      o = next
      inks = undefined
      s.update(settings())
    },
    destroy() {
      s.destroy()
      img?.removeEventListener?.('load', ready)
      img?.removeEventListener?.('error', failed)
    },
  }
}

/** Is the page behind `el` dark? Light inks on dark read as light; on a light page the ramp darkens outward, so tone flips. */
function isDark(el: Element) {
  const scheme = getComputedStyle(el).colorScheme
  if (scheme === 'dark') return true
  if (scheme === 'light') return false
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}
