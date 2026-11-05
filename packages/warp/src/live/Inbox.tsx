import type { InboxTab } from '@weft-js/warp-core'
import type { LiveState } from '../parts'
import { Button } from '../Button'
import { inboxModel } from './InboxModel'
import { InboxHeader, InboxTabs } from './InboxHeader'
import { InboxFeed } from './InboxFeed'
import '../styles'
import '@weft-js/warp-core/styles/components/tabs.css'
import '@weft-js/warp-core/styles/components/link.css'
import '@weft-js/warp-core/styles/app/inbox.css'
import '@weft-js/warp-core/styles/app/notification.css'

/** What a notification is about, which picks its glyph. */
export type NoteKind = 'mention' | 'comment' | 'assign' | 'approve' | 'system' | 'invite'
/** A button on a notification. */
export interface NoteAction {
  id: string
  label: string
  emphasis?: 'solid' | 'outline'
}
/** One notification. */
export interface Note {
  id: string
  actor: string
  kind: NoteKind
  verb: string
  object?: string | undefined
  detail?: string | undefined
  /** Already formatted: the caller owns the clock. */
  time: string
  /** "Today", "Yesterday": see `dayLabel`. */
  day?: string | undefined
  source?: string | undefined
  quote?: string | undefined
  read?: boolean | undefined
  actions?: NoteAction[] | undefined
}

/** Props for Inbox. */
export interface InboxProps {
  /** Newest first. Undefined while the first load runs: skeletons, once. */
  items: Note[] | undefined | { value: Note[] | undefined } | (() => Note[] | undefined)
  /** The connection's state, shown in the foot as "Up to date" or "Connecting…". */
  live?: (LiveState | (() => LiveState)) | undefined
  /** The filter tabs, in order. Default all, unread and mentions. */
  tabs?: InboxTab[] | undefined
  title?: string | undefined
  variant?: 'popover' | undefined
  /** Is the inbox on screen? Rows are read after 2 s visible only while it is. */
  open?: boolean | undefined
  /** Updates waiting to sync (offline, reconnecting). */
  queued?: number | undefined
  viewAll?: string | undefined
  /** Adds a settings button to the header, and is called when it is pressed. */
  settings?: (() => void) | undefined
  /** Called with a row's id once it has been seen or opened. */
  onRead?: ((id: string) => void) | undefined
  /** Called when Mark all as read is pressed. */
  onReadAll?: (() => void) | undefined
  /** Called with a row's id when it is dismissed. */
  onDismiss?: ((id: string) => void) | undefined
  /** Undo a dismiss: put the row back. */
  onRestore?: ((note: Note) => void) | undefined
  onAction?: ((note: Note, action: string) => void) | undefined
  /** The row is a link to its object. */
  onOpen?: ((note: Note) => void) | undefined
}

/**
 * Inbox (07 §4.1, §4.2, §4.5): tabs filter one panel; a role=feed list grouped by day, rendered by key, so a read or an
 * approval patches the row in place. New rows arrive; with the list scrolled, an "n new" pill shows instead of moving
 * it. A dismissed row slides out and Undo is in the toast. Needs a mounted Toaster for Undo and announcements.
 */
export function Inbox({
  items,
  live,
  tabs = ['all', 'unread', 'mentions'],
  title = 'Notifications',
  variant,
  open = true,
  queued = 0,
  viewAll,
  settings,
  onRead,
  onReadAll,
  onDismiss,
  onRestore,
  onAction,
  onOpen,
}: InboxProps) {
  const model = inboxModel(() => ({
    items,
    live,
    tabs,
    title,
    variant,
    open,
    queued,
    viewAll,
    settings,
    onRead: onRead ? (id: string) => onRead?.(id) : undefined,
    onReadAll: onReadAll ? () => onReadAll?.() : undefined,
    onDismiss: onDismiss ? (id: string) => onDismiss?.(id) : undefined,
    onRestore: onRestore ? (note: Note) => onRestore?.(note) : undefined,
    onAction,
    onOpen: onOpen ? (note: Note) => onOpen?.(note) : undefined,
  }))
  return (
    <section
      ref={model.setRoot}
      data-scope="inbox"
      data-part="root"
      data-variant={variant}
      aria-labelledby={`${model.id}-t`}
    >
      <InboxHeader title={title} settings={settings} model={model} />
      <InboxTabs tabs={tabs} model={model} />
      {model.fresh.value > 0 && (
        <Button size="sm" data-part="new-pill" onClick={model.toTop}>
          {model.fresh.value} new
        </Button>
      )}
      <InboxFeed
        title={title}
        model={model}
        onAction={(note, action) => onAction?.(note, action)}
      />
      <div data-part="footer">
        <span>{model.sync.value}</span>
        {model.page.value && (
          <a href={model.page.value} data-scope="link">
            View all
          </a>
        )}
      </div>
    </section>
  )
}
