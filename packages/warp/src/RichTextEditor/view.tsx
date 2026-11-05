import type { RichTextHandle } from '@weft-js/warp-core'
import type { State } from '@weft-js/core'
import { UndoIcon } from '@weft-js/warp-icons'
import { Button } from '../Button'
import type { Control } from '../Field'
import { Tooltip } from '../Tooltip'
import type { RichTextEditorProps, Tool, MenuRow } from './tools'

export type EditorView = {
  id: string
  toolbar: NonNullable<RichTextEditorProps['toolbar']>
  placeholder: string
  name: string | undefined
  held: { readonly value: string }
  start: string
  tools: { readonly value: Tool[][] }
  flat: { readonly value: Tool[] }
  pressed: State<Record<string, boolean>>
  stop: State<number>
  linking: State<boolean>
  url: State<string>
  items: State<MenuRow[]>
  active: State<number>
  menuOpen: State<boolean>
  said: State<string>
  handle(): RichTextHandle | undefined
  setEditor(n: HTMLDivElement): void
  setBar(n: HTMLDivElement): void
  setPop(n: HTMLDivElement): void
  setMark(n: HTMLSpanElement): void
  setLink(n: HTMLInputElement): void
  rows(): string | undefined
  onToolKey: (e: KeyboardEvent) => void
  onMenuKey: (e: KeyboardEvent) => void
  startLink(): void
  endLink(apply: boolean): void
  choose(at: number): void
}

export function EditorBody({ view, p }: { view: EditorView; p: Parameters<Control>[0] }) {
  return (
    <div data-scope="rte">
      <div data-part="frame">
        {view.toolbar !== 'none' && <EditorToolbar view={view} />}
        {view.linking.value && <EditorLinkBar view={view} />}
        <EditorContent view={view} p={p} />
      </div>
      <span
        ref={(n) => view.setMark(n)}
        data-part="caret-anchor"
        style="position:fixed"
        aria-hidden="true"
      ></span>
      <EditorMenu view={view} />
      <span data-part="sr-only" role="status">
        {view.said.value}
      </span>
      {view.name && <input type="hidden" name={view.name} value={view.held.value} />}
    </div>
  )
}

function EditorToolbar({ view }: { view: EditorView }) {
  return (
    <div
      ref={(n) => view.setBar(n)}
      role="toolbar"
      aria-label="Formatting"
      aria-controls={`${view.id}-c`}
      popover={view.toolbar === 'bubble' ? 'manual' : undefined}
      data-bubble={view.toolbar === 'bubble' ? '' : undefined}
      onKeyDown={view.onToolKey}
      onPointerDown={(e) => {
        if ((e.target as Element).closest?.('[data-part="tool"]')) e.preventDefault()
      }}
    >
      {view.tools.value.map((g, i) => (
        <span key={g[0]!.cmd} style="display:contents">
          {i > 0 && <span data-part="sep"></span>}
          {g.map((t) => (
            <EditorTool key={t.cmd} tool={t} view={view} />
          ))}
        </span>
      ))}
      <span data-part="sep"></span>
      <Tooltip content="Undo" kbd="⌘Z">
        <button
          type="button"
          data-part="tool"
          tabindex="-1"
          aria-label="Undo"
          onClick={() => view.handle()!.run('undo')}
        >
          <UndoIcon />
        </button>
      </Tooltip>
    </div>
  )
}

function EditorTool({ tool: t, view }: { tool: Tool; view: EditorView }) {
  return (
    <Tooltip content={t.tip}>
      <button
        type="button"
        data-part="tool"
        tabindex={view.flat.value[view.stop.value] === t ? '0' : '-1'}
        aria-label={t.label}
        aria-pressed={view.pressed.get(t.cmd) ? 'true' : 'false'}
        style={t.style}
        onClick={() =>
          t.cmd === 'link' ? (view.handle()!.save(), view.startLink()) : view.handle()!.run(t.cmd)
        }
      >
        {t.glyph()}
      </button>
    </Tooltip>
  )
}

function EditorLinkBar({ view }: { view: EditorView }) {
  return (
    <div data-part="linkbar">
      <label data-part="sr-only" for={`${view.id}-url`}>
        Link address
      </label>
      <input
        ref={(n) => view.setLink(n)}
        type="url"
        id={`${view.id}-url`}
        placeholder="https://"
        value={view.url.value}
        onInput={(e: Event) => (view.url.value = (e.currentTarget as HTMLInputElement).value)}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            view.endLink(true)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            view.endLink(false)
          }
        }}
      />
      <Button size="sm" onClick={() => view.endLink(true)}>
        Apply
      </Button>
      <Button emphasis="ghost" tone="neutral" size="sm" onClick={() => view.endLink(false)}>
        Cancel
      </Button>
    </div>
  )
}

function EditorContent({ view, p }: { view: EditorView; p: Parameters<Control>[0] }) {
  return (
    <div
      ref={(n) => view.setEditor(n)}
      data-part="content"
      id={`${view.id}-c`}
      contenteditable="true"
      tabindex="0"
      role="textbox"
      aria-multiline="true"
      aria-labelledby={`${p.id}-l`}
      aria-describedby={p.describedby}
      aria-invalid={p.invalid ? 'true' : undefined}
      aria-autocomplete="list"
      aria-controls={`${view.id}-menu`}
      aria-activedescendant={view.menuOpen.value ? `${view.id}-${view.active.value}` : undefined}
      data-placeholder={view.placeholder}
      spellcheck
      style={view.rows()}
      onKeyDown={view.onMenuKey}
      // oxlint-disable-next-line weft/no-html-sink -- `start` went through toHtml, which sanitizes
      innerHTML={view.start}
    ></div>
  )
}

function EditorMenu({ view }: { view: EditorView }) {
  return (
    <div
      ref={(n) => view.setPop(n)}
      data-scope="popover"
      data-kind="combo"
      data-sweep=""
      popover="manual"
      role="presentation"
      onPointerDown={(e) => e.preventDefault()}
    >
      <span data-part="sweep" aria-hidden="true"></span>
      <ul data-part="listbox" role="listbox" id={`${view.id}-menu`} aria-label="Insert">
        {view.items.value.map((r, n) => (
          <li
            key={r.id}
            role="option"
            id={`${view.id}-${n}`}
            aria-selected={n === view.active.value ? 'true' : 'false'}
            data-active={n === view.active.value ? '' : undefined}
            onClick={() => view.choose(n)}
          >
            <span>{r.main}</span>
            {r.meta && <span data-part="opt-meta">{r.meta}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
