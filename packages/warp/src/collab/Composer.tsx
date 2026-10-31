import { announce, insertMention, installSweep, mentionQuery, nextIndex, uid, type Peer } from '@weft/ui-core'
import { derived, onMount, state, untrack, type State } from 'weft'
import { Button } from '../Button'
import { Glyph } from '../parts'
import { Icon } from '../Icon'
import { PeerAvatar, SWEEP } from './peer'
import '../styles'
import '@weft/ui-core/styles/components/button.css'
import '@weft/ui-core/styles/app/tokens.css'
import '@weft/ui-core/styles/app/base.css'
import '@weft/ui-core/styles/app/composer.css'
import '@weft/ui-core/styles/app/suggest.css'
import '@weft/ui-core/styles/app/typing.css'

export const CLIP = 'M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7'
export const SMILE = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5s1.2 1.5 3.5 1.5 3.5-1.5 3.5-1.5M9 9.5h.01M15 9.5h.01'
const AT = 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1'
const SEND = 'M5 12h13M12 5l7 7-7 7'
const HINT = 'Enter sends, Shift+Enter adds a line'

export interface QuoteDraftValue { ref: string; author: string; time: string; text: string }
export interface ComposerFile { id: string; name: string }
export type Mentionable = Peer & { status?: string }
export interface ComposerSend { text: string; quote?: QuoteDraftValue }

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
  compact?: boolean
  /** Reaches the textarea, for focus. */
  input?: (el: HTMLTextAreaElement) => void
}

/**
 * The composer (07 §5.1, §5.5): QuoteDraft, textarea, attach and emoji slots, @mention suggest listbox, Send. Enter
 * sends, Shift+Enter adds a line. A quote alone never sends: the hint says why. Escape closes the list, then the quote.
 */
export function Composer({ label, placeholder, onSend, quote, mentions, files, onRemoveFile, onAttach, onEmoji, onTyping, compact, input: giveInput }: ComposerProps) {
  const id = uid('composer')
  const hint = state<string | null>(null)
  const query = state<string | null>(null)
  const active = state(0)
  const hasPeople = derived(() => (mentions ?? []).length > 0)
  const canAttach = derived(() => onAttach !== undefined)
  const canEmoji = derived(() => onEmoji !== undefined)
  const shown = derived(() => {
    const q = query.value?.toLowerCase()
    return q === undefined ? [] : (mentions ?? []).filter(p => p.name.toLowerCase().includes(q)).slice(0, 8)
  })
  const open = derived(() => query.value !== null && shown.value.length > 0)
  const draft = derived(() => quote?.value ?? null)
  let ta: HTMLTextAreaElement | undefined
  onMount(() => installSweep())

  const removeQuote = () => {
    if (quote) quote.value = null
    hint.value = null
  }
  const closeList = () => { query.value = null; active.value = 0 }
  const scan = () => {
    const q = ta ? mentionQuery(ta.value, ta.selectionStart) : null
    query.value = q && hasPeople.value ? q.query : null
    active.value = 0
  }
  const pick = (p: Mentionable) => {
    const next = insertMention(ta!.value, ta!.selectionStart, p.name.split(/\s+/)[0])
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
      if (to >= 0 && e.key !== 'Home' && e.key !== 'End') { e.preventDefault(); active.value = to; return }
      if (e.key === 'Escape') { e.preventDefault(); return closeList() }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return pick(shown.value[active.value]) }
    }
    if (e.key === 'Escape' && draft.value) { e.preventDefault(); removeQuote(); return announce(ta!.ownerDocument, 'Quote removed') }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() }
  }
  const insert = (text: string) => {
    ta!.setRangeText(text, ta!.selectionStart, ta!.selectionEnd, 'end')
    ta!.focus()
  }
  return (
    <div data-scope="composer" data-sweep="" data-phase="idle">
      <SWEEP />
      {(files ?? []).length > 0 && (
        <div data-part="files">
          {(files ?? []).map(f => (
            <span key={f.id} data-part="file" data-arrive="">
              <Icon name="check" /><span>{f.name}</span>
              <Button emphasis="ghost" tone="neutral" size="sm" icon="x" label={`Remove ${f.name}`} onClick={() => onRemoveFile?.(f)} />
            </span>
          ))}
        </div>
      )}
      {draft.value && (
        <div data-part="quote-draft" role="group" aria-label={`Quoting ${draft.value.author}`} data-arrive="">
          <span data-part="quote-by">{draft.value.author} · {draft.value.time}</span>
          <span data-part="quote-text">{draft.value.text}</span>
          <Button emphasis="ghost" tone="neutral" size="sm" icon="x" label="Remove quote" onClick={() => { removeQuote(); ta!.focus(); announce(ta!.ownerDocument, 'Quote removed') }} />
        </div>
      )}
      <label data-part="sr-only" for={id}>{label}</label>
      <textarea
        ref={(n: any) => { ta = n; if (n) untrack(() => giveInput)?.(n) }}
        id={id}
        rows={1}
        placeholder={placeholder ?? label}
        aria-describedby={`${id}-h`}
        aria-autocomplete={hasPeople.value ? 'list' : undefined}
        aria-controls={open.value ? `${id}-l` : undefined}
        aria-activedescendant={open.value ? `${id}-o${active.value}` : undefined}
        onKeyDown={key}
        onInput={() => { hint.value = null; scan(); onTyping?.() }}
        onBlur={closeList}
      ></textarea>
      <div data-part="row">
        {canAttach.value && <Button emphasis="ghost" tone="neutral" size="sm" label="Attach" data-icon-only="" onClick={() => onAttach?.()}><Glyph d={CLIP} /></Button>}
        {canEmoji.value && <Button emphasis="ghost" tone="neutral" size="sm" label="Emoji" data-icon-only="" onClick={() => onEmoji?.(insert)}><Glyph d={SMILE} /></Button>}
        {hasPeople.value && <Button emphasis="ghost" tone="neutral" size="sm" label="Mention someone" data-icon-only="" onClick={() => { insert(`${ta!.value && !/\s$/.test(ta!.value) ? ' ' : ''}@`); scan() }}><Glyph d={AT} /></Button>}
        <span data-part="spacer"></span>
        <span data-part="hint" id={`${id}-h`} data-state={hint.value ? 'error' : undefined}>{hint.value ?? (compact ? '' : HINT)}</span>
        <button type="button" data-scope="button" data-part="send" data-icon-only="" aria-label="Send" onClick={send}><Glyph d={SEND} /></button>
      </div>
      {open.value && (
        <div data-scope="suggest" role="listbox" id={`${id}-l`} aria-label="Mention">
          {shown.value.map(p => (
            <div key={p.id} role="option" id={`${id}-o${shown.value.findIndex(x => x.id === p.id)}`} aria-selected={shown.value[active.value]?.id === p.id ? 'true' : 'false'} onMouseDown={(e: MouseEvent) => { e.preventDefault(); pick(p) }}>
              <PeerAvatar peer={p} size="sm" /><span>{p.name}</span><small>{p.status}</small>
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
      {text ? <><span data-part="dots" aria-hidden="true"><i></i><i></i><i></i></span><span>{text}</span></> : ' '}
    </div>
  )
}
