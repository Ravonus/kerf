// A live dithered field on a surface. No per-cell work outlives the frame: tones, forces and inks are typed arrays, and an
// unchanged frame never touches the canvas.
import { surface, type Frame } from '../canvas'
import { reducedMotion } from '../motion'
import type { Action } from '../store'
import type { Field, FieldName } from './fields'
import type { MaskSource } from './mask'
import type { PointerMode } from './pointer'
import { palette, tier, type Ramp } from './ramp'
import { tile, type Pattern } from './tiles'
import { fieldPointer } from './field-pointer'
import { createFieldState } from './field-state'
import { fieldBuffers } from './field-buffers'
import { drawField } from './field-draw'

/** Options for an animated dither field. */
export interface FieldOptions {
  /** A named field, or your own function of (x, y, t). */
  kind?: FieldName | Field | undefined
  /** Your own `kind` is smooth: evaluate it on a sparse lattice and interpolate, as the named fields do. */
  smooth?: boolean | undefined
  ramp?: Ramp | undefined
  /** Inks a disturbed cell takes instead, so a push shows in a second colour. */
  spark?: Ramp | undefined
  pattern?: Pattern | undefined
  /** CSS pixels per cell. */
  cell?: number | undefined
  /** How many inks of a tone ramp to use. Default: the tier's. */
  inks?: number | undefined
  /** Multiplies the tier's speed. 0 holds one frame. */
  speed?: number | undefined
  /** Tone gain, around 1. Default: the tier's. */
  gain?: number | undefined
  /** Where a held frame sits in the field's time, in seconds. */
  seed?: number | undefined
  /** How much of the step between inks the pattern may cross, 0–1. */
  spread?: number | undefined
  pointer?: PointerMode | PointerMode[] | undefined
  /** The field shows through this shape. */
  mask?: MaskSource | undefined
  /** Dissolves the field toward a side, so type can sit on clean ground, or into the page on every edge. */
  fade?: Fade | undefined
  /** Seconds a mask takes to draw itself on, left to right, with a flash where it lands. Needs motion. */
  reveal?: number | undefined
  fps?: number | undefined
}

/** The edge a field fades out from. */
export type Fade = 'left' | 'right' | 'top' | 'bottom' | 'edges'

/** The fx state a host shows (08 §1.2): `on` moves, `still` holds a frame. */
export const fxState = (el: Element, speed: number) =>
  speed > 0 && !reducedMotion(el) ? 'on' : 'still'

/** A canvas of dithered, animated noise that the pointer can disturb. */
export function ditherField(
  canvas: HTMLCanvasElement,
  options: FieldOptions = {},
): Action<FieldOptions> {
  const host = canvas.parentElement ?? canvas
  const v = createFieldState(host, options)

  const speedOf = () => (v.o.speed ?? 1) * v.dials.speed
  const moves = () => speedOf() > 0
  const { grow, remask, reforce, edges } = fieldBuffers(v, host)

  function retheme() {
    v.dials = tier(host)
    v.inks = palette(host, v.o.ramp ?? 'accent', v.o.inks ?? v.dials.inks)
    v.sparks =
      v.o.spark && v.inks.length > 1 ? palette(host, v.o.spark, v.inks.length - 1) : undefined
    v.painted = false
    host.setAttribute('data-fx-state', fxState(host, speedOf()))
    reforce()
    s?.update(settings())
  }
  const settings = () => ({
    draw,
    animate: moves(),
    fps: v.o.fps,
    cell: v.o.cell ?? 8,
    onTheme: retheme,
  })

  const reveal = (time: number) => !!v.o.mask && time < (v.o.reveal ?? 0) + 0.4

  const drawContext = { v, host, grow, retheme, speedOf, moves, reveal }
  const draw = (frame: Frame) => drawField(frame, drawContext)

  const s = surface(canvas, settings())
  if (v.o.mask)
    void (document.fonts?.ready ?? Promise.resolve()).then(() => {
      v.fontsReady = true
      remask()
      v.painted = false
      s.invalidate()
    })

  const stopPointer = fieldPointer(
    host,
    () => v.push,
    () => v.cols,
    s,
    settings,
  )

  return {
    update(next) {
      const was = JSON.stringify([
        v.o.mask && typeof v.o.mask !== 'function' ? v.o.mask : 0,
        v.o.pointer,
      ])
      const fn = v.o.kind,
        seed = v.o.seed
      v.o = next
      v.pattern = tile(v.o.pattern ?? 'bayer8')
      edges()
      if (fn !== v.o.kind || next.seed !== seed) v.fresh = false
      if (
        was !==
        JSON.stringify([v.o.mask && typeof v.o.mask !== 'function' ? v.o.mask : 0, v.o.pointer])
      ) {
        v.fontsReady = true
        remask()
        reforce()
      }
      retheme()
    },
    destroy() {
      s.destroy()
      stopPointer()
    },
  }
}
