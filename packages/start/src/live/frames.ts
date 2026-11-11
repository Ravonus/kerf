import { DEV } from '@kerf-js/core'
import { cache, FnError } from './api'
import type { Sub } from './sub-types'

export type Row = { 0: number; 1: never; 2: unknown }

export function ack(d: Row, byN: Map<number, Sub>, seeded: () => boolean) {
  const s = byN.get(d[0])
  if (!s) return
  s.tags = d[1]
  s.error.value = undefined
  if (DEV && !s.tags.length)
    console.warn(
      `kerf: W053 \`${s.fn.$id}\` is read with \`.live()\` but declares no \`tags\`: no mutation can ever poke it.\n  fix: add \`tags\` to the query`,
    )
  // Data older than the subscription may have missed a write. A page's first connect is covered by its cursor.
  if (!s.acked && !seeded() && s.tags.length) void cache.invalidate(...s.tags)
  s.acked = true
}

export function update(event: string, d: Row, byN: Map<number, Sub>) {
  if (event === 'm') {
    const s = byN.get(d[0])
    if (!s) return
    if (d[1] !== null) s.cursor = d[1]
    s.error.value = undefined
    for (const v of s.views.values())
      v.box.value = v.fold ? v.fold(v.box.value as never, d[2] as never) : d[2]
  } else if (event === 'r') {
    const s = byN.get(d[0])
    if (!s) return
    s.cursor = undefined
    for (const v of s.views.values()) v.box.value = v.initial
  } else if (event === 'f') {
    const s = byN.get(d[0])
    if (s) s.done.value = true
  } else if (event === 'e') {
    const s = byN.get(d[0])
    if (s)
      s.error.value = new FnError(d[1], (d[1] as { code?: string }).code === 'A002' ? 401 : 500)
  }
}
