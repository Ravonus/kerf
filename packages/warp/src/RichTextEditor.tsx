import { CodeIcon, CodeBlockIcon, LinkIcon, ListIcon, ListOrderedIcon, QuoteIcon, UndoIcon } from '@weft-js/warp-icons'
import { comboPopup, htmlToMarkdown, keyboardDock, markdownToHtml, nextIndex, richText, sanitizeHtml, uid, type MentionItem, type RichTextHandle, type RichTextOptions } from '@weft-js/warp-core'
import { derived, flush, onCleanup, state, untrack, watch } from '@weft-js/core'
import { bindable, type Bindable } from './bind'
import { Button } from './Button'
import { Field, type FieldShell } from './Field'
import { Tooltip } from './Tooltip'
import { use } from '@weft-js/warp-core/weft'
import '@weft-js/warp-core/styles/rich/body.css'
import '@weft-js/warp-core/styles/rich/rich-text.css'
import '@weft-js/warp-core/styles/rich/listbox.css'
import '@weft-js/warp-core/styles/rich/popover.css'
import '@weft-js/warp-core/styles/rich/helpers.css'

/** An entry in the editor's slash menu. */
export type SlashCommand = { id: string; label: string; hint?: string; shortcut?: string; run: (editor: RichTextHandle) => void }
type Mark = 'bold' | 'italic' | 'strike' | 'code' | 'link'
type Block = 'h2' | 'h3' | 'ul' | 'ol' | 'quote' | 'codeblock'

/** Props for RichTextEditor. */
export type RichTextEditorProps = FieldShell & Bindable<string> & {
  format?: 'html' | 'markdown' | undefined
  /** fixed (default) in the frame, bubble over a selection, or none. A phone docks either above the keyboard. */
  toolbar?: 'fixed' | 'bubble' | 'none'
  marks?: Mark[]
  blocks?: Block[]
  commands?: SlashCommand[]
  mentions?: { search: (q: string, signal: AbortSignal) => Promise<MentionItem[]> }
  placeholder?: string
  minRows?: number
  maxRows?: number
  name?: string | undefined
}

type Tool = { cmd: string; label: string; tip: string; glyph: () => unknown; style?: string; toggles?: boolean }
const TOOLS: Record<Mark | Block, Tool> = {
  h2: { cmd: 'h2', label: 'H2 heading', tip: 'Heading · # ', glyph: () => 'H2', toggles: true },
  h3: { cmd: 'h3', label: 'H3 subheading', tip: 'Subheading · ### ', glyph: () => 'H3', toggles: true },
  bold: { cmd: 'bold', label: 'Bold', tip: 'Bold · ⌘B', glyph: () => 'B', style: 'font-weight:700', toggles: true },
  italic: { cmd: 'italic', label: 'Italic', tip: 'Italic · ⌘I', glyph: () => 'I', style: 'font-style:italic;font-family:Georgia,serif;font-weight:400;font-size:16px', toggles: true },
  strike: { cmd: 'strikeThrough', label: 'Strikethrough', tip: 'Strikethrough', glyph: () => 'S', style: 'text-decoration:line-through;font-weight:500', toggles: true },
  code: { cmd: 'code', label: 'Inline code', tip: 'Code · `text`', glyph: () => <CodeIcon />, toggles: true },
  link: { cmd: 'link', label: 'Link', tip: 'Link · ⌘K', glyph: () => <LinkIcon />, toggles: true },
  ul: { cmd: 'insertUnorderedList', label: 'Bulleted list', tip: 'Bullets · - ', glyph: () => <ListIcon />, toggles: true },
  ol: { cmd: 'insertOrderedList', label: 'Numbered list', tip: 'Numbers · 1. ', glyph: () => <ListOrderedIcon />, toggles: true },
  quote: { cmd: 'blockquote', label: 'Quote', tip: 'Quote · > ', glyph: () => <QuoteIcon />, toggles: true },
  codeblock: { cmd: 'pre', label: 'Code block', tip: 'Code block · ```', glyph: () => <CodeBlockIcon />, toggles: true },
}
const SLASH: SlashCommand[] = [
  { id: 'h2', label: 'Heading', hint: '#', run: e => e.run('h2') },
  { id: 'h3', label: 'Subheading', hint: '###', run: e => e.run('h3') },
  { id: 'ul', label: 'Bulleted list', hint: '-', run: e => e.run('insertUnorderedList') },
  { id: 'ol', label: 'Numbered list', hint: '1.', run: e => e.run('insertOrderedList') },
  { id: 'quote', label: 'Quote', hint: '>', run: e => e.run('blockquote') },
  { id: 'code', label: 'Code block', hint: '```', run: e => e.run('pre') },
  { id: 'divider', label: 'Divider', hint: '---', run: e => e.run('insertHorizontalRule') },
]
type MenuRow = { id: string; main: string; meta?: string | undefined; run: () => void }

/**
 * A rich text field (04 RichTextEditor; inputs-rich.html:1522): the editor frame is the field. The toolbar is an APG
 * Toolbar, one tab stop with ←/→ inside. Markdown shortcuts open a block at the start of a line; `/` on an empty line and
 * `@` open a list at the caret. Everything that enters the editor, a value or a paste, goes through warp-core's allow-list.
 */
export function RichTextEditor({ value, defaultValue, onValueChange, format = 'html', toolbar = 'fixed', marks = ['bold', 'italic', 'strike', 'code', 'link'], blocks = ['h2', 'ul', 'ol', 'quote'], commands = SLASH, mentions, placeholder = 'Write, or type / for blocks…', minRows, maxRows, name, hint, ...rest }: RichTextEditorProps) {
  const id = uid('rte')
  const held = bindable<string>(() => value, () => defaultValue, '', () => onValueChange)
  const toHtml = (v: string) => (format === 'markdown' ? sanitizeHtml(markdownToHtml(v)) : sanitizeHtml(v))
  const fromEditor = (html: string) => (format === 'markdown' ? htmlToMarkdown(ed!) : html)
  const start = untrack(() => toHtml(held.value))
  let written = untrack(() => held.value)
  const pressed = state<Record<string, boolean>>({})
  const stop = state(0)
  const linking = state(false)
  const url = state('')
  const items = state<MenuRow[]>([])
  const active = state(0)
  const menuOpen = state(false)
  const said = state('')
  const tools = derived(() => [blocks.filter(b => b === 'h2' || b === 'h3').map(b => TOOLS[b]), marks.map(m => TOOLS[m]), blocks.filter(b => b !== 'h2' && b !== 'h3').map(b => TOOLS[b])].filter(g => g.length))
  const flat = derived(() => tools.value.flat())
  let ed: HTMLDivElement | undefined
  let handle: RichTextHandle | undefined
  let bar: HTMLDivElement | undefined
  let pop: HTMLDivElement | undefined
  let mark: HTMLSpanElement | undefined
  let link: HTMLInputElement | undefined
  let lookup: AbortController | undefined
  onCleanup(() => lookup?.abort())
  const close = () => { menuOpen.value = false; lookup?.abort() }
  const openMenu = (rows: MenuRow[], rect: DOMRect) => {
    items.value = rows
    active.value = 0
    mark!.style.insetBlockStart = `${rect.bottom}px`
    mark!.style.insetInlineStart = `${rect.left}px`
    menuOpen.value = rows.length > 0
  }
  const onQuery = async (q: { trigger: string; query: string; rect: DOMRect } | null) => {
    lookup?.abort()
    if (!q) return void (menuOpen.value = false)
    const drop = () => handle!.replaceQuery(q.query.length + 1)
    if (q.trigger === '/') {
      const low = q.query.toLowerCase()
      return openMenu(commands.filter(c => c.label.toLowerCase().includes(low)).map(c => ({ id: c.id, main: c.label, meta: c.shortcut ?? c.hint, run: () => { drop(); c.run(handle!) } })), q.rect)
    }
    if (!mentions) return
    const me = (lookup = new AbortController())
    try {
      const found = await mentions.search(q.query, me.signal)
      if (me !== lookup) return
      openMenu(found.map(m => ({ id: m.id, main: m.label, meta: m.meta, run: () => {
        drop()
        handle!.insertMention(m.label)
        said.value = `Mention: ${m.label}`
      } })), q.rect)
    } catch { /* superseded */ }
  }
  const choose = (at: number) => { const row = items.value[at]; close(); row?.run() }
  const startLink = () => { url.value = ''; linking.value = true; flush(); link?.focus() }
  const endLink = (apply: boolean) => {
    linking.value = false
    if (apply && url.value.trim()) handle!.run('link', url.value.trim())
    else { ed!.focus(); handle!.restore() }
  }
  use(
    (el: HTMLDivElement, o: RichTextOptions) => (handle = richText(el, o)),
    () => ed,
    () => ({
      onChange: (html: string) => { written = fromEditor(html); held.set(written, 'keyboard') },
      onState: (on: Record<string, boolean>) => (pressed.value = on),
      onQuery, onLink: startLink,
      bubble: toolbar === 'bubble' ? bar : undefined,
    }),
  )
  if (untrack(() => toolbar) !== 'none') use(keyboardDock, () => bar, () => ({ editor: () => ed }))
  use(comboPopup, () => pop, () => ({ open: menuOpen.value, anchor: mark!, onClose: close }))
  watch(() => held.value, v => {
    if (v === written) return
    written = v
    // oxlint-disable-next-line weft/no-html-sink -- toHtml sanitizes
    if (ed) ed.innerHTML = toHtml(v)
  })
  const onToolKey = (e: KeyboardEvent) => {
    const to = nextIndex(e.key, stop.value, flat.value.length, { rtl: getComputedStyle(e.currentTarget as Element).direction === 'rtl' })
    if (to < 0) return
    e.preventDefault()
    stop.value = to
    flush()
    ;(e.currentTarget as Element).querySelector<HTMLElement>('[tabindex="0"]')?.focus()
  }
  const onMenuKey = (e: KeyboardEvent) => {
    if (!menuOpen.value || e.isComposing) return
    const n = items.value.length
    const by = ({ ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[e.key]
    if (by) { e.preventDefault(); active.value = (active.value + by + n) % n }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(active.value) }
    else if (e.key === 'Escape') { e.preventDefault(); close() }
  }
  const Tool = ({ tool: t }: { tool: Tool }) => (
    <Tooltip content={t.tip}><button type="button" data-part="tool" tabindex={flat.value[stop.value] === t ? '0' : '-1'} aria-label={t.label} aria-pressed={pressed.get(t.cmd) ? 'true' : 'false'} style={t.style} onClick={() => (t.cmd === 'link' ? (handle!.save(), startLink()) : handle!.run(t.cmd))}>{t.glyph()}</button></Tooltip>
  )
  const rows = () => [minRows && `min-block-size:${minRows * 1.6}em`, maxRows && `max-block-size:${maxRows * 1.6}em`].filter(Boolean).join(';') || undefined
  return (
    <Field
      {...rest}
      hint={hint ?? 'Markdown shortcuts work at the start of a line. Esc closes menus.'}
      group
      filled
      reset={held.reset}
      hold={menuOpen.value}
      attrs={{ 'data-multiline': '' }}
      control={p => (
        <div data-scope="rte">
          <div data-part="frame">
            {toolbar !== 'none' && (
              <div ref={(n: any) => (bar = n)} role="toolbar" aria-label="Formatting" aria-controls={`${id}-c`} popover={toolbar === 'bubble' ? 'manual' : undefined} data-bubble={toolbar === 'bubble' ? '' : undefined} onKeyDown={onToolKey} onPointerDown={e => { if ((e.target as Element).closest?.('[data-part="tool"]')) e.preventDefault() }}>
                {tools.value.map((g, i) => <span key={g[0].cmd} style="display:contents">{i > 0 && <span data-part="sep"></span>}{g.map(t => <Tool key={t.cmd} tool={t} />)}</span>)}
                <span data-part="sep"></span>
                <Tooltip content="Undo" kbd="⌘Z"><button type="button" data-part="tool" tabindex="-1" aria-label="Undo" onClick={() => handle!.run('undo')}><UndoIcon /></button></Tooltip>
              </div>
            )}
            {linking.value && (
              <div data-part="linkbar">
                <label data-part="sr-only" for={`${id}-url`}>Link address</label>
                <input ref={n => (link = n)} type="url" id={`${id}-url`} placeholder="https://" value={url.value} onInput={(e: Event) => (url.value = (e.currentTarget as HTMLInputElement).value)} onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); endLink(true) } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endLink(false) } }} />
                <Button size="sm" onClick={() => endLink(true)}>Apply</Button>
                <Button emphasis="ghost" tone="neutral" size="sm" onClick={() => endLink(false)}>Cancel</Button>
              </div>
            )}
            <div ref={n => (ed = n)} data-part="content" id={`${id}-c`} contenteditable="true" tabindex="0" role="textbox" aria-multiline="true" aria-labelledby={`${p.id}-l`} aria-describedby={p.describedby} aria-invalid={p.invalid ? 'true' : undefined} aria-autocomplete="list" aria-controls={`${id}-menu`} aria-activedescendant={menuOpen.value ? `${id}-${active.value}` : undefined} data-placeholder={placeholder} spellcheck style={rows()} onKeyDown={onMenuKey}
          // oxlint-disable-next-line weft/no-html-sink -- `start` went through toHtml, which sanitizes
          innerHTML={start}></div>
          </div>
          <span ref={n => (mark = n)} data-part="caret-anchor" style="position:fixed" aria-hidden="true"></span>
          <div ref={n => (pop = n)} data-scope="popover" data-kind="combo" data-sweep="" popover="manual" role="presentation" onPointerDown={e => e.preventDefault()}>
            <span data-part="sweep" aria-hidden="true"></span>
            <ul data-part="listbox" role="listbox" id={`${id}-menu`} aria-label="Insert">
              {items.value.map((r, n) => <li key={r.id} role="option" id={`${id}-${n}`} aria-selected={n === active.value ? 'true' : 'false'} data-active={n === active.value ? '' : undefined} onClick={() => choose(n)}><span>{r.main}</span>{r.meta && <span data-part="opt-meta">{r.meta}</span>}</li>)}
            </ul>
          </div>
          <span data-part="sr-only" role="status">{said.value}</span>
          {name && <input type="hidden" name={name} value={held.value} />}
        </div>
      )}
    />
  )
}
