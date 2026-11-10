// Choosing the snap point a scroll comes to rest on. Pure: the points come in already measured.

/**
 * The point to rest at for a scroll that would end at `end`. `dir` (-1, 0, 1) is the way it was moving: a mandatory
 * snap never pulls back against it once the scroll has passed a point. Returns `end` when nothing applies.
 */
export function snapTo(
  points: readonly number[],
  end: number,
  o: { type?: 'mandatory' | 'proximity'; proximity?: number; dir?: number; max?: number } = {},
) {
  if (!points.length) return end
  const max = o.max ?? Infinity
  let best = end
  let gap = Infinity
  for (const raw of points) {
    const p = Math.min(max, Math.max(0, raw))
    const d = Math.abs(p - end)
    if (d < gap) {
      gap = d
      best = p
    }
  }
  if (o.type !== 'mandatory' && gap > (o.proximity ?? 120)) return end
  return best
}

/** The next point past `from` in direction `dir`, for a key press or a wheel notch under mandatory snapping. */
export function snapStep(points: readonly number[], from: number, dir: number, max: number) {
  const sorted = [...new Set(points.map((p) => Math.min(max, Math.max(0, p))))].sort(
    (a, b) => a - b,
  )
  if (dir > 0) return sorted.find((p) => p > from + 1) ?? Math.min(max, sorted.at(-1) ?? max)
  return sorted.findLast((p) => p < from - 1) ?? Math.max(0, sorted[0] ?? 0)
}
