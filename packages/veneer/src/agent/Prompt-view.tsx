import {
  CommandIcon,
  FileIcon,
  GlobeIcon,
  MicIcon,
  PaperclipIcon,
  SendIcon,
  StopIcon,
  XIcon,
} from '@kerf-js/veneer-icons'
import { Button } from '../Button'
import { Bar, IconButton, Sweep } from './bits'
import { ContextMeter } from './ContextMeter'
import { ModelPicker } from './ModelPicker'
import type { PromptProps } from './Prompt'
import type { promptState, suggestActions, sendActions, fileActions } from './Prompt-model'

type View = ReturnType<typeof promptState> &
  ReturnType<typeof suggestActions> &
  Pick<ReturnType<typeof sendActions>, 'sendOrStop'> &
  ReturnType<typeof fileActions> & {
    p: PromptProps
    id: string
    onKey: (event: KeyboardEvent) => void
    setHost: (node: HTMLElement) => void
    setBox: (node: HTMLTextAreaElement) => void
    setPicker: (node: HTMLInputElement) => void
    getPicker: () => HTMLInputElement | undefined
    getBox: () => HTMLTextAreaElement | undefined
  }

export function promptView(view: View) {
  const { p, id, draft, shown, open, drag, listed, activeId, hasFiles } = view
  const { look, sendOrStop, onKey, onDrop, over } = view
  const { setHost, setBox } = view
  return (
    <div
      data-scope="prompt"
      style="position:relative;padding:0 var(--veneer-space-group) var(--veneer-space-group)"
    >
      {p.children}
      <div
        ref={(n) => setHost(n)}
        data-scope="composer"
        data-sweep=""
        data-pin={drag.value ? '' : undefined}
        style="margin:0"
        onDragOver={over}
        onDragLeave={() => (drag.value = false)}
        onDrop={onDrop}
      >
        <Sweep />
        {hasFiles.value && fileChips(view)}
        <label data-part="sr-only" for={`${id}-in`}>
          {p.label ?? 'Message the assistant'}
        </label>
        <textarea
          ref={(n) => setBox(n)}
          id={`${id}-in`}
          rows="1"
          enterkeyhint="send"
          placeholder={p.placeholder ?? 'Ask, or type / for commands'}
          aria-describedby={p.blocked ? `${id}-hint ${id}-why` : `${id}-hint`}
          aria-controls={listed.value ? `${id}-list` : undefined}
          aria-activedescendant={activeId.value}
          value={draft.value}
          onInput={(e) => {
            draft.set(e.currentTarget.value)
            look()
          }}
          onKeyDown={onKey}
          onClick={look}
          onBlur={() => (open.value = null)}
        ></textarea>
        {p.blocked && (
          <span data-part="hint" data-state="error" id={`${id}-why`}>
            {p.blocked}
          </span>
        )}
        <div data-part="row">
          {shown('attach') && attachButton(view)}
          {shown('attach') && filePicker(view)}
          {shown('slash') && !!p.commands?.length && commandsButton(view)}
          {shown('mic') && micButton(view)}
          {shown('web') && !p.compact && webButton(view)}
          <span data-part="spacer"></span>
          {p.context && contextView(view)}
          {p.models && modelView(view)}
          <Button
            data-part="send"
            data-icon-only=""
            tone={p.busy ? 'neutral' : undefined}
            label={p.busy ? 'Stop' : 'Send'}
            aria-disabled={p.blocked && !p.busy ? 'true' : undefined}
            onClick={sendOrStop}
          >
            {p.busy ? <StopIcon /> : <SendIcon />}
          </Button>
        </div>
        <span data-part="sr-only" id={`${id}-hint`}>
          Enter sends, Shift+Enter adds a line, Escape stops a running answer.
        </span>
        {listed.value && suggestList(view)}
      </div>
    </div>
  )
}

function fileChips({ p }: View) {
  return (
    <div data-part="files">
      {p.attachments ??
        (p.files ?? []).map((f) => (
          <span key={f.id} data-part="file">
            <FileIcon />
            <span>{f.name}</span>
            <IconButton
              icon={XIcon}
              label={`Remove ${f.name}`}
              onClick={() => p.onRemoveFile?.(f.id)}
            />
            {f.progress !== undefined && f.progress < 1 && (
              <Bar label={`Uploading ${f.name}`} value={f.progress} />
            )}
          </span>
        ))}
    </div>
  )
}

function attachButton({ getPicker }: View) {
  return (
    <IconButton icon={PaperclipIcon} label="Attach file" onClick={() => getPicker()?.click()} />
  )
}

function filePicker({ setPicker, add }: View) {
  return (
    <input
      ref={(n) => setPicker(n)}
      type="file"
      multiple
      hidden
      onChange={(e) => {
        add(e.currentTarget.files)
        e.currentTarget.value = ''
      }}
    />
  )
}

function commandsButton({ draft, getBox, look }: View) {
  return (
    <IconButton
      icon={CommandIcon}
      label="Commands"
      onClick={() => {
        draft.set('/')
        getBox()!.value = '/'
        getBox()!.focus()
        getBox()!.setSelectionRange(1, 1)
        look()
      }}
    />
  )
}

function micButton({ p }: View) {
  return (
    <IconButton
      icon={MicIcon}
      label="Dictate"
      tone={p.mic ? 'critical' : 'neutral'}
      aria-pressed={p.mic ? 'true' : 'false'}
      onClick={p.onMic}
    />
  )
}

function webButton({ p }: View) {
  return (
    <Button
      emphasis="ghost"
      tone="neutral"
      size="sm"
      aria-pressed={p.web ? 'true' : 'false'}
      onClick={() => p.onWebChange?.(!p.web)}
    >
      <GlobeIcon />
      <span data-part="label">Web</span>
    </Button>
  )
}

function contextView({ p }: View) {
  return (
    <ContextMeter
      used={p.context!.used}
      limit={p.context!.limit}
      parts={p.context!.parts}
      onCompact={p.onCompact}
    />
  )
}

function modelView({ p }: View) {
  return (
    <ModelPicker
      models={p.models!}
      value={p.model}
      onChange={p.onModelChange}
      compact={p.compact}
    />
  )
}

function suggestList({ id, open, options, oid, current, pick }: View) {
  return (
    <div
      data-scope="suggest"
      role="listbox"
      id={`${id}-list`}
      aria-label={open.value?.trigger === '/' ? 'Commands' : 'Mentions'}
    >
      <div data-part="group" aria-hidden="true">
        {open.value?.trigger === '/' ? 'Commands' : 'Mentions'}
      </div>
      {options.value.map((o) => (
        <div
          key={o.value}
          id={oid(o)}
          role="option"
          aria-selected={o === current.value ? 'true' : 'false'}
          onMouseDown={(e) => {
            e.preventDefault()
            pick(o.value)
          }}
        >
          <span data-part="cmd">{o.value}</span>
          <small>{o.description}</small>
          <kbd>{o === current.value ? '↵' : ''}</kbd>
        </div>
      ))}
    </div>
  )
}
