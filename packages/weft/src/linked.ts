// Separate from the core so an app that writes no prop locals and no `state.linked` doesn't carry them.
// oxlint-disable-next-line import/no-cycle -- this file builds on the core, and the entry re-exports `localProps`
import { Box, derived, untrack, type Linked } from './index'

/**
 * A writable box that resets whenever `source` changes (a local copy of a prop). With `key`, it resets when the key
 * changes; while the key stays, it follows the source until a local edit, then keeps the edit and reports `conflict`
 * (a refetch or a push never clobbers what someone is typing, research 14 §3.4).
 */
export const linked = <T>(source: () => T, options?: { key: () => unknown }): Linked<T> => {
  const src = derived(source)
  // A fresh object per key, so a write belongs to one key even if the key later returns to it. No `key`: the source.
  const from = derived<{ k: unknown }>(((prev?: { k: unknown }) => {
    const k = options ? options.key() : src.value
    return prev && Object.is(prev.k, k) ? prev : { k }
  }))
  const local = new Box<{ v: T; from: { k: unknown }; base: T } | undefined>(undefined)
  const edit = () => {
    const f = from.value
    const l = local.value
    return l && l.from === f ? l : undefined
  }
  return {
    get value() {
      const l = edit()
      return l ? l.v : src.value
    },
    set value(v: T) {
      const f = from.value
      const l = local.v
      local.value = { v, from: f, base: l && l.from === f ? l.base : untrack(() => src.value) }
    },
    set(update) { const d = this.value; update(d); this.value = d },
    get(key) { return this.value?.[key] as T[typeof key] },
    conflict: derived(() => {
      const l = edit()
      const theirs = src.value
      return l && !Object.is(theirs, l.base) ? { theirs, base: l.base } : undefined
    }),
  }
}

/**
 * Compiled from a component that assigns to a prop's local (`let amount = props.amount; amount = 5`). Each written prop
 * reads through a linked state, so a write holds in this component until the parent's value next changes, and only a
 * prop given with `bind(box)` has a setter that takes it further. `written`: each key, then its default or 0.
 */
export function localProps(props: Record<PropertyKey, unknown>, written: unknown[]) {
  const boxes = new Map<PropertyKey, Linked<unknown>>()
  for (let i = 0; i < written.length; i += 2) {
    const k = written[i] as string, fallback = written[i + 1] as (() => unknown) | 0
    boxes.set(k, linked(() => (props[k] === undefined && fallback ? fallback() : props[k])))
  }
  return new Proxy(props, {
    get: (t, k) => (boxes.has(k) ? boxes.get(k)!.value : t[k]),
    set(t, k, v) {
      const box = boxes.get(k)
      if (box) box.value = v
      Reflect.set(t, k, v) // a setter, if the parent bound this prop; a getter alone ignores it
      return true
    },
    has: (t, k) => boxes.has(k) || k in t,
    ownKeys: t => [...new Set([...Reflect.ownKeys(t), ...boxes.keys()])] as (string | symbol)[],
    getOwnPropertyDescriptor: (t, k) => (boxes.has(k) || k in t ? { configurable: true, enumerable: true } : undefined),
  })
}
