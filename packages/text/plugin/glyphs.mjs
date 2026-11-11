// The characters a scoped face draws, read from the app's markup: the text inside every element that matches a
// simple selector (`.class`, `[attr="value"]` or a tag), or only each one's first letter. Text the source can't
// show (an expression, a prop) makes the scope unreadable, and the build keeps the face whole.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', '#39': "'" }
const TAG = /<([A-Za-z][\w.:-]*)((?:\s(?:[^<>{}]|\{[^{}]*\})*?)?)(\/?)>/g
const word = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Tests an opening tag for `.class`, `[attr="value"]` (a component's `role` is `data-role`) or `tag`. */
export function matcher(selector) {
  const cls = /^\.([\w-]+)$/.exec(selector)
  if (cls) {
    const re = new RegExp(
      `\\bclass(?:Name)?=\\{?["'\`][^"'\`]*(?<![\\w-])${word(cls[1])}(?![\\w-])`,
    )
    return (_, attrs) => re.test(attrs)
  }
  const attr = /^\[([\w-]+)=["']?([^"'\]]+)["']?\]$/.exec(selector)
  if (attr) {
    const [, name, value] = attr
    const re = (n) => new RegExp(`(?:^|\\s)${word(n)}=\\{?["'\`]${word(value)}["'\`]`)
    return (tag, attrs) =>
      re(name).test(attrs) || (name === 'data-role' && /^[A-Z]/.test(tag) && re('role').test(attrs))
  }
  if (/^[a-z][\w-]*$/.test(selector)) return (tag) => tag === selector
  throw new Error('must be .class, [attr="value"] or a tag')
}

/** The element's inner markup, up to its own closing tag. */
function inner(source, tag, from) {
  const open = new RegExp(`<${word(tag)}[\\s>/]|</${word(tag)}\\s*>`, 'g')
  open.lastIndex = from
  let depth = 1
  for (let m; (m = open.exec(source));) {
    depth += m[0][1] === '/' ? -1 : 1
    if (!depth) return source.slice(from, m.index)
  }
  return source.slice(from)
}

/** Markup as text, in order, with `null` where an expression stands. */
function pieces(markup) {
  const out = []
  let rest = markup.replace(/<[^<>]*>/g, ' ')
  while (rest) {
    const at = rest.indexOf('{')
    out.push((at < 0 ? rest : rest.slice(0, at)).replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? m))
    if (at < 0) break
    let depth = 0
    let end = at
    for (; end < rest.length; end++) {
      depth += rest[end] === '{' ? 1 : rest[end] === '}' ? -1 : 0
      if (!depth) break
    }
    const expr = rest.slice(at + 1, end).trim()
    const literal = /^(["'`])((?:(?!\1)(?:[^\\$]|\$(?!\{))|\\.)*)\1$/.exec(expr)
    if (literal) out.push(literal[2])
    else if (!/^\/\*[\s\S]*\*\/$/.test(expr)) out.push(null)
    rest = rest.slice(end + 1)
  }
  return out
}

/** The first letter as `::first-letter` takes it: any punctuation before it, then the letter or digit. */
function firstLetter(parts) {
  let text = ''
  for (const p of parts) {
    if (p === null) return null
    text += p
    const m = /^\s*([\p{P}]*[\p{L}\p{N}])/u.exec(text)
    if (m) return m[1]
  }
  return ''
}

/**
 * The characters inside every element `selector` matches in `source` (only each one's first letter with `first`),
 * or `{ unread }` naming the first element whose text is an expression or that matches nothing.
 */
export function scopedText(source, { selector, first = false }) {
  const match = matcher(selector)
  let text = ''
  let found = 0
  for (const m of source.matchAll(TAG)) {
    if (m[3] || !match(m[1], m[2])) continue
    found++
    const parts = pieces(inner(source, m[1], m.index + m[0].length))
    const got = first ? firstLetter(parts) : parts.includes(null) ? null : parts.join('')
    if (got === null) return { unread: `${m[0].slice(0, 60)}: its text is an expression` }
    text += got
  }
  if (!found) return { unread: `no element matches ${selector}` }
  return { text: [...new Set(text.replace(/\s+/g, ' '))].join('') }
}
