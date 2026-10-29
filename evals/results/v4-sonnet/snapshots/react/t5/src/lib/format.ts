// Formatters for everything the watchlist shows. In production they are expensive (locale data, server-side
// caches), so the app is measured by how often it calls them: `work.calls` counts every call. Use them for every
// price, change and sparkline you show. Don't edit this file.

export const work = { calls: 0 }

/** `$1,234.50` style, two decimals (no grouping here). */
export function money(n: number): string {
  work.calls++
  return `$${n.toFixed(2)}`
}

/** `+1.25%` / `-0.40%`. */
export function pct(n: number): string {
  work.calls++
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

/** SVG path data for a sparkline of `values`, oldest first, scaled to `width` × `height`. */
export function sparkline(values: number[], width = 60, height = 16): string {
  work.calls++
  if (values.length === 0) return ''
  const min = Math.min(...values)
  const span = Math.max(...values) - min || 1
  const step = values.length > 1 ? width / (values.length - 1) : 0
  return values.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`).join(' ')
}
