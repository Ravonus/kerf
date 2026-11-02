// The one shape every stateful core widget exposes: read the state, send it events, hear about changes. No framework:
// a binding copies `get()` into its own reactive cell in `subscribe` (weft: a box; React: useSyncExternalStore).

export interface Store<S> {
  get: () => S
  subscribe: (fn: (state: S) => void) => () => void
}

export function store<S>(initial: S) {
  let current = initial
  const listeners = new Set<(state: S) => void>()
  return {
    get: () => current,
    set(next: S) {
      if (Object.is(next, current)) return
      current = next
      // oxlint-disable-next-line unicorn/no-useless-spread -- a snapshot: a listener can unsubscribe while it's told
      for (const fn of [...listeners]) fn(current)
    },
    subscribe: (fn: (state: S) => void) => {
      listeners.add(fn)
      return () => void listeners.delete(fn)
    },
  }
}

/** An action: what a binding attaches to an element (`ref` + `onCleanup` in weft, an effect in React). */
export interface Action<O = void> {
  update(opts: O): void
  destroy(): void
}

let next = 0
// A server counts across requests and a client from 0, so the two sides never agree on a number. Hydration writes
// nothing, so server ids stay in the page: they get their own namespace, or a field added later could take one.
const side = typeof document === 'undefined' ? 's' : ''
/** A document-unique id for ARIA wiring (`warp-0`, `warp-1`, …). */
export const uid = (prefix = 'warp') => {
  // A server render restarts the count, so a page's markup doesn't depend on what was served before it: that's how start
  // tells a static level hasn't changed. weft has no import of this package, so the two meet on a global.
  if (side) (globalThis as Record<symbol, unknown>)[Symbol.for('weft.render')] = resetIds
  return `${prefix}-${side}${(next++).toString(36)}`
}
/**
 * Restart the id sequence. A server render and the hydration that adopts it each call this first, so the same
 * component order yields the same ids on both sides.
 */
export const resetIds = () => void (next = 0)
