// The helpers weft's own back end emits (research 19 §3): one job each, named for it. Hydratable output uses the
// claiming versions of `tpl` and `child` from claim.ts (`htpl`, `hchild`), so client-only apps don't ship them.
// Bindings here skip their first write while hydrating (the server wrote it).

import { DEV, effect } from './index'
import { addEvent, className, createComponent, delegateEvents, insert, ref, setAttribute, style } from './dom'
import { keys } from './keys'

/** A module-level template: `tpl(html)()` clones it. `svg`: the root is an SVG element outside an <svg>. */
export function tpl(html: string, svg?: boolean): () => Node {
  let node: Node | undefined
  return () => {
    if (!node) {
      const t = document.createElement('template')
      t.innerHTML = svg ? `<svg>${html}</svg>` : html
      node = svg ? t.content.firstChild!.firstChild! : t.content.firstChild!
    }
    return node.cloneNode(true)
  }
}

/** A child hole: `value` before `marker` (or appended); a function value is read reactively. */
export const child: (parent: Element, value: unknown, marker?: Node | null) => void = insert

// ---- bindings, events, components -----------------------------------------------------------------------------

/** One element's dynamic attributes: `compute` reads them (a value, or an array of them), `apply` writes changes. */
export function bind<T>(compute: () => T, apply: (value: T, prev: T | undefined) => void) {
  if (!keys.hydrating) return effect(compute, apply)
  let skip = true // the server wrote these
  effect(compute, (v, p) => {
    if (skip) skip = false
    else apply(v, p)
  })
}

const NS: Record<string, string> = { xlink: 'http://www.w3.org/1999/xlink', xml: 'http://www.w3.org/XML/1998/namespace' }

/** An attribute: `null`/`false` remove it, `true` writes it empty. `xlink:` and `xml:` names get their namespace. */
export function attr(el: Element, name: string, value: unknown) {
  const at = name.indexOf(':')
  const ns = at > 0 ? NS[name.slice(0, at)] : undefined
  if (!ns) return setAttribute(el, name, value)
  if (value == null || value === false) el.removeAttributeNS(ns, name.slice(at + 1))
  else el.setAttributeNS(ns, name, value === true ? '' : String(value))
}

export const cls = className
export const css = style

/** `onX={fn}`. Delegated events (the bubbling ones, listed by the compiler) share one document listener. */
export function on(el: Element, name: string, handler: (e: Event) => void, delegated: boolean) {
  addEvent(el, name, handler, delegated)
}

export const delegate = delegateEvents

/**
 * `name`/`loc` (dev builds): the component's name and `file:line`, for error messages. A component weft/hmr
 * registered (`$$h`) mounts through it, so a new module version can swap it in place.
 */
export function component<P>(Comp: (props: P) => unknown, props: P, name?: string, loc?: string) {
  const hot = DEV && (Comp as any).$$h
  return hot ? hot(props, name, loc) : createComponent(Comp as any, props, name, loc)
}

const PROPERTIES = new Set(['value', 'checked', 'selected', 'muted', 'indeterminate', 'textContent', 'innerHTML'])
const NAMES: Record<string, string> = { htmlFor: 'for' }
const ON = /^on[A-Z]/

/**
 * `<div {...rest} a={x}>`: `props` reads the element's attributes as one plain object (`{ a: x, ...rest }`, later
 * wins). One binding runs it and writes what changed; `onX` handlers are listeners (swapped when the value changes),
 * `ref` runs once. `children` isn't applied here: the compiler gives it its own hole. Hydrating, the first run
 * attaches handlers and refs only.
 */
export function spread(el: Element, props: () => Record<string, any>) {
  const listeners: Record<string, EventListener> = {}
  let refDone = false
  let latest: unknown
  let hydrating = keys.hydrating
  effect(props, (v, p = {}) => {
    delete v.children
    delete v.key
    for (const k in p) if (!(k in v)) write(k, undefined, p[k])
    for (const k in v) if (v[k] !== p[k] && (!hydrating || k === 'ref' || ON.test(k))) write(k, v[k], p[k])
    hydrating = false
  })

  function write(key: string, value: any, prev: any) {
    if (key === 'ref') {
      if (!refDone && value) ref(() => value, el) // apply runs untracked
      refDone = true
    } else if (ON.test(key)) {
      const name = key.slice(2).toLowerCase()
      if (listeners[name]) el.removeEventListener(name, listeners[name])
      if (typeof value === 'function') el.addEventListener(name, (listeners[name] = value))
      else delete listeners[name]
    } else if (key === 'class' || key === 'className') className(el, value, prev)
    else if (key === 'style') style(el as HTMLElement, value, prev)
    else if (PROPERTIES.has(key)) {
      const v = key === 'value' ? value ?? '' : value
      ;(el as any)[key] = v
      // A spread runs before the children are inserted, and a <select> can only pick an option that exists: set the
      // value again once they are (the latest one wins).
      if (key === 'value' && el.tagName === 'SELECT' && (el as HTMLSelectElement).value !== v) {
        latest = v
        queueMicrotask(() => latest === v && ((el as HTMLSelectElement).value = v))
      }
    } else attr(el, NAMES[key] ?? key, value)
  }
}
