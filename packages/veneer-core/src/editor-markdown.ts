// Safe HTML and Markdown conversion.
import { esc as escapeHtml } from '@kerf/core/markup'
import { safeUrl, unesc } from './editor-url'

const esc = (s: string) => escapeHtml(s, 'full')
// text keeps its entities (an editor's innerHTML is full of &nbsp;): in element content they can only ever be text
const escText = (s: string) =>
  s
    .replace(/&(?!#?\w+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const ALLOWED: Record<string, string> = {
  b: 'strong',
  strong: 'strong',
  i: 'em',
  em: 'em',
  s: 'del',
  strike: 'del',
  del: 'del',
  code: 'code',
  a: 'a',
  p: 'p',
  div: 'p',
  br: 'br',
  hr: 'hr',
  h1: 'h2',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  ul: 'ul',
  ol: 'ol',
  li: 'li',
  blockquote: 'blockquote',
  pre: 'pre',
  span: 'span',
}
const VOID = new Set(['br', 'hr'])
const DROPPED =
  /<(script|style|iframe|object|embed|template|noscript|svg|math)\b[\s\S]*?(?:<\/\1\s*>|$)/gi
const attr = (attrs: string, name: string) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs)
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined
}

/** A safe copy of `html`: every tag is rebuilt from the allow-list, the rest is text. Works with no DOM. */
export function sanitizeHtml(html: string) {
  let out = ''
  let from = 0
  const open: string[] = []
  const src = html.replace(/<!--[\s\S]*?(?:-->|$)/g, '').replace(DROPPED, '')
  for (const m of src.matchAll(/<(\/?)([a-z][a-z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi)) {
    out += escText(src.slice(from, m.index))
    from = m.index + m[0].length
    const tag = ALLOWED[m[2]!.toLowerCase()]
    if (!tag) continue
    if (m[1]) {
      const at = open.lastIndexOf(tag)
      if (at < 0) continue
      while (open.length > at) out += `</${open.pop()}>`
      continue
    }
    if (VOID.has(tag)) {
      out += `<${tag}>`
      continue
    }
    let attrs = ''
    if (tag === 'a') {
      const href = safeUrl(attr(m[3]!, 'href') ?? '')
      if (href) attrs = ` href="${esc(href)}" rel="noopener noreferrer"`
    }
    if (tag === 'span') {
      if (!/\bdata-mention\b/i.test(m[3]!)) {
        open.push(tag)
        out += '<span>'
        continue
      }
      const title = attr(m[3]!, 'title') ?? ''
      attrs = ` data-mention="" contenteditable="false" role="img" aria-label="Mention: ${esc(unesc(title))}"`
    }
    open.push(tag)
    out += `<${tag}${attrs}>`
  }
  out += escText(src.slice(from))
  while (open.length) out += `</${open.pop()}>`
  return out
}

function inline(s: string, target: string) {
  // code and links are set aside, so emphasis can't reach inside them
  const held: string[] = []
  const hold = (html: string) => `\u0000${held.push(html) - 1}\u0000`
  const styled = esc(s)
    .replace(/`([^`]+)`/g, (_, c) => hold(`<code data-scope="code">${c}</code>`))
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
      const ok = safeUrl(url)
      if (!ok) return text
      return hold(
        `<a href="${esc(ok)}"${/^https?:/i.test(ok) ? ` rel="noopener noreferrer"${target === '_blank' ? ' target="_blank"' : ''}` : ''}>${text}</a>`,
      )
    })
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
    .replace(/(^|\W)_(?!\s)(.+?)_(?=\W|$)/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
  // oxlint-disable-next-line no-control-regex -- NUL is the marker hold() writes
  return styled.replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[+i] ?? _)
}

const STARTS = /^(#{1,4}\s|```|>|\|.*\|\s*$|\s*[-*+]\s|\s*\d+[.)]\s|-{3,}\s*$)/
const TABLE_RULE = /^\|?(\s*:?-+:?\s*\|)+(\s*:?-+:?\s*)?$/
const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'))

/** Options for Markdown rendering. */
export interface MarkdownOptions {
  linkTarget?: string | undefined
  /** Replaces a fenced block's markup: a build's highlighter, say. It gets the raw text, and what it returns isn't escaped. */
  code?: ((text: string, language: string) => string) | undefined
  /** Keep a document's own levels (`#` is h1) and give each heading the id this returns. */
  heading?: (text: string, level: number) => string
}

/** The small safe renderer (04 Markdown). Raw HTML is escaped and shows as text; headings render one level down. */
export function markdownToHtml(
  source: string,
  { linkTarget = '_self', code, heading }: MarkdownOptions = {},
) {
  const L = source.replace(/\r/g, '').split('\n')
  let out = ''
  for (let i = 0; i < L.length;) {
    const l = L[i]!
    let m: RegExpExecArray | null
    if (l.startsWith('```')) {
      const lang = l.slice(3).trim()
      const buf: string[] = []
      for (i++; i < L.length && !L[i]!.startsWith('```'); i++) buf.push(L[i]!)
      i++
      if (code) out += code(buf.join('\n'), lang)
      else
        out += `<pre data-scope="codeblock"${lang ? ` data-lang="${esc(lang)}"` : ''} tabindex="0" aria-label="${esc(lang || 'Code')}"><code>${esc(buf.join('\n'))}</code></pre>`
    } else if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) {
      const tag = `h${m[1]!.length + (heading ? 0 : 1)}`
      out += `<${tag}${heading ? ` id="${esc(heading(m[2]!, m[1]!.length))}"` : ''}>${inline(m[2]!, linkTarget)}</${tag}>`
      i++
    } else if (l.includes('|') && TABLE_RULE.test(L[i + 1] ?? '')) {
      const head = cells(l)
      const align = cells(L[i + 1]!).map((c) => (c.endsWith(':') ? ' style="text-align:end"' : ''))
      i += 2
      const rows: string[] = []
      for (; i < L.length && L[i]!.includes('|') && L[i]!.trim(); i++)
        rows.push(
          `<tr>${cells(L[i]!)
            .map((c, n) => `<td${align[n] ?? ''}>${inline(c, linkTarget)}</td>`)
            .join('')}</tr>`,
        )
      out += `<table><thead><tr>${head.map((c, n) => `<th scope="col"${align[n] ?? ''}>${inline(c, linkTarget)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`
    } else if (/^(-{3,}|\*{3,})\s*$/.test(l)) {
      out += '<hr>'
      i++
    } else if (/^>\s?/.test(l)) {
      const buf: string[] = []
      while (i < L.length && /^>\s?/.test(L[i]!)) buf.push(L[i++]!.replace(/^>\s?/, ''))
      out += `<blockquote>${inline(buf.join(' '), linkTarget)}</blockquote>`
    } else if (/^\s*[-*+]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)) {
      const ordered = /^\s*\d/.test(l)
      const re = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/
      const items: string[] = []
      while (i < L.length) {
        if (re.test(L[i]!)) items.push(L[i++]!.replace(re, ''))
        else if (items.length && /^\s+\S/.test(L[i]!) && !/^\s*([-*+]|\d+[.)])\s/.test(L[i]!))
          items[items.length - 1] += ` ${L[i++]!.trim()}` // a wrapped item
        else break
      }
      const tag = ordered ? 'ol' : 'ul'
      out += `<${tag}>${items
        .map((x) => {
          const task = /^\[( |x)\]\s+/i.exec(x)
          return task
            ? `<li class="task"><label><input type="checkbox" disabled${task[1] !== ' ' ? ' checked' : ''}> ${inline(x.slice(task[0].length), linkTarget)}</label></li>`
            : `<li>${inline(x, linkTarget)}</li>`
        })
        .join('')}</${tag}>`
    } else if (!l.trim()) i++
    else {
      const buf: string[] = []
      while (i < L.length && L[i]!.trim() && !STARTS.test(L[i]!)) buf.push(L[i++]!)
      out += `<p>${inline(buf.join(' '), linkTarget)}</p>`
    }
  }
  return out
}

/** The editor's content back to Markdown: what the toolbar and shortcuts can make. */
export function htmlToMarkdown(root: Element): string {
  const walk = (n: Node): string => {
    if (n.nodeType === 3) return n.nodeValue!.replace(/​/g, '')
    if (n.nodeType !== 1) return ''
    const el = n as HTMLElement
    const kids = () => [...el.childNodes].map(walk).join('')
    switch (el.tagName.toLowerCase()) {
      case 'strong':
      case 'b':
        return `**${kids()}**`
      case 'em':
      case 'i':
        return `_${kids()}_`
      case 'del':
      case 's':
      case 'strike':
        return `~~${kids()}~~`
      case 'code':
        return `\`${el.textContent}\``
      case 'a':
        return `[${kids()}](${el.getAttribute('href') ?? ''})`
      case 'br':
        return '\n'
      case 'span':
        return el.hasAttribute('data-mention') ? el.textContent : kids()
      default:
        return kids()
    }
  }
  const block = (el: Element): string => {
    const tag = el.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Math.max(1, +tag[1]! - 1))} ${walk(el)}`
    if (tag === 'ul' || tag === 'ol')
      return [...el.children]
        .map((li, i) => `${tag === 'ol' ? `${i + 1}.` : '-'} ${walk(li).trim()}`)
        .join('\n')
    if (tag === 'blockquote')
      return walk(el)
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n')
    if (tag === 'pre') return `\`\`\`\n${el.textContent}\n\`\`\``
    if (tag === 'hr') return '---'
    return walk(el).replace(/\n$/, '')
  }
  return [...root.children].map(block).filter(Boolean).join('\n\n')
}
