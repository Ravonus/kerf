/** The two ends of what's left traded places: moves them, and says so. */
export function swap(parent: Node, current: Node[], next: Node[], start: number, was: number) {
  const a = current[start]!,
    b = current[was - 1]!
  if (
    was - start < 2 ||
    next[start] !== b ||
    next[was - 1] !== a ||
    a.parentNode !== parent ||
    b.parentNode !== parent
  )
    return false
  const after = b.nextSibling
  parent.insertBefore(b, a)
  parent.insertBefore(a, after)
  current[start] = b
  current[was - 1] = a
  return true
}

/** None stay, and this hole is all that's in there. */
export function empty(parent: Node, current: Node[], before: Node[], marker: Node | null) {
  if (
    marker ||
    before.length !== current.length ||
    parent.firstChild !== current[0] ||
    parent.lastChild !== current[current.length - 1]
  )
    return false
  parent.textContent = ''
  return true
}

/** The longest subsequence of `next` that keeps its relative order from `current` (O(n log n)). */
export function inOrder(next: Node[], current: Node[]): Set<Node> {
  const was = new Map<Node, number>()
  current.forEach((n, i) => was.set(n, i))
  const tails: number[] = [] // index into next of the smallest tail for each run length
  const prev: number[] = []
  for (let i = 0; i < next.length; i++) {
    const at = was.get(next[i]!)
    if (at === undefined) continue
    let lo = 0,
      hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (was.get(next[tails[mid]!]!)! < at) lo = mid + 1
      else hi = mid
    }
    prev[i] = lo > 0 ? tails[lo - 1]! : -1
    tails[lo] = i
  }
  const out = new Set<Node>()
  for (let i = tails.length ? tails[tails.length - 1]! : -1; i >= 0; i = prev[i]!) out.add(next[i]!)
  return out
}
