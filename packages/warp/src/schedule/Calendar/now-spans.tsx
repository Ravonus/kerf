/**
 * Where a day's now line shows. It runs under the events, so where events cover the minute it would peek out only as a
 * tick at the column's edge and a dash in the gap past the last lane, marks that read as strays rather than a line.
 * Instead it is drawn in the lanes that are free at that minute, from lane edge to lane edge, and not at all when every
 * lane is taken (the gutter's label still says the time). Its dot stays on the column's edge, so only a run from it.
 */
export function nowSpans(
  now: number | null,
  segs: { id: string; s: number; e: number }[],
  lanes: Map<string, { col: number; cols: number; span: number }>,
) {
  if (now === null) return []
  const over = segs
    .filter((s) => s.s <= now && s.e > now)
    .map((s) => lanes.get(s.id))
    .filter((l): l is { col: number; cols: number; span: number } => !!l)
  if (!over.length) return [{ a: 0, b: 1, inset: '' }]
  const cols = Math.max(...over.map((l) => l.cols))
  const taken = Array.from({ length: cols }, () => false)
  for (const l of over) for (let k = l.col; k < Math.min(cols, l.col + l.span); k++) taken[k] = true
  const runs: { a: number; b: number; inset: string }[] = []
  for (let k = 0; k < cols; k++) {
    if (taken[k]) continue
    const a = k
    while (k < cols && !taken[k]) k++
    const b = k
    // the lane geometry of [data-part="event"] in calendar.css: (100% - 6px) shared by the lanes, 2px in from each
    const start = a === 0 ? '0px' : `calc((100% - 6px) * ${a} / ${cols} + 2px)`
    const end = b === cols ? '0px' : `calc(100% - (100% - 6px) * ${b} / ${cols})`
    runs.push({ a, b, inset: `inset-inline:${start} ${end}` })
  }
  return runs
}
