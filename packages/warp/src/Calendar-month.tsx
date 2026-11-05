// Month and day rendering for the calendar grid.
import {
  dayState,
  fmt,
  isoWeek,
  isWeekend,
  messages,
  monthWeeks,
  ymd,
  type CalendarContext,
  type IsoDate,
} from '@weft-js/warp-core'
import { derived } from '@weft-js/core'
import { uid } from './Picker'

export function Month({
  month,
  heads,
  first,
  weekNumbers,
  locale,
  wholeWeek,
  ctx,
  cursor,
  initial,
}: {
  month: string
  heads: readonly (readonly [string, string, number])[]
  first: number
  weekNumbers?: boolean | undefined
  locale: string
  wholeWeek: boolean
  ctx: () => CalendarContext
  cursor: string
  initial?: boolean | undefined
}) {
  const cap = uid('cap')
  const weeks = derived(() =>
    monthWeeks(month, first).map((days) => ({
      days: days.map((iso, c) => ({ iso, k: iso ?? `b${c}`, weekday: (first + c) % 7 })),
      k: days.find(Boolean)!,
      week: isoWeek(days.find(Boolean)!).week,
    })),
  )
  return (
    <div data-part="month">
      <div data-part="caption" id={cap} aria-live="polite">
        {fmt(month, { month: 'long', year: 'numeric' }, locale)}
      </div>
      <table role="grid" aria-labelledby={cap}>
        <thead>
          <tr>
            {weekNumbers && (
              <th scope="col" abbr={messages(locale).week}>
                <span class="sr">{messages(locale).week}</span>
              </th>
            )}
            {heads.map((h) => (
              <th key={h[0]} scope="col" abbr={h[0]}>
                {h[1]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.value.map((w) => (
            <tr key={w.k}>
              {weekNumbers && (
                <th scope="row" data-part="week">
                  {w.week}
                </th>
              )}
              {w.days.map((d) =>
                d.iso ? (
                  <Day
                    key={d.k}
                    iso={d.iso}
                    weekend={isWeekend(d.weekday, locale)}
                    locale={locale}
                    wholeWeek={wholeWeek}
                    ctx={ctx}
                    cursor={cursor}
                    initial={initial}
                  />
                ) : (
                  <td key={d.k} role="gridcell"></td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Day({
  iso,
  weekend,
  locale,
  ctx,
  cursor,
  initial,
}: {
  iso: IsoDate
  weekend: boolean
  locale: string
  wholeWeek: boolean
  ctx: () => CalendarContext
  cursor: string
  initial?: boolean | undefined
}) {
  const s = derived(() => dayState(iso, ctx()))
  const n = derived(() => new Intl.NumberFormat(locale).format(ymd(iso)[2]))
  return (
    <td
      role="gridcell"
      aria-selected={s.value.cellSelected ? 'true' : 'false'}
      data-range={s.value.range}
      data-preview={s.value.preview ? '' : undefined}
      data-compare={s.value.compare ? '' : undefined}
    >
      <button
        type="button"
        data-part="day"
        data-date={iso}
        tabindex={iso === cursor ? '0' : '-1'}
        data-initial={initial && iso === cursor ? '' : undefined}
        data-weekend={weekend ? '' : undefined}
        data-selected={s.value.selected ? '' : undefined}
        data-booked={s.value.unavailable && s.value.booked ? '' : undefined}
        aria-current={s.value.today ? 'date' : undefined}
        aria-disabled={s.value.unavailable ? 'true' : undefined}
        aria-label={s.value.name}
      >
        {n.value}
      </button>
    </td>
  )
}
