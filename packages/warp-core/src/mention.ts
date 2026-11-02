// MentionsInput's text model (04 MentionsInput; inputs-rich.html:2367). The textarea shows names; the value keeps tokens
// as `@[Ada Lovelace](user:ada)`. These helpers map one to the other, and keep tokens in step as the text is edited.

/** Something that can be mentioned. */
export interface MentionItem { id: string; label: string; meta?: string; kind?: string }
/** A token in the shown text: `[start, end)` of `@Ada Lovelace`, with what it stands for. */
export interface MentionMark { start: number; end: number; token: string }

const TOKEN = /([^\s\w])\[([^\]]+)\]\(([^)]+)\)/g
const KINDS: Record<string, string> = { '@': 'user', '#': 'channel' }

/** The markup a mention serializes to. */
export const mentionToken = (trigger: string, item: MentionItem) => `${trigger}[${item.label.replace(/[\][]/g, '')}](${item.kind ?? KINDS[trigger] ?? 'item'}:${item.id})`

/** A value's shown text and where its tokens landed in it. */
export function parseMentions(value: string) {
  const marks: MentionMark[] = []
  let text = ''
  let from = 0
  for (const m of value.matchAll(TOKEN)) {
    text += value.slice(from, m.index)
    const shown = m[1]! + m[2]!
    marks.push({ start: text.length, end: text.length + shown.length, token: m[0] })
    text += shown
    from = m.index + m[0].length
  }
  return { text: text + value.slice(from), marks }
}

/** `text` with its marks written as mention markup. */
export function serializeMentions(text: string, marks: readonly MentionMark[]) {
  let out = ''
  let from = 0
  for (const m of [...marks].sort((a, b) => a.start - b.start)) {
    out += text.slice(from, m.start) + m.token
    from = m.end
  }
  return out + text.slice(from)
}

/** Marks after an edit from `was` to `now`: those after it shift, one it touched goes back to plain text. */
export function shiftMarks(marks: readonly MentionMark[], was: string, now: string) {
  let head = 0
  const max = Math.min(was.length, now.length)
  while (head < max && was[head] === now[head]) head++
  let tail = 0
  while (tail < max - head && was[was.length - 1 - tail] === now[now.length - 1 - tail]) tail++
  const end = was.length - tail
  const by = now.length - was.length
  return marks.flatMap(m => (m.end <= head ? [m] : m.start >= end ? [{ ...m, start: m.start + by, end: m.end + by }] : []))
}

/** The trigger the caret is in: a trigger character at a word start, then the query so far. */
export function findTrigger(text: string, caret: number, triggers: readonly string[], marks: readonly MentionMark[] = []) {
  const before = text.slice(0, caret)
  const m = /(?:^|\s)(\S)([\w-]*)$/.exec(before)
  if (!m || !triggers.includes(m[1]!)) return undefined
  const at = caret - m[2]!.length - 1
  if (marks.some(k => at >= k.start && at < k.end)) return undefined
  return { trigger: m[1], query: m[2], at }
}

const MIRRORED = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'boxSizing', 'tabSize', 'textIndent', 'textTransform'] as const

/** Where a text index sits in a textarea, in px from its top left: a hidden mirror measures it (04 MentionsInput). */
export function caretPoint(area: HTMLTextAreaElement, index: number) {
  const doc = area.ownerDocument
  const cs = getComputedStyle(area)
  const mirror = doc.createElement('div')
  for (const k of MIRRORED) mirror.style[k] = cs[k]
  mirror.style.cssText += `;position:absolute;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;inline-size:${area.offsetWidth}px;block-size:auto;top:0;left:-9999px`
  mirror.textContent = area.value.slice(0, index)
  const mark = doc.createElement('span')
  mark.textContent = '​'
  mirror.append(mark)
  doc.body.append(mirror)
  const point = { x: mark.offsetLeft, y: mark.offsetTop + mark.offsetHeight - area.scrollTop }
  mirror.remove()
  return point
}
