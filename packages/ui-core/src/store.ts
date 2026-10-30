// The one shape every stateful core widget exposes: read the state, send it events, hear about changes. No framework:
// a binding copies `get()` into its own reactive cell in `subscribe` (weft: a box; React: useSyncExternalStore).

export interface Store<S> {
  get(): S
  subscribe(fn: (state: S) => void): () => void
}

export function store<S>(initial: S) {
  let current = initial
  const listeners = new Set<(state: S) => void>()
  return {
    get: () => current,
    set(next: S) {
      if (Object.is(next, current)) return
      current = next
      for (const fn of [...listeners]) fn(current)
    },
    subscribe(fn: (state: S) => void) {
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
export const uid = (prefix = 'warp') => `${prefix}-${side}${(next++).toString(36)}`
/**
 * Restart the id sequence. A server render and the hydration that adopts it each call this first, so the same
 * component order yields the same ids on both sides.
 */
export const resetIds = () => void (next = 0)
