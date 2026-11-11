// Where a capture scrolls to: pixels, or a place in a section the page's map names. The same stop, the same offset.

const key = (text) => (/^\d+$/.test(text) ? Number(text) : text)

/** A stop from text: `1200` px, `hero@0.5` or `2@0` (a section's id or index at a share), `hero+300` px past its top. */
export function parseStop(text) {
  const t = String(text).trim()
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t)
  const at = /^(.+)@(\d*\.?\d+)$/.exec(t)
  if (at) return { section: key(at[1] ?? ''), at: Number(at[2]) }
  const px = /^(.+?)([+-]\d+(?:\.\d+)?)$/.exec(t)
  if (px) return { section: key(px[1] ?? ''), px: Number(px[2]) }
  throw new Error(`kerf capture: a stop is <px>, <section>@<0..1> or <section>+<px>, not "${t}"`)
}

function find(map, section) {
  const found =
    typeof section === 'number' ? map.sections[section] : map.sections.find((s) => s.id === section)
  if (!found) throw new Error(`kerf capture: the page has no section ${JSON.stringify(section)}`)
  return found
}

/** A stop's offset, clamped: a tall section's pass is top-at-top to bottom-at-bottom, a short one's enter to leave. */
export function resolveStop(stop, map) {
  const vh = map.viewportHeight
  const clamp = (y) => Math.round(Math.min(Math.max(0, map.documentHeight - vh), Math.max(0, y)))
  if (typeof stop === 'number') return clamp(stop)
  const s = find(map, stop.section)
  if ('px' in stop) return clamp(s.top + stop.px)
  const tall = s.height > vh
  const from = tall ? s.top : s.top - vh
  const to = tall ? s.top + s.height - vh : s.top + s.height
  return clamp(from + (to - from) * stop.at)
}

/** A stop as part of a file name: `y1200`, `hero@0.50`, `2+300`. */
export function stopName(stop) {
  if (typeof stop === 'number') return `y${Math.round(stop)}`
  const name = String(stop.section).replace(/[^\w-]+/g, '-')
  return 'px' in stop
    ? `${name}${stop.px < 0 ? '' : '+'}${stop.px}`
    : `${name}@${stop.at.toFixed(2)}`
}
