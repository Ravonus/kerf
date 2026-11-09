import { Box } from '../index/state'
import { clean, rt, setFlat } from '../index/graph'
import { getOwner, memo, untrack, within, type Owner } from '../index'
import { DEFER, ENDS, FLAT, LINEAR, ROWBOX, SWAP } from '../flags'
import { keys, under } from '../keys'
import { Row, find, rendered, rowStep, type Item } from './rows'

export type ListState = { order: Item[]; out: unknown[]; fresh: boolean; single: boolean; r: Item }
type Props<T> = {
  each: readonly T[] | null | undefined
  by?: ((item: T, index: number) => unknown) | undefined
  children: (item: () => T, index: () => number) => unknown
}

type Hooks<T> = {
  props: Props<T>
  base: string
  data: ListState
  make: () => unknown
  claim: () => unknown
  repeats: () => void
}

export function listMemo<T>(o: Hooks<T>) {
  const { props, base } = o
  return memo(() => {
    const list = props.each || []
    if (rt.server) return untrack(() => rendered(list, props, base))
    const parent = getOwner()
    // A callback that takes an index (or might: `(...args)`) gets an index box; `(row) =>` doesn't.
    const indexed = props.children.length !== 1
    return untrack(() => reconcile(list, parent, indexed, o))
  })
}

function matchEnds(order: Item[], length: number, key: (i: number) => unknown) {
  // Rows that stayed at either end are found by position, ends that traded places by each other, the rest by key.
  let from = 0,
    end = order.length,
    stop = length,
    traded = false
  if (ENDS)
    for (;;) {
      while (from < end && from < stop && order[from]!.key === key(from)) from++
      while (from < end && from < stop && order[end - 1]!.key === key(stop - 1)) {
        end--
        stop--
      }
      const a = order[from]!,
        b = order[end - 1]!
      if (!SWAP || end - from < 2 || end !== stop || a.key !== key(stop - 1) || b.key !== key(from))
        break
      order[from] = b
      order[end - 1] = a
      traded = true
    }
  return [from, end, stop, traded] as const
}

function reconcile<T>(
  list: readonly T[],
  parent: Owner | null,
  indexed: boolean,
  { props, base, data, make, claim, repeats }: Hooks<T>,
) {
  const by = props.by
  const key = (i: number) => (by ? by(list[i]!, i) : list[i])
  const paths = keys.on ? new Set<unknown>() : undefined // two rows with one key can't share a hydration scope
  if (DEFER && data.fresh && list.length) repeats() // not as they're made: making a row costs no lookup that way
  data.fresh = false
  const order = data.order
  const [from, end, stop, traded] = matchEnds(order, list.length, key)
  let left: Map<unknown, Item> | undefined
  if (from < stop) {
    if (from < end && (!LINEAR || end - from > 8)) left = new Map()
    if (left) for (let i = from; i < end; i++) left.set(order[i]!.key, order[i]!)
  } else for (let i = from; i < end; i++) clean(order[i]!)
  // oxlint-disable unicorn/no-new-array -- sized up front: filling a list of known length is the keyed list's hot path
  const next = new Array<Item>(list.length),
    nodes = new Array<unknown>(list.length) /* oxlint-enable unicorn/no-new-array */
  for (let i = 0; i < list.length; i++) {
    const item = list[i]!
    let row = i < from ? order[i] : i >= stop ? order[i + end - stop] : undefined
    if (!row) {
      let k: unknown = key(i)
      if ((row = left?.get(k))) left!.delete(k)
      else if (LINEAR && !left && from < end && (row = find(order, from, end, k))) {
      } // taken out of `order`
      else {
        if (paths) {
          const id = k === Object(k) ? k : String(k)
          if (paths.has(id)) k = { duplicate: k }
          paths.add(id)
        }
        const r =
          (data.r =
          row =
            new Row(item, k, parent, indexed ? new Box(i) : undefined) as Item)
        if (!ROWBOX) r.box = new Box<unknown>(item)
        // A row the server didn't render builds itself and no more: the next row still claims.
        r.nodes = within(r, keys.on ? () => under(base + rowStep(k, i) + '/', claim) : make)
        if (FLAT) data.single &&= !rt.server && r.nodes instanceof Node && r.nodes.nodeType !== 11
        data.fresh = true
        next[i] = row
        nodes[i] = r.nodes
        continue
      }
    }
    if (!ROWBOX) row.box.value = item
    else if (row.v !== item) row.value = item
    if (row.index) row.index.value = i
    next[i] = row
    nodes[i] = row.nodes
  }
  if (left) for (const row of left.values()) clean(row)
  else if (LINEAR && from < stop) for (let i = from; i < end; i++) if (order[i]) clean(order[i]!)
  data.order = next
  if (!DEFER && data.fresh) repeats()
  if (!ENDS || traded || from < end || from < stop) {
    data.out = nodes
    if (FLAT) {
      if (!data.out.length) data.single = true
      else if (data.single) setFlat(data.out)
    }
  }
  return data.out
}
