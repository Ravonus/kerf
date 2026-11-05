let made = new WeakSet<object>()
export const resetMade = () => {
  made = new WeakSet()
}
export const isMade = (value: object) => made.has(value)

type Obj = Record<PropertyKey, unknown>

const plain = (v: unknown): v is Obj =>
  !!v &&
  typeof v === 'object' &&
  (Array.isArray(v) ||
    Object.getPrototypeOf(v) === Object.prototype ||
    Object.getPrototypeOf(v) === null)

/** `next`, with every subtree deep-equal to `prev`'s replaced by `prev`'s (TanStack's replaceEqualDeep). */
export function share<T>(prev: unknown, next: T): T {
  if (prev === next || !plain(prev) || !plain(next) || Array.isArray(prev) !== Array.isArray(next))
    return next
  const keys = Object.keys(next)
  let same = Object.keys(prev).length === keys.length
  const out = (Array.isArray(next) ? [] : {}) as Obj
  for (const k of keys) {
    out[k] = share(prev[k], next[k])
    if (out[k] !== prev[k]) same = false
  }
  return (same ? prev : out) as T
}

interface Draft {
  b: Obj
  c?: Obj
  px: Obj
  done?: Obj
}

/**
 * Run `recipe` on a copy-on-write draft of `base`: only objects it writes (and their parents) are copied. A recipe
 * may instead return a new value. The copies are remembered for `cache.isOptimistic`.
 */
export function produce<T>(base: T, recipe: (draft: T) => T | void): T {
  if (!plain(base)) {
    const r = recipe(base)
    return r === undefined ? base : r
  }
  const nodes = new Map<object, Draft>()
  const byProxy = new WeakMap<object, Draft>()
  const unwrap = (v: unknown) =>
    v && typeof v === 'object' && byProxy.has(v) ? byProxy.get(v)!.b : v
  const cur = (n: Draft) => n.c ?? n.b
  const own = (n: Draft) => (n.c ??= (Array.isArray(n.b) ? n.b.slice() : { ...n.b }) as Obj)
  const node = (b: Obj): Draft => {
    let n = nodes.get(b)
    if (n) return n
    const self: Draft = (n = { b, px: b })
    n.px = new Proxy((Array.isArray(b) ? [] : {}) as Obj, {
      get: (_, k) => {
        const v = cur(self)[k]
        return plain(v) ? node(v).px : v
      },
      set: (_, k, v) => {
        v = unwrap(v)
        if (plain(v) && !nodes.has(v)) made.add(v) // a new object (a pushed row) is optimistic too
        own(self)[k] = v
        return true
      },
      deleteProperty: (_, k) => (delete own(self)[k], true),
      has: (_, k) => k in cur(self),
      ownKeys: () => Reflect.ownKeys(cur(self)),
      getOwnPropertyDescriptor: (t, k) => {
        const d = Reflect.getOwnPropertyDescriptor(cur(self), k)
        if (d && k === 'length' && Array.isArray(t)) return { ...d, configurable: false }
        return d && { ...d, configurable: true, value: self.px[k] }
      },
    })
    nodes.set(b, n)
    byProxy.set(n.px, n)
    return n
  }
  // The result: copies where something changed, the original objects everywhere else.
  const fin = (n: Draft): Obj => {
    if (n.done !== undefined) return n.done
    n.done = n.b // cycles stop here
    const src = cur(n)
    let out = n.c
    for (const k of Object.keys(src)) {
      const v = src[k]
      if (!plain(v) || !nodes.has(v)) continue
      const f = fin(nodes.get(v)!)
      if (f !== v) (out ??= own(n))[k] = f
    }
    if (out) made.add(out)
    return (n.done = out ?? n.b)
  }
  const deep = (v: unknown): unknown => {
    if (v && typeof v === 'object' && byProxy.has(v)) return fin(byProxy.get(v)!)
    if (Array.isArray(v)) return v.map(deep)
    if (plain(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))
    return v
  }
  const root = node(base)
  const r = recipe(root.px as T)
  return (r === undefined || r === root.px ? fin(root) : deep(r)) as T
}
