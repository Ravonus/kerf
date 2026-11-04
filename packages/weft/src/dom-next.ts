// The helpers weft's own back end emits (research 19 §3): one job each, named for it. Hydratable output uses the
// claiming versions of `tpl` and `child` from claim.ts (`htpl`, `hchild`), so client-only apps don't ship them.
// Bindings here skip their first write while hydrating (the server wrote it). A template that missed was built fresh and
// comes before its own bindings, so they write (`keys.miss`, which each claim and the end of each hole put back).

import { DEV, effect } from './index'
import {
  addEvent,
  attrName,
  className,
  createComponent,
  delegateEvents,
  insert,
  ref,
  setAttribute,
  style,
} from './dom'
import { keys } from './keys'

/** A module-level template: `tpl(html)()` clones it. `svg`: the root is an SVG element outside an <svg>. */
export function tpl(html: string, svg?: boolean): () => Node {
  let node: Node | undefined
  return () => {
    if (!node) {
      const t = document.createElement('template')
      // oxlint-disable-next-line weft/no-html-sink -- `html` is a template the compiler wrote from static markup, never a runtime value
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
  if (!keys.hydrating || keys.miss) return effect(compute, apply)
  let skip = true // the server wrote these
  effect(compute, (v, p) => {
    if (skip) skip = false
    else apply(v, p)
  })
}

const NS: Record<string, string> = {
  xlink: 'http://www.w3.org/1999/xlink',
  xml: 'http://www.w3.org/XML/1998/namespace',
}

/** An attribute: `null`/`false` remove it, `true` writes it empty. `xlink:` and `xml:` names get their namespace. */
export function attr(el: Element, name: string, value: unknown) {
  const at = name.indexOf(':')
  const ns = at > 0 ? NS[name.slice(0, at)] : undefined
  if (!ns) return setAttribute(el, name, value)
  if (value == null || value === false) el.removeAttributeNS(ns, name.slice(at + 1))
  // oxlint-disable-next-line typescript/no-base-to-string -- whatever reaches here is a primitive or a mistake, and a mistake should show as it does anywhere else
  else el.setAttributeNS(ns, name, value === true ? '' : String(value))
}

/** `className`, under the short name compiled code uses. */
export const cls = className
/** `style`, under the short name compiled code uses. */
export const css = style

/** `onX={fn}`. Delegated events (the bubbling ones, listed by the compiler) share one document listener. */
export function on(el: Element, name: string, handler: (e: Event) => void, delegated: boolean) {
  addEvent(el, name, handler, delegated)
}

/** `delegateEvents`, under the short name compiled code uses. */
export const delegate = delegateEvents

/**
 * `onChange`, as React means it: on every edit, not on commit. Text inputs fire `input` per keystroke and `change` on
 * blur; a checkbox or select fires both at once. The `change` after an `input` is the same edit, so it's dropped;
 * a `change` alone (a script's, a test's `fireEvent.change`) still counts.
 */
export function change(
  el: Element,
  handler: EventListener | [(data: unknown, e: Event) => void, unknown],
) {
  let edited = false
  const fire = (e: Event) => {
    if (e.type === 'input') edited = true
    else if (edited) return void (edited = false)
    Array.isArray(handler) ? handler[0](handler[1], e) : handler(e)
  }
  el.addEventListener('input', fire)
  el.addEventListener('change', fire)
}

/**
 * `autoFocus`, as React means it: focus on mount. Hydrating, the browser already acted on the server's attribute. In a
 * closed `<dialog>` it's for `showModal()`, and `focus()` here would only force a layout of the page and do nothing.
 */
export function focus(el: HTMLElement, wanted: unknown) {
  if (wanted && !keys.hydrating)
    queueMicrotask(() => el.closest('dialog:not([open]),[hidden]') || el.focus())
}

/** A spread element's hole, hydrating: content the server rendered from its props stays. */
export function kids(props: Record<string, unknown>, el: Element) {
  return keys.hydrating &&
    !keys.miss &&
    (props.dangerouslySetInnerHTML ||
      props.innerHTML != null ||
      props.textContent != null ||
      el.localName === 'textarea')
    ? [...el.childNodes]
    : props.children
}

/**
 * `name`/`loc` (dev builds): the component's name and `file:line`, for error messages. A component @weft-js/core/hmr
 * registered (`$$h`) mounts through it, so a new module version can swap it in place.
 */
export function component<P>(Comp: (props: P) => unknown, props: P, name?: string, loc?: string) {
  const hot =
    DEV && (Comp as typeof Comp & { $$h?: (props: P, name?: string, loc?: string) => unknown }).$$h
  return hot ? hot(props, name, loc) : createComponent(Comp, props, name, loc)
}

const PROPERTIES = new Set([
  'value',
  'checked',
  'selected',
  'muted',
  'indeterminate',
  'textContent',
  'innerHTML',
  'defaultValue',
  'defaultChecked',
])
const ON = /^on[A-Z]/
const CAPTURE = /(?<!Pointer)Capture$/

/**
 * `<div {...rest} a={x}>`: `props` reads the element's attributes as one plain object (`{ a: x, ...rest }`, later
 * wins). One binding runs it and writes what changed; `onX` handlers are listeners (swapped when the value changes),
 * `ref` runs once. `children` isn't applied here: the compiler gives it its own hole. Hydrating, the first run
 * attaches handlers and refs only.
 */
export function spread(el: Element, props: () => Record<string, unknown>) {
  const listeners: Record<string, EventListener> = {}
  let refDone = false
  let latest: unknown
  let hydrating = keys.hydrating && !keys.miss
  effect(props, (v, p = {}) => {
    delete v.children
    delete v.key
    for (const k in p) if (!(k in v)) write(k, undefined, p[k])
    for (const k in v)
      if (v[k] !== p[k] && (!hydrating || k === 'ref' || ON.test(k))) write(k, v[k], p[k])
    hydrating = false
  })

  function write(key: string, value: unknown, prev: unknown) {
    if (key === 'defaultValue' && el.localName === 'select') key = 'value'
    if (key === 'ref') {
      if (!refDone && value) ref(() => value, el) // apply runs untracked
      refDone = true
    } else if (ON.test(key)) {
      const fn = typeof value === 'function' ? value : undefined
      if (key === 'onChange') {
        if (!(key in listeners)) change(el, (e: Event) => listeners.onChange?.(e))
        listeners.onChange = fn as EventListener
        return
      }
      const capture = CAPTURE.test(key)
      let name = (capture ? key.slice(2, -7) : key.slice(2)).toLowerCase()
      if (name === 'doubleclick') name = 'dblclick'
      if (capture && name === 'change') name = 'input'
      if (listeners[key]) el.removeEventListener(name, listeners[key]!, capture)
      if (fn) el.addEventListener(name, (listeners[key] = fn as EventListener), capture)
      else delete listeners[key]
    } else if (key === 'dangerouslySetInnerHTML')
      // oxlint-disable-next-line weft/no-html-sink -- `dangerouslySetInnerHTML` is the app saying this markup is safe; the name is the warning
      el.innerHTML = (value as { __html?: string } | null | undefined)?.__html ?? ''
    else if (key === 'autoFocus') focus(el as HTMLElement, value)
    else if (key === 'class' || key === 'className') className(el, value, prev)
    else if (key === 'style') style(el as HTMLElement, value, prev)
    else if (PROPERTIES.has(key)) {
      const v = key === 'value' || key === 'defaultValue' ? (value ?? '') : value
      ;(el as Element & Record<string, unknown>)[key] = v
      // A spread runs before the children are inserted, and a <select> can only pick an option that exists: set the
      // value again once they are (the latest one wins).
      if (key === 'value' && el.tagName === 'SELECT' && (el as HTMLSelectElement).value !== v) {
        latest = v
        queueMicrotask(() => latest === v && ((el as HTMLSelectElement).value = v as string))
      }
    } else attr(el, attrName(key), value)
  }
}
