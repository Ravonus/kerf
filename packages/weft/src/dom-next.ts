// The helpers weft's own back end emits (research 19 §3): one job each, named for it. Steps 1–2 cover templates,
// bindings, events, children, components and element spreads; hydration by path key follows in step 3, when the
// Solid-shaped helpers in dom.ts go.

import { effect, untrack } from './index'
import { addEvent, className, createComponent, delegateEvents, insert, ref, setAttribute, style } from './dom'

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

/** One element's dynamic attributes: `compute` reads them (a value, or an array of them), `apply` writes changes. */
export function bind<T>(compute: () => T, apply: (value: T, prev: T | undefined) => void) {
  effect(compute, apply)
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
 * A child hole. `marker` is the `<!>` it goes before, or none when the hole is the element's only content.
 * A function value is read reactively; anything else is placed once.
 */
export function child(parent: Element, value: unknown, marker?: Node) {
  insert(parent, value, marker)
}

export function component<P>(Comp: (props: P) => unknown, props: P) {
  return createComponent(Comp as any, props)
}

const PROPERTIES = new Set(['value', 'checked', 'selected', 'muted', 'indeterminate', 'textContent', 'innerHTML'])
const NAMES: Record<string, string> = { className: 'class', htmlFor: 'for' }

/**
 * `<div {...rest} a={x}>`: `props` is the merged object (later wins). One binding reads every key and writes what
 * changed; `onX` handlers are listeners (swapped when the value changes), `ref` runs once, `children` applies only
 * when the element has no JSX children (`hasChildren`).
 */
export function spread(el: Element, props: Record<string, any>, hasChildren: boolean) {
  const listeners: Record<string, EventListener> = {}
  let refDone = false
  effect(
    () => {
      const v: Record<string, any> = {}
      for (const k of Reflect.ownKeys(props) as string[]) if (k !== 'children' && k !== 'key') v[k] = props[k]
      return v
    },
    (v, p = {}) => {
      for (const k in p) if (!(k in v)) write(k, undefined, p[k])
      for (const k in v) if (v[k] !== p[k]) write(k, v[k], p[k])
    },
  )
  if (!hasChildren && 'children' in props) insert(el, () => props.children)

  function write(key: string, value: any, prev: any) {
    if (key === 'ref') {
      if (!refDone && value) untrack(() => ref(() => value, el))
      refDone = true
    } else if (/^on[A-Z]/.test(key)) {
      const name = key.slice(2).toLowerCase()
      if (listeners[name]) el.removeEventListener(name, listeners[name])
      if (typeof value === 'function') el.addEventListener(name, (listeners[name] = value))
      else delete listeners[name]
    } else if (key === 'class' || key === 'className') className(el, value, prev)
    else if (key === 'style') style(el as HTMLElement, value, prev)
    else if (PROPERTIES.has(key)) (el as any)[key] = key === 'value' ? value ?? '' : value
    else attr(el, NAMES[key] ?? key, value)
  }
}
