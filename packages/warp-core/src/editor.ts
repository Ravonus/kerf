// The rich and Markdown editors' model (04 RichTextEditor, MarkdownEditor, Markdown). Everything that reaches
// innerHTML is rebuilt here from an allow-list, on the server as in the browser: what isn't on the list is escaped
// text, so a value or a paste can't carry a script. The `richText` action is the specimen's engine, contenteditable
// and execCommand (inputs-rich.html:1522), which costs no editor library.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// text keeps its entities (an editor's innerHTML is full of &nbsp;): in element content they can only ever be text
const escText = (s: string) => s.replace(/&(?!#?\w+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const unesc = (s: string) => s.replace(/&(lt|gt|quot|#39|amp);/g, (_, e) => ({ lt: '<', gt: '>', quot: '"', '#39': "'", amp: '&' })[e as 'lt'])

/** http, https, mailto and relative only (04 Markdown). */
export const safeUrl = (url: string) => {
  // browsers drop tabs, line breaks and controls before reading a scheme
  // oxlint-disable-next-line no-control-regex -- the point: these are what hide a scheme
  const u = unesc(url).replace(/[\u0000- ]+/g, '')
  return /^(https?:|mailto:|\/(?![/\\])|#|\.)/i.test(u) || !/^[a-z][a-z0-9+.-]*:|^[/\\]{2}/i.test(u) ? u : null
}

const ALLOWED: Record<string, string> = { b: 'strong', strong: 'strong', i: 'em', em: 'em', s: 'del', strike: 'del', del: 'del', code: 'code', a: 'a', p: 'p', div: 'p', br: 'br', hr: 'hr', h1: 'h2', h2: 'h2', h3: 'h3', h4: 'h4', ul: 'ul', ol: 'ol', li: 'li', blockquote: 'blockquote', pre: 'pre', span: 'span' }
const VOID = new Set(['br', 'hr'])
const DROPPED = /<(script|style|iframe|object|embed|template|noscript|svg|math)\b[\s\S]*?(?:<\/\1\s*>|$)/gi
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
    if (VOID.has(tag)) { out += `<${tag}>`; continue }
    let attrs = ''
    if (tag === 'a') { const href = safeUrl(attr(m[3]!, 'href') ?? ''); if (href) attrs = ` href="${esc(href)}" rel="noopener noreferrer"` }
    if (tag === 'span') {
      if (!/\bdata-mention\b/i.test(m[3]!)) { open.push(tag); out += '<span>'; continue }
      const title = attr(m[3]!, 'title') ?? ''
      attrs = ` data-mention="" contenteditable="false" title="${esc(unesc(title))}" role="img" aria-label="Mention: ${esc(unesc(title))}"`
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
      return hold(`<a href="${esc(ok)}"${/^https?:/i.test(ok) ? ` rel="noopener noreferrer"${target === '_blank' ? ' target="_blank"' : ''}` : ''}>${text}</a>`)
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
const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'))

export interface MarkdownOptions {
  linkTarget?: string | undefined
  /** Replaces a fenced block's markup: a build's highlighter, say. It gets the raw text, and what it returns isn't escaped. */
  code?: ((text: string, language: string) => string) | undefined
  /** Keep a document's own levels (`#` is h1) and give each heading the id this returns. */
  heading?: (text: string, level: number) => string
}

/** The small safe renderer (04 Markdown). Raw HTML is escaped and shows as text; headings render one level down. */
export function markdownToHtml(source: string, { linkTarget = '_self', code, heading }: MarkdownOptions = {}) {
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
      else out += `<pre data-scope="codeblock"${lang ? ` data-lang="${esc(lang)}"` : ''} tabindex="0" aria-label="${esc(lang || 'Code')}"><code>${esc(buf.join('\n'))}</code></pre>`
    } else if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) {
      const tag = `h${m[1]!.length + (heading ? 0 : 1)}`
      out += `<${tag}${heading ? ` id="${esc(heading(m[2]!, m[1]!.length))}"` : ''}>${inline(m[2]!, linkTarget)}</${tag}>`
      i++
    } else if (l.includes('|') && TABLE_RULE.test(L[i + 1] ?? '')) {
      const head = cells(l)
      const align = cells(L[i + 1]!).map(c => (c.endsWith(':') ? ' style="text-align:end"' : ''))
      i += 2
      const rows: string[] = []
      for (; i < L.length && L[i]!.includes('|') && L[i]!.trim(); i++) rows.push(`<tr>${cells(L[i]!).map((c, n) => `<td${align[n] ?? ''}>${inline(c, linkTarget)}</td>`).join('')}</tr>`)
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
        else if (items.length && /^\s+\S/.test(L[i]!) && !/^\s*([-*+]|\d+[.)])\s/.test(L[i]!)) items[items.length - 1] += ` ${L[i++]!.trim()}` // a wrapped item
        else break
      }
      const tag = ordered ? 'ol' : 'ul'
      out += `<${tag}>${items.map(x => {
        const task = /^\[( |x)\]\s+/i.exec(x)
        return task
          ? `<li class="task"><label><input type="checkbox" disabled${task[1] !== ' ' ? ' checked' : ''}> ${inline(x.slice(task[0].length), linkTarget)}</label></li>`
          : `<li>${inline(x, linkTarget)}</li>`
      }).join('')}</${tag}>`
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
      case 'strong': case 'b': return `**${kids()}**`
      case 'em': case 'i': return `_${kids()}_`
      case 'del': case 's': case 'strike': return `~~${kids()}~~`
      case 'code': return `\`${el.textContent}\``
      case 'a': return `[${kids()}](${el.getAttribute('href') ?? ''})`
      case 'br': return '\n'
      case 'span': return el.hasAttribute('data-mention') ? el.textContent : kids()
      default: return kids()
    }
  }
  const block = (el: Element): string => {
    const tag = el.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Math.max(1, +tag[1]! - 1))} ${walk(el)}`
    if (tag === 'ul' || tag === 'ol') return [...el.children].map((li, i) => `${tag === 'ol' ? `${i + 1}.` : '-'} ${walk(li).trim()}`).join('\n')
    if (tag === 'blockquote') return walk(el).split('\n').map(l => `> ${l}`).join('\n')
    if (tag === 'pre') return `\`\`\`\n${el.textContent}\n\`\`\``
    if (tag === 'hr') return '---'
    return walk(el).replace(/\n$/, '')
  }
  return [...root.children].map(block).filter(Boolean).join('\n\n')
}

/** Options for the rich text editor. */
export interface RichTextOptions {
  onChange(html: string): void
  /** A character typed that may open a menu: where the query stands, or nothing to close it. */
  onQuery?(q: { trigger: string; query: string; rect: DOMRect } | null): unknown
  /** A shortcut for the Link command, with the selection saved. */
  onLink?(): void
  /** Called on each selection change with the commands in force. */
  onState?(on: Record<string, boolean>): void
  /** A `popover` toolbar to show 8px above a non-empty selection. */
  bubble?: HTMLElement | undefined
}

const BLOCKS: [RegExp, string, string?][] = [[/^#{1,2}\s$/, 'formatBlock', 'h2'], [/^###\s$/, 'formatBlock', 'h3'], [/^[-*]\s$/, 'insertUnorderedList'], [/^1\.\s$/, 'insertOrderedList'], [/^>\s$/, 'formatBlock', 'blockquote'], [/^```$/, 'formatBlock', 'pre']]
const STATE = ['bold', 'italic', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'] as const

/** Attach to `[data-part="content"]`, the contenteditable. `run` is what the toolbar calls. */
export function richText(ed: HTMLElement, opts: RichTextOptions) {
  let o = opts
  const doc = ed.ownerDocument
  let saved: Range | null = null
  const exec = (cmd: string, value?: string) => doc.execCommand(cmd, false, value)
  const blockOf = (node: Node | null) => {
    let n = node
    while (n && n !== ed && n.parentNode !== ed && !(n.parentNode as Element)?.matches?.('ul, ol')) n = n.parentNode
    return n === ed ? null : (n as HTMLElement | null)
  }
  const save = () => {
    const s = doc.getSelection()
    if (s?.rangeCount && ed.contains(s.anchorNode)) saved = s.getRangeAt(0).cloneRange()
  }
  const restore = () => {
    if (!saved) return
    const s = doc.getSelection()
    s?.removeAllRanges()
    s?.addRange(saved)
  }
  const report = () => {
    const s = doc.getSelection()
    const at = s?.anchorNode?.parentElement
    const block = (doc.queryCommandValue?.('formatBlock') || '').toLowerCase()
    const on: Record<string, boolean> = { link: !!at?.closest('a'), code: !!at?.closest('code'), h2: block === 'h2', h3: block === 'h3', blockquote: block === 'blockquote', pre: block === 'pre' }
    for (const c of STATE) on[c] = doc.queryCommandState?.(c) ?? false
    o.onState?.(on)
  }
  const changed = () => o.onChange(sanitizeHtml(ed.innerHTML))
  const run = (cmd: string, value?: string) => {
    ed.focus()
    restore()
    if (cmd === 'h2' || cmd === 'h3' || cmd === 'blockquote' || cmd === 'pre') exec('formatBlock', (doc.queryCommandValue('formatBlock') || '').toLowerCase() === cmd ? 'p' : cmd)
    else if (cmd === 'code') {
      const text = doc.getSelection()?.toString()
      if (text) exec('insertHTML', `<code>${esc(text)}</code>&#8203;`)
    } else if (cmd === 'link') { const url = value && safeUrl(value); if (url) exec('createLink', url) }
    else exec(cmd, value)
    changed()
    report()
    save()
  }
  const insertHtml = (html: string) => { ed.focus(); restore(); exec('insertHTML', sanitizeHtml(html)); changed() }
  // insertHTML drops or displaces an atomic span in Chromium: the text goes in as an undoable edit, then gets its wrapper
  const insertMention = (name: string) => {
    ed.focus()
    restore()
    const label = `@${name}`
    exec('insertText', `${label}\u00a0`)
    const s = doc.getSelection()!
    const node = s.anchorNode!, end = s.anchorOffset - 1
    if (node.nodeType === 3 && end >= label.length) {
      const span = doc.createElement('span')
      const attrs = { 'data-mention': '', contenteditable: 'false', title: name, role: 'img', 'aria-label': `Mention: ${name}` }
      for (const [k, v] of Object.entries(attrs)) span.setAttribute(k, v)
      const r = doc.createRange()
      r.setStart(node, end - label.length)
      r.setEnd(node, end)
      r.surroundContents(span)
      s.collapse(span.nextSibling, 1)
    }
    changed()
    save()
    report()
  }
  // replaces what was typed for a menu, leaving the caret after it
  const replaceQuery = (length: number) => {
    const s = doc.getSelection()
    if (!s?.rangeCount) return
    const r = s.getRangeAt(0).cloneRange()
    if (r.startContainer.nodeType === 3 && r.startOffset >= length) {
      r.setStart(r.startContainer, r.startOffset - length)
      s.removeAllRanges()
      s.addRange(r)
      exec('delete')
    }
    save()
  }
  const shortcuts = () => {
    const s = doc.getSelection()
    const block = blockOf(s?.anchorNode ?? null)
    if (!block || block.closest('li')) return false
    const text = block.textContent.replace(/ /g, ' ')
    if (text === '---') { block.textContent = ''; exec('insertHorizontalRule'); return true }
    for (const [re, cmd, value] of BLOCKS) {
      if (!re.test(text)) continue
      // select the marker and delete it, so it's one undoable edit away from the literal characters
      const r = doc.createRange()
      r.selectNodeContents(block)
      s!.removeAllRanges()
      s!.addRange(r)
      exec('delete')
      exec(cmd, value)
      const list = doc.getSelection()?.anchorNode?.parentElement?.closest('ul, ol')
      if (list?.parentElement?.matches('p')) list.parentElement.replaceWith(list) // Chromium nests it, which isn't HTML
      return true
    }
    return false
  }
  // `**b**`, `_i_`, `` `code` ``, closed at the caret
  const marks = () => {
    const s = doc.getSelection()
    const node = s?.anchorNode
    if (node?.nodeType !== 3 || !s!.isCollapsed) return
    const before = node.nodeValue!.slice(0, s!.anchorOffset)
    const m = /(\*\*([^*]+)\*\*|`([^`]+)`|(?:^|\s)_([^_]+)_)$/.exec(before)
    if (!m) return
    const inner = (m[2] ?? m[3] ?? m[4])!
    const start = before.length - m[1]!.length + (m[1]!.startsWith('_') || m[2] || m[3] ? 0 : 1)
    const r = doc.createRange()
    r.setStart(node, start)
    r.setEnd(node, before.length)
    s!.removeAllRanges()
    s!.addRange(r)
    exec('insertHTML', `${m[2] ? `<strong>${esc(inner)}</strong>` : m[3] ? `<code>${esc(inner)}</code>` : `<em>${esc(inner)}</em>`}&#8203;`)
  }
  const query = () => {
    if (!o.onQuery) return
    const s = doc.getSelection()
    const node = s?.anchorNode
    const m = node?.nodeType === 3 && s!.isCollapsed ? /(?:^|\s)([/@])([\w-]*)$/.exec(node.nodeValue!.slice(0, s!.anchorOffset)) : null
    const block = m && blockOf(node!)
    if (!m || !block || (m[1] === '/' && block.textContent.trim() !== `/${m[2]}`)) return void o.onQuery(null)
    o.onQuery({ trigger: m[1]!, query: m[2]!, rect: s!.getRangeAt(0).getBoundingClientRect() })
  }
  const onInput = (e: Event) => {
    const type = (e as InputEvent).inputType
    if (type === 'insertText' || type === 'insertParagraph') { if (shortcuts()) report(); else if (type === 'insertText') marks() }
    query()
    changed()
  }
  const onKey = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return
    const cmd = ({ b: 'bold', i: 'italic' } as Record<string, string>)[e.key.toLowerCase()]
    if (cmd) { e.preventDefault(); run(cmd) }
    else if (e.key.toLowerCase() === 'k') { e.preventDefault(); save(); o.onLink?.() }
  }
  const onPaste = (e: ClipboardEvent) => {
    const data = e.clipboardData
    if (!data) return
    e.preventDefault()
    const html = data.getData('text/html')
    if (html) exec('insertHTML', sanitizeHtml(html))
    else exec('insertText', data.getData('text/plain'))
  }
  const onDrop = (e: DragEvent) => e.preventDefault() // a dropped file or page fragment skips the paste path
  const onSelection = () => {
    if (!ed.contains(doc.getSelection()?.anchorNode ?? null)) return
    save()
    report()
    float()
  }
  const float = () => {
    const bar = o.bubble
    if (!bar) return
    const s = doc.getSelection()
    if (!s?.rangeCount || s.isCollapsed) { if (bar.matches(':popover-open')) bar.hidePopover(); return }
    if (!bar.matches(':popover-open')) bar.showPopover()
    const box = s.getRangeAt(0).getBoundingClientRect()
    bar.style.insetBlockStart = `${Math.max(8, box.top - bar.offsetHeight - 8)}px`
    bar.style.insetInlineStart = `${Math.max(8, box.left)}px`
  }
  ed.addEventListener('input', onInput)
  ed.addEventListener('keydown', onKey)
  ed.addEventListener('paste', onPaste)
  ed.addEventListener('drop', onDrop)
  doc.addEventListener('selectionchange', onSelection)
  doc.execCommand?.('defaultParagraphSeparator', false, 'p')
  return {
    update: (next: RichTextOptions) => void (o = next),
    destroy() {
      ed.removeEventListener('input', onInput)
      ed.removeEventListener('keydown', onKey)
      ed.removeEventListener('paste', onPaste)
      ed.removeEventListener('drop', onDrop)
      doc.removeEventListener('selectionchange', onSelection)
    },
    run, insertHtml, insertMention, replaceQuery, save, restore,
  }
}

/** On a phone the toolbar is a bar above the keyboard, at the bottom of the visual viewport (04 §1.2). */
export function keyboardDock(bar: HTMLElement, opts: { editor: () => HTMLElement | undefined }) {
  const win = bar.ownerDocument.defaultView!
  const vv = win.visualViewport
  const phone = () => win.matchMedia?.('(pointer: coarse)').matches && win.innerWidth < 600
  const place = () => {
    const on = !!vv && phone() && opts.editor()?.matches(':focus-within, :focus')
    bar.toggleAttribute('data-docked', on)
    bar.style.insetBlockEnd = on ? `${win.innerHeight - vv.height - vv.offsetTop}px` : ''
  }
  vv?.addEventListener('resize', place)
  vv?.addEventListener('scroll', place)
  bar.ownerDocument.addEventListener('focusin', place)
  bar.ownerDocument.addEventListener('focusout', place)
  return {
    update() {},
    destroy() {
      vv?.removeEventListener('resize', place)
      vv?.removeEventListener('scroll', place)
      bar.ownerDocument.removeEventListener('focusin', place)
      bar.ownerDocument.removeEventListener('focusout', place)
    },
  }
}

/** The handle `richText` returns. */
export type RichTextHandle = ReturnType<typeof richText>
