import { attrName, cssName, cssValue, WORDS } from '../dom'

// ---- escaping -------------------------------------------------------------------------------------------------

const CONTENT = /[&<]/g
const ATTR = /[&"<]/g
const ENTITY: Record<string, string> = { '&': '&amp;', '<': '&lt;', '"': '&quot;' }

/** Escape text (`&`, `<`) or an attribute value (`&`, `"`, `<`). */
export function escape(s: string, quoted?: boolean): string {
  const re = quoted ? ATTR : CONTENT
  re.lastIndex = 0
  return re.test(s) ? s.replace(re, (c) => ENTITY[c]!) : s
}

// ---- attributes -----------------------------------------------------------------------------------------------

/**
 * ` name="value"` for a dynamic attribute or property: `null`/`false` drop it, `true` writes the bare name. `WORDS`
 * attributes write booleans as the words (`aria-pressed="false"`), as @kerf-js/core/dom does.
 */
export function attr(name: string, value: unknown): string {
  name = attribute(name)
  if (typeof value === 'boolean' && WORDS.test(name)) value = String(value)
  if (name === 'class') value = classes(value)
  else if (name === 'style') value = styles(value)
  if (value == null || value === false || (value === '' && (name === 'class' || name === 'style')))
    return ''
  if (value === true) return ` ${name}`
  // oxlint-disable-next-line typescript/no-base-to-string -- whatever reaches here is a primitive or a mistake, and a mistake should show as it does anywhere else
  return ` ${name}="${escape(String(value), true)}"`
}

const NAMES_MAX = 2048
const names = new Map<string, string>()

/** `attrName`, remembered: a server sees the same few names on every request, and its regexes run on each. */
function attribute(k: string) {
  let name = names.get(k)
  if (name === undefined) {
    if (names.size >= NAMES_MAX) names.clear()
    names.set(k, (name = attrName(k)))
  }
  return name
}

function classes(v: unknown): string {
  if (v == null || v === false) return ''
  // oxlint-disable-next-line typescript/no-base-to-string -- whatever reaches here is a primitive or a mistake, and a mistake should show as it does anywhere else
  if (typeof v !== 'object') return String(v)
  return Object.keys(v)
    .filter((k) => (v as Record<string, unknown>)[k])
    .join(' ')
}

function styles(v: unknown): string {
  if (v == null || typeof v !== 'object') return (v ?? '') as string
  let out = ''
  for (const k of Object.keys(v)) {
    const name = cssName(k)
    const value = cssValue(name, (v as Record<string, unknown>)[k])
    if (value != null) out += `${out ? ';' : ''}${name}:${value as string}`
  }
  return out
}

/** `ref` beside a spread compiles the same for both targets; there is no element to hand over on the server. */
export function ref(): void {}

/** A spread's key that isn't an attribute: handlers, refs, children and what sets the content. */
const skipped = (k: string) =>
  k === 'children' ||
  k === 'ref' ||
  k === 'key' ||
  k === 'innerHTML' ||
  k === 'textContent' ||
  k === 'dangerouslySetInnerHTML' ||
  (k[0] === 'o' && /^on[A-Z]/.test(k))

/** `<div {...props}>`: the merged props' attributes (handlers, refs and children aren't attributes). */
export function spread(props: Record<string, unknown>): string {
  let out = ''
  for (const k of Reflect.ownKeys(props) as string[]) {
    if (skipped(k)) continue
    out += attr(k === 'defaultValue' ? 'value' : k === 'defaultChecked' ? 'checked' : k, props[k])
  }
  return out
}

/**
 * Each key of `sources` merged (`mergeProps`: a later source wins a key, which keeps its first place) with the source it
 * comes from. A source is an object or a getter for one. They're few, so asking them beats building a map.
 */
function merge(sources: unknown[], each: (k: string, o: Record<string, unknown>) => void) {
  const all = sources.map(
    (s) => Object(typeof s === 'function' ? s() : s) as Record<string, unknown>,
  )
  for (let i = 0; i < all.length; i++) {
    const own = all[i]!
    for (const k of Reflect.ownKeys(own) as string[]) {
      let seen = false
      for (let j = 0; j < i && !seen; j++) seen = Object.hasOwn(all[j]!, k)
      if (seen) continue
      let o = own
      for (let j = all.length - 1; j > i; j--)
        if (Object.hasOwn(all[j]!, k)) {
          o = all[j]!
          break
        }
      each(k, o)
    }
  }
}

/**
 * `<div a={x} {...rest}>` with JSX children: `spread(mergeProps(...sources))` without the view, since the server reads
 * every key once.
 */
export function spreads(...sources: unknown[]): string {
  if (sources.length === 1)
    return spread(Object(typeof sources[0] === 'function' ? sources[0]() : sources[0]))
  let out = ''
  merge(sources, (k, o) => {
    if (!skipped(k))
      out += attr(k === 'defaultValue' ? 'value' : k === 'defaultChecked' ? 'checked' : k, o[k])
  })
  return out
}

/**
 * `mergeProps(...sources)` for a spread element without JSX children, as a plain object: its attributes and what goes
 * inside are each read once, right away, so a view's traps would only cost. `children` stays a getter, read in its place.
 */
export function merged(...sources: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  merge(sources, (k, o) => {
    if (k === 'children')
      Object.defineProperty(out, k, { get: () => o[k], enumerable: true, configurable: true })
    else out[k] = o[k]
  })
  return out
}

/** What a spread element without JSX children holds: content its props set, or `children`. */
export function inner(props: Record<string, unknown>, tag: string): unknown {
  const raw =
    (props.dangerouslySetInnerHTML as { __html?: unknown } | null | undefined)?.__html ??
    props.innerHTML
  // oxlint-disable-next-line typescript/no-base-to-string -- whatever reaches here is a primitive or a mistake, and a mistake should show as it does anywhere else
  if (raw != null) return { t: String(raw) }
  return (
    props.textContent ??
    (tag === 'textarea' ? (props.value ?? props.defaultValue) : undefined) ??
    props.children
  )
}

// ---- <select value> -------------------------------------------------------------------------------------------

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')

/** `<select value="b">…<option value="b">` → the value attribute dropped and `selected` on the option. */
export function resolveSelects(html: string): string {
  return html.replace(
    /<select\b([^>]*?)\svalue="([^"]*)"([^>]*)>([\s\S]*?)<\/select>/g,
    (_, pre, value, post, body) => {
      const want = decode(value)
      const options = body.replace(
        /<option\b([^>]*)>([^<]*)/g,
        (m: string, attrs: string, label: string) => {
          if (/\sselected\b/.test(attrs)) return m
          const v = /\svalue="([^"]*)"/.exec(attrs)
          return (v ? decode(v[1]!) : decode(label).trim()) === want
            ? `<option${attrs} selected>${label}`
            : m
        },
      )
      return `<select${pre}${post}>${options}</select>`
    },
  )
}
