import { arrivals, groupByDay, uid } from '@weft-js/warp-core'
import { derived } from '@weft-js/core'
import { Avatar, type LiveState } from '../parts'
import { use } from '@weft-js/warp-core/weft'
import { avatarTint, G, val } from './shared'
import '../styles'
import '@weft-js/warp-core/styles/app/base.css'
import '@weft-js/warp-core/styles/app/activity.css'
import '@weft-js/warp-core/styles/app/activity-feed.css'
import '@weft-js/warp-core/styles/app/sync.css'

/** One line of the activity feed. */
export interface ActivityItem {
  id: string
  actor: string
  verb: string
  object?: string
  detail?: string
  time: string
  datetime?: string
  day?: string
}

/**
 * Activity feed (07 §4.2): actor, verb, object, time, grouped per day on a hairline spine, the quiet sibling of the inbox
 * row. The header shows a "Live" check while `live` is live; new ids arrive.
 */
export function ActivityFeed({
  items,
  live,
  title = 'Activity',
  level = 3,
}: {
  items: ActivityItem[] | { value: ActivityItem[] } | (() => ActivityItem[])
  live?: LiveState | { value: LiveState } | (() => LiveState) | undefined
  title?: string
  /** The title's heading level: one below the heading the feed sits under. */ level?:
    | 2
    | 3
    | 4
    | 5
    | 6
}) {
  const id = uid('activity')
  const data = derived(() => val<ActivityItem[]>(items) ?? [])
  const days = derived(() => groupByDay(data.value))
  const many = derived(() => days.value.length > 1 || data.value.some((n) => n.day))
  const on = derived(() => val<LiveState | undefined>(live) === 'live')
  let root: HTMLElement | undefined
  use(
    arrivals,
    () => root,
    () => ({ items: '[data-scope="activity"] > li', ids: data.value.map((n) => n.id) }),
  )
  return (
    <section ref={(n) => (root = n)} data-scope="activity-feed" aria-labelledby={`${id}-t`}>
      <header>
        <h3 id={`${id}-t`} aria-level={level === 3 ? undefined : level}>
          {title}
        </h3>
        {on.value && (
          <span data-scope="sync" data-state="saved">
            <G name="check" /> Live
          </span>
        )}
      </header>
      {days.value.map((g) => (
        <div key={g.day}>
          {many.value && <span data-part="eyebrow">{g.day}</span>}
          <ol data-scope="activity">
            {g.rows.map((n) => (
              <li key={n.id} data-id={n.id}>
                <Avatar name={n.actor} size="sm" style={avatarTint(n.actor)} />
                <span>
                  <b>{n.actor}</b> {n.verb}
                  {n.object ? ' ' : ''}
                  {n.object && <b>{n.object}</b>}
                  {n.detail ? ` ${n.detail}` : ''}
                </span>
                <time datetime={n.datetime}>{n.time}</time>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  )
}
