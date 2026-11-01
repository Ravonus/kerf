// The command palette's ranking and its hotkey (05 §3; components.html:1704-1754).

/** Letters of `q` in order in `text`. Word starts score more; null when they aren't all there. A blank query matches. */
export function fuzzy(q: string, text: string): { score: number; hits: number[] } | null {
  if (!q) return { score: 0, hits: [] }
  const t = text.toLowerCase()
  const hits: number[] = []
  let score = 0
  for (let i = 0; i < t.length && hits.length < q.length; i++) {
    if (t[i] !== q[hits.length]) continue
    score += i === 0 || t[i - 1] === ' ' ? 3 : 1
    hits.push(i)
  }
  return hits.length === q.length ? { score, hits } : null
}

export interface Rankable { label: string; group?: string; keywords?: string[] }
export interface Ranked<C> { item: C; hits: number[] }

/** What a query shows, best first and then gathered by group in the order the groups turn up. */
export function rankCommands<C extends Rankable>(items: readonly C[], query: string) {
  const q = query.trim().toLowerCase()
  const found: (Ranked<C> & { score: number })[] = []
  for (const item of items) {
    const own = fuzzy(q, item.label)
    const alias = own ? undefined : item.keywords?.map(k => fuzzy(q, k)).find(Boolean)
    if (own || alias) found.push({ item, hits: own?.hits ?? [], score: (own ?? alias)!.score })
  }
  if (q) found.sort((a, b) => b.score - a.score)
  const groups = new Map<string, Ranked<C>[]>()
  for (const f of found) {
    const name = f.item.group ?? ''
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name)!.push({ item: f.item, hits: f.hits })
  }
  return [...groups].map(([name, rows]) => ({ name, rows }))
}

/** Split a label around its matched letters: the runs alternate unmatched, matched. */
export function marked(label: string, hits: readonly number[]) {
  const on = new Set(hits)
  const runs: { text: string; hit: boolean }[] = []
  for (let i = 0; i < label.length; i++) {
    const hit = on.has(i)
    if (runs.at(-1)?.hit === hit) runs.at(-1)!.text += label[i]
    else runs.push({ text: label[i], hit })
  }
  return runs
}

/** ⌘K or Ctrl+K anywhere in the document (05 §3). */
export function paletteHotkey(el: HTMLElement, opts: { key: string; slash?: boolean; onPress(): void }) {
  let o = opts
  const doc = el.ownerDocument
  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    const slash = o.slash && e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !target?.closest?.('input, textarea, select') && !target?.isContentEditable
    if (!slash && (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== o.key)) return
    e.preventDefault()
    o.onPress()
  }
  doc.addEventListener('keydown', onKey)
  return { update: (next: typeof opts) => void (o = next), destroy: () => doc.removeEventListener('keydown', onKey) }
}
