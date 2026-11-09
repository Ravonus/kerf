// The rich and Markdown editors' model (04 RichTextEditor, MarkdownEditor, Markdown). Everything that reaches
// innerHTML is rebuilt here from an allow-list, on the server as in the browser: what isn't on the list is escaped
// text, so a value or a paste can't carry a script. The `richText` action is the specimen's engine, contenteditable
// and execCommand (inputs-rich.html:1522), which costs no editor library.

import { esc as escapeHtml } from '@weft-js/core/markup'
import { safeUrl } from './editor-url'
import { sanitizeHtml } from './editor-markdown'
export { safeUrl } from './editor-url'
export { sanitizeHtml, markdownToHtml, htmlToMarkdown } from './editor-markdown'
export type { MarkdownOptions } from './editor-markdown'
const esc = (s: string) => escapeHtml(s, 'full')

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

const BLOCKS: [RegExp, string, string?][] = [
  [/^#{1,2}\s$/, 'formatBlock', 'h2'],
  [/^###\s$/, 'formatBlock', 'h3'],
  [/^[-*]\s$/, 'insertUnorderedList'],
  [/^1\.\s$/, 'insertOrderedList'],
  [/^>\s$/, 'formatBlock', 'blockquote'],
  [/^```$/, 'formatBlock', 'pre'],
]
const STATE = [
  'bold',
  'italic',
  'strikeThrough',
  'insertUnorderedList',
  'insertOrderedList',
] as const

function editorSelection(ed: HTMLElement, doc: Document, options: () => RichTextOptions) {
  let saved: Range | null = null
  const blockOf = (node: Node | null) => {
    let n = node
    while (n && n !== ed && n.parentNode !== ed && !(n.parentNode as Element)?.matches?.('ul, ol'))
      n = n.parentNode
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
    const on: Record<string, boolean> = {
      link: !!at?.closest('a'),
      code: !!at?.closest('code'),
      h2: block === 'h2',
      h3: block === 'h3',
      blockquote: block === 'blockquote',
      pre: block === 'pre',
    }
    for (const c of STATE) on[c] = doc.queryCommandState?.(c) ?? false
    options().onState?.(on)
  }
  return { blockOf, save, restore, report }
}

type EditorExec = (cmd: string, value?: string) => boolean
type EditorCtx = {
  ed: HTMLElement
  doc: Document
  exec: EditorExec
  options: () => RichTextOptions
  blockOf: (node: Node | null) => HTMLElement | null
  restore: () => void
  changed: () => void
  report: () => void
  save: () => void
}

function editorRun({ ed, doc, exec, restore, changed, report, save }: EditorCtx) {
  return (cmd: string, value?: string) => {
    ed.focus()
    restore()
    if (cmd === 'h2' || cmd === 'h3' || cmd === 'blockquote' || cmd === 'pre')
      exec(
        'formatBlock',
        (doc.queryCommandValue('formatBlock') || '').toLowerCase() === cmd ? 'p' : cmd,
      )
    else if (cmd === 'code') {
      const text = doc.getSelection()?.toString()
      if (text) exec('insertHTML', `<code>${esc(text)}</code>&#8203;`)
    } else if (cmd === 'link') {
      const url = value && safeUrl(value)
      if (url) exec('createLink', url)
    } else exec(cmd, value)
    changed()
    report()
    save()
  }
}

function editorInsert({ ed, doc, exec, restore, changed, report, save }: EditorCtx) {
  const insertHtml = (html: string) => {
    ed.focus()
    restore()
    exec('insertHTML', sanitizeHtml(html))
    changed()
  }
  // insertHTML drops or displaces an atomic span in Chromium: the text goes in as an undoable edit, then gets its wrapper
  const insertMention = (name: string) => {
    ed.focus()
    restore()
    const label = `@${name}`
    exec('insertText', `${label}\u00a0`)
    const s = doc.getSelection()!
    const node = s.anchorNode!,
      end = s.anchorOffset - 1
    if (node.nodeType === 3 && end >= label.length) {
      const span = doc.createElement('span')
      const attrs = {
        'data-mention': '',
        contenteditable: 'false',
        title: name,
        role: 'img',
        'aria-label': `Mention: ${name}`,
      }
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
  return { insertHtml, insertMention, replaceQuery }
}

// `**b**`, `_i_`, `` `code` ``, closed at the caret
function editorMarks(doc: Document, exec: EditorExec) {
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
  exec(
    'insertHTML',
    `${m[2] ? `<strong>${esc(inner)}</strong>` : m[3] ? `<code>${esc(inner)}</code>` : `<em>${esc(inner)}</em>`}&#8203;`,
  )
}

function editorInput({ doc, exec, blockOf, options, report, changed }: EditorCtx) {
  const shortcuts = () => {
    const s = doc.getSelection()
    const block = blockOf(s?.anchorNode ?? null)
    if (!block || block.closest?.('li')) return false // a bare Text in the editor is a block too, with no closest
    const text = block.textContent.replace(/ /g, ' ')
    if (text === '---') {
      block.textContent = ''
      exec('insertHorizontalRule')
      return true
    }
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

  const query = () => {
    if (!options().onQuery) return
    const s = doc.getSelection()
    const node = s?.anchorNode
    const m =
      node?.nodeType === 3 && s!.isCollapsed
        ? /(?:^|\s)([/@])([\w-]*)$/.exec(node.nodeValue!.slice(0, s!.anchorOffset))
        : null
    const block = m && blockOf(node!)
    if (!m || !block || (m[1] === '/' && block.textContent.trim() !== `/${m[2]}`))
      return void options().onQuery!(null)
    options().onQuery!({
      trigger: m[1]!,
      query: m[2]!,
      rect: s!.getRangeAt(0).getBoundingClientRect(),
    })
  }
  const onInput = (e: Event) => {
    const type = (e as InputEvent).inputType
    if (type === 'insertText' || type === 'insertParagraph') {
      if (shortcuts()) report()
      else if (type === 'insertText') editorMarks(doc, exec)
    }
    query()
    changed()
  }
  return onInput
}

function editorEvents(
  { ed, doc, options, exec, save, report }: EditorCtx,
  run: (cmd: string, value?: string) => void,
) {
  const onKey = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return
    const cmd = ({ b: 'bold', i: 'italic' } as Record<string, string>)[e.key.toLowerCase()]
    if (cmd) {
      e.preventDefault()
      run(cmd)
    } else if (e.key.toLowerCase() === 'k') {
      e.preventDefault()
      save()
      options().onLink?.()
    }
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
  // the bubble sits above the selection (below it when there is no room), follows it when the page or a scroller
  // moves, and hides while the selection is scrolled out of view
  const float = () => {
    const bar = options().bubble
    if (!bar) return
    const s = doc.getSelection()
    if (!s?.rangeCount || s.isCollapsed || !ed.contains(s.anchorNode)) {
      if (bar.matches(':popover-open')) bar.hidePopover()
      return
    }
    if (!bar.matches(':popover-open')) bar.showPopover()
    const win = doc.defaultView!
    const box = s.getRangeAt(0).getBoundingClientRect()
    const above = box.top - bar.offsetHeight - 8
    bar.style.insetBlockStart = `${above >= 8 ? above : box.bottom + 8}px`
    bar.style.insetInlineStart = `${Math.max(8, Math.min(box.left, win.innerWidth - bar.offsetWidth - 8))}px`
    bar.style.visibility = box.bottom < 0 || box.top > win.innerHeight ? 'hidden' : ''
  }
  const onMove = () => {
    if (options().bubble?.matches(':popover-open')) float()
  }
  return { onKey, onPaste, onDrop, onSelection, onMove }
}

/** Attach to `[data-part="content"]`, the contenteditable. `run` is what the toolbar calls. */
export function richText(ed: HTMLElement, opts: RichTextOptions) {
  let o = opts
  const doc = ed.ownerDocument
  const exec = (cmd: string, value?: string) => doc.execCommand(cmd, false, value)
  const { blockOf, save, restore, report } = editorSelection(ed, doc, () => o)
  const changed = () => o.onChange(sanitizeHtml(ed.innerHTML))
  const x: EditorCtx = { ed, doc, exec, options: () => o, blockOf, restore, changed, report, save }
  const run = editorRun(x)
  const { insertHtml, insertMention, replaceQuery } = editorInsert(x)
  const onInput = editorInput(x)
  const { onKey, onPaste, onDrop, onSelection, onMove } = editorEvents(x, run)
  ed.addEventListener('input', onInput)
  ed.addEventListener('keydown', onKey)
  ed.addEventListener('paste', onPaste)
  ed.addEventListener('drop', onDrop)
  doc.addEventListener('selectionchange', onSelection)
  doc.defaultView?.addEventListener('scroll', onMove, { capture: true, passive: true })
  doc.defaultView?.addEventListener('resize', onMove, { passive: true })
  doc.execCommand?.('defaultParagraphSeparator', false, 'p')
  return {
    update: (next: RichTextOptions) => void (o = next),
    destroy() {
      ed.removeEventListener('input', onInput)
      ed.removeEventListener('keydown', onKey)
      ed.removeEventListener('paste', onPaste)
      ed.removeEventListener('drop', onDrop)
      doc.removeEventListener('selectionchange', onSelection)
      doc.defaultView?.removeEventListener('scroll', onMove, { capture: true })
      doc.defaultView?.removeEventListener('resize', onMove)
    },
    run,
    insertHtml,
    insertMention,
    replaceQuery,
    save,
    restore,
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
