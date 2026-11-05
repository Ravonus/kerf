import {
  uid,
  sanitizeHtml,
  markdownToHtml,
  htmlToMarkdown,
  richText,
  keyboardDock,
  comboPopup,
  nextIndex,
  type RichTextHandle,
  type RichTextOptions,
} from '@weft-js/warp-core'
import { untrack, state, derived, onCleanup, flush, watch } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import { bindable } from '../bind'
import { TOOLS, type RichTextEditorProps, type MenuRow } from './tools'
import type { EditorView } from './view'

type EditorOptions = {
  value: () => RichTextEditorProps['value']
  defaultValue: () => RichTextEditorProps['defaultValue']
  onValueChange: () => RichTextEditorProps['onValueChange']
  format: () => NonNullable<RichTextEditorProps['format']>
  toolbar: () => NonNullable<RichTextEditorProps['toolbar']>
  marks: () => NonNullable<RichTextEditorProps['marks']>
  blocks: () => NonNullable<RichTextEditorProps['blocks']>
  commands: () => NonNullable<RichTextEditorProps['commands']>
  mentions: () => RichTextEditorProps['mentions']
  placeholder: () => string
  minRows: () => number | undefined
  maxRows: () => number | undefined
  name: () => string | undefined
}

function editorData(o: EditorOptions) {
  const id = uid('rte')
  const held = bindable<string>(o.value, o.defaultValue, '', o.onValueChange)
  const refs = {
    ed: undefined as HTMLDivElement | undefined,
    handle: undefined as RichTextHandle | undefined,
    bar: undefined as HTMLDivElement | undefined,
    pop: undefined as HTMLDivElement | undefined,
    mark: undefined as HTMLSpanElement | undefined,
    link: undefined as HTMLInputElement | undefined,
    lookup: undefined as AbortController | undefined,
    written: '',
  }
  const toHtml = (v: string) =>
    o.format() === 'markdown' ? sanitizeHtml(markdownToHtml(v)) : sanitizeHtml(v)
  const fromEditor = (html: string) => (o.format() === 'markdown' ? htmlToMarkdown(refs.ed!) : html)
  const start = untrack(() => toHtml(held.value))
  refs.written = untrack(() => held.value)
  const pressed = state<Record<string, boolean>>({})
  const stop = state(0)
  const linking = state(false)
  const url = state('')
  const items = state<MenuRow[]>([])
  const active = state(0)
  const menuOpen = state(false)
  const said = state('')
  const tools = derived(() =>
    [
      o
        .blocks()
        .filter((b) => b === 'h2' || b === 'h3')
        .map((b) => TOOLS[b]),
      o.marks().map((m) => TOOLS[m]),
      o
        .blocks()
        .filter((b) => b !== 'h2' && b !== 'h3')
        .map((b) => TOOLS[b]),
    ].filter((g) => g.length),
  )
  const flat = derived(() => tools.value.flat())
  onCleanup(() => refs.lookup?.abort())
  return {
    id,
    held,
    refs,
    toHtml,
    fromEditor,
    start,
    pressed,
    stop,
    linking,
    url,
    items,
    active,
    menuOpen,
    said,
    tools,
    flat,
  }
}
type Data = ReturnType<typeof editorData>

function editorMenu(d: Data, o: EditorOptions) {
  const close = () => {
    d.menuOpen.value = false
    d.refs.lookup?.abort()
  }
  const openMenu = (rows: MenuRow[], rect: DOMRect) => {
    d.items.value = rows
    d.active.value = 0
    d.refs.mark!.style.insetBlockStart = `${rect.bottom}px`
    d.refs.mark!.style.insetInlineStart = `${rect.left}px`
    d.menuOpen.value = rows.length > 0
  }
  const onQuery = async (q: { trigger: string; query: string; rect: DOMRect } | null) => {
    d.refs.lookup?.abort()
    if (!q) return void (d.menuOpen.value = false)
    const drop = () => d.refs.handle!.replaceQuery(q.query.length + 1)
    if (q.trigger === '/') {
      const low = q.query.toLowerCase()
      return openMenu(
        o
          .commands()
          .filter((c) => c.label.toLowerCase().includes(low))
          .map((c) => ({
            id: c.id,
            main: c.label,
            meta: c.shortcut ?? c.hint,
            run: () => {
              drop()
              c.run(d.refs.handle!)
            },
          })),
        q.rect,
      )
    }
    if (!o.mentions()) return
    const me = (d.refs.lookup = new AbortController())
    try {
      const found = await o.mentions()!.search(q.query, me.signal)
      if (me !== d.refs.lookup) return
      openMenu(
        found.map((m) => ({
          id: m.id,
          main: m.label,
          meta: m.meta,
          run: () => {
            drop()
            d.refs.handle!.insertMention(m.label)
            d.said.value = `Mention: ${m.label}`
          },
        })),
        q.rect,
      )
    } catch {
      /* superseded */
    }
  }
  const choose = (at: number) => {
    const row = d.items.value[at]
    close()
    row?.run()
  }
  return { close, onQuery, choose }
}

function editorLinks(d: Data) {
  const startLink = () => {
    d.url.value = ''
    d.linking.value = true
    flush()
    d.refs.link?.focus()
  }
  const endLink = (apply: boolean) => {
    d.linking.value = false
    if (apply && d.url.value.trim()) d.refs.handle!.run('link', d.url.value.trim())
    else {
      d.refs.ed!.focus()
      d.refs.handle!.restore()
    }
  }
  return { startLink, endLink }
}

function bindEditor(
  d: Data,
  o: EditorOptions,
  menu: ReturnType<typeof editorMenu>,
  links: ReturnType<typeof editorLinks>,
) {
  use(
    (el: HTMLDivElement, options: RichTextOptions) => (d.refs.handle = richText(el, options)),
    () => d.refs.ed,
    () => ({
      onChange: (html: string) => {
        d.refs.written = d.fromEditor(html)
        d.held.set(d.refs.written, 'keyboard')
      },
      onState: (on: Record<string, boolean>) => (d.pressed.value = on),
      onQuery: menu.onQuery,
      onLink: links.startLink,
      bubble: o.toolbar() === 'bubble' ? d.refs.bar : undefined,
    }),
  )
  if (untrack(o.toolbar) !== 'none')
    use(
      keyboardDock,
      () => d.refs.bar,
      () => ({ editor: () => d.refs.ed }),
    )
  use(
    comboPopup,
    () => d.refs.pop,
    () => ({ open: d.menuOpen.value, anchor: d.refs.mark!, onClose: menu.close }),
  )
  watch(
    () => d.held.value,
    (v) => {
      if (v === d.refs.written) return
      d.refs.written = v
      // oxlint-disable-next-line weft/no-html-sink -- toHtml sanitizes
      if (d.refs.ed) d.refs.ed.innerHTML = d.toHtml(v)
    },
  )
}

function editorKeys(d: Data, menu: ReturnType<typeof editorMenu>) {
  const onToolKey = (e: KeyboardEvent) => {
    const to = nextIndex(e.key, d.stop.value, d.flat.value.length, {
      rtl: getComputedStyle(e.currentTarget as Element).direction === 'rtl',
    })
    if (to < 0) return
    e.preventDefault()
    d.stop.value = to
    flush()
    ;(e.currentTarget as Element).querySelector<HTMLElement>('[tabindex="0"]')?.focus()
  }
  const onMenuKey = (e: KeyboardEvent) => {
    if (!d.menuOpen.value || e.isComposing) return
    const n = d.items.value.length
    const by = ({ ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[e.key]
    if (by) {
      e.preventDefault()
      d.active.value = (d.active.value + by + n) % n
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      menu.choose(d.active.value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      menu.close()
    }
  }
  return { onToolKey, onMenuKey }
}

export function editorState(o: EditorOptions) {
  const d = editorData(o)
  const menu = editorMenu(d, o)
  const links = editorLinks(d)
  bindEditor(d, o, menu, links)
  const keys = editorKeys(d, menu)
  const rows = () =>
    [
      o.minRows() && `min-block-size:${o.minRows()! * 1.6}em`,
      o.maxRows() && `max-block-size:${o.maxRows()! * 1.6}em`,
    ]
      .filter(Boolean)
      .join(';') || undefined
  const view: EditorView = {
    id: d.id,
    held: d.held,
    start: d.start,
    tools: d.tools,
    flat: d.flat,
    pressed: d.pressed,
    stop: d.stop,
    linking: d.linking,
    url: d.url,
    items: d.items,
    active: d.active,
    menuOpen: d.menuOpen,
    said: d.said,
    get toolbar() {
      return o.toolbar()
    },
    get placeholder() {
      return o.placeholder()
    },
    get name() {
      return o.name()
    },
    handle: () => d.refs.handle,
    setEditor: (n) => (d.refs.ed = n),
    setBar: (n) => (d.refs.bar = n),
    setPop: (n) => (d.refs.pop = n),
    setMark: (n) => (d.refs.mark = n),
    setLink: (n) => (d.refs.link = n),
    rows,
    onToolKey: keys.onToolKey,
    onMenuKey: keys.onMenuKey,
    startLink: links.startLink,
    endLink: links.endLink,
    choose: menu.choose,
  }
  return { held: d.held, menuOpen: d.menuOpen, view }
}
