// One diagnostic shape for every command (PLAN §3.5, §7: code, location, why, fix).
//
// { code, severity, owner, file, span: [line, col, endLine, endCol], offset: [start, end], why, fix: { text, safe?, edits? }, docs }
//
// Lines and columns are 1-based, columns in UTF-16 units (what editors count). `offset` is UTF-16 indices into the
// file's text, so `text.slice(...offset)` is the flagged code. Edits use the same two forms.

import { entry } from './catalog.mjs'

/** Position helpers over one file's text. The compiler reports UTF-8 byte offsets; JS strings index UTF-16. */
export function positions(text) {
  const bytes = Buffer.from(text)
  const ascii = bytes.length === text.length
  const lineStarts = [0]
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lineStarts.push(i + 1)
  const fromByte = (b) => (ascii ? b : bytes.subarray(0, b).toString('utf8').length)
  const lineCol = (index) => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= index) lo = mid
      else hi = mid - 1
    }
    return [lo + 1, index - lineStarts[lo] + 1]
  }
  const span = (start, end) => [...lineCol(start), ...lineCol(end)]
  return { fromByte, lineCol, span }
}

export function diagnostic({
  code,
  severity,
  file,
  span = [1, 1, 1, 1],
  offset,
  why,
  help,
  fix,
  related,
  owner = 'core',
}) {
  const known = entry(code)
  const d = { code, severity: severity ?? known?.severity ?? 'error', owner, file, span }
  if (offset) d.offset = offset
  d.why = why
  d.fix = { text: help ?? known?.fix ?? '', ...fix }
  if (related?.length) d.related = related
  d.docs = `weft docs ${code}`
  return d
}

/** Span of `needle` in `text` (a task name, a plugin name), preferring it as a key, then as a quoted string; else the file start. */
export function locate(text, needle) {
  if (!needle || !text) return { span: [1, 1, 1, 1] }
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const re of [
    new RegExp(`(?<![\\w$.-])${esc}(?=\\s*:)`),
    new RegExp(`(['"\`])${esc}\\1`),
    new RegExp(esc),
  ]) {
    const m = re.exec(text)
    if (!m) continue
    const at = m.index + (m[0].length - needle.length) / 2
    return { span: positions(text).span(at, at + needle.length), offset: [at, at + needle.length] }
  }
  return { span: [1, 1, 1, 1] }
}

export function summarize(diagnostics) {
  const byCode = {}
  for (const d of diagnostics) byCode[d.code] = (byCode[d.code] ?? 0) + 1
  return {
    errors: diagnostics.filter((d) => d.severity === 'error').length,
    warnings: diagnostics.filter((d) => d.severity === 'warning').length,
    byCode,
  }
}

export function sortDiagnostics(diagnostics) {
  return diagnostics.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.span[0] - b.span[0] ||
      a.span[1] - b.span[1] ||
      a.code.localeCompare(b.code),
  )
}

/** Human text for stderr: `file:line:col  CODE severity  why` then the fix. */
export function formatHuman(diagnostics) {
  return diagnostics
    .map(
      (d) =>
        `${d.file}:${d.span[0]}:${d.span[1]}  ${d.code} ${d.severity}  ${d.why}\n    fix: ${d.fix.text}${d.fix.edits ? ' (autofix)' : ''}`,
    )
    .join('\n')
}
