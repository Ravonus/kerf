// weft/linked: `state.linked`. The weft() Vite plugin imports this where an app uses it, so others don't carry it.

import { Box, derived, state, untrack, type Linked } from './index'

/**
 * A writable box that resets whenever `source` changes (a local copy of a prop). With `key`, it resets when the key
 * changes; while the key stays, it follows the source until a local edit, then keeps the edit and reports `conflict`
 * (a refetch or a push never clobbers what someone is typing, research 14 §3.4).
 */
(state as { linked: typeof state.linked }).linked = <T>(source: () => T, options?: { key: () => unknown }): Linked<T> => {
  const src = derived(source)
  // A fresh object per key, so a write belongs to one key even if the key later returns to it. No `key`: the source.
  const from = derived<{ k: unknown }>(((prev?: { k: unknown }) => {
    const k = options ? options.key() : src.value
    return prev && Object.is(prev.k, k) ? prev : { k }
  }) as () => { k: unknown })
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
    set(update) { const d: any = this.value; update(d); this.value = d },
    get(key) { return (this.value as any)?.[key] },
    conflict: derived(() => {
      const l = edit()
      const theirs = src.value
      return l && !Object.is(theirs, l.base) ? { theirs, base: l.base } : undefined
    }),
  }
}
