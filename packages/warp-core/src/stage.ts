// @weft-js/warp-core/stage: a canvas that paints the page laid out over it (08 §6.8). The DOM keeps what it is good at,
// layout, focus, typing, selection and the accessibility tree; every `[data-skin]` element inside gives up its own paint,
// and the stage hands each one to a painter with its box, its states and a 2D context, every frame something moves. So the
// page reflows, wraps and stacks like any other, and what it looks like is entirely the painters': vector, pixels, glow,
// pencil, or the dither stage's cells (./dither/stage), which is one look built on this. A stage can be a whole page or a
// few skins among ordinary components, which paint over it as usual.
import { surface, type Frame } from './canvas'
import { reducedMotion } from './motion'
import type { Action } from './store'

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
export interface Press { x: number; y: number; age: number }

/** The scroll position a stage paints at, when it scrolls. */
export interface Scroll { top: number; height: number; view: number }

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
export interface Word { text: string; x: number; y: number; w: number; font: string; spacing: number }

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
  fps?: number | undefined
  /** Scrolls when the rail is dragged. The look paints it from `scene.rail`. */
  rail?: boolean | undefined
  context?: CanvasRenderingContext2DSettings | undefined
  /** Called when the theme or dial changes, before the repaint. */
  onTheme?: (() => void) | undefined
}

const INK_PROBE = 'i'
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
  return { update() {}, destroy() { own?.removeEventListener('beforetoggle', start); inner?.destroy() } }
}
const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Paints every `[data-skin]` element inside the canvas's stage. The canvas sits in a paint layer that is the stage's first child. */
export function stage(canvas: HTMLCanvasElement, options: StageOptions = {}): Action<StageOptions> {
  let o = options
  const box = canvas.parentElement ?? canvas, host = box.parentElement ?? box
  let time = 0, appeared = 0, hidden = false, stale = true, busy = 0, painted = false, drag = false, unit = 1, rows = 0, cols = 0
  let pieces: HTMLElement[] = [], states = new WeakMap<HTMLElement, Piece>(), inks = new Map<string, string>()
  const marks: { x: number; y: number; at: number }[] = [], pointer = { x: -1e4, y: -1e4 }

  const lively = () => !reducedMotion(host) && !!dials && dials.speed > 0
  let dials: Frame['tier'] | undefined
  const settings = () => ({ draw, animate: o.animate, fps: o.fps, cell: o.cell, context: o.context, onTheme: retheme })
  function retheme() {
    inks = new Map()
    o.onTheme?.()
  }

  const scroller = () => (o.layout === 'page' ? document.scrollingElement ?? document.documentElement : o.layout === 'scroll' ? host : undefined)

  function color(css: string) {
    let c = inks.get(css)
    if (c === undefined) {
      const probe = document.createElement(INK_PROBE)
      probe.hidden = true
      host.append(probe)
      probe.style.color = css.startsWith('--') ? `var(${css})` : css
      inks.set(css, (c = getComputedStyle(probe).color))
      probe.remove()
    }
    return c
  }

  function words(el: HTMLElement) {
    const origin = box.getBoundingClientRect(), range = document.createRange(), walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), out: Word[] = []
    const measure = document.createElement('canvas').getContext('2d')
    for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
      const st = getComputedStyle(n.parentElement!), upper = st.textTransform === 'uppercase', size = parseFloat(st.fontSize) / unit
      const font = `${st.fontStyle} ${st.fontWeight} ${size}px ${st.fontFamily}`, spacing = (parseFloat(st.letterSpacing) || 0) / unit
      if (measure) measure.font = font
      const m = measure?.measureText('Hg'), asc = m?.fontBoundingBoxAscent ?? size * 0.8, desc = m?.fontBoundingBoxDescent ?? size * 0.2
      for (const word of n.data.matchAll(/\S+/g)) {
        range.setStart(n, word.index)
        range.setEnd(n, word.index + word[0].length)
        const at = range.getClientRects()[0]
        if (!at) continue
        const top = (at.top - origin.top) / unit, h = at.height / unit
        out.push({ text: upper ? word[0].toUpperCase() : word[0], x: (at.left - origin.left) / unit, y: top + (h - asc - desc) / 2 + asc, w: at.width / unit, font, spacing })
      }
    }
    return out
  }

  function gather() {
    pieces = [...host.querySelectorAll<HTMLElement>('[data-skin]')].filter(el => el.closest('[data-scope="stage"]') === host)
    sizes?.disconnect()
    sizes?.observe(box)
    for (const el of pieces) sizes?.observe(el)
    stale = false
  }

  // States come from the DOM itself (:hover, :focus-visible, checked, aria-pressed), so a look can't disagree with it.
  function read(el: HTMLElement, base: DOMRect, ease: number, snap: boolean): Piece {
    const b = el.getBoundingClientRect(), cut = (v: number) => (snap ? Math.round(v) : v)
    let p = states.get(el)
    if (!p) states.set(el, (p = { el, skin: '', x: 0, y: 0, w: -1, h: -1, r: 0, hover: 0, press: 0, focus: 0, on: 0, value: 0, seen: lively() && !host.matches('[data-veil], [popover]') ? 0 : 1, disabled: false, invalid: false, px: 0, py: 0 }))
    const w = cut(b.width / unit), h = cut(b.height / unit)
    if (w !== p.w || h !== p.h) p.r = Math.min(cut(parseFloat(getComputedStyle(el).borderTopLeftRadius) / unit) || 0, h / 2)
    p.skin = el.dataset.skin ?? ''
    p.x = cut((b.left - base.left) / unit)
    p.y = cut((b.top - base.top) / unit)
    p.w = w
    p.h = h
    p.px = (pointer.x - b.left) / unit
    p.py = (pointer.y - b.top) / unit
    p.disabled = el.matches(':disabled, [aria-disabled="true"]')
    let invalid = false
    try { invalid = el.matches(':user-invalid') } catch { /* an older engine: no invalid state */ }
    p.invalid = invalid
    const input = el as HTMLInputElement, aria = (name: string) => el.getAttribute(name) === 'true'
    const on = input.checked || aria('aria-pressed') || aria('aria-selected') || aria('aria-checked') || aria('aria-expanded') || el.hasAttribute('open') || (el.hasAttribute('aria-current') && el.getAttribute('aria-current') !== 'false')
    const value = input.type === 'range' ? (+input.value - +(input.min || 0)) / ((+(input.max || 100) - +(input.min || 0)) || 1) : el instanceof HTMLProgressElement || el instanceof HTMLMeterElement ? el.value / (el.max || 1) : 0
    const toward = (now: number, goal: number) => (Math.abs(goal - now) < 0.01 ? goal : now + (goal - now) * ease)
    p.hover = toward(p.hover, !p.disabled && el.matches(':hover, [data-highlighted]') ? 1 : 0)
    p.press = toward(p.press, !p.disabled && el.matches(':active') ? 1 : 0)
    p.focus = toward(p.focus, el.matches(':focus-visible') || (el.matches('input, select, textarea') && el.matches(':focus')) ? 1 : 0)
    p.on = toward(p.on, on ? 1 : 0)
    p.value = toward(p.value, clamp(value))
    return p
  }
  const settled = (p: Piece) => p.seen >= 1 && [p.hover, p.press, p.focus, p.on].every(v => v === 0 || v === 1)

  function draw(frame: Frame) {
    const { ctx, width, height, dpr, dt, time: now } = frame
    dials = frame.tier
    if (hidden) { states = new WeakMap(); appeared = now; hidden = false }
    if (stale) gather()
    time = now
    cols = width
    rows = height
    unit = o.cell ? Math.max(1, Math.round(o.cell * dpr)) / dpr : 1
    const live = lively(), ease = live ? 1 - Math.exp(-dt * 16) : 1, base = box.getBoundingClientRect()

    let moving = marks.length > 0 || drag || now < busy
    const shown: Piece[] = []
    for (const el of pieces) {
      const p = read(el, base, ease, !!o.cell)
      if (p.y >= height || p.y + p.h < -8 || p.x >= width || p.x + p.w < -8 || !p.w || !p.h) continue
      p.seen = live ? Math.min(1, p.seen + dt / 0.45) : 1
      if (!settled(p) || (live && p.focus > 0.5)) moving = true
      shown.push(p)
    }
    const presses: Press[] = []
    for (let k = marks.length - 1; k >= 0; k--) {
      const age = (now - marks[k]!.at) / 0.6
      if (age >= 1) marks.splice(k, 1)
      else presses.unshift({ x: marks[k]!.x, y: marks[k]!.y, age })
    }
    const sc = scroller(), scroll = sc ? { top: sc.scrollTop, height: sc.scrollHeight, view: sc.clientHeight } : undefined
    let rail: Scene['rail']
    if (o.rail && scroll && scroll.height > scroll.view + 1) {
      const len = Math.max(height * 0.06, height * (scroll.view / scroll.height)), w = Math.max(2, 6 / unit)
      rail = { x: width - w - 2 / unit, w, top: (height - len) * (scroll.top / (scroll.height - scroll.view)), len, drag }
    }
    const scene: Scene = { ctx, width, height, unit, time: now, dt, live, pieces: shown, pointer: { x: (pointer.x - base.left) / unit, y: (pointer.y - base.top) / unit, in: pointer.x > -1e4 }, presses, scroll, rail, shown: now - appeared, color, words }

    if (o.paint) moving = o.paint(scene) === true || moving
    else {
      ctx.clearRect(0, 0, width, height)
      o.background?.(scene)
      for (const p of shown) {
        const fn = o.painters?.[p.skin]
        if (!fn) continue
        ctx.save()
        fn(p, scene)
        ctx.restore()
      }
      o.overlay?.(scene)
    }
    if (!painted) { painted = true; host.setAttribute('data-state', 'live') }
    return moving
  }

  // Its float: a box with no ground of its own, which the float's own painters fill.
  LOOKS.set(host, c => { const f = stage(c, { ...o, layout: 'box', rail: false, background: undefined }); return { update() {}, destroy: () => f.destroy() } })
  const s = surface(canvas, settings())
  const invalidate = () => s.invalidate()
  // A CSS transition can move a piece after the event that started it, so paint on for a moment after any of them.
  const stir = (e?: Event) => { busy = time + (e?.type === 'animationstart' ? 0.6 : 0.4); s.update(settings()) }
  const sizes = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => { if (!box.clientWidth) hidden = true; invalidate() })
  sizes?.observe(box)
  const watch = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(() => { stale = true; stir() })
  watch?.observe(host, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-skin', 'data-ramp', 'data-look', 'aria-pressed', 'aria-checked', 'aria-selected', 'aria-expanded', 'data-highlighted', 'aria-current', 'disabled', 'open', 'hidden', 'class', 'value'] })

  const at = (e: PointerEvent) => { const b = box.getBoundingClientRect(); return { x: (e.clientX - b.left) / unit, y: (e.clientY - b.top) / unit } }
  const scrubTo = (e: PointerEvent) => { const sc = scroller(); if (sc) sc.scrollTop = (at(e).y / rows) * sc.scrollHeight - sc.clientHeight / 2 }
  const onRail = (e: PointerEvent) => !!o.rail && !!scroller() && at(e).x >= cols - 12 / unit
  const move = (e: PointerEvent) => { pointer.x = e.clientX; pointer.y = e.clientY; if (drag) scrubTo(e); invalidate() }
  const down = (e: PointerEvent) => {
    if (onRail(e)) { drag = true; e.preventDefault(); scrubTo(e); document.addEventListener('pointermove', move); stir(); return }
    if (lively()) marks.push({ ...at(e), at: time })
    stir()
  }
  const up = () => { if (drag) { drag = false; document.removeEventListener('pointermove', move) } stir() }
  const leave = () => { pointer.x = pointer.y = -1e4; invalidate() }
  const fonts = () => invalidate()
  const EVENTS = ['focusin', 'focusout', 'input', 'change', 'toggle', 'transitionrun', 'animationstart', 'keydown', 'keyup'] as const
  host.addEventListener('pointermove', move, { passive: true })
  host.addEventListener('pointerdown', down)
  host.addEventListener('pointerleave', leave)
  document.addEventListener('pointerup', up)
  document.addEventListener('scroll', invalidate, { capture: true, passive: true })
  for (const name of EVENTS) host.addEventListener(name, stir, true)
  void document.fonts?.ready.then(fonts)

  return {
    update(next) {
      o = next
      s.update(settings())
    },
    destroy() {
      s.destroy()
      sizes?.disconnect()
      watch?.disconnect()
      host.removeEventListener('pointermove', move)
      host.removeEventListener('pointerdown', down)
      host.removeEventListener('pointerleave', leave)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('scroll', invalidate, { capture: true })
      for (const name of EVENTS) host.removeEventListener(name, stir, true)
    },
  }
}
export { stageSelect, type StageSelectOptions } from './stage-select'
