// A live dithered field on a surface. No per-cell work outlives the frame: tones, forces and inks are typed arrays, and an
// unchanged frame never touches the canvas.
import { surface, type Frame } from '../canvas'
import { reducedMotion } from '../motion'
import type { Action } from '../store'
import { FIELDS, sample, stepFor, type Field, type FieldName } from './fields'
import { rasterMask, type Mask, type MaskSource } from './mask'
import { forces, type Forces, type PointerMode } from './pointer'
import { quantize } from './quantize'
import { palette, tier, type Ramp } from './ramp'
import { tile, type Pattern } from './tiles'

/** Options for an animated dither field. */
export interface FieldOptions {
  /** A named field, or your own function of (x, y, t). */
  kind?: FieldName | Field
  /** Your own `kind` is smooth: evaluate it on a sparse lattice and interpolate, as the named fields do. */
  smooth?: boolean
  ramp?: Ramp
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
const HOT = 0.32
const smooth = (v: number) => { const k = v < 0 ? 0 : v > 1 ? 1 : v; return k * k * (3 - 2 * k) }
const clamp = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v)
const family = (el: Element) => getComputedStyle(el).fontFamily || 'sans-serif'

/** The fx state a host shows (08 §1.2): `on` moves, `still` holds a frame. */
export const fxState = (el: Element, speed: number) => (speed > 0 && !reducedMotion(el) ? 'on' : 'still')

/** A canvas of dithered, animated noise that the pointer can disturb. */
export function ditherField(canvas: HTMLCanvasElement, options: FieldOptions = {}): Action<FieldOptions> {
  let o = options
  const host = canvas.parentElement ?? canvas
  let cols = 0, rows = 0, cells = 0
  let tones = new Float32Array(0), shown = new Float32Array(0), heat = new Float32Array(0), out = new Uint32Array(0), image: ImageData | undefined
  let inks = new Uint32Array(0), sparks: Uint32Array | undefined, dials = tier(host), mask: Mask | undefined, push: Forces | undefined, ground: Float32Array | undefined
  let pattern = tile(o.pattern ?? 'bayer8'), fresh = false, painted = false, fontsReady = !o.mask, hot = false, clock = 0, seen = 0

  const speedOf = () => (o.speed ?? 1) * dials.speed
  const moves = () => speedOf() > 0
  const modes = () => { const p = o.pointer; return p ? (Array.isArray(p) ? p : [p]) : [] }

  function retheme() {
    dials = tier(host)
    inks = palette(host, o.ramp ?? 'accent', o.inks ?? dials.inks)
    sparks = o.spark && inks.length > 1 ? palette(host, o.spark, inks.length - 1) : undefined
    painted = false
    host.setAttribute('data-fx-state', fxState(host, speedOf()))
    reforce()
    s?.update(settings())
  }
  const settings = () => ({ draw, animate: moves(), fps: o.fps, cell: o.cell ?? 8, onTheme: retheme })

  function grow(w: number, h: number) {
    cols = w
    rows = h
    cells = w * h
    tones = new Float32Array(cells)
    shown = new Float32Array(cells)
    heat = new Float32Array(cells)
    image = new ImageData(w, h)
    out = new Uint32Array(image.data.buffer)
    fresh = painted = false
    remask()
    reforce()
    edges()
  }
  const remask = () => { mask = o.mask && fontsReady && cols ? rasterMask(o.mask, cols, rows, family(host)) : undefined }
  const reforce = () => { const m = modes(); push = m.length && dials.reach > 0 && !reducedMotion(host) && cols ? forces(m, cols, rows, dials.reach) : undefined }

  const reveal = (time: number) => !!o.mask && time < (o.reveal ?? 0) + 0.4

  function edges() {
    const f = o.fade
    ground = f ? new Float32Array(cells) : undefined
    if (ground) for (let y = 0, i = 0; y < rows; y++) for (let x = 0; x < cols; x++, i++) {
      const u = x / cols, v = y / rows
      ground[i] = f === 'left' ? smooth(u * 1.8 - 0.5) : f === 'right' ? smooth((1 - u) * 1.8 - 0.5) : f === 'top' ? smooth(v * 1.8 - 0.5) : f === 'bottom' ? smooth((1 - v) * 1.8 - 0.5) : smooth(Math.min(u, 1 - u) * 6) * smooth(Math.min(v, 1 - v) * 6)
    }
  }

  function compose(now: number, stirred: boolean) {
    const gain = o.gain ?? dials.gain, m = mask, p = stirred ? push : undefined, g = ground, sweep = moves() && !reducedMotion(host) ? o.reveal ?? 0 : 0
    hot = false
    for (let y = 0, i = 0; y < rows; y++) for (let x = 0; x < cols; x++, i++) {
      let at = i, energy = 0
      if (p) {
        p.at(x, y)
        energy = p.energy
        if (energy) at = clamp(Math.round(y + p.oy), rows - 1) * cols + clamp(Math.round(x + p.ox), cols - 1)
      }
      const tone = tones[at]!
      let v = tone * tone * 0.95 * gain * (g ? g[i]! : 1) + energy * 0.55
      if (m) {
        const age = sweep ? now - (x / cols) * sweep : 1
        const on = age <= 0 ? 0 : age >= 0.2 ? 1 : age * 5, flash = age > 0 && age < 0.3 ? (0.3 - age) * 2 * m.shape[at]! : 0
        v = v * 0.42 + m.halo[at]! * 0.34 * gain * on + m.shape[at]! * (0.46 + tone * 0.72) * on + flash
      }
      shown[i] = v
      heat[i] = energy
      if (energy > HOT) hot = true
    }
  }

  /** Disturbed cells take the spark inks at the level they already dithered to. */
  function ignite() {
    const top = inks.length - 1, n = pattern.n, bits = n - 1, spread = o.spread ?? 0.9, shift = (1 - spread) / 2
    for (let y = 0, i = 0; y < rows; y++) for (let x = 0; x < cols; x++, i++) if (heat[i]! > HOT) {
      const level = shown[i]! * top + pattern.t[(y & bits) * n + (x & bits)]! * spread + shift
      if (level >= 1) out[i] = sparks![Math.min(sparks!.length - 1, (level | 0) + 1)]!
    }
  }

  function draw({ ctx, width, height, time, dt }: Frame) {
    if (width !== cols || height !== rows) grow(width, height)
    if (!inks.length) retheme()
    if (!cells || !image) return
    const speed = speedOf(), moving = speed > 0 && !reducedMotion(host)
    clock += (time - seen) * speed * 2 // a change of speed carries on from here, with no jump
    seen = time
    if (moving || !fresh) {
      const f = o.kind ?? 'weave', own = typeof f === 'function'
      sample(own ? f : FIELDS[f], cols, rows, (o.seed ?? 12) + clock, tones, own && !o.smooth ? 1 : stepFor(cells))
      fresh = true
    }
    const active = push?.step(dt) ?? false
    compose(time, active)
    let changed = quantize(shown, cols, rows, pattern, inks, out, o.spread ?? 0.9)
    if (sparks && (hot || active)) { ignite(); changed = 1 }
    if (changed || !painted) {
      ctx.putImageData(image, 0, 0)
      painted = true
    }
    if (host.getAttribute('data-state') !== 'live') host.setAttribute('data-state', 'live')
    return active || (reveal(time) && moves())
  }

  const s = surface(canvas, settings())
  if (o.mask) void (document.fonts?.ready ?? Promise.resolve()).then(() => { fontsReady = true; remask(); painted = false; s.invalidate() })

  // Pointer events reach the document even when content sits over the field, as a hero's text does.
  const place = (e: PointerEvent, fn: (x: number, y: number) => void) => {
    if (!push || !s.visible()) return
    const r = host.getBoundingClientRect()
    const x = e.clientX - r.left, y = e.clientY - r.top
    if (x < 0 || y < 0 || x > r.width || y > r.height) return push.leave()
    const k = r.width / cols
    fn(x / k, y / k)
    s.invalidate()
    wake()
  }
  // A settled surface is asleep, so the first push has to start it; the draw's return value keeps it going from there.
  const wake = () => s.update(settings())
  const move = (e: PointerEvent) => place(e, (x, y) => push!.move(x, y))
  const press = (e: PointerEvent) => place(e, (x, y) => push!.press(x, y))
  const leave = () => { push?.leave(); s.invalidate() }
  document.addEventListener('pointermove', move, { passive: true })
  document.addEventListener('pointerdown', press, { passive: true })
  document.documentElement.addEventListener('pointerleave', leave)

  return {
    update(next) {
      const was = JSON.stringify([o.mask && typeof o.mask !== 'function' ? o.mask : 0, o.pointer])
      const fn = o.kind, seed = o.seed
      o = next
      pattern = tile(o.pattern ?? 'bayer8')
      edges()
      if (fn !== o.kind || next.seed !== seed) fresh = false
      if (was !== JSON.stringify([o.mask && typeof o.mask !== 'function' ? o.mask : 0, o.pointer])) { fontsReady = true; remask(); reforce() }
      retheme()
    },
    destroy() {
      s.destroy()
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerdown', press)
      document.documentElement.removeEventListener('pointerleave', leave)
    },
  }
}
