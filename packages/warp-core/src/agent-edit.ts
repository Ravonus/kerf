// Editing and completion helpers for agent input.
/** The changed lines between two argument texts, as "- " and "+ " lines; empty when they match (07 §1.3). */
export function argsDiff(before: string, after: string): string[] {
  if (before === after) return []
  const a = before.split('\n'),
    b = after.split('\n')
  const lcs = a.map(() => Array<number>(b.length + 1).fill(0))
  lcs.push(Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
  const out: string[] = []
  let i = 0,
    j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i++
      j++
    } else if (j >= b.length || (i < a.length && lcs[i + 1]![j]! >= lcs[i]![j + 1]!))
      out.push(`- ${a[i++]}`)
    else out.push(`+ ${b[j++]}`)
  }
  return out
}

/** The open `/` or `@` token at the caret: `/` only at the start of the message, `@` at the start of a word. */
export function suggestQuery(text: string, caret: number) {
  const m = /(^|\s)([/@])([^\s/@]*)$/.exec(text.slice(0, caret))
  if (!m || (m[2] === '/' && m.index + m[1]!.length !== 0)) return null
  return { trigger: m[2] as '/' | '@', query: m[3]!.toLowerCase(), start: m.index + m[1]!.length }
}

/** Replace the token from `start` to the caret with `value` plus a space. */
export function applySuggest(text: string, start: number, caret: number, value: string) {
  const head = text.slice(0, start) + value + ' '
  return { text: head + text.slice(caret), caret: head.length }
}
