export const usageError = (message) => Object.assign(new Error(message), { code: 'E_USAGE' })

const words = (s) =>
  s
    .toLowerCase()
    .split(/[\s\-_.:/=,]+|(?<=[a-z])(?=[A-Z])/)
    .filter(Boolean)

/** Edit distance with adjacent swaps as one edit (`ordre` → `order`). */
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (__, j) => (i ? (j ? 0 : i) : j)),
  )
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  return d[a.length][b.length]
}

/** The names closest to `word` (edit distance within a third of its length, or containing it). */
export function closest(word, names, n = 3) {
  const w = word.toLowerCase()
  const limit = Math.max(1, Math.floor(w.length / 3))
  return names
    .map((x) => [distance(w, x.toLowerCase()), x])
    .filter(([d, x]) => d <= limit || x.toLowerCase().includes(w) || w.includes(x.toLowerCase()))
    .sort((a, b) => a[0] - b[0])
    .slice(0, n)
    .map(([, x]) => x)
}

/**
 * `kerf style find <query>`: the groups that fit, best first. Every word of the query must hit the group's name,
 * doc, parts, axes, values, states or tokens (a name word one typo off counts); with no such group, groups that hit
 * any word.
 */
export function findGroups(matrix, query) {
  const terms = words(query ?? '')
  if (!terms.length)
    throw usageError(
      'kerf style find <query>: say what the thing is (`card`, `status badge`, `critical`)',
    )
  const score = (name, g) => {
    const fields = [
      [words(name), 30],
      [words(g.doc ?? ''), 10],
      [[...g.parts, ...g.states, ...Object.keys(g.axes)].flatMap(words), 8],
      [
        Object.values(g.axes)
          .flatMap((v) => (Array.isArray(v) ? v : []))
          .flatMap(words),
        6,
      ],
      [g.tokens.flatMap(words), 4],
    ]
    let total = name === query ? 100 : 0
    const matched = []
    let hits = 0
    for (const t of terms) {
      let best = 0
      let why = null
      for (const [ws, weight] of fields) {
        for (const w of ws) {
          const s =
            w === t
              ? weight
              : w.startsWith(t) || (t.length > 3 && w.includes(t))
                ? weight * 0.7
                : weight >= 30 && t.length > 3 && distance(w, t) === 1
                  ? weight * 0.5
                  : 0
          if (s > best) [best, why] = [s, w]
        }
      }
      if (best) {
        hits++
        matched.push(why)
      }
      total += best
    }
    return { total, hits, matched: [...new Set(matched)] }
  }
  const all = Object.entries(matrix.groups)
    .map(([name, g]) => ({ name, g, ...score(name, g) }))
    .filter((x) => x.total > 0)
  const full = all.filter((x) => x.hits === terms.length)
  const ranked = (full.length ? full : all).sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name),
  )
  // A name or doc hit outranks groups that only share a token (`row` → product-row, not every `layout: row`).
  const picked = ranked.filter((x) => x.total >= (ranked[0]?.total ?? 0) / 4)
  return {
    query,
    groups: picked.map(({ name, g, total, matched }) => ({
      name,
      score: Math.round(total),
      matched,
      doc: g.doc,
      file: g.file,
      import:
        g.binding && g.exported ? { name: g.binding, from: g.file.replace(/:\d+$/, '') } : null,
      axes: g.axes,
      defaults: g.defaults,
      parts: g.parts,
      states: g.states,
      uses: g.used.length,
      similar: matrix.similar
        .filter((s) => s[0] === name || s[1] === name)
        .map((s) => (s[0] === name ? s[1] : s[0])),
    })),
    partial: !full.length && all.length > 0,
    total: Object.keys(matrix.groups).length,
  }
}
