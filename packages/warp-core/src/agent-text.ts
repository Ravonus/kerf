// ---- text: a minimal safe default until warp has a Markdown component ----------------------------------------------

/** A block of answer text once parsed. */
export type TextBlock =
  | { kind: 'p'; at: number; text: string }
  | { kind: 'ul'; at: number; items: { at: number; text: string }[] }
  | { kind: 'code'; at: number; lang: string; text: string; open: boolean }
/** A run of inline answer text: plain, code, or a citation number. */
export type Inline =
  | { kind: 'text' | 'code'; at: number; text: string }
  | { kind: 'cite'; at: number; n: number }

/** Paragraphs, `- ` lists and code fences. A fence with no close yet is already a code block (07 §1.3). */
export function parseText(text: string): TextBlock[] {
  const out: TextBlock[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const fence = /^```(\S*)/.exec(line)
    if (fence) {
      const body: string[] = []
      let j = i + 1
      while (j < lines.length && !/^```\s*$/.test(lines[j]!)) body.push(lines[j++]!)
      out.push({
        kind: 'code',
        at: i,
        lang: fence[1]!,
        text: body.join('\n'),
        open: j >= lines.length,
      })
      i = j
    } else if (/^[-*] /.test(line)) {
      const last = out.at(-1)
      const item = { at: i, text: line.slice(2) }
      if (last?.kind === 'ul' && lines[i - 1] !== '') last.items.push(item)
      else out.push({ kind: 'ul', at: i, items: [item] })
    } else if (line.trim()) {
      const last = out.at(-1)
      if (last?.kind === 'p' && lines[i - 1]!.trim()) last.text += `\n${line}`
      else out.push({ kind: 'p', at: i, text: line })
    }
  }
  return out
}

/** Inline code and `[n]` cites; everything else stays text, so nothing in a model's output becomes markup. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  const re = /`([^`\n]+)`|\[(\d+)\]/g
  let from = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > from) out.push({ kind: 'text', at: from, text: text.slice(from, m.index) })
    out.push(
      m[1] !== undefined
        ? { kind: 'code', at: m.index, text: m[1] }
        : { kind: 'cite', at: m.index, n: Number(m[2]) },
    )
    from = m.index + m[0].length
  }
  if (from < text.length) out.push({ kind: 'text', at: from, text: text.slice(from) })
  return out
}
