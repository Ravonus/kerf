// The helpers weft's own back end emits (research 19 §3): one job each, named for it. Hydration (research 19 §2.4)
// is part of the same helpers: while `keys.hydrating`, `tpl` claims the server's element by key instead of cloning,
// `first`/`next` step over the server's marked hole ranges, `child` adopts the nodes in its range, and bindings
// skip their first write (the server wrote it).

import { DEV, effect, untrack } from './index'
import { addEvent, className, createComponent, delegateEvents, insert, place, ref, setAttribute, style } from './dom'
import { keys, nextKey, under } from './keys'
import { hydration } from './hydrate'

/**
 * A module-level template: `tpl(html)()` clones it. `svg`: the root is an SVG element outside an <svg>. While keys
 * are on, each instance takes the next key; while hydrating, the server's element with that key is claimed.
 */
export function tpl(html: string, svg?: boolean): () => Node {
  let node: Node | undefined
  const tag = /^<([\w:-]+)/.exec(html)![1]
  const clone = () => {
    if (!node) {
      const t = document.createElement('template')
      t.innerHTML = svg ? `<svg>${html}</svg>` : html
      node = svg ? t.content.firstChild!.firstChild! : t.content.firstChild!
    }
    return node.cloneNode(true)
  }
  return () => {
    if (!keys.on) return clone()
    const key = nextKey()
    if (keys.hydrating) {
      const el = hydration.registry.get(key)
      if (el && el.localName === tag.toLowerCase()) {
        hydration.registry.delete(key)
        ;(el as any).$k = key
        return el
      }
      hydration.misses++
      if (DEV) console.warn(el ? `weft: hydration mismatch at wk=${key}: expected <${tag}>, found <${el.localName}>; rendering it fresh` : `weft: hydration key miss at wk=${key} (${html.slice(0, 60)}); rendering it fresh`)
    }
    const fresh = clone() as any
    fresh.$k = key
    return fresh
  }
}

// ---- walking a claimed template -------------------------------------------------------------------------------

/** A server hole range `<!--[-->…<!--]-->` stands where the template has one `<!>`: step to its end marker. */
function over(n: Node | null): Node | null {
  if (!n || n.nodeType !== 8 || (n as Comment).data !== '[') return n
  let depth = 0
  for (let m = n.nextSibling; m; m = m.nextSibling) {
    if (m.nodeType !== 8) continue
    const d = (m as Comment).data
    if (d === '[') depth++
    else if (d === ']' && depth-- === 0) return m
  }
  return null
}

/** `firstChild` / `nextSibling` in hydratable output. Outside hydration there are no ranges and they're the same. */
export const first = (n: Node) => over(n.firstChild)
export const next = (n: Node) => over(n.nextSibling)

/**
 * The server's nodes in a hole: the parent's children (only content), or those between `marker`'s range start and
 * it. A marker that isn't a template's `<!>` (hydrate's data script) takes everything before it.
 */
function range(parent: Node, marker: Node | undefined): Node[] {
  if (!marker) return [...parent.childNodes]
  const nodes: Node[] = []
  let depth = 0
  for (let n = marker.previousSibling; n; n = n.previousSibling) {
    if (n.nodeType === 8) {
      const d = (n as Comment).data
      if (d === ']') depth++
      else if (d === '[' && depth-- === 0) return nodes.reverse()
    }
    nodes.push(n)
  }
  return marker.nodeType === 8 ? [] : nodes.reverse() // a fresh template's `<!>`: nothing to claim
}

/**
 * The value's nodes, reusing the server's: claimed elements are already the server's nodes; text takes the next
 * server text node (rewritten only if it differs); `<!--,-->` separators the server put between texts are kept.
 */
function adopt(value: any, server: Node[], at: { i: number }, out: Node[]): Node[] {
  while (typeof value === 'function') value = value()
  if (value == null || typeof value === 'boolean' || value === '') return out
  if (Array.isArray(value)) {
    for (const v of value) adopt(v, server, at, out)
    return out
  }
  if (value instanceof Node) {
    const i = server.indexOf(value, at.i)
    if (i >= 0) {
      for (let j = at.i; j < i; j++) if (isSeparator(server[j])) out.push(server[j])
      at.i = i + 1
    }
    out.push(value)
    return out
  }
  const text = String(value)
  while (at.i < server.length && isSeparator(server[at.i])) out.push(server[at.i++])
  const n = server[at.i]
  if (n && n.nodeType === 3) {
    at.i++
    if ((n as Text).data !== text) (n as Text).data = text
    out.push(n)
  } else out.push(document.createTextNode(text))
  return out
}

const isSeparator = (n: Node) => n.nodeType === 8 && (n as Comment).data === ','

// ---- holes, bindings, events, components ----------------------------------------------------------------------

/**
 * A child hole. `marker`: the `<!>` it goes before, or none when the hole is the element's only content. `root` and
 * `slot` name the hole's scope (its template's key and its index). `once`: `value` builds static content (a
 * component, an element) and runs once, untracked; otherwise a function value is read reactively.
 */
export function child(parent: Element, value: unknown, marker?: Node | null, root?: any, slot?: number, once?: 1) {
  const hole = () => {
    let v = once ? untrack(value as () => unknown) : value
    if (!keys.hydrating) return insert(parent, v, marker)
    // Claim the server's nodes on the first run; later runs place values as usual.
    let current = range(parent, marker ?? undefined)
    const at = marker ?? null
    if (typeof v !== 'function') return void place(parent, adopt(v, current, { i: 0 }, []), current, at)
    let claimed = false
    effect(
      () => {
        let x = (v as () => unknown)()
        while (typeof x === 'function') x = x()
        if (Array.isArray(x)) x = x.map(y => { while (typeof y === 'function') y = y(); return y })
        return x
      },
      x => {
        current = place(parent, claimed ? x : adopt(x, current, { i: 0 }, []), current, at)
        claimed = true
      },
    )
  }
  if (keys.on && root?.$k !== undefined) under(`${root.$k}.${slot}/`, hole)
  else hole()
}

/** One element's dynamic attributes: `compute` reads them (a value, or an array of them), `apply` writes changes. */
export function bind<T>(compute: () => T, apply: (value: T, prev: T | undefined) => void) {
  let skip = keys.hydrating // the server wrote these
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

export function component<P>(Comp: (props: P) => unknown, props: P) {
  return createComponent(Comp as any, props)
}

const PROPERTIES = new Set(['value', 'checked', 'selected', 'muted', 'indeterminate', 'textContent', 'innerHTML'])
const NAMES: Record<string, string> = { className: 'class', htmlFor: 'for' }

/**
 * `<div {...rest} a={x}>`: `props` is the merged object (later wins). One binding reads every key and writes what
 * changed; `onX` handlers are listeners (swapped when the value changes), `ref` runs once, `children` applies only
 * when the element has no JSX children (`hasChildren`). Hydrating, the first run attaches handlers and refs only.
 */
export function spread(el: Element, props: Record<string, any>, hasChildren: boolean) {
  const listeners: Record<string, EventListener> = {}
  let refDone = false
  let hydrating = keys.hydrating
  effect(
    () => {
      const v: Record<string, any> = {}
      for (const k of Reflect.ownKeys(props) as string[]) if (k !== 'children' && k !== 'key') v[k] = props[k]
      return v
    },
    (v, p = {}) => {
      for (const k in p) if (!(k in v)) write(k, undefined, p[k])
      for (const k in v) if (v[k] !== p[k] && (!hydrating || k === 'ref' || /^on[A-Z]/.test(k))) write(k, v[k], p[k])
      hydrating = false
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
