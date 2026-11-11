import { uid, type Peer } from '@kerf-js/veneer-core'
import { untrack, type State } from '@kerf-js/core'
import { SWEEP } from './peer'
import { composerState } from './Composer/state'
import { ComposerFiles, ComposerQuote, ComposerRow, ComposerSuggestions } from './Composer/view'
import '../styles'
import '@kerf-js/veneer-core/styles/components/button.css'
import '@kerf-js/veneer-core/styles/app/tokens.css'
import '@kerf-js/veneer-core/styles/app/base.css'
import '@kerf-js/veneer-core/styles/app/composer.css'
import '@kerf-js/veneer-core/styles/app/suggest.css'
import '@kerf-js/veneer-core/styles/app/typing.css'

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
  const view = composerState({
    quote: () => quote,
    mentions: () => mentions,
    onSend: (message) => onSend(message()),
    onAttach: () => onAttach,
    onEmoji: () => onEmoji,
  })
  return (
    <div data-scope="composer" data-sweep="">
      <SWEEP />
      {(files ?? []).length > 0 && (
        <ComposerFiles files={files} onRemoveFile={(file) => onRemoveFile?.(file())} />
      )}
      {view.draft.value && <ComposerQuote view={view} />}
      <label data-part="sr-only" for={id}>
        {label}
      </label>
      <textarea
        ref={(n) => {
          view.refs.ta = n
          if (n) untrack(() => giveInput)?.(n)
        }}
        id={id}
        rows={1}
        placeholder={placeholder ?? label}
        aria-describedby={`${id}-h`}
        aria-autocomplete={view.hasPeople.value ? 'list' : undefined}
        aria-controls={view.open.value ? `${id}-l` : undefined}
        aria-activedescendant={view.open.value ? `${id}-o${view.active.value}` : undefined}
        onKeyDown={view.key}
        onInput={() => {
          view.hint.value = null
          view.scan()
          onTyping?.()
        }}
        onBlur={view.closeList}
      ></textarea>
      <ComposerRow
        id={id}
        view={view}
        compact={compact}
        onAttach={() => onAttach?.()}
        onEmoji={() => onEmoji?.(view.insert)}
      />
      {view.open.value && <ComposerSuggestions id={id} view={view} />}
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
