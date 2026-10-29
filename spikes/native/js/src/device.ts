// The `weft device` protocol: what the iOS host (DevServer.swift), the Android host (DevServer.kt) and the Node host
// (RecordingHost.dev) all answer, one JSON object per line. Agents find things by label, act through the real
// control, and read back the same semantic tree on every platform.
import type { WindowInfo } from './platform'

export type Request =
  | { cmd: 'hello' | 'viewport' | 'snapshot' | 'frames' }
  | { cmd: 'tap'; label?: string; id?: number }
  | { cmd: 'type'; label?: string; id?: number; text: string }
  | { cmd: 'select'; label?: string; id?: number; index: number }

export type SnapNode = {
  id: number
  type: string
  /** x, y, w, h in the window's pt / dp, after scrolling */
  frame: [number, number, number, number]
  visible: boolean
  label?: string; text?: string; tone?: string; role?: string; surface?: string
  value?: string; selected?: number; options?: string[]; disabled?: boolean
  children?: SnapNode[]
}
export type Reply = { ok: true; [k: string]: unknown } | { ok: false; error: string }
export type Snapshot = { ok: true; viewport: WindowInfo; root: SnapNode }

/**
 * The tree as an agent reads it: one line per node, label and text in quotes, tone and state flags, frame last.
 * Offscreen subtrees collapse to a count unless `all` (150 product rows are mostly below the fold).
 */
export function render(s: Snapshot, all = false): string {
  const v = s.viewport
  const out = [`window ${v.w}×${v.h}${v.hinge ? ` hinge [${v.hinge.x},${v.hinge.y} ${v.hinge.w}×${v.hinge.h}]` : ''}`]
  const r = (n: number) => Math.round(n * 10) / 10
  const walk = (n: SnapNode, depth: number) => {
    const name = [n.label !== undefined && `"${n.label}"`, n.text !== undefined && n.text !== n.label && `text="${n.text}"`].filter(Boolean).join(' ')
    const flags = [n.tone && `tone=${n.tone}`, n.surface && `surface=${n.surface}`, n.value !== undefined && `value="${n.value}"`,
      n.selected !== undefined && `selected=${n.options?.[n.selected] ?? n.selected}`, n.disabled && 'disabled'].filter(Boolean).join(' ')
    const [x, y, w, h] = n.frame
    out.push(`${'  '.repeat(depth)}${n.type} #${n.id}${name ? ` ${name}` : ''}${flags ? ` ${flags}` : ''} [${r(x)},${r(y)} ${r(w)}×${r(h)}]`)
    const kids = n.children ?? []
    let hidden = 0
    for (const c of kids) { if (all || c.visible) walk(c, depth + 1); else hidden++ }
    if (hidden) out.push(`${'  '.repeat(depth + 1)}… ${hidden} offscreen`)
  }
  walk(s.root, 0)
  return out.join('\n')
}
