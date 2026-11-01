// A shadow is the source with a few spans replaced (annotations in, `bind:` out). Nothing else moves, so mapping a
// position is a binary search over the edits, in both directions, and it never needs a source map. Research 41 §5.

/** @param {string} text @param {{ start: number, end: number, text: string }[]} edits sorted, not overlapping */
function shadow(text, edits) {
  const sorted = [...edits].sort((a, b) => a.start - b.start)
  const parts = []
  const segments = [] // { src, out, len }: runs that are unchanged
  let at = 0, out = 0
  for (const e of sorted) {
    const len = e.start - at
    segments.push({ src: at, out, len })
    parts.push(text.slice(at, e.start), e.text)
    out += len + e.text.length
    at = e.end
  }
  segments.push({ src: at, out, len: text.length - at })
  parts.push(text.slice(at))
  return { text: parts.join(''), segments, edits: sorted }
}

function find(segments, pos, key) {
  let lo = 0, hi = segments.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (segments[mid][key] <= pos) lo = mid
    else hi = mid - 1
  }
  return segments[lo]
}

/** Source position to shadow position. */
const toShadow = (map, pos) => { const s = find(map.segments, pos, 'src'); return s.out + Math.min(pos - s.src, s.len) }

/** Shadow position to source position. A position inside generated text lands where that text was inserted. */
const toSource = (map, pos) => { const s = find(map.segments, pos, 'out'); return s.src + Math.min(pos - s.out, s.len) }

/** Whether a shadow span is inside text the source doesn't have. */
const inGenerated = (map, start, length) => {
  const s = find(map.segments, start, 'out')
  return start >= s.out + s.len && length >= 0
}

const identity = text => ({ text, segments: [{ src: 0, out: 0, len: text.length }], edits: [] })

module.exports = { shadow, toShadow, toSource, inGenerated, identity }
