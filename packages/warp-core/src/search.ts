// Client-side search over a prebuilt index (research 38 §2). A build calls `buildIndex` and writes the JSON; the page calls
// `openIndex` once and `searchIndex` per key press. Terms are sorted, so a prefix is a binary search and a range of
// postings: no index is built at runtime, and a query allocates almost nothing.

import { fuzzy } from './palette'

export interface SearchEntry {
  title: string
  url: string
  /** Fixed group names keep their order across queries. */
  group: string
  /** Static rank, 0 to 1. */
  rank?: number
  /** What it sits under, shown beside it: a page's title for a heading. */
  parent?: string | undefined
  /** Words shown beside the title, indexed with it. */
  text?: string | undefined
  /** Words to index and not show. */
  keywords?: string
}

export interface SearchWire {
  groups: string[]
  /** [title, url, group, rank × 100, parent, text] */
  docs: [string, string, number, number, (string | undefined)?, (string | undefined)?][]
  /** Sorted, newline-separated. */
  terms: string
  /** For each term, its doc ids as base-36 deltas; `,` between ids, `;` between terms. */
  post: string
}

export interface SearchHit {
  title: string
  url: string
  group: string
  parent?: string | undefined
  text?: string | undefined
  score: number
  /** From the fallback for a typo, not from the index. */
  fuzzy?: boolean
}

export interface SearchIndex {
  wire: SearchWire
  terms: string[]
  lower: string[]
  starts: Int32Array
  post: Int32Array
  seen: Int32Array
  run: number
}

/** The words a string is found by: lowercased, split on punctuation and at camelCase humps, with the whole word kept. */
export function words(text: string) {
  const out = new Set<string>()
  for (const raw of text.match(/[\p{L}\p{N}_$]+/gu) ?? []) {
    out.add(raw.toLowerCase())
    for (const part of raw.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])|\d+/g) ?? []) out.add(part.toLowerCase())
  }
  return out
}

/** For a build: entries to the wire format. */
export function buildIndex(entries: SearchEntry[]): SearchWire {
  const groups = [...new Set(entries.map(e => e.group))]
  const byTerm = new Map<string, number[]>()
  entries.forEach((e, id) => {
    for (const w of words(`${e.title} ${e.keywords ?? ''} ${e.text ?? ''}`)) {
      if (!byTerm.has(w)) byTerm.set(w, [])
      byTerm.get(w)!.push(id)
    }
  })
  const terms = [...byTerm.keys()].sort()
  const post = terms.map(t => byTerm.get(t)!.map((id, i, all) => (id - (i ? all[i - 1]! : 0)).toString(36)).join(',')).join(';')
  return {
    groups,
    docs: entries.map(e => [e.title, e.url, groups.indexOf(e.group), Math.round((e.rank ?? 0.5) * 100), e.parent, e.text]),
    terms: terms.join('\n'),
    post,
  }
}

/** The wire format to typed arrays, once. */
export function openIndex(wire: SearchWire): SearchIndex {
  const terms = wire.terms ? wire.terms.split('\n') : []
  const starts = new Int32Array(terms.length + 1)
  const post = new Int32Array(wire.post.length) // more than enough: every id takes a character and a separator
  const text = wire.post
  let at = 0, value = 0, last = 0, term = 0, any = false
  for (let i = 0; i <= text.length; i++) {
    const c = i < text.length ? text.charCodeAt(i) : 59
    if (c === 44 || c === 59) {
      if (any) post[at++] = last += value
      value = 0
      any = false
      if (c === 59) { starts[++term] = at; last = 0 }
    } else {
      value = value * 36 + (c < 58 ? c - 48 : c - 87)
      any = true
    }
  }
  return { wire, terms, lower: wire.docs.map(d => d[0].toLowerCase()), starts, post: post.subarray(0, at), seen: new Int32Array(wire.docs.length), run: 0 }
}

function lowerBound(terms: string[], q: string) {
  let lo = 0, hi = terms.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (terms[mid]! < q) lo = mid + 1
    else hi = mid
  }
  return lo
}

const hitOf = (ix: SearchIndex, id: number, score: number, isFuzzy?: boolean): SearchHit => {
  const d = ix.wire.docs[id]!
  return { title: d[0], url: d[1], group: ix.wire.groups[d[2]]!, parent: d[4], text: d[5], score, ...(isFuzzy && { fuzzy: true }) }
}

/** The best `limit` matches: every word of `query` as a prefix, ranked exact, title prefix, word in the title, the rest. */
export function searchIndex(ix: SearchIndex, query: string, limit = 40): SearchHit[] {
  const q = query.trim().toLowerCase()
  const parts = (q.match(/[\p{L}\p{N}_$]+/gu) ?? []).slice(0, 8)
  if (!parts.length) return []
  const mark = ++ix.run
  const found: number[] = []
  parts.forEach((part, n) => {
    const from = lowerBound(ix.terms, part)
    for (let t = from; t < ix.terms.length && ix.terms[t]!.startsWith(part); t++) {
      for (let p = ix.starts[t]!;  p < ix.starts[t + 1]!; p++) {
        const id = ix.post[p]!
        // Seen by every earlier word, or (for the first word) not seen yet.
        if (ix.seen[id] === mark * 16 + n) {
          ix.seen[id] = mark * 16 + n + 1
          if (n === parts.length - 1) found.push(id)
        }
        else if (n === 0 && ix.seen[id] !== mark * 16 + 1) {
          ix.seen[id] = mark * 16 + 1
          if (parts.length === 1) found.push(id)
        }
      }
    }
  })
  const scored = found.map(id => {
    const t = ix.lower[id]!
    const base = t === q ? 1000 : t.startsWith(q) ? 600 : (t.includes(` ${q}`) || t.includes(`.${q}`)) ? 300 : t.includes(q) ? 200 : 100
    return { id, score: base * (0.5 + ix.wire.docs[id]![3] / 100) - t.length / 100 }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(s => hitOf(ix, s.id, s.score))
}

/** Only when the index found nothing: letters in order, against titles. Slower, and a result the caller should label. */
export function fuzzyIndex(ix: SearchIndex, query: string, limit = 8): SearchHit[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, '')
  if (q.length < 3) return []
  const out: { id: number; score: number }[] = []
  ix.lower.forEach((t, id) => {
    const f = fuzzy(q, t)
    if (f && f.score >= q.length * 1.4) out.push({ id, score: f.score - t.length / 50 })
  })
  return out.sort((a, b) => b.score - a.score).slice(0, limit).map(s => hitOf(ix, s.id, s.score, true))
}
