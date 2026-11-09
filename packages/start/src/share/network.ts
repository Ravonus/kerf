import type { connectBuiltIn } from '../channel'
import type { shareStats as ShareStats } from '../share'
import { mine, tabs, type Pair } from './state'

type Conn = ReturnType<typeof connectBuiltIn>

function changedPairs(o: {
  dirtyNet: Set<string>
  sent: Map<string, number>
  refused: Set<string>
  upstream: (key: string) => number
  BATCH: number
}) {
  const { dirtyNet, sent, refused, upstream, BATCH } = o
  const e: Pair[] = []
  for (const key of dirtyNet) {
    if (e.length === BATCH) break
    dirtyNet.delete(key)
    if (!sent.has(key) || refused.has(key)) continue
    const bits = upstream(key)
    // Off and on again inside the gap: nothing to say. The latest value is all that's kept.
    if (bits !== sent.get(key)) {
      sent.set(key, bits)
      e.push([key, bits])
    }
  }
  return e
}

export function network({
  connection,
  isOpen,
  sent,
  refused,
  dirtyNet,
  toAdd,
  toDrop,
  upstream,
  shareStats,
  GAP_NET,
  BATCH,
}: {
  connection: () => Conn | undefined
  isOpen: () => boolean
  sent: Map<string, number>
  refused: Set<string>
  dirtyNet: Set<string>
  toAdd: Set<string>
  toDrop: Set<string>
  upstream: (key: string) => number
  shareStats: typeof ShareStats
  GAP_NET: number
  BATCH: number
}) {
  let netLast = 0
  let netTimer: ReturnType<typeof setTimeout> | undefined
  /** One frame per GAP_NET, `u` first: the bucket is 20 a second, and a frame carries every key that's waiting. */
  function netTick() {
    netTimer = undefined
    const conn = connection()
    if (!conn || !isOpen()) return
    let name: 'u' | 'set' | undefined,
      msg: unknown,
      size = 0
    if (toAdd.size || toDrop.size) {
      const add = [...toAdd].slice(0, BATCH),
        drop = [...toDrop].slice(0, BATCH - add.length)
      for (const k of add) toAdd.delete(k)
      for (const k of drop) toDrop.delete(k)
      name = 'u'
      msg = { add, drop }
      size = add.length + drop.length
    } else {
      const e = changedPairs({ dirtyNet, sent, refused, upstream, BATCH })
      if (e.length) {
        name = 'set'
        msg = { e }
        size = e.length
      }
    }
    if (name) {
      netLast = performance.now()
      shareStats.frames++
      shareStats.keysSent += size
      conn.send(name as never, msg as never).catch(() => {}) // a dropped link re-says everything
    }
    if (toAdd.size || toDrop.size || dirtyNet.size) netSoon()
  }
  /** Not a timer when the gap has passed: the leader is often a hidden tab, where a timer waits a second or more. */
  function netSoon() {
    const wait = GAP_NET - (performance.now() - netLast)
    if (wait > 0) {
      netTimer ??= setTimeout(netTick, wait)
      return
    }
    clearTimeout(netTimer)
    netTick()
  }

  const clear = () => {
    clearTimeout(netTimer)
    netTimer = undefined
  }
  return { netSoon, clear }
}

export const upstream = (key: string, locks: boolean) => {
  if (!locks) return mine.get(key) ?? 0
  let bits = 0
  for (const keys of tabs.values()) bits |= keys.get(key) ?? 0
  return bits
}

export function wanted(locks: boolean) {
  if (!locks) return new Set(mine.keys())
  const out = new Set<string>()
  for (const keys of tabs.values()) for (const k of keys.keys()) out.add(k)
  return out
}
