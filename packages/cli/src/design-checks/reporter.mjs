import { diagnostic, positions } from '../diag.mjs'
import { allowed } from './rules.mjs'

export function makeReporter(out) {
  const reporter = (file) => {
    const pos = positions(file.text)
    const allow = allowed(file.text)
    return (code, start, end, why, fix, severity) => {
      if (allow.has(`${code}:${pos.lineCol(start)[0]}`)) return
      const edits =
        fix &&
        (
          fix.edits ?? [{ start: fix.at?.[0] ?? start, end: fix.at?.[1] ?? end, text: fix.text }]
        ).map((e) => ({
          file: file.rel,
          span: pos.span(e.start, e.end),
          offset: [e.start, e.end],
          text: e.text,
        }))
      out.push(
        diagnostic({
          code,
          severity,
          file: file.rel,
          span: pos.span(start, end),
          offset: [start, end],
          why,
          fix: fix && { description: fix.description, safe: fix.safe, edits },
        }),
      )
    }
  }
  return reporter
}
