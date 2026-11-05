import { clock, minuteOf, monthStart, ymd, yearLevel, type IsoDate } from '@weft-js/warp-core'
import { Button } from '../Button'
import type { YearViewProps } from './YearView'
import type { yearData, yearDetail, yearNavigation } from './YearView-model'

export function yearMonthsView(
  data: ReturnType<typeof yearData>,
  nav: ReturnType<typeof yearNavigation>,
) {
  const { id, swapping, list, heads, focus, picked, env } = data
  const { setMonths, onKey, onClick, dayName } = nav
  return (
    <div
      ref={setMonths}
      data-part="months"
      role="group"
      aria-labelledby={`${id}-t`}
      aria-describedby={`${id}-h`}
      data-swapping={swapping.value ? '' : undefined}
      onKeyDown={onKey}
      onClick={onClick}
    >
      {list.value.map((m) => (
        <div key={m.month} data-part="year-month" data-current={m.current ? '' : undefined}>
          <button
            type="button"
            data-part="month-title"
            id={`${id}-${m.month}`}
            data-month={m.month}
            tabindex="-1"
          >
            {m.name}{' '}
            <small>
              {m.total}
              <span class="sr"> events</span>
            </small>
          </button>
          <div role="grid" aria-labelledby={`${id}-${m.month}`}>
            <div role="row">
              {heads.value.map((h) => (
                <span key={h[0]} role="columnheader">
                  <span aria-hidden="true">{h[0][0]}</span>
                  <span class="sr">{h[0]}</span>
                </span>
              ))}
            </div>
            {m.weeks.map((w) => (
              <div key={w.key} role="row">
                {w.cells.map((c) =>
                  c.iso ? (
                    <span
                      key={c.key}
                      role="gridcell"
                      data-day={c.iso}
                      tabindex={c.iso === focus.value ? '0' : '-1'}
                      aria-selected={
                        picked.value?.iso === c.iso && picked.value.kind === 'day'
                          ? 'true'
                          : 'false'
                      }
                      aria-current={c.iso === env.today.value ? 'date' : undefined}
                      data-weekend={c.weekend ? '' : undefined}
                      aria-label={`${dayName(c.iso)}${c.iso === env.today.value ? ', today' : ''}`}
                    >
                      <span data-part="num" aria-hidden="true">
                        {ymd(c.iso)[2]}
                      </span>
                      <i
                        data-part="dots"
                        style={`--_n:${yearLevel(c.count)}`}
                        aria-hidden="true"
                      ></i>
                    </span>
                  ) : (
                    <span key={c.key} role="gridcell" data-outside="" aria-hidden="true"></span>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function yearDetailView(
  p: YearViewProps,
  data: ReturnType<typeof yearData>,
  detail: ReturnType<typeof yearDetail>,
) {
  const { picked, env } = data
  return (
    <div data-part="detail" role="status" aria-live="polite">
      {detail.value ? (
        <>
          <div class="row">
            <b>{detail.value.head}</b>
            {detail.value.kind === 'day' && p.openDay && (
              <Button
                emphasis="outline"
                tone="neutral"
                size="sm"
                onClick={() => p.openDay!(picked.value!.iso as IsoDate)}
              >
                Open in Day view
              </Button>
            )}
            {p.openMonth && (
              <Button
                emphasis="ghost"
                tone="neutral"
                size="sm"
                onClick={() => p.openMonth!(monthStart(picked.value!.iso))}
              >
                Open in Month view
              </Button>
            )}
          </div>
          {detail.value.kind === 'month'
            ? detail.value.busiest && <span class="muted">{detail.value.busiest}</span>
            : detail.value.rows.length > 0 && (
                <ul>
                  {detail.value.rows.map((e) => (
                    <li key={e.id}>
                      <i data-cal={e.cal ?? 1}></i>
                      <span>
                        {e.allDay
                          ? 'All day'
                          : clock(minuteOf(e.start), env.locale.value, p.hourCycle)}
                      </span>
                      {e.title}
                    </li>
                  ))}
                  {detail.value.more > 0 && <li>+{detail.value.more} more</li>}
                </ul>
              )}
        </>
      ) : (
        <span class="muted">
          Pick a day to see what's on it. More dots, busier day: one for 1–2 events, two for 3–4,
          three for 5 or more.
        </span>
      )}
    </div>
  )
}
