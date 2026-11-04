// Keep other Oxlint and Clippy diagnostics while routing length findings through the baseline.
import { isAbsolute, join, relative } from 'node:path'
import { matchedLength, matchedRustLength, root } from './lengths.mjs'

const lintLine = d => `${d.filename}:${d.labels?.[0]?.span.line ?? 0} ${d.code ?? 'plugin'} ${d.message.split('\n')[0]}`

export function lintProblems(report, lengths) {
  const diagnostics = report.diagnostics.filter(d => {
    const kind = d.code === 'eslint(max-lines)' ? 'file' : d.code === 'eslint(max-lines-per-function)' ? 'function' : null
    return !kind || !matchedLength(lengths.findings, d.filename, d.labels?.[0]?.span.line ?? 0, kind)
  })
  return [...lengths.problems, ...new Set(diagnostics.map(lintLine))]
}

/** Parse Cargo JSON and suppress only a matched, baseline-checked too_many_lines diagnostic. */
export function clippyProblems(cwd, result, lengths) {
  const problems = [], errors = [], parsed = []
  for (const line of (result.stdout ?? result.out).split('\n')) {
    let item
    try { item = JSON.parse(line) } catch { if (/^error: (?!could not compile)/.test(line)) errors.push(line); continue }
    if (item.reason !== 'compiler-message') continue
    const message = item.message
    if (!['warning', 'error', 'failure-note'].includes(message.level)) continue
    const span = message.spans?.find(s => s.is_primary) ?? message.spans?.[0]
    const path = span && (isAbsolute(span.file_name) ? relative(root, span.file_name) : join(cwd, span.file_name))
    if (message.level === 'warning' && message.code?.code === 'clippy::too_many_lines' && span && matchedRustLength(lengths.findings, path, span.line_start, span.line_end ?? span.line_start)) continue
    parsed.push(`${cwd}: ${message.rendered?.trim() || message.message}`)
  }
  for (const line of (result.stderr ?? '').split('\n')) if (/^error: (?!could not compile)/.test(line)) errors.push(line)
  problems.push(...parsed, ...errors)
  if (result.code !== 0 && !problems.length) problems.push(`${cwd}: cargo clippy failed: ${result.out.trim().split('\n').slice(-10).join('\n')}`)
  return problems
}
