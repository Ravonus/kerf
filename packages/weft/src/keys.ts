// Hydration keys (research 19 §2.4). A template instance's key is its place in the source tree, not in the runtime's
// owner tree, so memos, effects and roots never shift it:
//
//   <scope><n>     the n-th template (or Boundary, or resource) created directly in a scope
//   <key>.<slot>/  the scope of hole `slot` (a compile-time index) in the template with that key
//   <scope><row>/  the scope of a list row, by the row's own key
//
// e.g. `0.1/0.5/apple/0`: the first template of row `apple`, in hole 5 of the template in hole 1 of the root.
// The server and the client compute the same keys because they run the same holes in the same order. Keys are
// computed only while `on`: during a server render, and while `hydrate()` claims the server's nodes.

export const keys = {
  /** Compute keys (server renders, hydration). */
  on: false,
  /** Client: claiming server nodes (`hydrate()`'s synchronous pass). */
  hydrating: false,
  /** The current template missed and was built fresh: its bindings make the first writes a server's element doesn't need. */
  miss: false,
  /** The current scope's path and its counter. */
  p: '',
  n: 0,
}

export function nextKey(): string {
  return keys.p + keys.n++
}

/** Run `fn` in the scope `path` (counting from 0), then restore the caller's. */
export function under<T>(path: string, fn: () => T): T {
  const p = keys.p, n = keys.n
  keys.p = path
  keys.n = 0
  try {
    return fn()
  } finally {
    keys.p = p
    keys.n = n
  }
}

/** A row key as a path step: `/`, `.` and `%` are escaped so steps can't run together. */
export const step = (k: unknown) => String(k).replace(/[%/.]/g, encodeURIComponent)
