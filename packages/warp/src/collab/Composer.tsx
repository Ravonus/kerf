import { AtIcon, CheckIcon, PaperclipIcon, SendIcon, SmileIcon, XIcon } from '@weft-js/warp-icons'
import {
  announce,
  insertMention,
  mentionQuery,
  nextIndex,
  uid,
  type Peer,
} from '@weft-js/warp-core'
import { derived, state, untrack, type State } from '@weft-js/core'
import { Button } from '../Button'
import { PeerAvatar, SWEEP } from './peer'
import '../styles'
import '@weft-js/warp-core/styles/components/button.css'
import '@weft-js/warp-core/styles/app/tokens.css'
import '@weft-js/warp-core/styles/app/base.css'
import '@weft-js/warp-core/styles/app/composer.css'
import '@weft-js/warp-core/styles/app/suggest.css'
import '@weft-js/warp-core/styles/app/typing.css'

const HINT = 'Enter sends, Shift+Enter adds a line'

/** The message being quoted in a reply. */
export interface QuoteDraftValue {
  ref: string
  author: string
  time: string
  text: string
}
/** A file attached to a draft. */
export interface ComposerFile {
  id: string
  name: string
}
/** Someone an `@` can name. */
export type Mentionable = Peer & { status?: string | undefined }
/** What the composer sends. */
export interface ComposerSend {
  text: string
  quote?: QuoteDraftValue
}

/** Props for Composer. */
export interface ComposerProps {
  /** The textarea's name: "Message #calendar-engine". */
  label: string
  placeholder?: string
  onSend: (m: ComposerSend) => void
  /** The quote being drafted (§5.5), for a Thread to fill. */
  quote?: State<QuoteDraftValue | null>
  mentions?: Mentionable[]
  files?: ComposerFile[]
  onRemoveFile?: (f: ComposerFile) => void
  onAttach?: () => void
  /** The emoji slot: open a picker, then call `insert` with what was picked. */
  onEmoji?: (insert: (text: string) => void) => void
  onTyping?: () => void
  /** Hide the keyboard hint (phone). */
  compact?: boolean | undefined
  /** Reaches the textarea, for focus. */
  input?: (el: HTMLTextAreaElement) => void
}

/**
 * The composer (07 §5.1, §5.5): QuoteDraft, textarea, attach and emoji slots, @mention suggest listbox, Send. Enter
 * sends, Shift+Enter adds a line. A quote alone never sends: the hint says why. Escape closes the list, then the quote.
 */
export function Composer({
  label,
  placeholder,
  onSend,
  quote,
  mentions,
  files,
  onRemoveFile,
  onAttach,
  onEmoji,
  onTyping,
  compact,
  input: giveInput,
}: ComposerProps) {
  const id = uid('composer')
  const hint = state<string | null>(null)
  const query = state<string | null>(null)
  const active = state(0)
  const hasPeople = derived(() => (mentions ?? []).length > 0)
  const canAttach = derived(() => onAttach !== undefined)
  const canEmoji = derived(() => onEmoji !== undefined)
  const shown = derived(() => {
    const q = query.value?.toLowerCase()
    return q === undefined
      ? []
      : (mentions ?? []).filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8)
  })
  const open = derived(() => query.value !== null && shown.value.length > 0)
  const draft = derived(() => quote?.value ?? null)
  let ta: HTMLTextAreaElement | undefined

  const removeQuote = () => {
    if (quote) quote.value = null
    hint.value = null
  }
  const closeList = () => {
    query.value = null
    active.value = 0
  }
  const scan = () => {
    const q = ta ? mentionQuery(ta.value, ta.selectionStart) : null
    query.value = q && hasPeople.value ? q.query : null
    active.value = 0
  }
  const pick = (p: Mentionable) => {
    const next = insertMention(ta!.value, ta!.selectionStart, p.name.split(/\s+/)[0]!)
    ta!.value = next.value
    ta!.setSelectionRange(next.caret, next.caret)
    closeList()
    ta!.focus()
  }
  const send = () => {
    const text = ta!.value.trim()
    const q = draft.value
    if (!text) {
      if (!q) return
      hint.value = 'Add a reply to the quote'
      announce(ta!.ownerDocument, 'Add a reply to the quote', true)
      return ta!.focus()
    }
    ta!.value = ''
    closeList()
    removeQuote()
    onSend(q ? { text, quote: q } : { text })
  }
  const key = (e: KeyboardEvent) => {
    if (open.value) {
      const to = nextIndex(e.key, active.value, shown.value.length, { orientation: 'vertical' })
      if (to >= 0 && e.key !== 'Home' && e.key !== 'End') {
        e.preventDefault()
        active.value = to
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        return closeList()
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        return pick(shown.value[active.value]!)
      }
    }
    if (e.key === 'Escape' && draft.value) {
      e.preventDefault()
      removeQuote()
      return announce(ta!.ownerDocument, 'Quote removed')
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      send()
    }
  }
  const insert = (text: string) => {
    ta!.setRangeText(text, ta!.selectionStart, ta!.selectionEnd, 'end')
    ta!.focus()
  }
  return (
    <div data-scope="composer" data-sweep="">
      <SWEEP />
      {(files ?? []).length > 0 && (
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
                onClick={() => onRemoveFile?.(f)}
              />
            </span>
          ))}
        </div>
      )}
      {draft.value && (
        <div
          data-part="quote-draft"
          role="group"
          aria-label={`Quoting ${draft.value.author}`}
          data-arrive=""
        >
          <span data-part="quote-by">
            {draft.value.author} · {draft.value.time}
          </span>
          <span data-part="quote-text">{draft.value.text}</span>
          <Button
            emphasis="ghost"
            tone="neutral"
            size="sm"
            icon={XIcon}
            label="Remove quote"
            onClick={() => {
              removeQuote()
              ta!.focus()
              announce(ta!.ownerDocument, 'Quote removed')
            }}
          />
        </div>
      )}
      <label data-part="sr-only" for={id}>
        {label}
      </label>
      <textarea
        ref={(n) => {
          ta = n
          if (n) untrack(() => giveInput)?.(n)
        }}
        id={id}
        rows={1}
        placeholder={placeholder ?? label}
        aria-describedby={`${id}-h`}
        aria-autocomplete={hasPeople.value ? 'list' : undefined}
        aria-controls={open.value ? `${id}-l` : undefined}
        aria-activedescendant={open.value ? `${id}-o${active.value}` : undefined}
        onKeyDown={key}
        onInput={() => {
          hint.value = null
          scan()
          onTyping?.()
        }}
        onBlur={closeList}
      ></textarea>
      <div data-part="row">
        {canAttach.value && (
          <Button
            emphasis="ghost"
            tone="neutral"
            size="sm"
            label="Attach"
            data-icon-only=""
            onClick={() => onAttach?.()}
          >
            <PaperclipIcon />
          </Button>
        )}
        {canEmoji.value && (
          <Button
            emphasis="ghost"
            tone="neutral"
            size="sm"
            label="Emoji"
            data-icon-only=""
            onClick={() => onEmoji?.(insert)}
          >
            <SmileIcon />
          </Button>
        )}
        {hasPeople.value && (
          <Button
            emphasis="ghost"
            tone="neutral"
            size="sm"
            label="Mention someone"
            data-icon-only=""
            onClick={() => {
              insert(`${ta!.value && !/\s$/.test(ta!.value) ? ' ' : ''}@`)
              scan()
            }}
          >
            <AtIcon />
          </Button>
        )}
        <span data-part="spacer"></span>
        <span data-part="hint" id={`${id}-h`} data-state={hint.value ? 'error' : undefined}>
          {hint.value ?? (compact ? '' : HINT)}
        </span>
        <button
          type="button"
          data-scope="button"
          data-part="send"
          data-icon-only=""
          aria-label="Send"
          onClick={send}
        >
          <SendIcon />
        </button>
      </div>
      {open.value && (
        <div data-scope="suggest" role="listbox" id={`${id}-l`} aria-label="Mention">
          {shown.value.map((p) => (
            <div
              key={p.id}
              role="option"
              id={`${id}-o${shown.value.findIndex((x) => x.id === p.id)}`}
              aria-selected={shown.value[active.value]?.id === p.id ? 'true' : 'false'}
              onMouseDown={(e: MouseEvent) => {
                e.preventDefault()
                pick(p)
              }}
            >
              <PeerAvatar peer={p} size="sm" />
              <span>{p.name}</span>
              <small>{p.status}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** "Mei is typing…" with three dots (07 §5.1): real data, so it may animate; it holds still under reduced motion. */
export function TypingIndicator({ text }: { text: string }) {
  return (
    <div data-scope="typing" aria-live="polite">
      {text ? (
        <>
          <span data-part="dots" aria-hidden="true">
            <i></i>
            <i></i>
            <i></i>
          </span>
          <span>{text}</span>
        </>
      ) : (
        ' '
      )}
    </div>
  )
}
