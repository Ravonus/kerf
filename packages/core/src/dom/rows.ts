import { NONE, type Box, type Computation, type Owner } from '../index'
import { keys, under } from '../keys'

/**
 * A row is its own root (no closure to dispose it) and the box of its item. `index` exists only when `children` takes
 * one. It sets a box's fields itself: built through `extends Box`, every row costs a derived constructor.
 */
export class Row {
  v: unknown
  f: Computation | undefined = undefined
  o: Computation[] = NONE
  owned: Owner['owned'] = null
  tail: Owner['tail'] = null
  cleanups: Owner['cleanups'] = null
  nodes: unknown = undefined
  constructor(
    item: unknown,
    public key: unknown,
    public owner: Owner | null,
    public index: Box<number> | undefined,
  ) {
    this.v = item
  }
}
/** A row as `For` sees it, with the prototype it gets there. `box` holds the item when rows aren't boxes themselves. */
export type Item = Row & Box<unknown> & { box: Box<unknown> }

/** The row under `k` between `from` and `end`, taken out. */
export function find(order: Item[], from: number, end: number, k: unknown): Item | undefined {
  for (let i = from; i < end; i++) {
    const r = order[i]
    // oxlint-disable-next-line no-self-compare -- `k !== k` is the NaN check for a key: this loop is the list's hot path, and Number.isNaN costs bytes and a call
    if (r && (r.key === k || (k !== k && r.key !== r.key))) return ((order[i] = undefined!), r)
  }
  return undefined
}

/**
 * A row as a path step: its key, so a row claims the server's row of that key wherever the list has moved it, and no two
 * keys can meet. `:` keeps it from a Boundary's scope, and what's escaped would end a step or the `wk` it's written in, or
 * the parser would rewrite it there (`\r`, NUL). An object says nothing the server and client share, so it's the row's place.
 */
export const rowStep = (k: unknown, i: number) =>
  k === Object(k)
    ? `%i${i}`
    : `:${String(k).replace(/[%/.&<>"\0\r]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}`

/** A server's list: rendered once, so each row is its item and its scope, with no row to keep or owner to clean. */
export function rendered<T>(
  list: readonly T[],
  props: {
    each: readonly T[] | null | undefined
    by?: ((item: T, index: number) => unknown) | undefined
    children: (item: () => T, index: () => number) => unknown
  },
  base: string,
) {
  // oxlint-disable-next-line unicorn/no-new-array -- sized up front, as the client's list is
  const out = new Array<unknown>(list.length)
  const paths = keys.on ? new Set<unknown>() : undefined
  for (let i = 0; i < list.length; i++) {
    const item = list[i]!
    let key = props.by ? props.by(item, i) : item
    if (paths) {
      const id = key === Object(key) ? key : String(key)
      if (paths.has(id)) key = { duplicate: key }
      paths.add(id)
    }
    const make = () =>
      props.children(
        () => item,
        () => i,
      )
    out[i] = paths ? under(base + rowStep(key, i) + '/', make) : make()
  }
  return out
}

export const reader =
  <V>(box: Box<V>) =>
  () =>
    box.value
export const zero = () => 0
