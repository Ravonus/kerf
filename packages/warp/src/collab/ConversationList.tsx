import { PinIcon } from '@weft-js/warp-icons'
import { peerColor, roving, type Peer } from '@weft-js/warp-core'
import { Box, derived, state, untrack, type State } from '@weft-js/core'
import { Badge } from '../Badge'
import { Avatar } from '../parts'
import { use } from '@weft-js/warp-core/weft'
import { tint } from './peer'
import '../styles'
import '@weft-js/warp-core/styles/app/tokens.css'
import '@weft-js/warp-core/styles/app/conversations.css'

/** One conversation in the list. */
export type ChatConversation = Peer & {
  /** Last message. */
  preview: string
  time: string
  unread?: number
  muted?: boolean
  pinned?: boolean
  /** A channel draws "#"; a person draws initials. */
  channel?: boolean
  online?: boolean
  href?: string
}

/**
 * The conversation list (07 §5.1, §5.4): a listbox with `aria-selected` on the open channel. One tab stop, ↑/↓ and
 * Home/End rove, Enter or a press opens. `value` is a box or a plain id.
 */
export function ConversationList({
  label = 'Conversations',
  title,
  actions,
  items,
  value,
  onSelect,
}: {
  label?: string | undefined
  title?: unknown
  actions?: unknown
  items: ChatConversation[]
  value?: State<string> | string
  onSelect?: (c: ChatConversation) => void
}) {
  const own = state(untrack(() => (value instanceof Box ? '' : (value ?? ''))))
  const current = derived(() => (value instanceof Box ? value.value : (value ?? own.value)))
  const heading = derived(() => title)
  const tools = derived(() => actions)
  let box: HTMLDivElement | undefined
  use(
    roving,
    () => box,
    () => ({ items: '[role="option"]', orientation: 'vertical' as const }),
  )
  const pick = (e: Event, c: ChatConversation) => {
    if (!c.href) e.preventDefault()
    if (value instanceof Box) value.value = c.id
    else own.value = c.id
    onSelect?.(c)
  }
  const stop = derived(() =>
    items.some((c) => c.id === current.value) ? current.value : items[0]?.id,
  )
  return (
    <nav data-scope="conversations" aria-label={label}>
      {(heading.value !== undefined || tools.value !== undefined) && (
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 8px 6px">
          {heading.value}
          {tools.value}
        </div>
      )}
      <div ref={(n) => (box = n)} role="listbox" aria-label={label} style="display:contents">
        {items.map((c) => (
          <a
            key={c.id}
            href={c.href ?? '#'}
            role="option"
            aria-selected={current.value === c.id ? 'true' : 'false'}
            aria-current={current.value === c.id ? 'page' : undefined}
            tabindex={stop.value === c.id ? 0 : -1}
            data-unread={c.unread ? '' : undefined}
            data-muted={c.muted ? '' : undefined}
            onClick={(e: MouseEvent) => pick(e, c)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === ' ') {
                e.preventDefault()
                pick(e, c)
              }
            }}
          >
            <Avatar
              name={c.channel ? '#' : c.name}
              size="sm"
              status={c.online ? 'positive' : undefined}
              style={tint(peerColor(c))}
            />
            <b>{c.name}</b>
            <small>{c.preview}</small>
            <span data-part="side">
              <span>{c.time}</span>
              {c.unread ? (
                <Badge emphasis="solid" count srText={`${c.unread} unread`}>
                  {c.unread}
                </Badge>
              ) : c.pinned ? (
                <PinIcon />
              ) : null}
            </span>
          </a>
        ))}
      </div>
    </nav>
  )
}
