import type { ChatMessage, ThreadRow } from '@kerf-js/veneer-core'

type MessageRow = Extract<ThreadRow, { kind: 'message' }>
/** One row of the window: a message, and the divider above it if it has one. */
export type Entry = {
  id: string
  row: MessageRow
  divider?: Exclude<ThreadRow, MessageRow> | undefined
}

export function entries(rows: readonly ThreadRow[]) {
  const out: Entry[] = []
  let divider: Entry['divider']
  for (const r of rows) {
    if (r.kind !== 'message') {
      divider = r
      continue
    }
    out.push({ id: r.id, row: r, divider })
    divider = undefined
  }
  return out
}

export const plain = (m: ChatMessage) =>
  !m.quote &&
  !m.attachment &&
  !m.reactions?.length &&
  !m.replies &&
  !m.mentions?.length &&
  !m.streaming
/** Rows that look the same around their text share one measurement. Anything richer is measured when it renders. */
export function shape({ row: { message: m, continued, last }, divider }: Entry) {
  if (!plain(m)) return 'rich'
  const status = !m.mine
    ? ''
    : m.state === 'failed' || m.state === 'sending'
      ? m.state
      : last
        ? 'last'
        : ''
  return `${m.mine ? 'm' : continued ? 'c' : 'h'}${divider?.unread ? 'u' : divider ? 'd' : ''}${status}`
}

export function Divider({ d }: { d: NonNullable<Entry['divider']> }) {
  return (
    <div
      data-part="divider"
      data-unread={d.unread ? '' : undefined}
      role="separator"
      aria-label={d.unread ? 'New messages' : d.label}
    >
      {d.label}
    </div>
  )
}
