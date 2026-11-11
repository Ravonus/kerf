// The command palette's ranking and its hotkey (05 §3; components.html:1704-1754).

/** A word starts at `i`: the text's start, or after a space or other mark ("us" starts a word in "eu-west/us-east"). */
const starts = (t: string, i: number) => i === 0 || !/[\p{L}\p{N}]/u.test(t[i - 1] ?? '')

/** Letters of `q` in order in `text`. Word starts score more; null when they aren't all there. A blank query matches. */
export function fuzzy(q: string, text: string): { score: number; hits: number[] } | null {
  if (!q) return { score: 0, hits: [] }
  const t = text.toLowerCase()
  const hits: number[] = []
  let score = 0
  for (let i = 0; i < t.length && hits.length < q.length; i++) {
    if (t[i] !== q[hits.length]) continue
    score += starts(t, i) ? 3 : 1
    hits.push(i)
  }
  return hits.length === q.length ? { score, hits } : null
}

/**
 * How well `q` matches `text`, strongest first: 3 the query as written at a word's start ("us" in "us-east"); 2 at word
 * starts only, as initials ("np" in "New project") or each word of the query starting a word; 1 the query as written
 * inside a word; 0 its letters in order anywhere ("us" in "eu-west"). Null when they aren't all there.
 */
export function matchStrength(
  q: string,
  text: string,
): { tier: 0 | 1 | 2 | 3; score: number; hits: number[] } | null {
  if (!q) return { tier: 3, score: 0, hits: [] }
  const t = text.toLowerCase()
  const run = (at: number) => Array.from({ length: q.length }, (_, k) => at + k)
  for (let at = t.indexOf(q); at >= 0; at = t.indexOf(q, at + 1))
    if (starts(t, at)) return { tier: 3, score: 100 - at, hits: run(at) }
  // initials: each letter of the query starts a word, in order
  const initials: number[] = []
  for (let i = 0; i < t.length && initials.length < q.length; i++)
    if (starts(t, i) && t[i] === q[initials.length]) initials.push(i)
  if (initials.length === q.length && !/\s/.test(q))
    return { tier: 2, score: 50 - initials[0]!, hits: initials }
  // each word of the query starts a word of the text, in order
  const words = q.split(/\s+/).filter(Boolean)
  if (words.length > 1) {
    const hits: number[] = []
    let from = 0
    for (const w of words) {
      let at = t.indexOf(w, from)
      while (at >= 0 && !starts(t, at)) at = t.indexOf(w, at + 1)
      if (at < 0) {
        hits.length = 0
        break
      }
      hits.push(...Array.from({ length: w.length }, (_, k) => at + k))
      from = at + w.length
    }
    if (hits.length) return { tier: 2, score: 50 - hits[0]!, hits }
  }
  const inside = t.indexOf(q)
  if (inside >= 0) return { tier: 1, score: 20 - inside, hits: run(inside) }
  const loose = fuzzy(q, text)
  return loose && { tier: 0, ...loose }
}

/** What the command palette ranks by. */
export interface Rankable {
  label: string
  group?: string | undefined
  keywords?: string[]
}
/** An item that matched, with the letters that hit. */
export interface Ranked<C> {
  item: C
  hits: number[]
}

/**
 * What a query shows, best first and then gathered by group in the order the groups turn up. A match at a word's start
 * or as written ranks before letters scattered in order, and scattered letters show only when nothing matches better:
 * "us" finds us-east and us-west, not eu-west.
 */
export function rankCommands<C extends Rankable>(items: readonly C[], query: string) {
  const q = query.trim().toLowerCase()
  const found: (Ranked<C> & { tier: number; score: number })[] = []
  for (const item of items) {
    const own = matchStrength(q, item.label)
    const alias = item.keywords
      ?.map((k) => matchStrength(q, k))
      .filter(Boolean)
      .sort((a, b) => b!.tier - a!.tier)[0]
    // a keyword can rank a row higher than its label's scattered letters, but never marks the label
    const best = own && (!alias || own.tier >= alias.tier) ? own : alias
    if (best)
      found.push({
        item,
        hits: own && best === own ? own.hits : [],
        tier: best.tier,
        score: best.score,
      })
  }
  const strong = found.some((f) => f.tier > 0)
  const shown = q && strong ? found.filter((f) => f.tier > 0) : found
  if (q) shown.sort((a, b) => b.tier - a.tier || b.score - a.score)
  const groups = new Map<string, Ranked<C>[]>()
  for (const f of shown) {
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
    else runs.push({ text: label[i]!, hit })
  }
  return runs
}

/** ⌘K or Ctrl+K anywhere in the document (05 §3). */
export function paletteHotkey(
  el: HTMLElement,
  opts: { key: string; slash?: boolean | undefined; onPress(): void },
) {
  let o = opts
  const doc = el.ownerDocument
  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    const slash =
      o.slash &&
      e.key === '/' &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !target?.closest?.('input, textarea, select') &&
      !target?.isContentEditable
    if (!slash && (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== o.key)) return
    e.preventDefault()
    o.onPress()
  }
  doc.addEventListener('keydown', onKey)
  return {
    update: (next: typeof opts) => void (o = next),
    destroy: () => doc.removeEventListener('keydown', onKey),
  }
}
