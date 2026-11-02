import { AlertIcon, CheckIcon, ChecksIcon, ClockIcon, CopyIcon, QuoteIcon, SmileIcon } from '@weft-js/warp-icons'
import { announce, arrivalTracker, burst, firstName, installSweep, joinNames, messageLog, quoteText, reactionName, STICK_PX, textParts, threadRows, typingLine, uid, type ChatMessage, type MessageReaction, type ThreadRow } from '@weft-js/warp-core'
import { derived, onCleanup, onMount, state, untrack, watch } from '@weft-js/core'
import { Text } from '@weft-js/core/text'
import { Button } from '../Button'
import { use } from '@weft-js/warp-core/weft'
import { VirtualList, type VirtualControl } from '../VirtualList'
import { Composer, TypingIndicator, type ComposerProps, type ComposerSend, type QuoteDraftValue } from './Composer'
import { PeerAvatar, read, SWEEP, type Live } from './peer'
import '../styles'
import '@weft-js/warp-core/styles/components/button.css'
import '@weft-js/warp-core/styles/app/tokens.css'
import '@weft-js/warp-core/styles/app/base.css'
import '@weft-js/warp-core/styles/app/thread.css'
import '@weft-js/warp-core/styles/app/message.css'
import '@weft-js/warp-core/styles/app/reactions.css'
import '@weft-js/warp-core/styles/app/thread-replies.css'
import '@weft-js/warp-core/styles/app/avatar-stack.css'


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
      data-focus=""
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
        <div data-part="bubble" data-sweep="">
          <SWEEP />
          {quoted.value && (
            <blockquote data-part="quote">
              <span data-part="quote-by"><span data-part="sr-only">Quoting </span>{quoted.value.by}</span>
              {!quoted.value.deleted && <span data-part="quote-text">{quoted.value.text}</span>}
            </blockquote>
          )}
          {message.streaming
            ? <Text stream as="div">{message.text}</Text>
            : <span data-part="text" data-measure="">{parts.value.map(p => p.mention ? <span key={p.at} data-part="mention">{p.text}</span> : <span key={p.at}>{p.text}</span>)}</span>}
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

type MessageRow = Extract<ThreadRow, { kind: 'message' }>
/** One row of the window: a message, and the divider above it if it has one. */
type Entry = { id: string; row: MessageRow; divider?: Exclude<ThreadRow, MessageRow> }

function entries(rows: readonly ThreadRow[]) {
  const out: Entry[] = []
  let divider: Entry['divider']
  for (const r of rows) {
    if (r.kind !== 'message') { divider = r; continue }
    out.push({ id: r.id, row: r, divider })
    divider = undefined
  }
  return out
}

const plain = (m: ChatMessage) => !m.quote && !m.attachment && !m.reactions?.length && !m.replies && !m.mentions?.length && !m.streaming
/** Rows that look the same around their text share one measurement. Anything richer is measured when it renders. */
function shape({ row: { message: m, continued, last }, divider }: Entry) {
  if (!plain(m)) return 'rich'
  const status = !m.mine ? '' : m.state === 'failed' || m.state === 'sending' ? m.state : last ? 'last' : ''
  return `${m.mine ? 'm' : continued ? 'c' : 'h'}${divider?.unread ? 'u' : divider ? 'd' : ''}${status}`
}

function Divider({ d }: { d: NonNullable<Entry['divider']> }) {
  return <div data-part="divider" data-unread={d.unread ? '' : undefined} role="separator" aria-label={d.unread ? 'New messages' : d.label}>{d.label}</div>
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
  /** A log height, if the parent doesn't size the thread. */
  height?: string
  /** No `onSend`, no composer: a read-only log. */
  onSend?: (m: ComposerSend) => void
  onRetry?: (m: ChatMessage) => void
  onReact?: (m: ChatMessage, r: MessageReaction | null) => void
  onReplies?: (m: ChatMessage) => void
  /** Near the top: load older messages, and prepend them to `messages`. */
  onOlder?: () => void
  onDrift?: (index: number, predicted: number, actual: number) => void
  control?: (c: VirtualControl) => void
  composer?: Omit<ComposerProps, 'onSend' | 'quote' | 'input'>
}

/**
 * A conversation (07 §5, §5.5): the log, a window of rows, so 100,000 messages cost what 20 do (role=log; day and unread
 * dividers, grouping, stick to bottom, Jump to latest with the new count, roving messages and Q), typing line, composer
 * with the quote draft. New messages are announced as one summary after 1 s of quiet, a failed send assertively once.
 * Plain messages have exact heights from `text.measure`; rows are keyed, so live updates patch in place.
 */
export function Thread({ label, messages, unreadFrom, typing, header, height, onSend, onRetry, onReact, onReplies, onOlder, onDrift, control, composer }: ThreadProps) {
  const id = uid('thread')
  const list = derived(() => read(messages))
  const rows = derived(() => entries(threadRows(list.value, unreadFrom)))
  const ids = derived(() => list.value.map(m => m.id))
  const mark = arrivalTracker()
  const fresh = derived(() => mark(ids.value))
  const stuck = state(true)
  const unseen = state(0)
  const draft = state<QuoteDraftValue | null>(null)
  const typingNames = derived(() => read(typing) ?? [])
  const head = derived(() => header)
  let root: HTMLElement | undefined
  let box: HTMLTextAreaElement | undefined
  let win: VirtualControl | undefined
  const doc = () => root!.ownerDocument
  const find = (mid?: string) => (mid ? list.value.find(m => m.id === mid) : undefined)

  onMount(() => {
    const told = burst<string>(names => {
      const who = [...new Set(names)]
      announce(doc(), names.length === 1 ? `New message from ${who[0]}` : who.length === 1 ? `${names.length} new messages from ${who[0]}` : `${names.length} new messages from ${joinNames(who)}`)
    })
    const failed = new Set(untrack(() => list.value.filter(m => m.state === 'failed').map(m => m.id)))
    let seen = new Set(untrack(() => ids.value))
    onCleanup(told.cancel)
    watch(() => list.value, l => {
      for (const m of l) {
        if (!seen.has(m.id) && !m.mine) told.push(firstName(m.author.name))
        if (m.state === 'failed' && !failed.has(m.id)) { failed.add(m.id); announce(doc(), 'Message not sent', true) }
        if (m.state !== 'failed') failed.delete(m.id)
      }
      const last = l.at(-1)
      if (last && !seen.has(last.id)) { // a prepend of older messages isn't an arrival
        const known = l.findIndex(m => seen.has(m.id))
        const arrived = l.slice(l.findLastIndex(m => seen.has(m.id)) + 1)
        if (arrived.some(m => m.mine)) queueMicrotask(() => win?.scrollToEnd())
        else if (known >= 0 && !stuck.value) unseen.value += arrived.length
      }
      seen = new Set(l.map(m => m.id))
    })
  })
  use(messageLog, () => root?.querySelector<HTMLElement>('[data-part="log"]') ?? undefined, () => ({
    onQuote(mid: string, selection: string) {
      const m = find(mid)
      if (!m) return
      const author = m.mine ? 'You' : m.author.name
      draft.value = { ref: m.id, author, time: m.time, text: quoteText(m, selection) }
      box?.focus()
      announce(doc(), `Quoting ${author}. Escape removes the quote.`)
    },
    ids: () => untrack(() => ids.value),
    reveal: (mid: string) => win?.focus(mid),
  }))
  const latest = () => {
    win?.scrollToEnd()
    const last = ids.value.at(-1)
    if (last !== undefined) win?.focus(last)
  }
  const take = (c: VirtualControl) => {
    win = c
    control?.(c)
    const open = untrack(() => unreadFrom)
    if (open) queueMicrotask(() => c.scrollTo(open))
  }
  const row = (e: () => Entry) => {
    const source = derived(() => find(e().row.message.quote?.ref))
    return <>
      {e().divider && <Divider d={e().divider!} />}
      <Message message={e().row.message} continued={e().row.continued} last={e().row.last} arrive={fresh.value.includes(e().id)} source={source.value} onRetry={m => onRetry?.(m)} onReact={(m, r) => onReact?.(m, r)} onReplies={m => onReplies?.(m)} />
    </>
  }
  return (
    <section ref={(n: any) => (root = n)} data-scope="thread" data-part="root" aria-label={label} id={id} style={height ? `block-size:${height}` : undefined}>
      {head.value !== undefined ? <div data-part="app-bar">{head.value}</div> : <span></span>}
      <VirtualList
        part="log"
        role="log"
        bareRows
        open
        tabindex={-1}
        label="Messages"
        items={rows.value}
        rowKey={e => e.id}
        text={e => (plain(e.row.message) ? e.row.message.text : null)}
        variant={shape}
        estimate={64}
        gap={2}
        stick={STICK_PX}
        from={untrack(() => (unreadFrom ? 'start' : 'end'))}
        onStart={onOlder}
        onStick={s => { stuck.value = s; if (s) unseen.value = 0 }}
        onDrift={onDrift}
        control={take}
      >{row}</VirtualList>
      {!stuck.value && <Button size="sm" data-part="jump" onClick={latest}>Jump to latest{unseen.value > 0 ? ` · ${unseen.value} new` : ''}</Button>}
      <div>
        <TypingIndicator text={typingLine(typingNames.value)} />
        {onSend && <Composer {...(composer ?? { label: `Message ${label}` })} quote={draft} onSend={m => onSend!(m)} input={el => (box = el)} />}
      </div>
    </section>
  )
}
