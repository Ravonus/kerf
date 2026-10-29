// The helpers weft's own back end emits (research 19 §3): one job each, named for it. Step 1 covers templates,
// bindings, events, children and components; lists, spreads, refs and hydration by path key follow in steps 2–3,
// when the Solid-shaped helpers in dom.ts go.

import { effect } from './index'
import { addEvent, className, createComponent, delegateEvents, insert, setAttribute, style, template } from './dom'

/** A module-level template: `tpl(html)()` clones it. */
export const tpl = template

/** One element's dynamic attributes: `compute` reads them (a value, or an array of them), `apply` writes changes. */
export function bind<T>(compute: () => T, apply: (value: T, prev: T | undefined) => void) {
  effect(compute, apply)
}

export const attr = setAttribute
export const cls = className
export const css = style

/** `onX={fn}`. Delegated events (the bubbling ones, listed by the compiler) share one document listener. */
export function on(el: Element, name: string, handler: (e: Event) => void, delegated: boolean) {
  addEvent(el, name, handler, delegated)
}

export const delegate = delegateEvents

/**
 * A child hole. `marker` is the `<!>` it goes before, or none when the hole is the element's only content.
 * A function value is read reactively; anything else is placed once.
 */
export function child(parent: Element, value: unknown, marker?: Node) {
  insert(parent, value, marker)
}

export function component<P>(Comp: (props: P) => unknown, props: P) {
  return createComponent(Comp as any, props)
}
