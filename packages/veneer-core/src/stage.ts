// @kerf/veneer-core/stage: a canvas that paints the page laid out over it (08 §6.8). The DOM keeps what it is good at,
// layout, focus, typing, selection and the accessibility tree; every `[data-skin]` element inside gives up its own paint,
// and the stage hands each one to a painter with its box, its states and a 2D context, every frame something moves. So the
// page reflows, wraps and stacks like any other, and what it looks like is entirely the painters': vector, pixels, glow,
// pencil, or the dither stage's cells (./dither/stage), which is one look built on this. A stage can be a whole page or a
// few skins among ordinary components, which paint over it as usual.
import { surface } from './canvas'
import { reducedMotion } from './motion'
import type { Action } from './store'
import { stageInput, stageInputState } from './stage-input'
import { stageRenderer } from './stage-renderer'
import { observeStage } from './stage-observers'
import { createStageState } from './stage-state'

/** Where a stage's paint sits: its own box, the view of a scroller it is, or the viewport for a whole page. */
export type StageLayout = 'box' | 'scroll' | 'page'

/** One skinned element as the stage sees it this frame. Boxes are in the scene's units from its top left; states ease 0–1. */
export interface Piece {
  el: HTMLElement
  skin: string
  x: number
  y: number
  w: number
  h: number
  /** Corner radius, from the element's own `border-radius`. */
  r: number
  hover: number
  press: number
  focus: number
  /** Checked, pressed, expanded, current or open. */
  on: number
  /** A range's, progress's or meter's position, 0–1. */
  value: number
  /** The entrance: 0 until it first comes into view, then 1 over a moment. Always 1 without motion, and in a modal's stage, whose panel rises in instead. */
  seen: number
  disabled: boolean
  invalid: boolean
  /** The pointer, from the piece's top left. */
  px: number
  py: number
}

/** A press, where it landed, and how far through its moment it is, 0–1. */
export interface Press {
  x: number
  y: number
  age: number
}

/** The scroll position a stage paints at, when it scrolls. */
export interface Scroll {
  top: number
  height: number
  view: number
}

/** What a stage's painters get each frame. */
export interface Scene {
  ctx: CanvasRenderingContext2D
  /** CSS pixels, or cells when the stage has a `cell`. Pieces use the same units. */
  width: number
  height: number
  /** CSS pixels per unit. */
  unit: number
  time: number
  dt: number
  /** Motion is on: not reduced, not the quiet dial. */
  live: boolean
  /** Every piece in document order, the ones in view or near it. */
  pieces: Piece[]
  pointer: { x: number; y: number; in: boolean }
  presses: Press[]
  scroll: Scroll | undefined
  /** The rail's box and thumb, with `rail` set and something to scroll. */
  rail: { x: number; w: number; top: number; len: number; drag: boolean } | undefined
  /** Seconds since the stage last appeared, for an entrance of its own such as a modal's veil. */
  shown: number
  /** A token or any CSS colour, resolved where the stage sits and kept until the theme changes. */
  color(css: string): string
  /** Each word of an element's text, where the DOM set it, in scene units, with its font scaled to match. */
  words(el: HTMLElement): Word[]
}

/** One word of a piece's text, ready for `fillText`. */
export interface Word {
  text: string
  x: number
  y: number
  w: number
  font: string
  spacing: number
}

/** Paints one piece. It runs every frame the stage paints, so it should only draw. */
export type StagePainter = (piece: Piece, scene: Scene) => void

/** Options for a stage. */
export interface StageOptions {
  layout?: StageLayout | undefined
  /** Painters by skin name. */
  painters?: Record<string, StagePainter> | undefined
  /** Paints under the pieces. The canvas is already cleared. */
  background?: ((scene: Scene) => void) | undefined
  /** Paints over the pieces: presses, the rail, anything on top. */
  overlay?: ((scene: Scene) => void) | undefined
  /** Replaces the whole frame, for a look that paints its own way. Return true to be called again. */
  paint?: ((scene: Scene) => boolean | void) | undefined
  /** Keep painting every frame while motion is on, for a background that moves. Pieces animate without it. */
  animate?: boolean | undefined
  /** Whole-cell mode: units are cells of this many CSS pixels, scaled up without smoothing. */
  cell?: number | undefined
  /** Caps the frame rate while it animates. Uncapped by default, at the display's rate. */
  fps?: number | undefined
  /** Scrolls when the rail is dragged. The look paints it from `scene.rail`. */
  rail?: boolean | undefined
  /** Settings for the 2D context, such as `{ alpha: false }`. Read once, when the canvas attaches. */
  context?: CanvasRenderingContext2DSettings | undefined
  /** Called when the theme or dial changes, before the repaint. */
  onTheme?: (() => void) | undefined
}

/**
 * How each stage paints, kept by its host element, so a part that floats out of it into the top layer, a select's list,
 * paints in the same look with a canvas of its own. A look that wraps `stage` sets its own entry after it.
 */
export const LOOKS = new WeakMap<Element, (canvas: HTMLCanvasElement) => Action<void>>()

/**
 * A floating part's canvas, painted in the look of the stage it floats out of (a plain stage when there is none). A
 * popover starts painting as it first opens, by when the stage around it has surely attached.
 */
export function floatStage(canvas: HTMLCanvasElement): Action<void> {
  const own = canvas.parentElement?.parentElement
  let inner: { destroy(): void } | undefined
  const start = () => {
    if (inner) return
    const make = LOOKS.get(own?.parentElement?.closest('[data-scope="stage"]') as Element)
    inner = make ? make(canvas) : stage(canvas, { layout: 'box' })
  }
  if (own?.hasAttribute('popover')) own.addEventListener('beforetoggle', start)
  else start()
  return {
    update() {},
    destroy() {
      own?.removeEventListener('beforetoggle', start)
      inner?.destroy()
    },
  }
}

/** Paints every `[data-skin]` element inside the canvas's stage. The canvas sits in a paint layer that is the stage's first child. */
export function stage(canvas: HTMLCanvasElement, options: StageOptions = {}): Action<StageOptions> {
  const box = canvas.parentElement ?? canvas,
    host = box.parentElement ?? box
  const v = createStageState(options)

  const marks: { x: number; y: number; at: number }[] = [],
    pointer = { x: -1e4, y: -1e4 }

  const lively = () => !reducedMotion(host) && !!v.dials && v.dials.speed > 0

  const settings = () => ({
    draw,
    animate: v.o.animate,
    fps: v.o.fps,
    cell: v.o.cell,
    context: v.o.context,
    onTheme: retheme,
  })
  function retheme() {
    v.inks = new Map()
    v.o.onTheme?.()
  }

  const scroller = () =>
    v.o.layout === 'page'
      ? (document.scrollingElement ?? document.documentElement)
      : v.o.layout === 'scroll'
        ? host
        : undefined

  const draw = stageRenderer(v, host, box, {
    marks,
    pointer,
    lively,
    scroller,
    getSizes: () => sizes,
  })

  // Its float: a box with no ground of its own, which the float's own painters fill.
  LOOKS.set(host, (c) => {
    const f = stage(c, { ...v.o, layout: 'box', rail: false, background: undefined })
    return { update() {}, destroy: () => f.destroy() }
  })
  const s = surface(canvas, settings())
  const invalidate = () => s.invalidate()
  // A CSS transition can move a piece after the event that started it, so paint on for a moment after any of them.
  const stir = (e?: Event) => {
    v.busy = v.time + (e?.type === 'animationstart' ? 0.6 : 0.4)
    s.update(settings())
  }
  const { sizes, watch } = observeStage(v, box, host, invalidate, stir)

  const stopInput = stageInput(host, box, stageInputState(v), {
    pointer,
    marks,
    scroller,
    lively,
    stir,
    invalidate,
  })

  return {
    update(next) {
      v.o = next
      s.update(settings())
    },
    destroy() {
      s.destroy()
      sizes?.disconnect()
      watch?.disconnect()
      stopInput()
    },
  }
}
export { stageSelect, type StageSelectOptions } from './stage-select'
