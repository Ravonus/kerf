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
  changes: MutationObserver | null
  stop: (() => void) | undefined
}
const canvases = new WeakMap<HTMLElement, Painted>()
const COLORS = ['color', 'hoverColor', 'activeColor', 'track', 'hoverTrack'] as const
let scheme: MediaQueryList | null | undefined
const dark = () =>
  !!(scheme ??=
    typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null)?.matches

/** A CSS colour as the canvas can take it: `color-mix()`, `currentColor` and `var()` resolve against `el`. */
export function cssColor(el: HTMLElement, css: string) {
  return cssColors(el, [css])[0]!
}

// Append every probe before reading any style, then remove them after all reads.
function cssColors(el: HTMLElement, values: string[]) {
  const probes = values.map((css) => {
    const probe = el.ownerDocument.createElement('i')
    probe.style.cssText = 'position:absolute;display:none'
    probe.style.color = css
    return probe
  })
  el.append(...probes)
  try {
    return probes.map((probe, i) => getComputedStyle(probe).color || values[i]!)
  } finally {
    for (const probe of probes) probe.remove()
  }
}

function changed(track: HTMLElement, records: MutationRecord[]) {
  return records.some((m) => m.target instanceof Element && m.target.contains(track))
}

function observePalette(track: HTMLElement, p: Painted) {
  const invalidate = () => {
    p.colors = null
  }
  const observer =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver((records) => {
          if (changed(track, records)) invalidate()
        })
  observer?.observe(track.ownerDocument.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'data-theme', 'data-expression', 'data-motion'],
  })
  const loaded = (event: Event) => {
    if (event.target instanceof HTMLLinkElement && event.target.rel === 'stylesheet') invalidate()
  }
  track.ownerDocument.addEventListener('load', loaded, true)
  p.changes = observer
  p.stop = () => {
    observer?.disconnect()
    track.ownerDocument.removeEventListener('load', loaded, true)
  }
}

/** Cache by colour values, including fresh frame objects; theme changes invalidate the palette. */
function colors(track: HTMLElement, p: Painted, bar: BarFrame['bar']) {
  if (changed(track, p.changes?.takeRecords() ?? [])) p.colors = null
  if (p.colors && COLORS.every((k) => p.bar?.[k] === bar[k]) && p.dark === dark()) {
    const out = { ...bar }
    for (const k of COLORS) out[k] = p.colors[k]
    return out
  }
  const out = { ...bar }
  const resolved = cssColors(
    track,
    COLORS.map((k) => `var(${BAR_VARS[k]}, ${bar[k]})`),
  )
  for (const [i, k] of COLORS.entries()) out[k] = resolved[i]!
  p.bar = { ...bar }
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
      if (ctx) {
        const painted: Painted = {
          canvas: c,
          ctx,
          bar: null,
          dark: false,
          colors: null,
          changes: null,
          stop: undefined,
        }
        observePalette(track, painted)
        canvases.set(track, painted)
      }
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
      canvases.get(track)?.stop?.()
      canvases.get(track)?.canvas.remove()
      canvases.delete(track)
      track.querySelector('[data-part="thumb"]')?.removeAttribute('hidden')
    },
  }
}
