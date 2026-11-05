import { dayDots, fmt, ymd, type CalEvent, type IsoDate } from '@weft-js/warp-core'

export function AgendaStrip({
  id,
  week,
  date,
  today,
  locale,
  events,
  onTabs,
  go,
}: {
  id: string
  week: IsoDate[]
  date: string
  today: string
  locale: string
  events: CalEvent[]
  onTabs: (e: KeyboardEvent) => void
  go: (d: string) => void
}) {
  return (
    <div
      data-part="strip"
      role="tablist"
      aria-label={`Week of ${fmt(week[0]!, { month: 'short', day: 'numeric' }, locale)}`}
      onKeyDown={onTabs}
    >
      {week.map((d) => (
        <button
          key={d}
          type="button"
          role="tab"
          id={`${id}-${d}`}
          aria-controls={`${id}-panel`}
          aria-selected={d === date ? 'true' : 'false'}
          tabindex={d === date ? '0' : '-1'}
          data-today={d === today ? '' : undefined}
          onClick={() => go(d)}
        >
          <strong class="sr">
            {fmt(d, { weekday: 'long', month: 'short', day: 'numeric' }, locale)}
          </strong>
          <span aria-hidden="true">{fmt(d, { weekday: 'narrow' }, locale)}</span>
          <b aria-hidden="true">{ymd(d)[2]}</b>
          <i>
            {dayDots(events, d).map((c) => (
              <em key={c} data-cal={c}></em>
            ))}
          </i>
        </button>
      ))}
    </div>
  )
}
