// Pointer input on the bars: drag the thumb, press the track to page (held, it repeats until the thumb reaches the
// pointer) or to jump, and hover. Hit-testing uses the engine's geometry, so a canvas bar works the same as a DOM one.
import { dragRatio, progressAt } from './bar'
import type { AxisState, Engine } from './engine'
import type { Visibility } from './render'
import { pageStep } from './wheel'

/** Listen on each bar's track. Returns the cleanup. */
export function barInput(e: Engine, vis: Visibility) {
  const offs: (() => void)[] = []
  for (const a of e.axes) {
    const track = a.track
    if (!track) continue
    const along = (ev: PointerEvent) => {
      const r = track.getBoundingClientRect()
      return a.axis === 'y' ? ev.clientY - r.top : ev.clientX - r.left
    }
    const hover = (on: boolean) => () => {
      a.hover = on
      vis.apply()
      e.wake()
    }
    const enter = hover(true)
    const leave = hover(false)
    const down = (ev: PointerEvent) => {
      if (ev.button !== 0) return
      ev.preventDefault()
      const at = along(ev)
      const c = { e, vis, a, track, along }
      if (at >= a.thumbOff && at <= a.thumbOff + a.thumbLen) drag(c, ev, at)
      else press(c, ev, at)
    }
    track.addEventListener('pointerenter', enter)
    track.addEventListener('pointerleave', leave)
    track.addEventListener('pointerdown', down)
    offs.push(() => {
      track.removeEventListener('pointerenter', enter)
      track.removeEventListener('pointerleave', leave)
      track.removeEventListener('pointerdown', down)
    })
  }
  return () => offs.forEach((f) => f())
}

/** One bar's pointer handling: the engine, its axis, the track and where a pointer is along it. */
interface Bar {
  e: Engine
  vis: Visibility
  a: AxisState
  track: HTMLElement
  along: (ev: PointerEvent) => number
}

function drag({ e, vis, a, track, along }: Bar, ev: PointerEvent, at: number) {
  const start = a.pos
  const ratio = dragRatio(a.trackLen, a.thumbLen, a.max - a.min)
  track.setPointerCapture?.(ev.pointerId)
  a.active = true
  vis.apply()
  const move = (m: PointerEvent) => e.moveTo(a.axis, start + (along(m) - at) * ratio, 'bar')
  const up = () => {
    a.active = false
    vis.apply()
    e.settle(a.axis)
    e.wake()
    track.removeEventListener('pointermove', move)
    track.removeEventListener('pointerup', up)
    track.removeEventListener('pointercancel', up)
  }
  track.addEventListener('pointermove', move)
  track.addEventListener('pointerup', up)
  track.addEventListener('pointercancel', up)
}

function press({ e, a, track, along }: Bar, ev: PointerEvent, at: number) {
  const jump = (e.o.bar.trackClick === 'jump') !== ev.altKey
  if (jump) {
    const p = progressAt(a.trackLen, a.thumbLen, at - e.o.bar.inset)
    return e.tweenTo(a.axis, a.min + p * (a.max - a.min), 'bar')
  }
  let pointer = at
  const dir = at < a.thumbOff ? -1 : 1
  const page = () => {
    const before = pointer < a.thumbOff ? -1 : pointer > a.thumbOff + a.thumbLen ? 1 : 0
    if (before === dir) e.tweenBy(a.axis, dir * pageStep(a.view), 'bar')
    else stop()
  }
  let timer: ReturnType<typeof setTimeout> = setTimeout(function repeat() {
    page()
    timer = setTimeout(repeat, 60)
  }, 350)
  track.setPointerCapture?.(ev.pointerId)
  const move = (m: PointerEvent) => (pointer = along(m))
  const stop = () => {
    clearTimeout(timer)
    track.removeEventListener('pointermove', move)
    track.removeEventListener('pointerup', stop)
    track.removeEventListener('pointercancel', stop)
  }
  track.addEventListener('pointermove', move)
  track.addEventListener('pointerup', stop)
  track.addEventListener('pointercancel', stop)
  e.tweenBy(a.axis, dir * pageStep(a.view), 'bar')
}
