// Touch and pen drags (and mouse drags with `grab`). One gesture at a time across every scroller: the innermost one
// under the finger starts it, and once the direction is clear it goes to the innermost scroller that can move that
// way, or to the page when none can.
import { Velocity } from './physics'
import { registry, type Engine } from './engine'
import type { Axis } from './types'

const SLOP = 8

interface Gesture {
  id: number
  chain: Engine[]
  owner: Engine | null
  page: Element | null
  axes: Axis[]
  x0: number
  y0: number
  lastX: number
  lastY: number
  raw: { x: number; y: number }
  vel: Velocity
  moved: boolean
}

let g: Gesture | null = null

/** The scrollers from `e` outwards. */
function chainFrom(e: Engine) {
  const out: Engine[] = []
  for (let at: Engine | null = e; at; at = at.parent()) out.push(at)
  return out
}

/** Listen for drags starting in the viewport. Returns the cleanup. */
export function touchInput(e: Engine) {
  const onDown = (ev: PointerEvent) => {
    if (g?.id === ev.pointerId || !ev.isPrimary) return
    const mouse = ev.pointerType === 'mouse'
    const js = e.o.touch === 'js' && e.o.mode === 'engine'
    if (mouse ? !e.o.grab || ev.button !== 0 : !js) return
    const chain = chainFrom(e)
    let caught = false
    for (const s of chain)
      for (const a of s.axes) {
        if (a.anim?.kind === 'coast' && Math.abs(a.v) > 0.1) caught = true
        if (a.anim?.kind !== 'spring') s.stop(a.axis)
      }
    if (mouse) ev.preventDefault()
    g = {
      id: ev.pointerId,
      chain,
      owner: null,
      page: null,
      axes: [],
      x0: ev.clientX,
      y0: ev.clientY,
      lastX: ev.clientX,
      lastY: ev.clientY,
      raw: { x: 0, y: 0 },
      vel: new Velocity(),
      moved: caught,
    }
    g.vel.add(ev.timeStamp, -ev.clientX, -ev.clientY)
    addEventListener('pointermove', onMove)
    addEventListener('pointerup', onUp)
    addEventListener('pointercancel', onUp)
  }
  e.vp.addEventListener('pointerdown', onDown)
  return () => {
    e.vp.removeEventListener('pointerdown', onDown)
    if (g?.chain[0] === e) end()
  }
}

function onMove(ev: PointerEvent) {
  if (!g || ev.pointerId !== g.id) return
  const dx = ev.clientX - g.x0
  const dy = ev.clientY - g.y0
  if (!g.axes.length) {
    if (Math.hypot(dx, dy) < SLOP) return
    pick(g, dx, dy)
    g.moved = true
  }
  g.vel.add(ev.timeStamp, -ev.clientX, -ev.clientY)
  if (g.owner) {
    for (const axis of g.axes) g.owner.drag(axis, g.raw[axis] - (axis === 'x' ? dx : dy))
  } else if (g.page) {
    g.page.scrollBy({
      left: g.axes.includes('x') ? g.lastX - ev.clientX : 0,
      top: g.axes.includes('y') ? g.lastY - ev.clientY : 0,
      behavior: 'instant',
    })
  }
  g.lastX = ev.clientX
  g.lastY = ev.clientY
}

/** Lock the direction and choose who moves: the innermost scroller that can, as browsers chain overscroll. */
function pick(gest: Gesture, dx: number, dy: number) {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  const both = gest.chain[0]!.ax
  if (ax > ay * 1.5 || !both.y.on) gest.axes = ['x']
  else if (ay > ax * 1.5 || !both.x.on) gest.axes = ['y']
  else gest.axes = ['x', 'y']
  const can = (s: Engine) => gest.axes.some((a) => s.canMove(a, -Math.sign(a === 'x' ? dx : dy)))
  let owner: Engine | null = null
  for (const s of gest.chain) {
    if (can(s) || s.o.chain === 'contain') {
      owner = s
      break
    }
  }
  const outer = gest.chain.at(-1)!
  if (!owner && outer.o.chain === 'auto') {
    const page = scrollParent(outer.root)
    if (page && gest.axes.some((a) => nativeRoom(page, a, -Math.sign(a === 'x' ? dx : dy))))
      gest.page = page
  }
  // Nothing anywhere can move this way: the innermost area takes it, to rubber-band.
  if (!owner && !gest.page) owner = gest.chain[0]!
  gest.owner = owner
  // Measured from where the slop ended, so the content doesn't jump by the slop when the drag starts.
  if (owner) for (const a of gest.axes) gest.raw[a] = owner.rawPos(a) + (a === 'x' ? dx : dy)
}

function onUp(ev: PointerEvent) {
  if (!g || ev.pointerId !== g.id) return
  const v = ev.type === 'pointercancel' ? { x: 0, y: 0 } : g.vel.get(ev.timeStamp)
  if (g.owner) for (const axis of g.axes) g.owner.release(axis, v[axis])
  if (g.moved) swallowClick()
  end()
}

function end() {
  g = null
  removeEventListener('pointermove', onMove)
  removeEventListener('pointerup', onUp)
  removeEventListener('pointercancel', onUp)
}

/** A drag that moved, or a tap that caught a coast, isn't a click on what's under it. */
function swallowClick() {
  const stop = (ev: Event) => {
    ev.stopPropagation()
    ev.preventDefault()
  }
  addEventListener('click', stop, { capture: true, once: true })
  setTimeout(() => removeEventListener('click', stop, { capture: true }), 350)
}

/** The nearest natively scrolling ancestor, or the page. */
function scrollParent(from: Element): Element | null {
  for (let el = from.parentElement; el; el = el.parentElement) {
    if (registry.has(el)) return null
    const s = getComputedStyle(el)
    if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && el.scrollHeight > el.clientHeight)
      return el
  }
  return document.scrollingElement
}

/** Whether a native scroller has room to move `dir` along `axis`. */
function nativeRoom(el: Element, axis: Axis, dir: number) {
  const max = axis === 'y' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth
  const at = axis === 'y' ? el.scrollTop : Math.abs(el.scrollLeft)
  const forward = axis === 'x' && getComputedStyle(el).direction === 'rtl' ? -dir : dir
  return forward > 0 ? at < max - 0.5 : at > 0.5
}
