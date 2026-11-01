import { AlertIcon, CheckIcon, ChecksIcon, ClockIcon, CopyIcon, QuoteIcon, SmileIcon } from '@weft/icons'
import { announce, arrivalTracker, burst, firstName, installSweep, joinNames, messageLog, quoteText, reactionName, textParts, threadRows, typingLine, uid, type ChatMessage, type MessageReaction, type ThreadRow } from '@weft/ui-core'
import { derived, onCleanup, onMount, state, untrack, watch } from 'weft'
import { Button } from '../Button'
import { use } from '../use'
import { Composer, TypingIndicator, type ComposerProps, type ComposerSend, type QuoteDraftValue } from './Composer'
import { PeerAvatar, read, SWEEP, type Live } from './peer'
import '../styles'
import '@weft/ui-core/styles/components/button.css'
import '@weft/ui-core/styles/app/tokens.css'
import '@weft/ui-core/styles/app/base.css'
import '@weft/ui-core/styles/app/thread.css'
import '@weft/ui-core/styles/app/message.css'
import '@weft/ui-core/styles/app/reactions.css'
import '@weft/ui-core/styles/app/thread-replies.css'
import '@weft/ui-core/styles/app/avatar-stack.css'


export interface MessageProps {
  message: ChatMessage
  continued?: boolean
  /** The last of mine: only it carries Sent or Read. */
  last?: boolean
  arrive?: boolean
  /** The quoted source, read live. */
  source?: ChatMessage
  onRetry?: (m: ChatMessage) => void
  onReact?: (m: ChatMessage, r: MessageReaction | null) => void
  onReplies?: (m: ChatMessage) => void
}

/**
 * One message (07 §5.1, §5.2): avatar, author, Actions toolbar, bubble (quote, text with mention chips), Jump to
 * original, attachment, reactions, thread replies, delivery. Continued messages hide avatar and author.
 */
export function Message({ message, continued, last, arrive, source, onRetry, onReact, onReplies }: MessageProps) {
  const who = () => (message.mine ? 'You' : message.author.name)
  const quoted = derived(() => {
    const q = message.quote
    if (!q) return null
    const src = source
    const author = src ? (src.mine ? 'You' : src.author.name) : q.author
    const deleted = q.deleted || (!src && !q.author && !q.channel)
    return { text: q.text, author, by: deleted ? 'Original message deleted' : q.channel ? `In ${q.channel}${author ? ` · ${author}` : ''}` : `${author} · ${src?.time ?? q.time ?? ''}`, ref: src ? q.ref : undefined, deleted }
  })
  const parts = derived(() => textParts(message.text, message.mentions))
  const state_ = derived(() => message.state)
  const delivery = derived(() => {
    const s = state_.value
    return !message.mine ? null : s === 'failed' || s === 'sending' ? s : last ? (s === 'read' ? 'read' : 'sent') : null
  })
  return (
    <div
      data-scope="message"
      role="article"
      tabindex="-1"
      data-mid={message.id}
      aria-label={`${who()}, ${message.time}${quoted.value?.author ? `, quoting ${quoted.value.author}` : ''}`}
      data-mine={message.mine ? '' : undefined}
      data-continued={continued ? '' : undefined}
      data-state={state_.value}
      data-arrive={arrive ? '' : undefined}
      data-mentions-me={message.mentions?.includes('you') ? '' : undefined}
    >
      {!message.mine && <PeerAvatar peer={message.author} />}
      <div data-part="body">
        {!continued && !message.mine && <div data-part="by"><b>{message.author.name}</b><time>{message.time}</time></div>}
        <div data-part="actions" role="toolbar" aria-label="Message actions">
          <Button emphasis="ghost" tone="neutral" size="sm" label="Quote reply" data-icon-only="" data-quote="" tabindex="-1" aria-keyshortcuts="Q"><QuoteIcon /></Button>
          <Button emphasis="ghost" tone="neutral" size="sm" label="Copy text" data-icon-only="" data-copytext="" tabindex="-1"><CopyIcon /></Button>
        </div>
        <div data-part="bubble" data-sweep="" data-phase="idle">
          <SWEEP />
          {quoted.value && (
            <blockquote data-part="quote">
              <span data-part="quote-by"><span data-part="sr-only">Quoting </span>{quoted.value.by}</span>
              {!quoted.value.deleted && <span data-part="quote-text">{quoted.value.text}</span>}
            </blockquote>
          )}
          <span data-part="text">{parts.value.map(p => p.mention ? <span key={p.at} data-part="mention">{p.text}</span> : <span key={p.at}>{p.text}</span>)}</span>
        </div>
        {quoted.value?.ref && <Button emphasis="link" tone="neutral" data-part="quote-jump" data-jump={quoted.value.ref}>Jump to original</Button>}
        {message.attachment && <div data-part="attachment"><i>{message.attachment.kind}</i><b>{message.attachment.name}</b><small>{message.attachment.meta}</small></div>}
        {(message.reactions?.length ?? 0) > 0 && (
          <div data-scope="reactions">
            {message.reactions!.map(r => (
              <button key={r.emoji} type="button" aria-pressed={r.mine ? 'true' : 'false'} aria-label={reactionName(r)} onClick={() => onReact?.(message, r)}>{r.emoji} <span>{r.count}</span></button>
            ))}
            <button type="button" aria-label="Add reaction" onClick={() => onReact?.(message, null)}><SmileIcon /></button>
          </div>
        )}
        {message.replies && (
          <button data-scope="thread-replies" type="button" onClick={() => onReplies?.(message)}>
            <span data-scope="avatar-stack">{(message.replies.people ?? []).map(p => <PeerAvatar key={p.id} peer={p} />)}</span>
            {message.replies.count} {message.replies.count === 1 ? 'reply' : 'replies'}{message.replies.last ? ` · last ${message.replies.last}` : ''}
          </button>
        )}
        {delivery.value === 'failed' && <span data-part="status"><AlertIcon /> Not sent. <Button emphasis="link" tone="critical" onClick={() => onRetry?.(message)}>Retry</Button></span>}
        {delivery.value === 'sending' && <span data-part="status"><ClockIcon /> Sending…</span>}
        {delivery.value === 'sent' && <span data-part="status"><CheckIcon /> Sent {message.time}</span>}
        {delivery.value === 'read' && <span data-part="status"><ChecksIcon /> Read {message.readAt ?? message.time}</span>}
      </div>
    </div>
  )
}

type RowCtx = Pick<MessageProps, 'onRetry' | 'onReact' | 'onReplies'> & { find: (id?: string) => ChatMessage | undefined; fresh: () => string[] }

function Row({ row, ctx }: { row: ThreadRow; ctx: RowCtx }) {
  const kind = untrack(() => row.kind)
  if (kind === 'message') {
    const r = () => row as Extract<ThreadRow, { kind: 'message' }>
    return <Message message={r().message} continued={r().continued} last={r().last} arrive={ctx.fresh().includes(r().id)} source={ctx.find(r().message.quote?.ref)} onRetry={ctx.onRetry} onReact={ctx.onReact} onReplies={ctx.onReplies} />
  }
  const d = () => row as Exclude<ThreadRow, { kind: 'message' }>
  return <div data-part="divider" data-unread={d().unread ? '' : undefined} role="separator" aria-label={d().unread ? 'New messages' : d().label}>{d().label}</div>
}

export interface ThreadProps {
  /** Names the region: "calendar-engine channel". */
  label: string
  messages: Live<ChatMessage[]>
  /** The first unread message: opening lands on the divider before it. */
  unreadFrom?: string | null
  /** Names typing now. */
  typing?: Live<string[]>
  /** The header's content (`data-part="app-bar"`): channel, members, stack, call, search. */
  header?: any
  onSend: (m: ComposerSend) => void
  onRetry?: (m: ChatMessage) => void
  onReact?: (m: ChatMessage, r: MessageReaction | null) => void
  onReplies?: (m: ChatMessage) => void
  composer: Omit<ComposerProps, 'onSend' | 'quote' | 'input'>
}

/**
 * A conversation (07 §5, §5.5): the log (role=log; day and unread dividers, grouping, stick to bottom, Jump to latest
 * with the new count, roving messages and Q), typing line, composer with the quote draft. New messages are announced
 * as one summary after 1 s of quiet, a failed send assertively once. Rows are keyed, so live updates patch in place.
 */
export function Thread({ label, messages, unreadFrom, typing, header, onSend, onRetry, onReact, onReplies, composer }: ThreadProps) {
  const id = uid('thread')
  const list = derived(() => read(messages))
  const rows = derived(() => threadRows(list.value, unreadFrom))
  const mark = arrivalTracker()
  const fresh = derived(() => mark(list.value.map(m => m.id)))
  const stuck = state(true)
  const unseen = state(0)
  const draft = state<QuoteDraftValue | null>(null)
  const typingNames = derived(() => read(typing) ?? [])
  const head = derived(() => header)
  let log: HTMLDivElement | undefined
  let box: HTMLTextAreaElement | undefined
  const doc = () => log!.ownerDocument
  const find = (mid?: string) => (mid ? list.value.find(m => m.id === mid) : undefined)

  onMount(() => {
    installSweep()
    const told = burst<string>(names => {
      const who = [...new Set(names)]
      announce(doc(), names.length === 1 ? `New message from ${who[0]}` : who.length === 1 ? `${names.length} new messages from ${who[0]}` : `${names.length} new messages from ${joinNames(who)}`)
    })
    const failed = new Set(untrack(() => list.value.filter(m => m.state === 'failed').map(m => m.id)))
    let seen = new Set(untrack(() => list.value.map(m => m.id)))
    onCleanup(told.cancel)
    watch(() => list.value, l => {
      for (const m of l) {
        if (!seen.has(m.id) && !m.mine) told.push(firstName(m.author.name))
        if (m.state === 'failed' && !failed.has(m.id)) { failed.add(m.id); announce(doc(), 'Message not sent', true) }
        if (m.state !== 'failed') failed.delete(m.id)
      }
      seen = new Set(l.map(m => m.id))
    })
  })
  use(messageLog, () => log, () => ({
    onQuote(mid: string, selection: string) {
      const m = find(mid)
      if (!m) return
      const author = m.mine ? 'You' : m.author.name
      draft.value = { ref: m.id, author, time: m.time, text: quoteText(m, selection) }
      box?.focus()
      announce(doc(), `Quoting ${author}. Escape removes the quote.`)
    },
    onStick(on: boolean, n: number) { stuck.value = on; unseen.value = n },
  }))
  const latest = () => {
    log!.scrollTop = log!.scrollHeight
    log!.dispatchEvent(new Event('scroll'))
    ;[...log!.querySelectorAll<HTMLElement>('[data-scope="message"]')].at(-1)?.focus({ preventScroll: true })
  }
  const ctx: RowCtx = { find, fresh: () => fresh.value, onRetry: m => onRetry?.(m), onReact: (m, r) => onReact?.(m, r), onReplies: m => onReplies?.(m) }
  const comp = untrack(() => composer)
  return (
    <section data-scope="thread" data-part="root" aria-label={label} id={id}>
      {head.value !== undefined ? <div data-part="app-bar">{head.value}</div> : <span></span>}
      <div ref={(n: any) => (log = n)} data-part="log" role="log" aria-label="Messages" aria-live="off" tabindex="-1">
        {rows.value.map(r => <Row key={r.id} row={r} ctx={ctx} />)}
      </div>
      {!stuck.value && <Button size="sm" data-part="jump" onClick={latest}>Jump to latest{unseen.value > 0 ? ` · ${unseen.value} new` : ''}</Button>}
      <div>
        <TypingIndicator text={typingLine(typingNames.value)} />
        <Composer {...comp} quote={draft} onSend={onSend} input={el => (box = el)} />
      </div>
    </section>
  )
}
