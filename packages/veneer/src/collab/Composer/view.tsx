import { AtIcon, CheckIcon, PaperclipIcon, SendIcon, SmileIcon, XIcon } from '@kerf/veneer-icons'
import { announce } from '@kerf/veneer-core'
import { Button } from '../../Button'
import { PeerAvatar } from '../peer'
import type { ComposerFile, ComposerProps } from '../Composer'
import type { composerState } from './state'

type View = ReturnType<typeof composerState>
const HINT = 'Enter sends, Shift+Enter adds a line'
export function ComposerFiles({
  files,
  onRemoveFile,
}: {
  files: ComposerProps['files']
  onRemoveFile: (file: () => ComposerFile) => void
}) {
  return (
    <div data-part="files">
      {(files ?? []).map((f) => (
        <span key={f.id} data-part="file" data-arrive="">
          <CheckIcon />
          <span>{f.name}</span>
          <Button
            emphasis="ghost"
            tone="neutral"
            size="sm"
            icon={XIcon}
            label={`Remove ${f.name}`}
            onClick={() => onRemoveFile(() => f)}
          />
        </span>
      ))}
    </div>
  )
}
export function ComposerQuote({ view }: { view: View }) {
  return (
    <div
      data-part="quote-draft"
      role="group"
      aria-label={`Quoting ${view.draft.value!.author}`}
      data-arrive=""
    >
      <span data-part="quote-by">
        {view.draft.value!.author} · {view.draft.value!.time}
      </span>
      <span data-part="quote-text">{view.draft.value!.text}</span>
      <Button
        emphasis="ghost"
        tone="neutral"
        size="sm"
        icon={XIcon}
        label="Remove quote"
        onClick={() => {
          view.removeQuote()
          view.refs.ta!.focus()
          announce(view.refs.ta!.ownerDocument, 'Quote removed')
        }}
      />
    </div>
  )
}
export function ComposerRow({
  id,
  view,
  compact,
  onAttach,
  onEmoji,
}: {
  id: string
  view: View
  compact: ComposerProps['compact']
  onAttach: () => void
  onEmoji: () => void
}) {
  return (
    <div data-part="row">
      {view.canAttach.value && (
        <Button
          emphasis="ghost"
          tone="neutral"
          size="sm"
          label="Attach"
          data-icon-only=""
          onClick={() => onAttach()}
        >
          <PaperclipIcon />
        </Button>
      )}
      {view.canEmoji.value && (
        <Button
          emphasis="ghost"
          tone="neutral"
          size="sm"
          label="Emoji"
          data-icon-only=""
          onClick={() => onEmoji()}
        >
          <SmileIcon />
        </Button>
      )}
      {view.hasPeople.value && (
        <Button
          emphasis="ghost"
          tone="neutral"
          size="sm"
          label="Mention someone"
          data-icon-only=""
          onClick={() => {
            view.insert(`${view.refs.ta!.value && !/\s$/.test(view.refs.ta!.value) ? ' ' : ''}@`)
            view.scan()
          }}
        >
          <AtIcon />
        </Button>
      )}
      <span data-part="spacer"></span>
      <span data-part="hint" id={`${id}-h`} data-state={view.hint.value ? 'error' : undefined}>
        {view.hint.value ?? (compact ? '' : HINT)}
      </span>
      <button
        type="button"
        data-scope="button"
        data-part="send"
        data-icon-only=""
        aria-label="Send"
        onClick={view.send}
      >
        <SendIcon />
      </button>
    </div>
  )
}
export function ComposerSuggestions({ id, view }: { id: string; view: View }) {
  return (
    <div data-scope="suggest" role="listbox" id={`${id}-l`} aria-label="Mention">
      {view.shown.value.map((p) => (
        <div
          key={p.id}
          role="option"
          id={`${id}-o${view.shown.value.findIndex((x) => x.id === p.id)}`}
          aria-selected={view.shown.value[view.active.value]?.id === p.id ? 'true' : 'false'}
          onMouseDown={(e: MouseEvent) => {
            e.preventDefault()
            view.pick(p)
          }}
        >
          <PeerAvatar peer={p} size="sm" />
          <span>{p.name}</span>
          <small>{p.status}</small>
        </div>
      ))}
    </div>
  )
}
