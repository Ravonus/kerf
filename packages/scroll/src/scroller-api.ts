// The `Scroller` a caller holds: programmatic scrolling, scrollIntoView, and live option changes.
import { clamp } from './engine'
import { resolve } from './options'
import type { Setup } from './scroller'
import type { Axis, Scroller } from './types'

type Move = { top?: number; left?: number; behavior?: ScrollBehavior }

export function api(s: Setup, configure: () => void): Scroller {
  const { e } = s
  const move = (to: Move, by: boolean) => {
    for (const [axis, v] of [
      ['y', to.top],
      ['x', to.left],
    ] as [Axis, number | undefined][]) {
      if (v === undefined || !Number.isFinite(v)) continue
      const a = e.ax[axis]
      const target = by ? (a.anim?.kind === 'tween' ? a.anim.to : a.pos) + v : v
      if (to.behavior === 'smooth') e.tweenTo(axis, target, 'api')
      else {
        e.moveTo(axis, target, 'api')
        e.write()
      }
    }
  }
  return {
    viewport: e.vp,
    state: () => e.state(),
    scrollTo: (to) => move(to, false),
    scrollBy: (by) => move(by, true),
    scrollIntoView(el, o = {}) {
      const box = e.vp.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      const m = o.margin ?? 0
      const plan = (axis: Axis, pos: ScrollLogicalPosition) => {
        const a = e.ax[axis]
        const y = axis === 'y'
        const start = (y ? r.top - box.top : r.left - box.left) + a.pos
        const size = y ? r.height : r.width
        let to = a.pos
        if (pos === 'start') to = start - m
        else if (pos === 'end') to = start + size - a.view + m
        else if (pos === 'center') to = start + size / 2 - a.view / 2
        else if (start - m < a.pos || size + 2 * m > a.view) to = start - m
        else if (start + size + m > a.pos + a.view) to = start + size - a.view + m
        return clamp(to, a.min, a.max)
      }
      const top = plan('y', o.block ?? 'start')
      const left = plan('x', o.inline ?? 'nearest')
      move({ top, left, behavior: o.behavior ?? 'auto' }, false)
    },
    stop: () => e.stop(),
    refresh: s.remeasure,
    update(next) {
      s.options = { ...s.options, ...next }
      const axes = e.o.axes
      e.o = resolve(s.options)
      const wanted = next.renderer
      if (wanted && wanted !== s.renderer) {
        for (const a of e.axes) {
          if (!a.track) continue
          s.renderer.unmount(a.track)
          wanted.mount(a.track, a.axis)
          a.drawn = ''
        }
        s.renderer = wanted
      }
      configure()
      if (e.o.axes !== axes) s.rebar()
      else s.remeasure()
    },
    destroy: () => e.destroyHooks.splice(0).forEach((f) => f()),
  }
}
