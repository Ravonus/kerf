// CodeInput's editing and its highlighted layer (04 CodeInput; inputs-rich.html:2223): the keys a code field changes,
// a small tokenizer, and the layer itself, drawn with the CSS Custom Highlight API so no key press builds a span.

/** Indent or outdent. A selection across lines moves whole lines; a caret takes one indent. */
export function indented(text: string, start: number, end: number, size: number, outdent = false) {
  const pad = ' '.repeat(size)
  const from = text.lastIndexOf('\n', start - 1) + 1
  if (!outdent && start === end)
    return { from: start, to: end, insert: pad, start: start + size, end: start + size }
  const stop = end > start && text[end - 1] === '\n' ? end - 1 : end
  const lines = text.slice(from, stop).split('\n')
  const next = lines.map((l) => (outdent ? l.replace(new RegExp(`^ {1,${size}}`), '') : pad + l))
  const insert = next.join('\n')
  const first = next[0]!.length - lines[0]!.length
  return {
    from,
    to: stop,
    insert,
    start: Math.max(from, start + first),
    end: end + insert.length - (stop - from),
  }
}

/** The kinds of span the highlighter colours. */
export type CodeToken = 'string' | 'number' | 'keyword' | 'comment'
/** A coloured stretch of text, by offset. */
export interface CodeSpan {
  kind: CodeToken
  start: number
  end: number
}

const KEYWORDS =
  'import|from|export|default|const|let|var|function|return|if|else|for|while|class|new|await|async|type|interface|select|where|insert|update|delete|join|order|group|by|true|false|null|undefined'
const RULES: Record<string, RegExp> = {
  json: /("(?:[^"\\\n]|\\.)*")(\s*:)?|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false|null)\b/g,
  code: new RegExp(
    `((?:"(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`))()|(\\b\\d+(?:\\.\\d+)?\\b)|\\b(${KEYWORDS})\\b|(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/|^\\s*#[^\\n]*|--[^\\n]*)`,
    'gim',
  ),
}

/** The spans to colour. Keys of a JSON object stay plain, so its values read first. */
export function tokenize(text: string, language = 'code') {
  const rule = RULES[language] ?? RULES.code!
  const spans: CodeSpan[] = []
  for (const m of text.matchAll(rule)) {
    const kind: CodeToken | undefined = m[1]
      ? m[2]
        ? undefined
        : 'string'
      : m[3]
        ? 'number'
        : m[4]
          ? 'keyword'
          : m[5]
            ? 'comment'
            : undefined
    if (kind) spans.push({ kind, start: m.index, end: m.index + (m[1]?.length ?? m[0].length) })
  }
  return spans
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }
const esc = (s: string) => s.replace(/[&<>]/g, (c) => HTML_ESCAPES[c]!)
const TSX_KEYWORDS =
  'import|from|export|default|const|let|var|function|return|if|else|for|of|in|while|class|extends|new|await|async|type|interface|typeof|keyof|as|try|catch|throw|yield'
const SHELL = /(#[^\n]*)|("[^"\n]*"|'[^'\n]*')|(?<![\w-])(--?[\w-]+)|^(\s*\w[\w-]*)/gm
const TSX = new RegExp(
  '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)' + // comment
    '|("(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)' + // string
    '|\\b(\\d+(?:\\.\\d+)?)\\b' + // number
    `|\\b(${TSX_KEYWORDS}|true|false|null|undefined)\\b` + // keyword
    '|(?<=<\\/?)([A-Za-z][\\w.-]*)|\\b([A-Z]\\w*)\\b', // tag, then a capitalised name
  'g',
)

/**
 * Code as HTML, for a build or a server render: spans `.c` comment, `.s` string, `.n` number, `.k` keyword and `.t` type or
 * tag, one `data-part="line"` per line (`[data-scope="codeblock"]`). Escaped, so it's safe in `innerHTML`.
 */
export function highlight(text: string, language = 'tsx') {
  const shell = language === 'sh' || language === 'bash' || language === 'shell'
  const json = language === 'json'
  const plain = !shell && !json && !/^[jt]sx?$|^mjs$|^jsonc$/.test(language)
  const out: string[] = []
  let at = 0
  const span = (cls: string, from: number, to: number) => {
    if (from > at) out.push(esc(text.slice(at, from)))
    out.push(`<span class="${cls}">${esc(text.slice(from, to))}</span>`)
    at = to
  }
  if (json)
    for (const t of tokenize(text, 'json'))
      span(t.kind === 'string' ? 's' : t.kind === 'number' ? 'n' : 'k', t.start, t.end)
  else if (shell)
    for (const m of text.matchAll(SHELL))
      span(m[1] ? 'c' : m[2] ? 's' : m[3] ? 't' : 'k', m.index, m.index + m[0].length)
  else if (!plain)
    for (const m of text.matchAll(TSX))
      span(m[1] ? 'c' : m[2] ? 's' : m[3] ? 'n' : m[4] ? 'k' : 't', m.index, m.index + m[0].length)
  out.push(esc(text.slice(at)))
  // A multi-line span closes and reopens at each newline, so every line stands alone.
  return out
    .join('')
    .replace(/\n$/, '')
    .split('\n')
    .reduce<{ lines: string[]; open: string }>(
      (acc, line) => {
        const opens = line.match(/<span class="[^"]*">/g) ?? []
        const closes = (line.match(/<\/span>/g) ?? []).length
        const unclosed = opens.length > closes ? opens.at(-1)! : ''
        const body = acc.open + line + (unclosed || (acc.open && closes === 0) ? '</span>' : '')
        acc.lines.push(`<span data-part="line">${body}</span>`)
        acc.open = unclosed || (acc.open && closes === 0 ? acc.open : '')
        return acc
      },
      { lines: [], open: '' },
    )
    .lines.join('')
}

// oxlint-disable no-control-regex -- a JSON string may not hold a raw control character
const JSON_ATOM =
  /"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y /* oxlint-enable no-control-regex */

/** Where JSON stops being JSON. V8 names a position only sometimes and short text never, so this walks it itself. */
function jsonStop(text: string) {
  let i = 0
  const space = () => {
    while (' \n\r\t'.includes(text[i] || '-')) i++
  }
  const atom = () => {
    JSON_ATOM.lastIndex = i
    return JSON_ATOM.test(text) && ((i = JSON_ATOM.lastIndex), true)
  }
  const list = (close: string, item: () => boolean) => {
    i++
    space()
    if (text[i] === close) return (i++, true)
    for (;;) {
      if (!item()) return false
      space()
      if (text[i] === close) return (i++, true)
      if (text[i] !== ',') return false
      i++
    }
  }
  const pair = () => {
    space()
    if (text[i] !== '"' || !atom()) return false
    space()
    if (text[i] !== ':') return false
    i++
    return value()
  }
  const value = (): boolean => {
    space()
    return text[i] === '{' ? list('}', pair) : text[i] === '[' ? list(']', value) : atom()
  }
  value()
  return i
}

/** A parse failure's line and message; null when the text is JSON. */
export function jsonProblem(text: string) {
  try {
    JSON.parse(text)
    return null
  } catch (err) {
    const message = (err as Error).message
      .replace(/^JSON\.parse:\s*/, '')
      .replace(/,? "[\s\S]*$/, '')
      .replace(/ (in JSON|at line|\(line)[\s\S]*$/, '')
    return { line: text.slice(0, jsonStop(text)).split('\n').length, message }
  }
}

const shared = new Map<CodeToken, Highlight>() // one Highlight per kind: the registry is per document, the rule per name

/**
 * The colour layer: `layer` is a `<pre aria-hidden>` behind a transparent textarea, holding the same text. Without the
 * API (or before it runs) the textarea paints its own text, so `data-painted` turns the swap on only where it works.
 */
export function codeLayer(
  root: HTMLElement,
  opts: { text: string; language?: string | undefined },
) {
  let o = opts
  const doc = root.ownerDocument
  const win = doc.defaultView!
  const layer = root.querySelector<HTMLElement>('[data-part="layer"]')!
  const area = root.querySelector('textarea')!
  const gutter = root.querySelector<HTMLElement>('[data-part="lines"]')
  const on = typeof win.Highlight === 'function' && !!win.CSS?.highlights
  let mine: [Highlight, Range][] = []
  let frame = 0
  const clear = () => {
    for (const [h, r] of mine) h.delete(r)
    mine = []
  }
  const draw = () => {
    frame = 0
    clear()
    const node = layer.firstChild
    if (!on || node?.nodeType !== 3) return
    for (const { kind, start, end } of tokenize(o.text, o.language)) {
      const name = `warp-code-${kind}`
      let h = shared.get(kind)
      if (!h || !win.CSS.highlights.has(name)) {
        h = new win.Highlight()
        shared.set(kind, h)
        win.CSS.highlights.set(name, h)
      }
      const r = doc.createRange()
      r.setStart(node, start)
      r.setEnd(node, end)
      h.add(r)
      mine.push([h, r])
    }
  }
  const later = () => {
    frame ||= win.requestAnimationFrame(draw)
  }
  const onScroll = () => {
    layer.style.translate = `${-area.scrollLeft}px ${-area.scrollTop}px`
    if (gutter) gutter.scrollTop = area.scrollTop
  }
  area.addEventListener('scroll', onScroll, { passive: true })
  root.toggleAttribute('data-painted', on)
  draw()
  return {
    update(next: typeof opts) {
      o = next
      later()
    },
    destroy() {
      area.removeEventListener('scroll', onScroll)
      win.cancelAnimationFrame(frame)
      clear()
    },
  }
}
