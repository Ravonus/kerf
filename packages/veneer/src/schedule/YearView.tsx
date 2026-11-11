import { LeftIcon, RightIcon } from '@kerf/veneer-icons'
import { addMonths, type CalEvent, type IsoDate } from '@kerf/veneer-core'
import { untrack } from '@kerf/core'
import { Button } from '../Button'
import { yearData, yearDetail, yearNavigation } from './YearView-model'
import { yearMonthsView, yearDetailView } from './YearView-parts'
import './bits'
import '@kerf/veneer-core/styles/app/year.css'

/** Props for YearView. */
export type YearViewProps = {
  /** `{ [isoDay]: n }`: a year's counts only (07 §2.7). */
  counts: Record<string, number>
  /** Names the section when the year alone won't do: two on a page. */
  label?: string | undefined
  /** Events for the picked day's detail: from `events`, or fetched by the app when it is picked. */
  events?: CalEvent[] | undefined
  year?: number | undefined
  /** Pins today's date, for server rendering and tests. The browser's clock otherwise. */
  today?: string | undefined
  locale?: string | undefined
  /** `h12` for AM and PM, `h23` for a 24-hour clock. The locale's otherwise. */
  hourCycle?: string | undefined
  /** The day each month's rows start on, 0 for Sunday to 6. The locale's otherwise. */
  firstDayOfWeek?: number | undefined
  /** Inside a Calendar: return true when the day or month opened there, and the picker stays out of the way. */
  openDay?: ((iso: IsoDate) => boolean | void) | undefined
  openMonth?: ((iso: IsoDate) => boolean | void) | undefined
  /** Open straight away; off, a pick shows the detail and offers the jump. */
  direct?: boolean | undefined
  /** Called with the new year when you page. */
  onYearChange?: ((y: number) => void) | undefined
}

/**
 * The year (07 §2.7): twelve mini months with density dots, one roving stop across all twelve grids, a polite detail
 * for the picked day or month. Columns follow the container. Enter opens the day, `M` its month, `T` today.
 */
export function YearView(p: YearViewProps) {
  const props = untrack(() => p)
  const data = yearData(props)
  const nav = yearNavigation(props, data)
  const { id, env, focus, year } = data
  const { go } = nav
  const detail = yearDetail(props, data, nav.long)
  return (
    <section
      data-scope="year"
      aria-label={p.label}
      aria-labelledby={p.label ? undefined : `${id}-t`}
    >
      <div data-part="toolbar">
        <Button
          emphasis="ghost"
          tone="neutral"
          size="sm"
          icon={LeftIcon}
          label="Previous year"
          direction="back"
          onClick={() => go(addMonths(focus.value, -12), false)}
        />
        <h3 data-part="title" id={`${id}-t`} aria-live="polite">
          {year.value}
        </h3>
        <Button
          emphasis="ghost"
          tone="neutral"
          size="sm"
          icon={RightIcon}
          label="Next year"
          onClick={() => go(addMonths(focus.value, 12), false)}
        />
        <Button emphasis="outline" tone="neutral" size="sm" onClick={() => go(env.today.value)}>
          Today
        </Button>
        <span data-part="legend" aria-hidden="true">
          <span>
            <i data-part="dots" data-zero=""></i>none
          </span>
          <span>
            <i data-part="dots" style="--_n:1"></i>1–2
          </span>
          <span>
            <i data-part="dots" style="--_n:2"></i>3–4
          </span>
          <span>
            <i data-part="dots" style="--_n:3"></i>5+
          </span>
        </span>
      </div>
      {yearMonthsView(data, nav)}
      <span class="sr" id={`${id}-h`}>
        One stop for the whole year. Arrow keys move by day and week, Home and End to the week's
        ends, Page Up and Page Down by month, with Shift by year. Enter opens the day, M opens its
        month, T goes to today.
      </span>
      {yearDetailView(p, data, detail)}
    </section>
  )
}
