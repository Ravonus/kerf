import {
  AlertIcon,
  CheckIcon,
  ChecksIcon,
  ClockIcon,
  CopyIcon,
  QuoteIcon,
  SmileIcon,
} from '@weft-js/warp-icons'
import { reactionName, textParts } from '@weft-js/warp-core'
import { derived, untrack } from '@weft-js/core'
import { Text } from '@weft-js/core/text'
import { Button } from '../../Button'
import { PeerAvatar, SWEEP } from '../peer'
import type { MessageProps } from '../Thread'
import '../../styles'
import '@weft-js/warp-core/styles/components/button.css'
import '@weft-js/warp-core/styles/app/tokens.css'
import '@weft-js/warp-core/styles/app/base.css'
import '@weft-js/warp-core/styles/app/thread.css'
import '@weft-js/warp-core/styles/app/message.css'
import '@weft-js/warp-core/styles/app/reactions.css'
import '@weft-js/warp-core/styles/app/thread-replies.css'
import '@weft-js/warp-core/styles/app/avatar-stack.css'

function messageState(p: MessageProps) {
  const who = () => (p.message.mine ? 'You' : p.message.author.name)
  const quoted = derived(() => {
    const q = p.message.quote
    if (!q) return null
    const src = p.source
    const author = src ? (src.mine ? 'You' : src.author.name) : q.author
    const deleted = q.deleted || (!src && !q.author && !q.channel)
    return {
      text: q.text,
      author,
      by: deleted
        ? 'Original message deleted'
        : q.channel
          ? `In ${q.channel}${author ? ` · ${author}` : ''}`
          : `${author} · ${src?.time ?? q.time ?? ''}`,
      ref: src ? q.ref : undefined,
      deleted,
    }
  })
  const parts = derived(() => textParts(p.message.text, p.message.mentions))
  const state_ = derived(() => p.message.state)
  const delivery = derived(() => {
    const s = state_.value
    return !p.message.mine
      ? null
      : s === 'failed' || s === 'sending'
        ? s
        : p.last
          ? s === 'read'
            ? 'read'
            : 'sent'
          : null
  })
  return { who, quoted, parts, state_, delivery }
}

function messageReactions(p: MessageProps) {
  return (
    (p.message.reactions?.length ?? 0) > 0 && (
      <div data-scope="reactions">
        {p.message.reactions!.map((r) => (
          <button
            key={r.emoji}
            type="button"
            aria-pressed={r.mine ? 'true' : 'false'}
            aria-label={reactionName(r)}
            onClick={() => p.onReact?.(p.message, r)}
          >
            {r.emoji} <span>{r.count}</span>
          </button>
        ))}
        <button
          type="button"
          aria-label="Add reaction"
          onClick={() => p.onReact?.(p.message, null)}
        >
          <SmileIcon />
        </button>
      </div>
    )
  )
}

function messageReplies(p: MessageProps) {
  return (
    p.message.replies && (
      <button data-scope="thread-replies" type="button" onClick={() => p.onReplies?.(p.message)}>
        <span data-scope="avatar-stack">
          {(p.message.replies.people ?? []).map((peer) => (
            <PeerAvatar key={peer.id} peer={peer} />
          ))}
        </span>
        {p.message.replies.count} {p.message.replies.count === 1 ? 'reply' : 'replies'}
        {p.message.replies.last ? ` · last ${p.message.replies.last}` : ''}
      </button>
    )
  )
}

function messageFailed(p: MessageProps) {
  return (
    <span data-part="status">
      <AlertIcon /> Not sent.{' '}
      <Button emphasis="link" tone="critical" onClick={() => p.onRetry?.(p.message)}>
        Retry
      </Button>
    </span>
  )
}

function messageSending() {
  return (
    <span data-part="status">
      <ClockIcon /> Sending…
    </span>
  )
}

function messageSent(p: MessageProps) {
  return (
    <span data-part="status">
      <CheckIcon /> Sent {p.message.time}
    </span>
  )
}

function messageRead(p: MessageProps) {
  return (
    <span data-part="status">
      <ChecksIcon /> Read {p.message.readAt ?? p.message.time}
    </span>
  )
}

function messageBy(p: MessageProps) {
  return (
    <div data-part="by">
      <b>{p.message.author.name}</b>
      <time>{p.message.time}</time>
    </div>
  )
}

function messageJump(ctx: ReturnType<typeof messageState>) {
  return (
    <Button emphasis="link" tone="neutral" data-part="quote-jump" data-jump={ctx.quoted.value!.ref}>
      Jump to original
    </Button>
  )
}

function messageAttachment(p: MessageProps) {
  return (
    <div data-part="attachment">
      <i>{p.message.attachment!.kind}</i>
      <b>{p.message.attachment!.name}</b>
      <small>{p.message.attachment!.meta}</small>
    </div>
  )
}

function messageQuote(ctx: ReturnType<typeof messageState>) {
  return (
    <blockquote data-part="quote">
      <span data-part="quote-by">
        <span data-part="sr-only">Quoting </span>
        {ctx.quoted.value!.by}
      </span>
      {!ctx.quoted.value!.deleted && <span data-part="quote-text">{ctx.quoted.value!.text}</span>}
    </blockquote>
  )
}

function messageView(p: MessageProps, ctx: ReturnType<typeof messageState>) {
  return (
    <div
      data-scope="message"
      data-focus=""
      role="article"
      tabindex="-1"
      data-mid={p.message.id}
      aria-label={`${ctx.who()}, ${p.message.time}${ctx.quoted.value?.author ? `, quoting ${ctx.quoted.value.author}` : ''}`}
      data-mine={p.message.mine ? '' : undefined}
      data-continued={p.continued ? '' : undefined}
      data-state={ctx.state_.value}
      data-arrive={p.arrive ? '' : undefined}
      data-mentions-me={p.message.mentions?.includes('you') ? '' : undefined}
    >
      {!p.message.mine && <PeerAvatar peer={p.message.author} />}
      <div data-part="body">
        {!p.continued && !p.message.mine && messageBy(p)}
        <div data-part="actions" role="toolbar" aria-label="Message actions">
          <Button
            emphasis="ghost"
            tone="neutral"
            size="sm"
            label="Quote reply"
            data-icon-only=""
            data-quote=""
            tabindex="-1"
            aria-keyshortcuts="Q"
          >
            <QuoteIcon />
          </Button>
          <Button
            emphasis="ghost"
            tone="neutral"
            size="sm"
            label="Copy text"
            data-icon-only=""
            data-copytext=""
            tabindex="-1"
          >
            <CopyIcon />
          </Button>
        </div>
        <div data-part="bubble" data-sweep="">
          <SWEEP />
          {ctx.quoted.value && messageQuote(ctx)}
          {p.message.streaming ? (
            <Text stream as="div">
              {p.message.text}
            </Text>
          ) : (
            <span data-part="text" data-measure="">
              {ctx.parts.value.map((part) =>
                part.mention ? (
                  <span key={part.at} data-part="mention">
                    {part.text}
                  </span>
                ) : (
                  <span key={part.at}>{part.text}</span>
                ),
              )}
            </span>
          )}
        </div>
        {ctx.quoted.value?.ref && messageJump(ctx)}
        {p.message.attachment && messageAttachment(p)}
        {messageReactions(p)}
        {messageReplies(p)}
        {ctx.delivery.value === 'failed' && messageFailed(p)}
        {ctx.delivery.value === 'sending' && messageSending()}
        {ctx.delivery.value === 'sent' && messageSent(p)}
        {ctx.delivery.value === 'read' && messageRead(p)}
      </div>
    </div>
  )
}

/**
 * One message (07 §5.1, §5.2): avatar, author, Actions toolbar, bubble (quote, text with mention chips), Jump to
 * original, attachment, reactions, thread replies, delivery. Continued messages hide avatar and author.
 */
export function Message(props: MessageProps) {
  const p = untrack(() => props)
  const ctx = messageState(p)
  return messageView(p, ctx)
}
