const { toSource, inGenerated } = require('../src/infer/shadow.cjs')

const SPANS = new Set([
  'textSpan',
  'contextSpan',
  'triggerSpan',
  'applicableSpan',
  'applicableToSpan',
  'optionalReplacementSpan',
  'replacementSpan',
  'fileTextChangesSpan',
  'span',
])

function createMapping(ts, engine, textOf, sources) {
  const mapOf = (f) => engine.maps.get(f)
  const sourceFile = (f) => {
    const text = engine.texts.get(f) ?? textOf(f)
    const hit = sources.get(f)
    if (hit?.text === text) return hit.sf
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    sources.set(f, { text, sf })
    return sf
  }
  const spanBack = (map, s) => {
    const start = toSource(map, s.start)
    return { start, length: toSource(map, s.start + s.length) - start }
  }
  /** Walks a result and maps every span, using the nearest `fileName` above it. */
  function back(value, file) {
    if (Array.isArray(value)) return value.map((v) => back(v, file))
    if (!value || typeof value !== 'object') return value
    const here = typeof value.fileName === 'string' ? value.fileName : file
    const map = mapOf(here)
    const out = {}
    for (const k of Object.keys(value)) {
      const v = value[k]
      if (SPANS.has(k) && map && v && typeof v.start === 'number') out[k] = spanBack(map, v)
      else if (k === 'symbol' || k === 'file' || typeof v === 'function') out[k] = v
      else out[k] = back(v, here)
    }
    return out
  }
  const diag = (d, f) => {
    const file = d.file?.fileName ?? f
    const map = mapOf(file)
    if (!map || d.start === undefined) return d
    const related = d.relatedInformation?.map((r) => diag(r, f))
    const start = toSource(map, d.start)
    return {
      ...d,
      file: sourceFile(file),
      start,
      length: toSource(map, d.start + d.length) - start,
      relatedInformation: related,
    }
  }
  const inside = (d, f) => {
    const m = mapOf(f)
    return !(m && d.start !== undefined && inGenerated(m, d.start, d.length ?? 0))
  }
  return { mapOf, sourceFile, back, diag, inside }
}

module.exports = { createMapping }
