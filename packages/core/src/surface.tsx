// @weft-js/core/surface: canvas and WebGL as layout children (PLAN §5, research 33). `setup` runs once on the client, props are
// live, and a paint reads boxes like a binding does: when one changes, one paint is booked on the next frame and nothing
// else runs. No app pays for this unless it imports it.
// oxlint-disable-next-line typescript/triple-slash-reference -- slots.d.ts declares a wildcard module, so it has no exports for an `import` to name
/// <reference path="./slots.d.ts" />

import { onMount, untrack, type StandardSchema, type State } from '@weft-js/core'
import { mountSurface, type Mounting } from './surface/mount'
import type { clock } from './surface/clock'
import type { SurfaceText, TextOptions } from './surface-text'

export { clock } from './surface/clock'

export type {
  MeasureHandle,
  MeasureLine,
  MeasureProvider,
  SurfaceText,
  TextOptions,
} from './surface-text'

/** Where a frame sits: its number, the seconds since the start, and the seconds since the last one. */
export interface FrameTime {
  frame: number
  seconds: number
  delta: number
}

/** A token's live value: `css` for canvas2d, `linear` (0–1, linear sRGB, then alpha) for shaders. */
export interface Token {
  css: string
  linear: [number, number, number, number]
}

/** What every surface's `setup` gets, whatever its kind. */
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

/** `SurfaceBase` and what the kind `K` adds to it. */
export type SurfaceContext<K extends string> = SurfaceBase &
  (K extends keyof SurfaceKinds ? SurfaceKinds[K] : Record<string, unknown>)

/** A surface: its kind, its props' schema, and what it draws. */
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
  context(canvas: HTMLCanvasElement, def: Mounting): SurfaceBackend | null
}
/** What a renderer gives a mounted surface: the fields its kind adds, and how it resizes and starts a frame. */
export interface SurfaceBackend {
  /** Fields merged into `s`: `{ ctx }`, `{ gl }`, a provider's own. */
  fields: Record<string, unknown>
  resize?(width: number, height: number, dpr: number): void
  /** Before each paint. */
  begin?(): void
  dispose?(): void
}

/** Declares a surface, for `<Surface use={…}>`. */
export function defineSurface<P = {}, const K extends string = string>(
  def: SurfaceDef<P, K>,
): SurfaceDef<P, K> {
  return def
}

export { integerFit } from './surface/integer-fit'

// ---- <Surface> -----------------------------------------------------------------------------------------------------

/** `<Surface>`'s props: the surface's own, and those of its place on the page. */
export type SurfaceProps<P> = P & {
  use: SurfaceDef<P, string>
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
  onMount(() => mountSurface(def as unknown as Mounting, props, host))
  const ratio = () => props.aspect ?? (def.pixel ? `${def.pixel.width}/${def.pixel.height}` : '2/1')
  return (
    <div
      ref={(e: HTMLElement) => (host = e)}
      data-surface={def.name}
      class={props.class}
      style={`position:relative;aspect-ratio:${ratio()};${props.style ?? ''}`}
    ></div>
  )
}
