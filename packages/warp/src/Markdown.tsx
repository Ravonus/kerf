import { markdownToHtml, nextIndex, uid } from '@weft-js/warp-core'
import { derived, flush, state, untrack } from '@weft-js/core'
import { bindable, type Bindable } from './bind'
import { Textarea, type FieldShell } from './Field'
import './styles'
import '@weft-js/warp-core/styles/rich/markdown.css'
import '@weft-js/warp-core/styles/rich/md-editor.css'

/** Markdown, rendered (04 Markdown): a small, safe renderer. Raw HTML is escaped and shows as text. */
export function Markdown({
  source,
  linkTarget,
  ...rest
}: {
  source: string
  linkTarget?: '_self' | '_blank' | undefined
  [attr: string]: unknown
}) {
  return (
    <article
      data-scope="markdown"
      {...rest}
      // oxlint-disable-next-line weft/no-html-sink -- markdownToHtml sanitizes
      innerHTML={markdownToHtml(source, { linkTarget })}
    ></article>
  )
}

/** Props for MarkdownEditor. */
export type MarkdownEditorProps = FieldShell & Bindable<string> & { rows?: number }

const WRAPS: Record<string, [string, string]> = {
  b: ['**', '**'],
  i: ['_', '_'],
  k: ['[', '](https://)'],
}

function markdownKeys(held: ReturnType<typeof bindable<string>>) {
  return (e: KeyboardEvent) => {
    const wrap = (e.metaKey || e.ctrlKey) && WRAPS[e.key.toLowerCase()]
    if (!wrap) return
    e.preventDefault()
    const a = e.currentTarget as HTMLTextAreaElement
    const { selectionStart: from, selectionEnd: to } = a
    const text = wrap[0] + a.value.slice(from, to) + wrap[1]
    if (!document.execCommand?.('insertText', false, text)) a.setRangeText(text, from, to, 'end')
    a.setSelectionRange(from + wrap[0].length, to + wrap[0].length)
    held.set(a.value, 'keyboard')
  }
}

/**
 * Source and preview (04 MarkdownEditor; inputs-rich.html:2299): side by side from 640px of its own width, tabs below
 * that. ⌘B, ⌘I and ⌘K wrap the selection, and stay undoable.
 */
export function MarkdownEditor({
  value,
  defaultValue,
  onValueChange,
  rows = 12,
  ...rest
}: MarkdownEditorProps) {
  const id = uid('mde')
  const held = bindable<string>(
    () => value,
    () => defaultValue,
    '',
    () => onValueChange,
  )
  const tab = state<'write' | 'preview'>('write')
  const html = derived(() => markdownToHtml(held.value))
  const onKey = markdownKeys(held)
  const onTabKey = (e: KeyboardEvent) => {
    const to = nextIndex(e.key, tab.value === 'write' ? 0 : 1, 2)
    if (to < 0) return
    e.preventDefault()
    tab.value = to ? 'preview' : 'write'
    flush()
    ;(e.currentTarget as Element).querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
  }
  const button = (name: 'write' | 'preview', text: string) => (
    <button
      type="button"
      role="tab"
      id={`${id}-${name}`}
      aria-selected={tab.value === name ? 'true' : 'false'}
      aria-controls={`${id}-${name}-p`}
      tabindex={tab.value === name ? '0' : '-1'}
      onClick={() => (tab.value = name)}
    >
      {text}
    </button>
  )
  return (
    <div data-scope="md-editor" data-tab={tab.value}>
      <div
        data-part="tabs"
        role="tablist"
        aria-label={untrack(() => rest.label)}
        onKeyDown={onTabKey}
      >
        {button('write', 'Write')}
        {button('preview', 'Preview')}
      </div>
      <div data-part="source" role="tabpanel" id={`${id}-write-p`} aria-labelledby={`${id}-write`}>
        <Textarea
          {...rest}
          reset={held.reset}
          rows={rows}
          value={held.value}
          spellcheck={false}
          onInput={(e: Event) => held.set((e.currentTarget as HTMLInputElement).value, 'keyboard')}
          onKeyDown={onKey}
        />
      </div>
      <div
        data-scope="markdown"
        role="tabpanel"
        id={`${id}-preview-p`}
        aria-labelledby={`${id}-preview`}
        tabindex="0"
        // oxlint-disable-next-line weft/no-html-sink -- the preview comes from markdownToHtml, which sanitizes
        innerHTML={html.value}
      ></div>
    </div>
  )
}
