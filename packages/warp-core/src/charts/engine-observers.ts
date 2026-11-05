import type { Ctx } from './types'

type Live = { near: boolean; dirty: boolean; redraw(): void }
const live = new Set<Live>()
const lookup = new Map<string, number>()
let dials: MutationObserver | undefined
let draining = false

/** Read and cache a chart token. */
export function probe(
  el: Element,
  token: string,
  prop: 'borderTopLeftRadius' | 'transitionDuration',
) {
  const key = token + prop
  if (!lookup.has(key)) {
    const t = el.ownerDocument.createElement('i')
    t.style.cssText = `position:absolute;${prop === 'transitionDuration' ? 'transition-duration' : 'border-top-left-radius'}:var(${token})`
    el.append(t)
    lookup.set(key, parseFloat(getComputedStyle(t)[prop]) || 0)
    t.remove()
  }
  return lookup.get(key)!
}
/** Read the chart mark radius. */
export const radius = (el: Element) => probe(el, '--warp-radius-mark', 'borderTopLeftRadius')

// One chart per idle slice, so a dial switch never holds a long task for what is off screen (06 §4).
function drain() {
  if (draining) return
  draining = true
  const idle = (f: (d: { timeRemaining(): number }) => void) =>
    typeof requestIdleCallback === 'function'
      ? requestIdleCallback(f, { timeout: 1500 })
      : setTimeout(() => f({ timeRemaining: () => 8 }), 32)
  idle(function slice(d) {
    for (const c of live) {
      if (!c.dirty) continue
      if (d.timeRemaining() < 4) return void idle(slice)
      c.dirty = false
      c.redraw()
    }
    draining = false
  })
}

function watchDials() {
  if (dials || typeof MutationObserver === 'undefined') return
  dials = new MutationObserver(() => {
    lookup.clear()
    for (const c of live) {
      if (c.near) c.redraw()
      else c.dirty = true
    }
    drain()
  })
  // a theme change redraws nothing: every mark paints with var(--warp-color-*)
  dials.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-expression', 'data-density', 'data-form', 'data-pointer'],
  })
}

/** Observe a chart's visibility, size and shared design tokens. */
export function chartObservers(
  fig: HTMLElement,
  area: HTMLElement,
  ctx: Ctx,
  draw: () => void,
  enter: () => void,
  dimensions: { width: number },
) {
  const self: Live = { near: true, dirty: false, redraw: () => draw() }
  const view =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (es) => {
            for (const e of es) {
              self.near = e.isIntersecting
              if (self.near && self.dirty) {
                self.dirty = false
                draw()
              }
            }
          },
          { rootMargin: '300px 0px' },
        )
  // The markup arrives with data-enter="wait" and its motion already playing. Off screen that would be wasted, so it
  // is taken off until the chart is a quarter in view: once, on first view, never again on a resize redraw.
  const seen =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (es) => {
            if (es[es.length - 1]!.isIntersecting) {
              enter()
              seen!.disconnect()
            } else fig.removeAttribute('data-enter')
          },
          { threshold: 0.25 },
        )
  const size =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          const w = Math.round(area.clientWidth)
          if (!w || (w === dimensions.width && radius(fig) === ctx.r)) return
          dimensions.width = w
          if (self.near) draw()
          else {
            self.dirty = true
            drain()
          }
        })

  return {
    connect() {
      view?.observe(fig)
      seen?.observe(fig)
      size?.observe(area)
      live.add(self)
      watchDials()
    },
    disconnect() {
      view?.disconnect()
      seen?.disconnect()
      size?.disconnect()
    },
    release() {
      live.delete(self)
      if (!live.size) {
        dials?.disconnect()
        dials = undefined
      }
    },
  }
}
