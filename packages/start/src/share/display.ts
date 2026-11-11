import { NONE } from '@kerf/core/interaction'
import { tab } from '../link'
import { clients, lines, shown, siblings, tabs, type Client, type Triple } from './state'

export function render(key: string) {
  const heard = lines.get(key)
  if (!heard) return
  let hover = 0,
    focus = 0,
    pressed = 0
  const add = (bits: number) => {
    if (bits & 1) hover++
    if (bits & 2) focus++
    if (bits & 4) pressed++
  }
  for (const [t, keys] of tabs) if (t !== tab) add(keys.get(key) ?? 0)
  for (const e of clients.get(key)?.values() ?? []) add(e.bits)
  const was = shown.get(key) ?? NONE
  if (was.hover === hover && was.focus === focus && was.pressed === pressed) return
  const now = hover || focus || pressed ? { hover, focus, pressed } : NONE
  shown.set(key, now)
  heard(now)
}
export const renderAll = () => {
  for (const k of lines.keys()) render(k)
}

export function hear(s: Triple[], leading: boolean) {
  const at = Date.now(),
    touched = new Set<string>()
  for (const [id, key, bits] of s) {
    if (siblings.has(id) || (!leading && !lines.has(key))) continue
    let held = clients.get(key)
    if (bits) {
      if (!held) clients.set(key, (held = new Map()))
      held.set(id, { bits, at })
    } else if (!held?.delete(id)) continue
    touched.add(key)
  }
  for (const k of touched) render(k)
}

export function dropClients(which: (e: Client, id: string) => boolean) {
  for (const [key, held] of clients) {
    let changed = false
    for (const [id, e] of held) if (which(e, id)) changed = held.delete(id)
    if (!held.size) clients.delete(key)
    if (changed) render(key)
  }
}
