// The canvas renderer: each bar paints into its own canvas, sized to the track at the device's pixel ratio. Colours
// may be any CSS colour, `color-mix()` and `currentColor` included: they are resolved through the track's style.
import { BAR_VARS } from './options'
import type { BarFrame, Renderer } from './types'

/** Paints one bar. `paint` is the default look, for a draw that adds to it rather than replacing it. */
export type DrawBar = (
  ctx: CanvasRenderingContext2D,
  frame: BarFrame,
  paint: (ctx: CanvasRenderingContext2D, frame: BarFrame) => void,
) => void

/** Options for the canvas renderer. */
export interface CanvasOptions {
  /** Your own painting. Default: rounded track and thumb in the bar's colours. */
  draw?: DrawBar
}

interface Painted {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  bar: BarFrame['bar'] | null
  dark: boolean
  colors: BarFrame['bar'] | null
}
const canvases = new WeakMap<HTMLElement, Painted>()
const COLORS = ['color', 'hoverColor', 'activeColor', 'track', 'hoverTrack'] as const
const dark = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches

/** A CSS colour as the canvas can take it: `color-mix()`, `currentColor` and `var()` resolve against `el`. */
export function cssColor(el: HTMLElement, css: string) {
  const probe = el.ownerDocument.createElement('i')
  probe.style.cssText = `position:absolute;display:none`
  probe.style.color = css
  el.append(probe)
  const out = getComputedStyle(probe).color || css
  probe.remove()
  return out
}

/** The bar's colours resolved once per options and colour scheme; the stylesheet's custom properties win. */
function colors(track: HTMLElement, p: Painted, bar: BarFrame['bar']) {
  if (p.colors && p.bar === bar && p.dark === dark()) return p.colors
  const out = { ...bar }
  for (const k of COLORS) out[k] = cssColor(track, `var(${BAR_VARS[k]}, ${bar[k]})`)
  p.bar = bar
  p.dark = dark()
  p.colors = out
  return out
}

/** The default look: the track (when it has a colour) and a rounded thumb that thickens on hover. */
export function paintBar(ctx: CanvasRenderingContext2D, f: BarFrame) {
  const { bar, thumb } = f
  ctx.fillStyle = f.hover || f.active ? bar.hoverTrack : bar.track
  ctx.fillRect(0, 0, f.track.width, f.track.height)
  ctx.fillStyle = f.active ? bar.activeColor : f.hover ? bar.hoverColor : bar.color
  const r = bar.radius * (Math.min(thumb.width, thumb.height) / bar.width)
  ctx.beginPath()
  ctx.roundRect(
    thumb.x,
    thumb.y,
    thumb.width,
    thumb.height,
    Math.max(0, Math.min(r, thumb.width / 2, thumb.height / 2)),
  )
  ctx.fill()
}

/** A renderer that paints the bars on canvas. Pass it as `renderer`. */
export function canvas(o: CanvasOptions = {}): Renderer {
  return {
    animates: true,
    mount(track) {
      const c = document.createElement('canvas')
      c.dataset.part = 'canvas'
      c.setAttribute('aria-hidden', 'true')
      c.style.cssText =
        'position:absolute;inset:0;inline-size:100%;block-size:100%;pointer-events:none'
      track.querySelector('[data-part="thumb"]')?.setAttribute('hidden', '')
      track.append(c)
      const ctx = c.getContext('2d')
      if (ctx) canvases.set(track, { canvas: c, ctx, bar: null, dark: false, colors: null })
    },
    draw(track, f) {
      const got = canvases.get(track)
      if (!got) return
      const { canvas: c, ctx } = got
      const frame = { ...f, bar: colors(track, got, f.bar) }
      const dpr = globalThis.devicePixelRatio || 1
      const w = Math.round(f.track.width * dpr)
      const h = Math.round(f.track.height * dpr)
      if (c.width !== w || c.height !== h) {
        c.width = w
        c.height = h
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, f.track.width, f.track.height)
      if (o.draw) o.draw(ctx, frame, paintBar)
      else paintBar(ctx, frame)
    },
    unmount(track) {
      canvases.get(track)?.canvas.remove()
      canvases.delete(track)
      track.querySelector('[data-part="thumb"]')?.removeAttribute('hidden')
    },
  }
}
