function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    row = next
  }
  return row[b.length]
}
/** The name nearest to a typo, for "did you mean": a prefix counts as one edit closer. */
export const closest = (name, names) =>
  names.reduce(
    (best, n) => {
      const d = distance(name, n) - (n.startsWith(name) ? 1 : 0)
      return d < best.d ? { n, d } : best
    },
    { n: null, d: Infinity },
  ).n
