import { untrack, view } from '../index'

type Bag = Record<string, unknown>

// ---- attributes and properties ---------------------------------------------------------------------------------

/** Attributes whose states are the words `true`/`false`, so `false` can't mean a missing attribute. Prefixes keep it short. */
export const WORDS = /^(?:aria-|contented|draggab|focusab|spellch)/i

/** `null`/`false` remove the attribute and `true` writes it empty, except `WORDS`. */
export function setAttribute(node: Element, name: string, value: unknown) {
  if (typeof value === 'boolean' && WORDS.test(name)) value = String(value)
  if (value == null || value === false) node.removeAttribute(name)
  else node.setAttribute(name, (value === true ? '' : value) as string) // the DOM converts the rest
}

/** Writes a `class`: a string, or an object whose true keys are the classes. */
export function className(node: Element, value: unknown, prev?: unknown) {
  if (value == null || value === false) {
    if (prev != null) node.removeAttribute('class')
    return
  }
  if (typeof value !== 'object') {
    // oxlint-disable-next-line typescript/no-base-to-string -- whatever reaches here is a primitive or a mistake, and a mistake should show as it does anywhere else
    if (value !== prev) node.setAttribute('class', String(value))
    return
  }
  const p = (prev && typeof prev === 'object' ? prev : {}) as Bag
  for (const k in p) if (!(value as Bag)[k]) node.classList.remove(k)
  for (const k in value) if ((value as Bag)[k] && !p[k]) node.classList.add(k)
}

// The compiler resolves names it can see (crates/kerf-compiler/src/react.rs); a spread's arrive here. DASHED leaves out
// SVG font attributes and other names no browser reads, so a spread keeps those as written.
const NAMES: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
  acceptCharset: 'accept-charset',
  httpEquiv: 'http-equiv',
  tabIndex: 'tabindex',
  crossOrigin: 'crossorigin',
  hrefLang: 'hreflang',
  referrerPolicy: 'referrerpolicy',
}
const DASHED =
  /^(?:alignmentB|baselineS|clip(?:Path$|R)|color[IR]|dominantB|fill[OR]|flood[CO]|font[FSVW]|imageR|letterS|lightingC|marker[EMS]|paintO|pointerE|shapeR|stop[CO]|stroke[DLMOW]|text(?:An|D|R)|transformO|unicodeB|vectorE|wordS|writingM)/

/** The attribute a prop in a spread writes. HTML lowercases the rest itself. */
export const attrName = (k: string) =>
  NAMES[k] ??
  (DASHED.test(k)
    ? k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
    : /^(?:xlink|xmlns|xml)[A-Z]/.test(k)
      ? k.replace(/[A-Z]/, (c) => ':' + c.toLowerCase())
      : k)

const UNITLESS =
  /^(?:--.*|(?:-\w+-)?(?:animation-iteration-count|aspect-ratio|border-image-(?:outset|slice|width)|box-(?:flex|flex-group|ordinal-group)|column-count|columns|flex(?:-grow|-shrink|-order|-positive|-negative)?|(?:fill|flood|stop|stroke)-opacity|font-weight|grid-(?:area|row|column)(?:-end|-span|-start)?|line-clamp|line-height|opacity|order|orphans|scale|stroke-(?:dasharray|dashoffset|miterlimit|width)|tab-size|widows|z-index|zoom))$/

/** `fontSize` → `font-size`, `WebkitBoxShadow` → `-webkit-box-shadow`, `msTransform` → `-ms-transform`. */
export const cssName = (k: string) =>
  k === 'cssFloat'
    ? 'float'
    : k[1] === '-'
      ? k
      : k.replace(/^ms(?=[A-Z])/, '-ms').replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())

/** React's values: numbers are pixels unless the property is unitless; `null` and booleans mean no declaration. */
export const cssValue = (name: string, v: unknown) =>
  v == null || typeof v === 'boolean'
    ? null
    : typeof v === 'number' && v && !UNITLESS.test(name)
      ? `${v}px`
      : v

/** Writes a `style`: a string, or an object in React's shape. */
export function style(node: HTMLElement, value: unknown, prev?: unknown) {
  if (typeof value === 'string' || value == null) {
    node.style.cssText = value ?? ''
    return
  }
  const p = (prev && typeof prev === 'object' ? prev : {}) as Bag
  for (const k in p) if ((value as Bag)[k] == null) node.style.removeProperty(cssName(k))
  for (const k in value) {
    if ((value as Bag)[k] === p[k]) continue
    const name = cssName(k)
    const v = cssValue(name, (value as Bag)[k])
    if (v == null) node.style.removeProperty(name)
    else node.style.setProperty(name, v as string) // the DOM converts a number
  }
}

/** `ref={fn}` or `ref={[fn, …]}` (nested arrays flatten): each is called with the element, untracked. */
export function ref(get: () => unknown, el: Element) {
  const r = untrack(get)
  if (typeof r === 'function') r(el)
  else if (Array.isArray(r)) for (const f of r.flat(Infinity)) f && f(el)
}

/** `<Comp {...a} b={x}>`: a live view of the sources (later wins). A source is an object or a getter for one. */
export const mergeProps = (...sources: unknown[]) => view(sources)
