// Placeholder data for skeletons (research 31). A shape is a placeholder value of the result's own type, so a shape
// variant reads `post.title` from it as the component reads the real value. `$$s*` are what compiled variants call:
// they're only reached from a `pending="shape"`, so nothing here is in a page without one.

import { waiting } from './async'
import { DEV } from './index'

/** More rows than any viewport shows. */
const CAP = 50
/** A list with no count hint (X032). */
const ROWS = 5
const BAR = 'nnnnn nnnnn'

/** Placeholder text for `n` characters: words, so it wraps like prose. */
const text = (n: number) =>
  'nnnnn '
    .repeat(Math.ceil(n / 6))
    .slice(0, n)
    .trimEnd()
export { text as placeholder }

/** Dev: placeholder strings that came from a schema string with no length hint → its fields (X036). */
const hintless = new Map<string, string>()
const warned = new Set<string>()
const once = (id: string, message: string) => {
  if (warned.has(id)) return
  warned.add(id)
  console.warn(`kerf: ${message}`)
}

/** Letters to same-width stand-ins (`n` is the common lowercase width), spaces kept: lines wrap as the text did, and no text reaches the DOM (§4). */
const stand = (c: string) =>
  c >= '0' && c <= '9'
    ? '0'
    : c > 'ʯ' || /[mwMW]/.test(c)
      ? 'm'
      : /[iljtfr.,:;'|!]/.test(c)
        ? 'i'
        : c >= 'A' && c <= 'Z'
          ? 'X'
          : 'n'

/** A placeholder from a real value: strings masked, the rest kept, `limit` and 50 rows at most. */
export function mask(v: unknown, limit?: number): unknown {
  if (typeof v === 'string') return v.replace(/\S/g, stand)
  if (Array.isArray(v)) return v.slice(0, Math.min(limit ?? CAP, CAP)).map((x) => mask(x))
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mask(x)]))
  return v
}

/** The tree the plugin derives from an `output` schema (§3), or a declared example, as a placeholder value. */
export function fill(t: unknown, limit?: number, path = ''): unknown {
  const rows = (n: number, item: (i: number) => unknown) =>
    Array.from({ length: Math.min(n, CAP) }, (_, i) => item(i))
  if (Array.isArray(t))
    return rows(limit ?? t.length, (i) => fill(t[i % t.length], undefined, `${path}[]`))
  if (!t || typeof t !== 'object') return t
  if ('$s' in t) return text(t.$s as number)
  if ('$u' in t) {
    const s = text(t.$u as number)
    if (DEV)
      hintless.set(
        s,
        [...new Set([...(hintless.get(s)?.split(', ') ?? []), path || '(the result)'])].join(', '),
      )
    return s
  }
  if ('$of' in t) {
    if (DEV && (limit ?? (t as { $a?: number }).$a) === undefined)
      once(
        `X032${path}`,
        `X032 a skeleton repeats \`${path || 'the result'}\`, which has no count hint, so it shows ${ROWS} rows. Add a \`limit\` input or \`.max()\` to the array.`,
      )
    return rows(limit ?? (t as { $a?: number }).$a ?? ROWS, () =>
      fill(t.$of, undefined, `${path}[]`),
    )
  }
  return Object.fromEntries(
    Object.entries(t).map(([k, x]) => [k, fill(x, undefined, path ? `${path}.${k}` : k)]),
  )
}

/** Reads as anything: what a variant gets when nothing is known about a value (§2, source 4). */
// oxlint-disable-next-line typescript/no-explicit-any -- it's in the name: this stands in for a value of any type, in code written against the real one
export const shapeAny: any = /* @__PURE__ */ new Proxy(function () {}, {
  get(_, k) {
    if (k === Symbol.toPrimitive) return () => BAR
    if (k === Symbol.iterator)
      return function* () {
        yield shapeAny
        yield shapeAny
        yield shapeAny
      }
    if (k === 'then') return undefined
    if (k === 'length') return 3
    if (k === 'map')
      return (f: (x: unknown, i: number) => unknown) => {
        if (DEV)
          once(
            'X032',
            `X032 a skeleton repeats a list with no count hint, so it shows 3 rows. Declare \`output\` with \`.max()\`, or a \`limit\` input.`,
          )
        return [0, 1, 2].map((i) => f(shapeAny, i))
      }
    return shapeAny
  },
  apply: () => shapeAny,
})

/** `const posts = listPosts(…)` in a variant: the shape of the resource that query made under this Boundary. */
export function shapeRead(of: unknown): {
  value: unknown
  pending: boolean
  error: unknown
  shape: unknown
  refresh(): void
} {
  const fn = (of as Record<symbol, unknown> | null | undefined)?.[Symbol.for('kerf.fn')] ?? of
  const r = waiting.use?.find((t) => t.shape?.of === fn)
  const shape = r?.shape?.read()
  return {
    value: shape === undefined ? shapeAny : shape,
    pending: false,
    error: undefined,
    shape,
    refresh() {},
  }
}

/** A text hole's placeholder. No `read`: the hole read a local the variant dropped. */
export function shapeText(read?: () => unknown): string {
  let v: unknown = BAR
  if (read) {
    try {
      v = read()
    } catch {
      /* a formatter that doesn't take a placeholder: one bar */
    }
  }
  if (v == null || typeof v === 'boolean') return ''
  // oxlint-disable-next-line typescript/no-base-to-string -- whatever reaches here is a primitive or a mistake, and a mistake should show as it does anywhere else
  const s = String(v)
  if (DEV && hintless.has(s))
    once(
      `X036${s}`,
      `X036 a skeleton shows \`${hintless.get(s)}\`, a string with no length hint, so its bar's length is a guess. Add \`.max()\`, \`.length()\` or \`.meta({ example })\` to the schema.`,
    )
  return s
}
