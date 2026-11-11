import { derived } from '@kerf/core'
import { Avatar } from '../parts'
import { Button } from '../Button'
import { avatarTint, G, type GlyphName } from './shared'
import type { Note, NoteAction, NoteKind } from './Inbox'

const KIND: Record<NoteKind, [GlyphName, string]> = {
  mention: ['at', 'accent'],
  comment: ['comment', 'info'],
  assign: ['flag', 'caution'],
  approve: ['check', 'positive'],
  system: ['alert', 'critical'],
  invite: ['cal', 'accent'],
}
export const sentence = (n: Note) => [n.actor, n.verb, n.object, n.detail].filter(Boolean).join(' ')
const label = (n: Note) => `${sentence(n)}${n.read ? '' : ', unread'}, ${n.time}`

export function Row({
  n,
  at,
  size,
  leaving,
  stop,
  onKey,
  onPress,
  onFocus,
  onDismiss,
  onAction,
}: {
  n: Note
  at: number
  size: number
  leaving: boolean
  stop: boolean
  onKey: (e: KeyboardEvent, n: Note) => void
  onPress: (e: MouseEvent, n: Note) => void
  onFocus: () => void
  onDismiss: (n: Note, row: HTMLElement) => void
  onAction: (n: Note, id: string) => void
}) {
  const icon = derived(() => KIND[n.kind] ?? KIND.system)
  const name = derived(() => label(n))
  const glyph = derived(() => icon.value[0])
  return (
    <article
      data-scope="notification"
      data-sweep="surface"

      data-id={n.id}
      data-read={n.read ? '' : undefined}
      data-state={leaving ? 'dismissed' : undefined}
      tabindex={stop ? '0' : '-1'}
      data-initial={stop ? '' : undefined}
      aria-label={name.value}
      aria-posinset={at}
      aria-setsize={size}
      onKeyDown={(e: KeyboardEvent) => onKey(e, n)}
      onClick={(e: MouseEvent) => onPress(e, n)}
      onFocusIn={onFocus}
    >
      <span data-part="sweep-base" aria-hidden="true"></span>
      <span data-part="sweep" aria-hidden="true"></span>
      <span data-part="icon">
        <Avatar name={n.actor} style={avatarTint(n.actor)} />
        <span data-part="kind" data-tone={icon.value[1]}>
          <G name={glyph.value} />
        </span>
      </span>
      <NoteText n={n} />
      <span data-part="unread" aria-hidden="true"></span>
      {n.quote && <div data-part="quote">{n.quote}</div>}
      <span data-part="meta">
        {n.time}
        {n.source ? ` · ${n.source}` : ''}
      </span>
      <Dismiss n={n} onDismiss={onDismiss} />
      {n.actions?.length ? (
        <div data-part="actions">
          {n.actions.map((a: NoteAction) => (
            <Button
              key={a.id}
              size="sm"
              emphasis={a.emphasis ?? 'solid'}
              tone={a.emphasis === 'outline' ? 'neutral' : undefined}
              onClick={() => onAction(n, a.id)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}
    </article>
  )
}

function Dismiss({ n, onDismiss }: { n: Note; onDismiss: (n: Note, row: HTMLElement) => void }) {
  return (
    <Button
      emphasis="ghost"
      tone="neutral"
      size="sm"
      data-icon-only=""
      data-part="dismiss"
      aria-label={`Dismiss: ${n.actor} ${n.verb}`}
      tabindex="-1"
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        onDismiss(n, (e.currentTarget as HTMLElement).closest('article')!)
      }}
    >
      <G name="x" />
    </Button>
  )
}

function NoteText({ n }: { n: Note }) {
  return (
    <p data-part="text">
      <b>{n.actor}</b> {n.verb}
      {n.object ? ' ' : ''}
      {n.object && <b>{n.object}</b>}
      {n.detail ? ` ${n.detail}` : ''}
    </p>
  )
}
