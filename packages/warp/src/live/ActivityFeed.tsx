import { arrivals, groupByDay, uid } from '@weft/ui-core'
import { derived } from 'weft'
import { Avatar, type LiveState } from '../parts'
import { use } from '../use'
import { avatarTint, G, val } from './shared'
import '../styles'
import '@weft/ui-core/styles/app/base.css'
import '@weft/ui-core/styles/app/activity.css'
import '@weft/ui-core/styles/app/activity-feed.css'
import '@weft/ui-core/styles/app/sync.css'

export interface ActivityItem { id: string; actor: string; verb: string; object?: string; detail?: string; time: string; datetime?: string; day?: string }

/**
 * Activity feed (07 §4.2): actor, verb, object, time, grouped per day on a hairline spine, the quiet sibling of the inbox
 * row. The header shows a "Live" check while `live` is live; new ids arrive.
 */
export function ActivityFeed({ items, live, title = 'Activity' }: { items: ActivityItem[] | { value: ActivityItem[] } | (() => ActivityItem[]); live?: LiveState | (() => LiveState); title?: string }) {
  const id = uid('activity')
  const data = derived(() => (val(items as any) ?? []) as ActivityItem[])
  const days = derived(() => groupByDay(data.value))
  const many = derived(() => days.value.length > 1 || data.value.some(n => n.day))
  const on = derived(() => val(live as any) === 'live')
  let root: HTMLElement | undefined
  use(arrivals, () => root, () => ({ items: '[data-scope="activity"] > li', ids: data.value.map(n => n.id) }))
  return (
    <section ref={(n: any) => (root = n)} data-scope="activity-feed" aria-labelledby={`${id}-t`}>
      <header>
        <h3 id={`${id}-t`}>{title}</h3>
        {on.value && <span data-scope="sync" data-state="saved"><G name="check" /> Live</span>}
      </header>
      {days.value.map(g => (
        <div key={g.day}>
          {many.value && <span data-part="eyebrow">{g.day}</span>}
          <ol data-scope="activity">
            {g.rows.map(n => (
              <li key={n.id} data-id={n.id}>
                <Avatar name={n.actor} size="sm" style={avatarTint(n.actor)} />
                <span><b>{n.actor}</b> {n.verb}{n.object ? ' ' : ''}{n.object && <b>{n.object}</b>}{n.detail ? ` ${n.detail}` : ''}</span>
                <time datetime={n.datetime}>{n.time}</time>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  )
}
