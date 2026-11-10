// `scroller`: puts the engine, its inputs and its bars on a root element. `scroller-api.ts` is what it returns.
import { autoscroll } from './autoscroll'
import { barInput } from './bar-input'
import { Engine, registry } from './engine'
import { keyInput } from './keys'
import { resolve, writeVars } from './options'
import { domRenderer, drawBars, mountBars, Visibility } from './render'
import { api } from './scroller-api'
import { touchInput } from './touch'
import { wheelInput } from './wheel-input'
import type { Renderer, ScrollOptions, Scroller } from './types'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable]:not([contenteditable="false"]),summary,iframe,audio[controls],video[controls]'

/** What the setup steps share. */
export interface Setup {
  e: Engine
  vis: Visibility
  options: ScrollOptions
  renderer: Renderer
  remeasure: () => void
}

/**
 * Scrolling run in JavaScript on `root`, which holds a `[data-part="viewport"]` element (and, inside that, the
 * content). The viewport keeps native scroll offsets with `overflow: hidden`, so the browser's own focus, find and
 * anchor scrolling still land and `scroll` listeners still hear every move. Bars are found as
 * `[data-part="scrollbar"][data-orientation]` children of `root`, or made. Load `@weft-js/scroll/styles.css`.
 */
export function scroller(root: HTMLElement, options: ScrollOptions = {}): Scroller {
  const vp = root.querySelector<HTMLElement>(':scope > [data-part="viewport"]') ?? root
  registry
    .get(vp)
    ?.destroyHooks.splice(0)
    .forEach((f) => f())
  const content = vp === root ? null : (vp.firstElementChild as HTMLElement | null)
  const e = new Engine(root, vp, content, resolve(options))
  const vis = new Visibility(e)
  const hooks = e.destroyHooks
  const tabStop = focusable(vp, hooks)
  const s: Setup = {
    e,
    vis,
    options,
    renderer: e.o.renderer ?? domRenderer,
    remeasure: () => {
      tabStop()
      e.measure()
      vis.apply()
      e.wake()
    },
  }
  vp.setAttribute('data-scroll-viewport', '')
  configure(s)
  tabStop()
  hooks.push(mountBars(e, () => s.renderer))
  root.toggleAttribute('data-ready', true)
  e.measure()
  vis.apply()
  e.onActivity = () => vis.moved()
  e.onFrame = (now) => drawBars(e, s.renderer, e.last ? now - e.last : 16)
  hooks.push(watch(s), listen(s))
  hooks.push(wheelInput(e), keyInput(e), touchInput(e), autoscroll(e), barInput(e, vis))
  hooks.push(() => {
    vis.destroy()
    if (e.frame) cancelAnimationFrame(e.frame)
    if (e.content) e.content.style.transform = ''
    root.removeAttribute('data-ready')
    vp.removeAttribute('data-scroll-viewport')
    registry.delete(vp)
  })
  registry.set(vp, e)
  e.wake()
  return api(s, () => configure(s))
}

/** Options into attributes and custom properties on the root and viewport. */
function configure({ e, options }: Setup) {
  const { root, vp } = e
  e.ax.y.on = e.o.axes !== 'x'
  e.ax.x.on = e.o.axes !== 'y'
  root.dataset.scroll ??= ''
  root.dataset.layout = e.o.bar.layout
  root.dataset.show = e.o.bar.show
  root.dataset.axes = e.o.axes
  vp.dataset.touch = e.o.touch
  writeVars(root, options.bar, e.reduced())
  if (e.o.label) {
    vp.setAttribute('role', 'region')
    vp.setAttribute('aria-label', e.o.label)
  }
}

/**
 * As browsers treat scrollers: a tab stop only when nothing inside can take focus, and always focusable by a click so
 * the keys work after one. Returns the check, to run again when the content changes.
 */
function focusable(vp: HTMLElement, hooks: (() => void)[]) {
  if (vp.hasAttribute('tabindex')) return () => {}
  hooks.push(() => vp.removeAttribute('tabindex'))
  return () => {
    vp.tabIndex = vp.querySelector(FOCUSABLE) ? -1 : 0
  }
}

/** Measure again when the viewport, the content or a bar changes size, or the content is swapped. */
function watch(s: Setup) {
  const { e } = s
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => s.remeasure()) : null
  const observe = () => {
    ro?.disconnect()
    ro?.observe(e.vp)
    if (e.content) ro?.observe(e.content)
    for (const a of e.axes) if (a.track) ro?.observe(a.track)
  }
  observe()
  const mo =
    typeof MutationObserver === 'function' && e.vp !== e.root
      ? new MutationObserver(() => {
          const next = e.vp.firstElementChild as HTMLElement | null
          if (next === e.content) return
          e.content = next
          observe()
          s.remeasure()
        })
      : null
  mo?.observe(e.vp, { childList: true })
  return () => {
    ro?.disconnect()
    mo?.disconnect()
  }
}

/** The browser's own scrolling, the pointer over the area, and the reduced-motion setting. */
function listen({ e, vis, options }: Setup) {
  const onNative = () => {
    if (!e.dispatching) e.adopt()
  }
  const inside = (on: boolean) => () => {
    vis.inside = on
    vis.apply()
  }
  const enter = inside(true)
  const leave = inside(false)
  const motion =
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null
  const onMotion = () => writeVars(e.root, options.bar, e.reduced())
  e.vp.addEventListener('scroll', onNative, { passive: true })
  e.root.addEventListener('pointerenter', enter)
  e.root.addEventListener('pointerleave', leave)
  motion?.addEventListener?.('change', onMotion)
  return () => {
    e.vp.removeEventListener('scroll', onNative)
    e.root.removeEventListener('pointerenter', enter)
    e.root.removeEventListener('pointerleave', leave)
    motion?.removeEventListener?.('change', onMotion)
  }
}
