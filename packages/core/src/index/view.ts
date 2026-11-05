import { rt } from './graph'
import { getOwner, createRoot } from './lifecycle'
import type { Owner, State } from './types'

/** The nearest `provide`'s values: each one holds its parents' too. */
function contexts(from: Owner | null) {
  while (from && !from.context) from = from.owner
  return from?.context
}

/** A value a subtree reads without props: `provide` sets it below an owner, `use` reads the nearest. */
export function context<T>(fallback?: T) {
  const id = Symbol()
  return {
    provide<R>(value: T, fn: () => R): R {
      const parent = getOwner()
      return createRoot((end) => {
        if (parent) (parent.cleanups ??= []).push(end) // the subtree goes when its parent does
        getOwner()!.context = { ...contexts(parent), [id]: value }
        return fn()
      })
    },
    get use(): T {
      const ctx = contexts(getOwner())
      return ctx && id in ctx ? (ctx[id] as T) : (fallback as T)
    },
  }
}

export function once<T>(fn: () => T) {
  let done = false,
    v: T
  return () => (done ? v : ((v = fn()), (done = true), v))
}

/**
 * A live view of `sources` merged (later wins), without the `skip` keys. A source is an object, or a getter for one
 * (a spread of a prop), which may be undefined (`{...rest.attrs}`). `mergeProps` and `omit` are both views.
 */
export function view(sources: unknown[], skip: string[] = []): Record<PropertyKey, unknown> {
  if (rt.server && sources.length === 1) return seen(sources[0], skip)
  // A server renders once and nothing it reads can move: a getter (a `restOf` copy, so every prop) runs once, not per read.
  if (rt.server)
    sources = sources.map((s) => (typeof s === 'function' ? once(s as () => unknown) : s))
  const open = (s: unknown): Record<PropertyKey, unknown> =>
    Object(typeof s === 'function' ? s() : s)
  const kept = (k: PropertyKey) => !skip.includes(k as string)
  // Which source holds each key, later winning, in the order keys were first met. Once on a server, for the same reason.
  let held: Map<PropertyKey, Record<PropertyKey, unknown>> | undefined
  const owners = () => {
    if (held) return held
    const map = new Map<PropertyKey, Record<PropertyKey, unknown>>()
    for (const s of sources) {
      const o = open(s)
      for (const k of Reflect.ownKeys(o)) if (kept(k)) map.set(k, o)
    }
    if (rt.server) held = map
    return map
  }
  return new Proxy(
    {},
    {
      get(_, k) {
        if (rt.server) {
          const o = owners().get(k)
          if (o) return o[k]
        }
        if (kept(k))
          for (let i = sources.length - 1; i >= 0; i--) {
            const s = open(sources[i])
            if (k in s) return s[k]
          }
        return undefined
      },
      has: (_, k) => kept(k) && sources.some((s) => k in open(s)),
      ownKeys: () => [...owners().keys()] as (string | symbol)[],
      getOwnPropertyDescriptor: (_, k) =>
        kept(k) && (!rt.server || owners().has(k))
          ? { configurable: true, enumerable: true }
          : undefined,
    },
  )
}

/** A server's view of one source: itself, when nothing is left out, or a thin view that only drops `skip`. */
function seen(source: unknown, skip: string[]): Record<PropertyKey, unknown> {
  const s = typeof source === 'function' ? once(source as () => unknown) : source
  const open: () => Record<PropertyKey, unknown> =
    typeof s === 'function' ? () => Object(s()) : () => Object(s)
  if (!skip.length && typeof s !== 'function') return open()
  return new Proxy(
    {},
    {
      get: (_, k) => (skip.includes(k as string) ? undefined : open()[k]),
      has: (_, k) => !skip.includes(k as string) && k in open(),
      ownKeys: () => Reflect.ownKeys(open()).filter((k) => !skip.includes(k as string)),
      getOwnPropertyDescriptor: (_, k) =>
        !skip.includes(k as string) && Object.hasOwn(open(), k)
          ? { configurable: true, enumerable: true }
          : undefined,
    },
  )
}

/**
 * `<Card person={bind(name)} />`: `person` reads the box, and a write in `Card` reaches it. Without this, a child's
 * writes stay in the child. The compiler reads the call; this is its value where nothing compiled it.
 */
export const bind = <T>(box: State<T>): T => box.value

/** A live view of `props` without `keys` (`({ a, ...rest }) =>`, §3.3). */
export const omit = <P extends object, K extends PropertyKey>(props: P, keys: K[]) =>
  view([props], keys as string[]) as Omit<P, K>

/** `<div {...rest}>`: a plain copy of `props` without `keys`, read where the element's spread reads its attributes. */
export function restOf<P extends object>(props: P, keys: string[]) {
  const out: Record<string, unknown> = {}
  // Not `for in`: over a view (a Proxy) it asks for every key's descriptor and walks the prototype, which costs more than the copy.
  for (const k of Reflect.ownKeys(props))
    if (typeof k === 'string' && !keys.includes(k)) out[k] = (props as Record<string, unknown>)[k]
  return out
}
