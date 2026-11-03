// Hydration keys (research 19 §2.4). A template instance's key is its place in the source tree, not in the runtime's
// owner tree, so memos, effects and roots never shift it:
//
//   <scope><n>     the n-th template (or Boundary, or resource) created directly in a scope
//   <key>.<slot>/  the scope of hole `slot` (a compile-time index) in the template with that key
//   <scope><row>/  the scope of a list row: its place in the list, then three characters of its key
//
// e.g. `0.1/0.5/3k2f/0`: the first template of the fourth row, in hole 5 of the template in hole 1 of the root. A row's key
// can be a UUID, repeated in every `wk` under it: the place is short and unique, and the check keeps a list that moved
// on from claiming another row's nodes. Keys only have to agree for one claim, so a row's place may change later.
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

/** A row as a path step: base-36 only, so steps can't run together. */
export function step(k: unknown, i: number) {
  const s = String(k)
  let h = 0
  for (let n = 0; n < s.length; n++) h = (h * 31 + s.charCodeAt(n)) | 0
  return i.toString(36) + (46656 + (h >>> 0) % 46656).toString(36).slice(1)
}
