// Islands at a level's top (island.ts): the nodes the level's hole places and the island's own hole changes.
import { getOwner, onCleanup, type Owner } from '../index'
import type { Hold } from '../dom'
import { siblings } from './dom'

/**
 * An island at a level's top. Its nodes are the level's own top nodes, so the hole that shows the level places them,
 * and the island changes them. The level's value holds `shown` where they go, read each time the level is placed, so
 * what's placed is what the island has now and not what the server sent.
 */
export interface Top {
  /** What made the level: `park` finds the islands under an owner by it. */
  o: Owner | null
  c: Comment
  open: Node
  close: Node
  /** Its nodes when last counted: the server's until it runs, and what went to `f` after that. */
  was: Node[]
  /** Its own hole, once it runs and its range stays. */
  h?: Hold
  /** Where its nodes wait while the level is out of the page: the island goes on writing to them there. */
  f?: DocumentFragment
  /** Its nodes left the page once, so `c` no longer says where they start. */
  apart?: boolean
}
export const tops = new Set<Top>()

/** The nodes of `t` now, its end marker included. */
export function shown(t: Top): Node[] {
  const { c, open, close, h } = t
  const at = close.parentNode
  if (at && at === t.f) return [...at.childNodes]
  // Its start marker is there until the sweep takes it: listing it meanwhile keeps the claim from writing.
  if (h) return [...(at && open.parentNode === at ? [open] : []), ...(h.t ? [h.t] : h.c), close]
  if (!t.apart && at && c.parentNode === at) return [...siblings(c, close), close]
  return t.was
}

/**
 * Take the top-level islands made under `root` out of the page, each to a fragment of its own. The caller is about
 * to show something else where their level is and keep the level alive (a route's pending shape): the hole that
 * shows the level only knows the nodes it placed last, and an island left with its end marker gone has nowhere to
 * write. Showing the level again puts them back.
 */
export function park(root: Owner) {
  for (const t of tops) {
    let o = t.o
    while (o && o !== root) o = o.owner
    if (!o || (t.f && t.close.parentNode === t.f)) continue
    t.was = shown(t)
    t.apart = true
    ;(t.f ??= document.createDocumentFragment()).append(...t.was)
  }
}

/** The island is over: its nodes go, and the comment that named it. */
export function drop(t: Top) {
  tops.delete(t)
  for (const n of shown(t)) (n as ChildNode).remove()
  t.c.remove()
}

/** Count the island from `c` to `close` as its level's own nodes, until what's making the level is disposed. */
export function track(c: Comment, open: Node, close: Node): Top {
  const t: Top = { o: getOwner(), c, open, close, was: [...siblings(c, close), close] }
  tops.add(t)
  onCleanup(() => drop(t))
  return t
}

/** The island ran. `h` is its hole when its range stays: it writes where its end marker is, wherever that has gone. */
export function ran(t: Top, h: Hold | undefined) {
  if (h) Object.defineProperty((t.h = h), 'p', { get: () => t.close.parentNode })
  else t.was = shown(t)
}

/** A level's value: `nodes` that `keep` passes, with each island in `listed` as a read of its nodes where they are. */
export function listing(nodes: Node[], listed: Map<Node, Top>, keep: (n: Node) => boolean) {
  const value: unknown[] = []
  let inside: Top | undefined
  for (const n of nodes) {
    const t = inside
    if (t) {
      if (n !== t.close) continue
      inside = undefined
      value.push(() => shown(t))
    } else if (!(inside = listed.get(n)) && keep(n)) value.push(n)
  }
  return value
}
