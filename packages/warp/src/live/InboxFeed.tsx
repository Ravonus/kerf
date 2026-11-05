import { Skeleton } from '../Skeleton'
import { Row } from './InboxRow'
import type { Note } from './Inbox'
import type { inboxModel } from './InboxModel'

export function InboxFeed({
  title,
  model,
  onAction,
}: {
  title: string
  model: ReturnType<typeof inboxModel>
  onAction: ((n: Note, a: string) => void) | undefined
}) {
  return (
    <div
      role="tabpanel"
      id={`${model.id}-panel`}
      aria-labelledby={model.tabId(model.tab.value)}
      data-part="panel"
    >
      <div
        ref={model.setList}
        data-part="list"
        role="feed"
        aria-label={title}
        aria-busy={model.data.value === undefined ? 'true' : 'false'}
        tabindex={model.shown.value.length ? undefined : '0'}
        onScroll={model.onScroll}
      >
        {model.data.value === undefined && (
          <div data-part="group" aria-hidden="true">
            <Skeleton lines={3} />
          </div>
        )}
        {model.days.value.map((g) => (
          <div key={g.day} role="none">
            <div data-part="group" aria-hidden="true">
              {g.day}
            </div>
            {g.rows.map((n) => (
              <Row
                key={n.id}
                n={n}
                at={model.shown.value.indexOf(n) + 1}
                size={model.shown.value.length}
                leaving={model.leaving.value.includes(n.id)}
                stop={model.stop.value === n.id}
                onKey={model.onRowKey}
                onPress={model.pressRow}
                onFocus={() => (model.focused.value = n.id)}
                onDismiss={model.dismiss}
                onAction={(x: Note, a: string) => onAction?.(x, a)}
              />
            ))}
          </div>
        ))}
      </div>
      {model.data.value !== undefined && model.shown.value.length === 0 && (
        <div data-scope="empty-state">
          <p data-part="title">You're all caught up</p>
          <p data-part="description">New mentions, invites and approvals show up here.</p>
        </div>
      )}
    </div>
  )
}
