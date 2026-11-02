import { CommandIcon, FileIcon, GlobeIcon, MicIcon, PaperclipIcon, SendIcon, StopIcon, XIcon } from '@weft/icons'
import { announce, applySuggest, autosize, installSweep, suggestQuery, uid } from '@weft/warp-core'
import { derived, onMount, state, type State } from 'weft'
import { Button } from '../Button'
import { use } from '@weft/warp-core/weft'
import { Bar, held, IconButton, Sweep } from './bits'
import { ContextMeter, type ContextUse } from './ContextMeter'
import { ModelPicker, type ModelOption } from './ModelPicker'
import '../styles'
import '@weft/warp-core/styles/app/prompt.css'
import '@weft/warp-core/styles/app/composer.css'
import '@weft/warp-core/styles/app/suggest.css'

export type PromptTool = 'attach' | 'slash' | 'mic' | 'web'
export type PromptFile = { id: string; name: string; progress?: number }
export type PromptSuggestion = { value: string; description?: string }
export interface PromptControl { insert(text: string): void; focus(): void }

export interface PromptProps {
  value?: State<string> | string
  /** Called with the draft on every keystroke. */
  onValueChange?: (v: string) => void
  onSubmit?: (text: string) => void
  /** Pressing Stop or Escape while busy. Stop keeps what arrived. */
  onStop?: () => void
  /** A message sent while busy goes to the queue. */
  onQueue?: (text: string) => void
  busy?: boolean
  /** Why Send is off ("You're offline"): the button stays focusable and says why. */
  blocked?: string
  label?: string
  placeholder?: string
  tools?: PromptTool[]
  /** The picked model's id: a state, or a plain value with `onModelChange`. */
  model?: State<string> | string
  models?: ModelOption[]
  /** Called with the id of the model picked. */
  onModelChange?: (id: string) => void
  context?: ContextUse
  /** Called from the context meter's Compact: summarise the conversation to free room. */
  onCompact?: () => void
  /** Attached files shown as chips above the input, with upload progress. */
  files?: PromptFile[]
  /** Your own attachment row, in place of `files`. */
  attachments?: any
  /** Called with the files picked or dropped. */
  onAttach?: (files: File[]) => void
  /** Called with a file's id when its chip is removed. */
  onRemoveFile?: (id: string) => void
  /** What `/` offers: one suggestion each, with a description. */
  commands?: PromptSuggestion[]
  /** What `@` offers: one suggestion each, with a description. */
  mentions?: PromptSuggestion[]
  /** Whether the Web toggle is on. */
  web?: boolean
  /** Called with the Web toggle's new state. */
  onWebChange?: (on: boolean) => void
  /** Whether dictation is on: the mic button turns critical. */
  mic?: boolean
  /** Called when the mic button is pressed. */
  onMic?: () => void
  /** Phone: fewer tools, the model's short name. */
  compact?: boolean
  /** Hands over insert() and focus(), for SpeechInput's Insert. */
  control?: (c: PromptControl) => void
  /** Above the composer: Suggestions. */
  children?: any
}

/**
 * Prompt (07 §1.1, §1.6): one composer in the field's sweep. It grows to 8 lines; Enter sends, Shift+Enter adds a line,
 * Escape stops. Send and Stop are one button, so focus never drops. `/` and `@` open a suggest listbox on the textarea
 * (aria-activedescendant); files come by button or drop, the drag holding the sweep. Busy sends go to `onQueue`.
 */
export function Prompt(p: PromptProps) {
  const id = uid('prompt')
  const draft = held<string>(() => p.value, '', () => p.onValueChange)
  const toolset = derived(() => p.tools ?? ['attach', 'slash', 'mic', 'web'])
  const shown = (t: PromptTool) => toolset.value.includes(t)
  const open = state<ReturnType<typeof suggestQuery>>(null)
  const active = state(0)
  const drag = state(false)
  const options = derived(() => {
    const q = open.value
    if (!q) return []
    const list = (q.trigger === '/' ? p.commands : p.mentions) ?? []
    return list.filter(o => o.value.slice(1).toLowerCase().startsWith(q.query))
  })
  const listed = derived(() => options.value.length > 0)
  const oid = (o: PromptSuggestion) => `${id}-o-${o.value.slice(1)}`
  const current = derived(() => options.value[Math.min(active.value, options.value.length - 1)])
  const activeId = derived(() => (current.value ? oid(current.value) : undefined))
  const hasFiles = derived(() => p.attachments !== undefined || !!p.files?.length)
  let box: HTMLTextAreaElement | undefined
  let host: HTMLElement | undefined
  let picker: HTMLInputElement | undefined
  use(autosize, () => box, () => draft.value)
  onMount(() => {
    p.control?.({
      insert(text) {
        draft.set(draft.value ? `${draft.value} ${text}` : text)
        box!.focus({ preventScroll: true })
        installSweep().confirm(host)
        announce(box!.ownerDocument, 'Inserted into the message box.')
      },
      focus: () => box!.focus(),
    })
  })
  const look = () => {
    open.value = suggestQuery(box!.value, box!.selectionStart)
    active.value = 0
  }
  const pick = (value: string) => {
    const q = open.value!
    const next = applySuggest(box!.value, q.start, box!.selectionStart, value)
    draft.set(next.text)
    open.value = null
    box!.value = next.text
    box!.focus()
    box!.setSelectionRange(next.caret, next.caret)
  }
  const send = () => {
    const text = draft.value.trim()
    if (!text) return
    if (p.busy) {
      if (!p.onQueue) return
      p.onQueue(text)
      announce(box!.ownerDocument, 'Queued. It will run after the current step.')
    } else if (p.blocked) return
    else p.onSubmit?.(text)
    draft.set('')
    open.value = null
  }
  const press = () => (p.busy ? p.onStop?.() : send())
  const onKey = (e: KeyboardEvent) => {
    if (listed.value) {
      const n = options.value.length
      if (e.key === 'Escape') { e.preventDefault(); open.value = null; return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active.value = (active.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(current.value.value); return }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() }
    else if (e.key === 'Escape' && p.busy) { e.preventDefault(); p.onStop?.() }
  }
  const add = (list: FileList | null | undefined) => { const f = [...(list ?? [])]; if (f.length) p.onAttach?.(f) }
  const onDrop = (e: DragEvent) => { e.preventDefault(); drag.value = false; add(e.dataTransfer?.files) }
  const over = (e: DragEvent) => { e.preventDefault(); drag.value = true }
  return (
    <div data-scope="prompt" style="position:relative;padding:0 var(--warp-space-group) var(--warp-space-group)">
      {p.children}
      <div ref={(n: any) => (host = n)} data-scope="composer" data-sweep="" data-pin={drag.value ? '' : undefined} style="margin:0" onDragOver={over} onDragLeave={() => (drag.value = false)} onDrop={onDrop}>
        <Sweep />
        {hasFiles.value && (
          <div data-part="files">
            {p.attachments ?? (p.files ?? []).map(f => (
              <span key={f.id} data-part="file">
                <FileIcon /><span>{f.name}</span>
                <IconButton icon={XIcon} label={`Remove ${f.name}`} onClick={() => p.onRemoveFile?.(f.id)} />
                {f.progress !== undefined && f.progress < 1 && <Bar label={`Uploading ${f.name}`} value={f.progress} />}
              </span>
            ))}
          </div>
        )}
        <label data-part="sr-only" for={`${id}-in`}>{p.label ?? 'Message the assistant'}</label>
        <textarea ref={(n: any) => (box = n)} id={`${id}-in`} rows="1" enterkeyhint="send" placeholder={p.placeholder ?? 'Ask, or type / for commands'} aria-describedby={p.blocked ? `${id}-hint ${id}-why` : `${id}-hint`} aria-controls={listed.value ? `${id}-list` : undefined} aria-activedescendant={activeId.value} value={draft.value} onInput={e => { draft.set((e.currentTarget as HTMLTextAreaElement).value); look() }} onKeyDown={onKey} onClick={look} onBlur={() => (open.value = null)}></textarea>
        {p.blocked && <span data-part="hint" data-state="error" id={`${id}-why`}>{p.blocked}</span>}
        <div data-part="row">
          {shown('attach') && <IconButton icon={PaperclipIcon} label="Attach file" onClick={() => picker?.click()} />}
          {shown('attach') && <input ref={(n: any) => (picker = n)} type="file" multiple hidden onChange={e => { add((e.currentTarget as HTMLInputElement).files); (e.currentTarget as HTMLInputElement).value = '' }} />}
          {shown('slash') && !!p.commands?.length && <IconButton icon={CommandIcon} label="Commands" onClick={() => { draft.set('/'); box!.value = '/'; box!.focus(); box!.setSelectionRange(1, 1); look() }} />}
          {shown('mic') && <IconButton icon={MicIcon} label="Dictate" tone={p.mic ? 'critical' : 'neutral'} aria-pressed={p.mic ? 'true' : 'false'} onClick={p.onMic} />}
          {shown('web') && !p.compact && <Button emphasis="ghost" tone="neutral" size="sm" aria-pressed={p.web ? 'true' : 'false'} onClick={() => p.onWebChange?.(!p.web)}><GlobeIcon /><span data-part="label">Web</span></Button>}
          <span data-part="spacer"></span>
          {p.context && <ContextMeter used={p.context.used} limit={p.context.limit} parts={p.context.parts} onCompact={p.onCompact} />}
          {p.models && <ModelPicker models={p.models} value={p.model} onChange={p.onModelChange} compact={p.compact} />}
          <Button data-part="send" data-icon-only="" tone={p.busy ? 'neutral' : undefined} label={p.busy ? 'Stop' : 'Send'} aria-disabled={p.blocked && !p.busy ? 'true' : undefined} onClick={press}>{p.busy ? <StopIcon /> : <SendIcon />}</Button>
        </div>
        <span data-part="sr-only" id={`${id}-hint`}>Enter sends, Shift+Enter adds a line, Escape stops a running answer.</span>
        {listed.value && (
          <div data-scope="suggest" role="listbox" id={`${id}-list`} aria-label={open.value?.trigger === '/' ? 'Commands' : 'Mentions'}>
            <div data-part="group" aria-hidden="true">{open.value?.trigger === '/' ? 'Commands' : 'Mentions'}</div>
            {options.value.map(o => (
              <div key={o.value} id={oid(o)} role="option" aria-selected={o === current.value ? 'true' : 'false'} onMouseDown={e => { e.preventDefault(); pick(o.value) }}>
                <span data-part="cmd">{o.value}</span><small>{o.description}</small><kbd>{o === current.value ? '↵' : ''}</kbd>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
