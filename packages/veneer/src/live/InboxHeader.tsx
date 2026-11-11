import type { InboxTab } from '@kerf-js/veneer-core'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { G } from './shared'
import type { inboxModel } from './InboxModel'

const TABS: Record<InboxTab, string> = { all: 'All', unread: 'Unread', mentions: 'Mentions' }

export function InboxHeader({
  title,
  settings,
  model,
}: {
  title: string
  settings: (() => void) | undefined
  model: ReturnType<typeof inboxModel>
}) {
  return (
    <div data-part="header">
      <h3 id={`${model.id}-t`}>{title}</h3>
      <Button emphasis="ghost" tone="neutral" size="sm" onClick={model.readAll}>
        Mark all as read
      </Button>
      {settings && (
        <Button
          emphasis="ghost"
          tone="neutral"
          size="sm"
          data-icon-only=""
          aria-label="Notification settings"
          onClick={settings}
        >
          <G name="more" />
        </Button>
      )}
    </div>
  )
}

export function InboxTabs({
  tabs,
  model,
}: {
  tabs: InboxTab[]
  model: ReturnType<typeof inboxModel>
}) {
  return (
    <div data-scope="tabs" data-part="root">
      <div
        ref={model.setTablist}
        data-part="list"
        role="tablist"
        aria-label="Filter"
        onKeyDown={model.onTabKey}
      >
        {tabs.map((t) => (
          <button
            key={t}
            data-part="trigger"
            role="tab"
            type="button"
            id={model.tabId(t)}
            aria-controls={`${model.id}-panel`}
            aria-selected={t === model.tab.value ? 'true' : 'false'}
            tabindex={t === model.tab.value ? undefined : '-1'}
            onClick={() => model.pick(t)}
          >
            {TABS[t]}
            {t === 'unread' && (
              <>
                {' '}
                <Badge count>{model.unread.value}</Badge>
              </>
            )}
          </button>
        ))}
        <span data-part="indicator" aria-hidden="true" data-instant=""></span>
      </div>
    </div>
  )
}
