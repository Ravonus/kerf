// weft/surface: canvas and WebGL as layout children (PLAN §5, research 33). `setup` runs once on the client, props are
// live, and a paint reads boxes like a binding does: when one changes, one paint is booked on the next frame and nothing
// else runs. No app pays for this unless it imports it.
/// <reference path="./slots.d.ts" />

import { createRoot, DEV, effect, flush, getOwner, onCleanup, onMount, state, untrack, within, type StandardSchema, type State } from 'weft'
import { surfaceText, type PaintedText, type SurfaceText, type TextHost, type TextOptions } from './surface-text'

export type { MeasureHandle, MeasureLine, MeasureProvider, SurfaceText, TextOptions } from './surface-text'

export interface FrameTime { frame: number; seconds: number; delta: number }

/** A token's live value: `css` for canvas2d, `linear` (0–1, linear sRGB, then alpha) for shaders. */
export interface Token { css: string; linear: [number, number, number, number] }

export interface SurfaceBase {
  canvas: HTMLCanvasElement
  /** The host element. Put pointer handlers here: mirrors sit above the canvas. */
  el: HTMLElement
  /** CSS px, or the target's px with `pixel`. Live. */
  size: State<{ width: number; height: number }>
  dpr: State<number>
  /** The integer scale of a `pixel` surface. Live. */
  scale: State<number>
  clock: typeof clock
  /** `s.tokens.accent`: `--accent`, else `--warp-accent`. Reads are tracked, so a theme change repaints. */
  tokens: Record<string, Token>
  /** Paint when a box it read changes. */
  draw(fn: () => void): void
  /** Paint on every clock tick too (at `fps`), and on box changes while paused. */
  frame(fn: (time: FrameTime) => void): void
  /** Book a paint by hand. */
  invalidate(): void
  /** Text on the canvas, with its DOM mirror. Never `fillText` by hand (X010). */
  text(text: string | (() => string), options: TextOptions | (() => TextOptions)): SurfaceText
  /** Draw text that is truly decoration: the marker X010 reads. It just calls `fn`. */
  decorative<T>(fn: () => T): T
}

/** Fields each kind adds to `s`. `SurfaceKinds` is open: a provider's types extend it. */
export interface SurfaceKinds {
  canvas2d: { ctx: CanvasRenderingContext2D }
  webgl2: { gl: WebGL2RenderingContext }
}

export type SurfaceContext<K extends string> = SurfaceBase & (K extends keyof SurfaceKinds ? SurfaceKinds[K] : Record<string, any>)

export interface SurfaceDef<P = {}, K extends string = string> {
  name: string
  kind: K
  /** A Standard Schema (Zod). Validated in dev only. Or give the type: `defineSurface<{ n: number }>({ ... })`. */
  props?: StandardSchema<P>
  /** A fixed target: integer scale, nearest sampling (Keel's `integerFit`). */
  pixel?: { width: number; height: number }
  /** Ticks per second of `s.frame`. Default 60. */
  fps?: number
  /** Default 2. */
  maxDpr?: number
  /** canvas2d: keep the last frame instead of clearing before each paint. */
  clear?: boolean
  /** `getContext` attributes. */
  context?: Record<string, unknown>
  setup(s: SurfaceContext<K>, props: Readonly<P>): void | (() => void)
}

/** `surface.renderer@1`: what a kind provides. */
export interface SurfaceRenderer {
  context(canvas: HTMLCanvasElement, def: SurfaceDef<any, any>): SurfaceBackend | null
}
export interface SurfaceBackend {
  /** Fields merged into `s`: `{ ctx }`, `{ gl }`, a provider's own. */
  fields: Record<string, unknown>
  resize?(width: number, height: number, dpr: number): void
  /** Before each paint. */
  begin?(): void
  dispose?(): void
}

export function defineSurface<P = {}, const K extends string = string>(def: SurfaceDef<P, K>): SurfaceDef<P, K> {
  return def
}

/** Keel's integerFit: the largest whole scale of `width`×`height` that fits, never under 1. */
export function integerFit(width: number, height: number, availableWidth: number, availableHeight: number) {
  const scale = Math.max(1, Math.floor(Math.min(availableWidth / width, availableHeight / height)))
  return { scale, width: width * scale, height: height * scale, overflow: width > availableWidth || height > availableHeight }
}

// ---- backends ------------------------------------------------------------------------------------------------------

const canvas2d: SurfaceRenderer = {
  context(canvas, def) {
    const ctx = canvas.getContext('2d', def.context as any) as CanvasRenderingContext2D | null
    if (!ctx) return null
    let w = 0, h = 0
    return {
      fields: { ctx },
      resize(width, height, dpr) { w = width; h = height; ctx.setTransform(dpr, 0, 0, dpr, 0, 0) },
      begin() { if (def.clear !== false) ctx.clearRect(0, 0, w, h) },
    }
  },
}

const webgl2: SurfaceRenderer = {
  context(canvas, def) {
    const gl = canvas.getContext('webgl2', def.context as any) as WebGL2RenderingContext | null
    if (!gl) return null
    return {
      fields: { gl },
      resize() { gl.viewport(0, 0, canvas.width, canvas.height) },
      dispose() { gl.getExtension('WEBGL_lose_context')?.loseContext() },
    }
  },
}

const builtin: Record<string, SurfaceRenderer> = { canvas2d, webgl2 }

// ---- the clock -----------------------------------------------------------------------------------------------------

let seconds = 0, last = 0, raf = 0
const tickers = new Set<(force?: boolean) => void>()
const playing = state(typeof matchMedia !== 'function' || !matchMedia('(prefers-reduced-motion: reduce)').matches)

function loop(now: number) {
  raf = 0
  if (!tickers.size || !playing.value) { last = 0; return }
  if (last) seconds += Math.min(now - last, 100) / 1000 // capped: a background tab resumes without a jump
  last = now
  for (const t of [...tickers]) t()
  raf = requestAnimationFrame(loop)
}
const run = () => { raf ||= requestAnimationFrame(loop) }

/** The one clock all surfaces share. Seek for deterministic capture: same seed and frame, same pixels. */
export const clock = {
  /** False from the start under `prefers-reduced-motion: reduce`. */
  playing: playing as { readonly value: boolean },
  get seconds() { return seconds },
  play() { playing.value = true; run() },
  pause() { playing.value = false },
  /** Jump, and paint every animated surface now. */
  seek(to: number) {
    seconds = to
    for (const t of [...tickers]) t(true)
  },
}

// ---- tokens --------------------------------------------------------------------------------------------------------

const scratch = (() => {
  let ctx: CanvasRenderingContext2D | null | undefined
  return () => (ctx ??= (() => { const c = document.createElement('canvas'); c.width = c.height = 1; return c.getContext('2d', { willReadFrequently: true }) })())
})()

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

function rgba(css: string): [number, number, number, number] {
  const m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?/.exec(css)
  if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255, m[4] === undefined ? 1 : +m[4]]
  const ctx = scratch() // oklch(), color(), anything else the page can compute
  if (!ctx) return [0, 0, 0, 1]
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return a ? [r / a, g / a, b / a, a / 255] : [0, 0, 0, 0]
}

function tokensOf(host: HTMLElement): Record<string, Token> {
  const theme = state(0)
  const known = new Map<string, Token>()
  let probe: HTMLElement | undefined
  let watching = false
  const bump = () => { known.clear(); theme.value++ }
  return new Proxy({}, {
    get(_, name): Token | undefined {
      if (typeof name !== 'string') return undefined
      theme.value
      if (!watching) {
        watching = true
        const seen = new MutationObserver(bump)
        for (const el of [document.documentElement, document.body]) seen.observe(el, { attributes: true })
        const dark = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : undefined
        dark?.addEventListener('change', bump)
        onCleanup(() => { seen.disconnect(); dark?.removeEventListener('change', bump) })
      }
      let token = known.get(name)
      if (!token) {
        const kebab = name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)
        probe ??= host.appendChild(Object.assign(document.createElement('i'), { hidden: true }))
        probe.style.color = `var(--${kebab}, var(--warp-${kebab}))`
        const css = getComputedStyle(probe).color
        const [r, g, b, a] = rgba(css)
        token = { css, linear: [linear(r), linear(g), linear(b), a] }
        known.set(name, token)
      }
      return token
    },
  }) as Record<string, Token>
}

// ---- mounting ------------------------------------------------------------------------------------------------------

function mountSurface(def: SurfaceDef<any, any>, props: any, host: HTMLElement) {
  const fps = def.fps ?? 60
  const canvas = document.createElement('canvas')
  canvas.style.cssText = def.pixel ? 'position:absolute;inset:0;margin:auto;image-rendering:pixelated' : 'position:absolute;inset:0;width:100%;height:100%'
  effect(() => [props.label, props.decorative] as const, ([label, decorative]) => {
    if (decorative) canvas.setAttribute('aria-hidden', 'true')
    else {
      canvas.removeAttribute('aria-hidden')
      canvas.setAttribute('role', 'img')
      canvas.setAttribute('aria-label', label ?? def.name)
    }
  })
  host.prepend(canvas)
  onCleanup(() => canvas.remove())

  if (DEV && def.props) {
    effect(() => ({ ...props }), value => {
      const result = def.props!['~standard'].validate(value) as { issues?: readonly { message: string; path?: readonly any[] }[] }
      for (const i of result.issues ?? []) console.warn(`weft: <Surface use={${def.name}}> prop \`${(i.path ?? []).map(p => p?.key ?? p).join('.')}\`: ${i.message}`)
    })
  }

  const size = state({ width: 0, height: 0 })
  const dpr = state(1)
  const scale = state(1)
  const owner = getOwner()!
  let live = true
  onCleanup(() => { live = false })

  const start = (renderer: SurfaceRenderer) => {
    if (!live) return
    const backend = renderer.context(canvas, def)
    if (!backend) {
      console.error(`weft: <Surface use={${def.name}}>: this browser has no \`${def.kind}\` context.`)
      host.setAttribute('data-surface-error', def.kind)
      return
    }
    onCleanup(() => backend.dispose?.())

    const fit = (width: number, height: number, deviceWidth?: number, deviceHeight?: number) => {
      const device = devicePixelRatio || 1
      const d = Math.min(device, def.maxDpr ?? 2)
      if (def.pixel) {
        const f = integerFit(def.pixel.width, def.pixel.height, width, height)
        canvas.width = def.pixel.width
        canvas.height = def.pixel.height
        canvas.style.width = `${f.width}px`
        canvas.style.height = `${f.height}px`
        scale.value = f.scale
        backend.resize?.(def.pixel.width, def.pixel.height, 1)
        if (size.value.width !== def.pixel.width) size.value = { width: def.pixel.width, height: def.pixel.height }
      } else {
        canvas.width = Math.round((deviceWidth ?? width * device) * (d / device))
        canvas.height = Math.round((deviceHeight ?? height * device) * (d / device))
        backend.resize?.(width, height, d)
        if (size.value.width !== width || size.value.height !== height) size.value = { width, height }
      }
      dpr.value = d
    }

    let stop: (() => void) | undefined
    let repaint = () => {}

    const boot = () => {
      if (!live) return
      createRoot(dispose => {
        stop = dispose
        const draws: (() => void)[] = []
        const frames: ((t: FrameTime) => void)[] = []
        const texts: PaintedText[] = []
        const tick = state(0)
        let painting = false, started = false, booked = 0, seen = true, stale = false
        const first = Math.floor(seconds * fps) // a surface mounted after a seek starts at that frame
        let time: FrameTime = { frame: first, seconds: first / fps, delta: 0 }

        const paint = () => {
          painting = true
          tick.value = untrack(() => tick.value) + 1
          try { flush() } finally { painting = false }
        }
        repaint = paint
        const invalidate = () => {
          booked ||= requestAnimationFrame(() => {
            booked = 0
            if (seen) paint()
            else stale = true
          })
        }
        onCleanup(() => cancelAnimationFrame(booked))

        const ticker = (force?: boolean) => {
          const frame = Math.floor(seconds * fps)
          if (frame === time.frame && !force) return
          time = { frame, seconds: frame / fps, delta: Math.max(0, frame - time.frame) / fps }
          if (seen || force) paint()
          else stale = true
        }

        const textHost: TextHost = { el: host, ctx: backend.fields.ctx as any, invalidate, paint }
        const s = {
          ...backend.fields,
          canvas, el: host, size, dpr, scale, clock, tokens: tokensOf(host),
          draw(fn: () => void) { draws.push(fn); if (started) invalidate() },
          frame(fn: (t: FrameTime) => void) {
            frames.push(fn)
            if (!tickers.has(ticker)) { tickers.add(ticker); onCleanup(() => tickers.delete(ticker)); if (playing.value) run() }
          },
          invalidate,
          text(text: any, options: any) { const t = surfaceText(textHost, text, options); texts.push(t); return t },
          decorative: <T,>(fn: () => T) => fn(),
        }

        const cleanup = def.setup(s, props)
        if (cleanup) onCleanup(cleanup)

        // Paint and tracking are one effect: `tick` starts a paint, and a run with `painting` false means a source changed.
        painting = true
        effect(() => {
          tick.value
          if (!painting) return invalidate()
          backend.begin?.()
          for (const d of draws) d()
          for (const f of frames) f(time)
          for (const t of texts) t.paint()
        }, () => {})
        painting = false
        started = true

        if (typeof IntersectionObserver === 'function') {
          const io = new IntersectionObserver(entries => {
            seen = entries[entries.length - 1].isIntersecting
            if (seen && stale) { stale = false; paint() }
          })
          io.observe(host)
          onCleanup(() => io.disconnect())
        }
      }, owner)
    }

    const box = host.getBoundingClientRect()
    fit(box.width, box.height)
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(entries => {
        const e = entries[entries.length - 1]
        const dp = e.devicePixelContentBoxSize?.[0]
        const exact = dp && Math.abs(dp.inlineSize - e.contentRect.width * devicePixelRatio) < 2 // emulated dpr: the box is in other units
        fit(e.contentRect.width, e.contentRect.height, exact ? dp.inlineSize : undefined, exact ? dp.blockSize : undefined)
        repaint() // now, not on a frame: setting the size cleared the canvas, and this callback runs before the browser paints
      })
      try { ro.observe(host, { box: 'device-pixel-content-box' }) } catch { ro.observe(host) } // Safari has no such box
      onCleanup(() => ro.disconnect())
    }

    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); stop?.() })
    canvas.addEventListener('webglcontextrestored', () => { const b = host.getBoundingClientRect(); fit(b.width, b.height); boot() })
    onCleanup(() => stop?.())
    boot()
  }

  const known = builtin[def.kind]
  if (known) start(known)
  else {
    // @ts-ignore a generated module (`weft plugins sync`), declared in .weft/slots.d.ts once bound
    import('weft:slot/surface.renderer').then((m: any) => m.load(def.kind)).then((r: SurfaceRenderer) => within(owner, () => start(r)), (error: unknown) => {
      console.error(error)
      host.setAttribute('data-surface-error', def.kind)
    })
  }
}

// ---- <Surface> -----------------------------------------------------------------------------------------------------

export type SurfaceProps<P> = P & {
  use: SurfaceDef<P, any>
  /** `16/9`. Default: the `pixel` target's ratio, else `2/1`. */
  aspect?: string
  /** What the surface shows, for assistive tech. Required unless `decorative` (X009). */
  label?: string
  decorative?: boolean
  class?: string
  style?: string
}

/** A layout child. The server renders the host, sized by `aspect`; the canvas mounts on the client (research 33 §4). */
export function Surface<P>(props: SurfaceProps<P>) {
  let host!: HTMLElement
  const def = untrack(() => props.use)
  onMount(() => mountSurface(def, props, host))
  const ratio = () => props.aspect ?? (def.pixel ? `${def.pixel.width}/${def.pixel.height}` : '2/1')
  return <div ref={(e: HTMLElement) => (host = e)} data-surface={def.name} class={props.class} style={`position:relative;aspect-ratio:${ratio()};${props.style ?? ''}`}></div>
}
