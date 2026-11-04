import { state } from '@weft-js/core'
import { Badge, Button, Calendar, Card, DateField, DateRangeField, DateTimeField, DurationField, InlineCalendar, MonthPicker, PeriodPicker, RecurrenceField, Row, Stack, Text, TimeField, WeekPicker, Tag, Grid, compareRange } from '@weft-js/warp'
import type { DateRange, IsoDate, IsoDateTime, IsoDuration, IsoMonth, IsoTime, IsoWeek } from '@weft-js/warp'
import { BUSY_NOW, BUSY_TODAY, CAL_NOW, CAL_TODAY, CALENDARS, DEPLOYS, EVENTS, INVOICES, MONTH_EVENTS, ROOMS } from '../world'

type Event = (typeof EVENTS)[number]

const TODAY: IsoDate = '2026-11-02'

/** One state in a States grid: its name, then the field. */
const Cell = (p: { name: string; children?: unknown }) => (
  <Stack gap="tight">
    <Text role="caption" subtle>{p.name}</Text>
    {p.children}
  </Stack>
)
const isWeekend = (d: IsoDate) => [0, 6].includes(new Date(`${d}T12:00Z`).getUTCDay())

// -- Calendar

function useEvents() {
  const events = state<Event[]>(EVENTS)
  const change = (e: Event, to: Partial<Event>) => { events.value = events.value.map(x => (x.id === e.id ? { ...x, ...to } : x)) }
  return {
    events,
    change,
    create: (e: Event) => (events.value = [...events.value, e]),
    edit: (e: Event) => change(e, e),
    remove: (e: Event) => (events.value = events.value.filter(x => x.id !== e.id)),
  }
}

export function CalendarWeek() {
  const s = useEvents()
  return <Calendar events={s.events.value} calendars={CALENDARS} defaultView="week" defaultDate={CAL_TODAY} today={CAL_TODAY} now={CAL_NOW} locale="en-US" firstDayOfWeek={1} workingHours={[540, 1080]} onMove={s.change} onResize={s.change} onCreate={s.create} onEdit={s.edit} onDelete={s.remove} />
}

const COMPACT_VIEWS = ['month', 'agenda'] as const

/** The month carries the whole month's meetings, not only this week's. */
export const CalendarMonth = () => <Calendar events={MONTH_EVENTS} calendars={CALENDARS} views={[...COMPACT_VIEWS]} defaultView="month" defaultDate={CAL_TODAY} today={CAL_TODAY} now={CAL_NOW} locale="en-US" firstDayOfWeek={1} readOnly />

const DAY_VIEWS = ['day', 'week'] as const

/** Wednesday's morning runs five meetings into each other: they share the column side by side, in lanes. */
export function CalendarBusyDay() {
  const s = useEvents()
  return <Calendar events={s.events.value} calendars={CALENDARS} views={[...DAY_VIEWS]} defaultView="day" defaultDate={BUSY_TODAY} today={BUSY_TODAY} now={BUSY_NOW} locale="en-US" firstDayOfWeek={1} workingHours={[540, 1080]} onMove={s.change} onResize={s.change} />
}

const AGENDA_VIEWS = ['agenda', 'week'] as const

export const CalendarAgenda = () => <Calendar events={EVENTS} calendars={CALENDARS} views={[...AGENDA_VIEWS]} defaultView="agenda" defaultDate={CAL_TODAY} today={CAL_TODAY} now={CAL_NOW} locale="en-US" firstDayOfWeek={1} readOnly />

const ROOM_VIEWS = ['timeline', 'day'] as const
/** The rooms' working day, in minutes: 09:00 to 17:00 gives each hour room for a name. */
const ROOM_HOURS: [number, number] = [540, 1020]

export function CalendarRooms() {
  const s = useEvents()
  return <Calendar events={s.events.value} calendars={CALENDARS} resources={ROOMS} views={[...ROOM_VIEWS]} timeline={ROOM_HOURS} defaultView="timeline" defaultDate={BUSY_TODAY} today={BUSY_TODAY} now={BUSY_NOW} locale="en-US" onMove={s.change} onResize={s.change} />
}

// -- DateField

export const DateFieldPlay = (p: { label: string; hint?: string | undefined; disabled?: boolean | undefined; weekNumbers?: boolean | undefined }) => (
  <DateField defaultValue="2026-11-14" today={TODAY} {...p} />
)

export function DateFieldRelease() {
  const date = state<IsoDate | null>('2026-11-14')
  return (
    <Stack gap="related">
      <DateField label="Release date" today={TODAY} value={date} />
      <Text subtle role="caption">{date.value ? `Saved as ${date.value}` : 'No date set'}</Text>
    </Stack>
  )
}

export const DateFieldLimits = () => (
  <DateField label="Maintenance day" hint="Weekdays, within the next 60 days" defaultValue="2026-11-10" today={TODAY} min="2026-11-02" max="2026-12-31" isDateUnavailable={isWeekend} />
)

export const DateFieldWeeks = () => <DateField label="Sprint starts" defaultValue="2026-11-16" today={TODAY} firstDayOfWeek={1} weekNumbers />

export const DateFieldStates = () => (
  <Stack gap="group">
    <DateField label="Release date" today={TODAY} hint="Optional" />
    <DateField label="Release date" today={TODAY} error="Pick a date after the freeze ends" defaultValue="2026-12-24" />
    <DateField label="Release date" today={TODAY} defaultValue="2026-11-14" readonly />
    <DateField label="Release date" today={TODAY} defaultValue="2026-11-14" disabled />
  </Stack>
)

export function DateFieldSchedule() {
  const date = state<IsoDate | null>('2026-11-05')
  const time = state<IsoTime | null>('14:00')
  const planned = state('')
  const plan = () => (planned.value = `checkout goes out on ${date.value} at ${time.value}`)
  return (
    <Stack gap="group">
      <Text role="heading">Schedule a deploy</Text>
      <Row gap="related" wrap={false}>
        <DateField label="Date" today={TODAY} value={date} min={TODAY} />
        <TimeField label="Time" today={TODAY} value={time} step={30} />
      </Row>
      <Row gap="related" justify="between">
        <Text subtle role="caption">{planned.value || 'Nothing planned yet'}</Text>
        <Button aria-disabled={date.value && time.value ? undefined : 'true'} onClick={plan}>Schedule</Button>
      </Row>
    </Stack>
  )
}

// -- DateRangeField

export const DateRangeFieldPresets = () => (
  <DateRangeField label="Period" today={TODAY} defaultValue={{ start: '2026-10-01', end: '2026-10-31' }} />
)

const REPORTING = [
  { id: 'sprint', label: 'This sprint', range: (): DateRange => ({ start: '2026-10-26', end: '2026-11-06' }) },
  { id: 'q3', label: 'Q3', range: (): DateRange => ({ start: '2026-07-01', end: '2026-09-30' }) },
  { id: 'ytd', label: 'Year to date', range: (t: IsoDate): DateRange => ({ start: '2026-01-01', end: t }) },
]

const Q3: DateRange = { start: '2026-07-01', end: '2026-09-30' }

export const DateRangeFieldCustom = () => <DateRangeField label="Report on" today={TODAY} presets={REPORTING} defaultValue={Q3} />

export const DateRangeFieldLimit = () => (
  <DateRangeField label="Log export" hint="Up to 14 days at a time" today={TODAY} presets={false} months={1} maxDays={14} max={TODAY} defaultValue={{ start: '2026-10-20', end: '2026-10-27' }} />
)

export function DateRangeFieldCompare() {
  const range = state<DateRange>({ start: '2026-10-01', end: '2026-10-31' })
  const before = () => compareRange(range.value, 'previous-period')
  return (
    <Stack gap="related">
      <DateRangeField label="Period" today={TODAY} value={range} compare="previous-period" />
      <Text subtle role="caption">Compared with {before()?.start} to {before()?.end}</Text>
    </Stack>
  )
}

export function DateRangeFieldFilter() {
  const range = state<DateRange>({ start: '2026-10-31', end: '2026-10-31' })
  const shown = () => DEPLOYS.filter(d => d.at.slice(0, 10) >= (range.value.start ?? '') && d.at.slice(0, 10) <= (range.value.end ?? '9999'))
  return (
    <Stack gap="group">
      <DateRangeField label="Deploys between" today={TODAY} value={range} months={1} max={TODAY} />
      <Text role="label">{shown().length} deploys</Text>
      <Stack gap="related" divided>
        {shown().map(d => (
          <Row key={d.id} gap="related" justify="between">
            <Text>{d.project}</Text>
            <Text subtle role="caption">{d.at.slice(5).replace('T', ' at ')}</Text>
          </Row>
        ))}
      </Stack>
    </Stack>
  )
}

// -- DateTimeField

export function DateTimeFieldWindow() {
  const at = state<IsoDateTime | null>('2026-11-07T22:00')
  return (
    <Stack gap="related">
      <DateTimeField label="Maintenance starts" today={TODAY} value={at} min="2026-11-02" />
      <Text subtle role="caption">{at.value ? `Sent to the API as ${at.value}` : 'Pick a date and a time'}</Text>
    </Stack>
  )
}

export const DateTimeFieldStep = () => <DateTimeField label="Reminder" hint="On the quarter hour" today={TODAY} defaultValue="2026-11-05T09:15" step={15} firstDayOfWeek={1} />

/** The change freeze runs over the holidays: no weekends, and nothing after the 19th. */
export const DateTimeFieldLimits = () => (
  <DateTimeField label="Deploy at" hint="Weekdays only, before the freeze on Dec 19." today={TODAY} defaultValue="2026-11-04T10:00" min={TODAY} max="2026-12-19" isDateUnavailable={isWeekend} firstDayOfWeek={1} />
)

export const DateTimeFieldStates = () => (
  <Grid cols={2} gap="group">
    <Cell name="Empty"><DateTimeField label="Starts" today={TODAY} /></Cell>
    <Cell name="Hint"><DateTimeField label="Starts" today={TODAY} hint="In your time zone." /></Cell>
    <Cell name="Invalid"><DateTimeField label="Starts" today={TODAY} defaultValue="2026-10-30T09:00" error="Pick a time in the future." /></Cell>
    <Cell name="Read-only"><DateTimeField label="Starts" today={TODAY} defaultValue="2026-11-07T22:00" readonly /></Cell>
    <Cell name="Disabled"><DateTimeField label="Starts" today={TODAY} defaultValue="2026-11-07T22:00" disabled /></Cell>
  </Grid>
)

const minutesBetween = (a: string, b: string) => Math.round((Date.parse(`${b}Z`) - Date.parse(`${a}Z`)) / 60000)
const lasting = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`)

/** A window has a start and an end: the end is checked against the start as either changes. */
export function DateTimeFieldWindowPair() {
  const from = state<IsoDateTime | null>('2026-11-07T22:00')
  const to = state<IsoDateTime | null>('2026-11-08T01:30')
  const span = () => (from.value && to.value ? minutesBetween(from.value, to.value) : null)
  return (
    <Stack gap="group">
      <Text role="heading">Maintenance window</Text>
      <DateTimeField label="Starts" today={TODAY} value={from} min={TODAY} step={15} />
      <DateTimeField label="Ends" today={TODAY} value={to} min={TODAY} step={15} error={(span() ?? 1) <= 0 ? 'End after it starts.' : undefined} />
      <Text subtle role="caption">{span() === null ? 'Pick both ends.' : (span() ?? 0) > 0 ? `Checkout is read-only for ${lasting(span()!)}.` : 'The window is empty.'}</Text>
    </Stack>
  )
}

// -- TimeField

export function TimeFieldQuietHours() {
  const from = state<IsoTime | null>('22:00')
  const to = state<IsoTime | null>('07:30')
  return (
    <Stack gap="related">
      <Row gap="related" wrap={false}>
        <TimeField label="Quiet from" today={TODAY} value={from} step={30} />
        <TimeField label="Until" today={TODAY} value={to} step={30} />
      </Row>
      <Text subtle role="caption">No alerts from {from.value ?? '…'} to {to.value ?? '…'}, except failed deploys.</Text>
    </Stack>
  )
}

export const TimeFieldClock = () => (
  <Stack gap="group">
    <TimeField label="12-hour" today={TODAY} defaultValue="14:30" hourCycle="h12" />
    <TimeField label="24-hour" today={TODAY} defaultValue="14:30" hourCycle="h23" />
    <TimeField label="With seconds" today={TODAY} defaultValue="14:30:15" hourCycle="h23" seconds />
  </Stack>
)

const SLOTS: IsoTime[] = ['09:00', '09:30', '11:00', '14:00', '15:30', '16:00']

export const TimeFieldSlots = () => <TimeField label="Onboarding call" hint="Only the times Priya is free" today={TODAY} defaultValue="11:00" slots={SLOTS} />

export const TimeFieldHours = () => <TimeField label="Deploy window opens" hint="Office hours" today={TODAY} defaultValue="10:00" min="08:00" max="18:00" step={60} />

export const TimeFieldClocksChange = () => (
  <TimeField label="Nightly backup" today={TODAY} defaultValue="01:30" date="2026-11-01" timeZone="America/New_York" />
)

// -- DurationField

export function DurationFieldTimeout() {
  const timeout = state<IsoDuration | null>('PT1H30M')
  return (
    <Stack gap="related">
      <DurationField label="Build timeout" value={timeout} />
      <Text subtle role="caption">Saved as {timeout.value ?? 'nothing'}</Text>
    </Stack>
  )
}

const MIN_SEC = ['m', 's'] as const
const DAY_HOUR = ['d', 'h'] as const

export const DurationFieldUnits = () => (
  <Stack gap="group">
    <DurationField label="Health check every" units={[...MIN_SEC]} defaultValue="PT30S" />
    <DurationField label="Keep previews for" units={[...DAY_HOUR]} defaultValue="P7DT12H" />
  </Stack>
)

export const DurationFieldLimits = () => <DurationField label="Canary period" hint="At most 2 hours, in 15-minute steps" defaultValue="PT45M" max="PT2H" step={{ m: 15 }} />

// -- InlineCalendar

export function InlineCalendarSingle() {
  const day = state<IsoDate | null>('2026-11-12')
  return (
    <Stack gap="related">
      <InlineCalendar aria-label="Release day" today={TODAY} value={day} />
      <Text subtle role="caption">Release day: {day.value ?? 'not set'}</Text>
    </Stack>
  )
}

export function InlineCalendarRange() {
  const away = state<DateRange>({ start: '2026-11-23', end: '2026-12-04' })
  return (
    <Stack gap="related">
      <InlineCalendar aria-label="Time away" selection="range" months={2} today={TODAY} value={away} />
      <Text subtle role="caption">Away from {away.value.start ?? '…'} to {away.value.end ?? '…'}</Text>
    </Stack>
  )
}

export function InlineCalendarMultiple() {
  const days = state<IsoDate[]>(['2026-11-03', '2026-11-05', '2026-11-10'])
  return (
    <Stack gap="related">
      <InlineCalendar aria-label="Office days" selection="multiple" today={TODAY} value={days} />
      <Text subtle role="caption">{days.value.length} office days</Text>
    </Stack>
  )
}

const booked = (d: IsoDate) => isWeekend(d) || ['2026-11-11', '2026-11-12', '2026-11-26'].includes(d)

export const InlineCalendarBooking = () => <InlineCalendar aria-label="Pick a day for the audit" today={TODAY} defaultValue="2026-11-18" min={TODAY} max="2026-12-20" isDateUnavailable={booked} firstDayOfWeek={1} weekNumbers />

// -- Month, week and period

export function MonthPickerInvoice() {
  const month = state<IsoMonth | null>('2026-10')
  return (
    <Stack gap="related">
      <MonthPicker label="Invoice month" today={TODAY} value={month} max="2026-11" />
      <Text subtle role="caption">Showing {month.value ?? 'every month'}</Text>
    </Stack>
  )
}

/** Statements start when the workspace was made, and the current month isn't billed yet. */
export const MonthPickerRange = () => <MonthPicker label="Statement" hint="From June 2025, when the workspace began." today={TODAY} defaultValue="2025-08" min="2025-06" max="2026-10" />

/** The month names come from `locale`, so a German page reads März, not March. */
export const MonthPickerLocale = () => <MonthPicker label="Abrechnungsmonat" locale="de-DE" today={TODAY} defaultValue="2026-03" />

export const MonthPickerSizes = () => (
  <Stack gap="group">
    <MonthPicker label="Small" size="sm" today={TODAY} defaultValue="2026-10" />
    <MonthPicker label="Medium" today={TODAY} defaultValue="2026-10" />
    <MonthPicker label="Large" size="lg" today={TODAY} defaultValue="2026-10" />
  </Stack>
)

export const MonthPickerStates = () => (
  <Grid cols={2} gap="group">
    <Cell name="Empty"><MonthPicker label="Month" today={TODAY} /></Cell>
    <Cell name="Hint"><MonthPicker label="Month" today={TODAY} hint="Invoices go out on the 1st." /></Cell>
    <Cell name="Invalid"><MonthPicker label="Month" today={TODAY} error="Choose a month to export." /></Cell>
    <Cell name="Read-only"><MonthPicker label="Month" today={TODAY} defaultValue="2026-10" readonly /></Cell>
    <Cell name="Disabled"><MonthPicker label="Month" today={TODAY} defaultValue="2026-10" disabled /></Cell>
  </Grid>
)

const usd = (n: number) => `$${n.toLocaleString('en-US')}`

/** Pick a month and the list shows that month's invoice; Show all clears it. */
export function MonthPickerInvoices() {
  const month = state<IsoMonth | null>('2026-09')
  const shown = () => INVOICES.filter(i => !month.value || i.date.startsWith(month.value))
  return (
    <Stack gap="group">
      <Row gap="related" wrap={false}>
        <MonthPicker label="Invoices for" today={TODAY} value={month} min="2026-07" max="2026-10" />
        <Button emphasis="ghost" tone="neutral" aria-disabled={month.value ? undefined : 'true'} onClick={() => (month.value = null)}>Show all</Button>
      </Row>
      <Stack gap="related" divided>
        {shown().map(i => (
          <Row key={i.id} justify="between" gap="group">
            <Stack gap="hair">
              <Text role="label">{i.id}</Text>
              <Text role="caption" subtle>Issued {i.date}</Text>
            </Stack>
            <Row gap="related"><Badge tone="positive">{i.status}</Badge><Text>{usd(i.amount)}</Text></Row>
          </Row>
        ))}
      </Stack>
      <Text subtle role="caption">{shown().length} of {INVOICES.length} invoices, {usd(shown().reduce((t, i) => t + i.amount, 0))} in all</Text>
    </Stack>
  )
}

export function WeekPickerSprint() {
  const week = state<IsoWeek | null>('2026-W45')
  return (
    <Stack gap="related">
      <WeekPicker label="Sprint week" today={TODAY} value={week} />
      <Text subtle role="caption">Saved as {week.value ?? 'nothing'}</Text>
    </Stack>
  )
}

export const WeekPickerLocale = () => <WeekPicker label="Payroll week" today={TODAY} defaultValue="2026-W45" numbering="locale" />

export const WeekPickerStates = () => (
  <Grid cols={2} gap="group">
    <Cell name="Empty"><WeekPicker label="Week" today={TODAY} /></Cell>
    <Cell name="Hint"><WeekPicker label="Week" today={TODAY} hint="Monday to Sunday." /></Cell>
    <Cell name="Invalid"><WeekPicker label="Week" today={TODAY} error="Choose the week you worked." /></Cell>
    <Cell name="Read-only"><WeekPicker label="Week" today={TODAY} defaultValue="2026-W44" readonly /></Cell>
    <Cell name="Disabled"><WeekPicker label="Week" today={TODAY} defaultValue="2026-W44" disabled /></Cell>
  </Grid>
)

/** The Monday of an ISO week: the week with the year's first Thursday is week 1. */
function mondayOf(week: string) {
  const [year, n] = [+week.slice(0, 4), +week.slice(6)]
  const jan4 = new Date(Date.UTC(year, 0, 4))
  return new Date(jan4.getTime() + ((n - 1) * 7 - ((jan4.getUTCDay() + 6) % 7)) * 86400000)
}
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const HOURS = [7.5, 8, 6, 8.5, 4]

/** A timesheet: the week picks the dates, and each day's hours sit beside them. */
export function WeekPickerTimesheet() {
  const week = state<IsoWeek | null>('2026-W44')
  const day = (i: number) => new Date(mondayOf(week.value!).getTime() + i * 86400000).toISOString().slice(5, 10)
  return (
    <Stack gap="group">
      <WeekPicker label="Timesheet week" today={TODAY} value={week} />
      {week.value ? (
        <Stack gap="tight" divided>
          {DAYS.map((d, i) => (
            <Row key={d} justify="between"><Text>{d} {day(i)}</Text><Text subtle>{HOURS[i]} h</Text></Row>
          ))}
          <Row justify="between"><Text role="label">Total</Text><Text role="label">{HOURS.reduce((a, b) => a + b, 0)} h</Text></Row>
        </Stack>
      ) : <Text subtle>Pick a week to fill in its hours.</Text>}
    </Stack>
  )
}

export function PeriodPickerReport() {
  const period = state<string | null>('2026-Q4')
  return (
    <Stack gap="related">
      <PeriodPicker label="Report period" today={TODAY} value={period} />
      <Text subtle role="caption">Saved as {period.value ?? 'nothing'}</Text>
    </Stack>
  )
}

export const PeriodPickerGranularity = () => (
  <Stack gap="group">
    <PeriodPicker label="Year" today={TODAY} defaultValue="2026" granularity="year" />
    <PeriodPicker label="Quarter" today={TODAY} defaultValue="2026-Q4" granularity="quarter" />
    <PeriodPicker label="Month" today={TODAY} defaultValue="2026-10" granularity="month" />
    <PeriodPicker label="Week" today={TODAY} defaultValue="2026-W45" granularity="week" />
  </Stack>
)

export const PeriodPickerStates = () => (
  <Grid cols={2} gap="group">
    <Cell name="Empty"><PeriodPicker label="Period" today={TODAY} granularity="quarter" /></Cell>
    <Cell name="Hint"><PeriodPicker label="Period" today={TODAY} granularity="quarter" hint="Closed quarters only." /></Cell>
    <Cell name="Invalid"><PeriodPicker label="Period" today={TODAY} defaultValue="2027-Q1" error="That quarter hasn't started." /></Cell>
    <Cell name="Read-only"><PeriodPicker label="Period" today={TODAY} defaultValue="2026-Q3" readonly /></Cell>
    <Cell name="Disabled"><PeriodPicker label="Period" today={TODAY} defaultValue="2026-Q3" disabled /></Cell>
  </Grid>
)

const REVENUE: Record<string, number> = { '2026': 412300, '2026-Q1': 96400, '2026-Q2': 101800, '2026-Q3': 104900, '2026-Q4': 109200, '2026-10': 36100, '2026-09': 35200 }

/** A report's header: one control changes how long the period is, and the figures follow. */
export function PeriodPickerRevenue() {
  const period = state<string | null>('2026-Q3')
  const total = () => (period.value ? REVENUE[period.value] : undefined)
  return (
    <Stack gap="group">
      <PeriodPicker label="Revenue for" today={TODAY} value={period} />
      <Card>
        <Stack gap="tight">
          <Text role="label" subtle>Revenue, {period.value ?? 'no period'}</Text>
          <Text role="heading">{total() === undefined ? 'No figures yet' : usd(total()!)}</Text>
          <Text role="caption" subtle>Try 2026, 2026-Q1 to Q4, or September and October.</Text>
        </Stack>
      </Card>
    </Stack>
  )
}

// -- RecurrenceField

export function RecurrenceFieldBackup() {
  const rule = state<string | null>('FREQ=WEEKLY;BYDAY=MO,TH')
  return (
    <Stack gap="related">
      <RecurrenceField label="Backups run" dtstart="2026-11-02" value={rule} locale="en-US" />
      <Tag>{rule.value}</Tag>
    </Stack>
  )
}

const DAILY_WEEKLY = ['DAILY', 'WEEKLY'] as const

export const RecurrenceFieldLimited = () => <RecurrenceField label="Digest email" dtstart="2026-11-02" defaultValue="FREQ=DAILY" frequencies={[...DAILY_WEEKLY]} preview={3} locale="en-US" />

export const RecurrenceFieldCustom = () => <RecurrenceField label="Report" dtstart="2026-11-02" defaultValue="FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1;BYHOUR=9" locale="en-US" />

export function RecurrenceFieldInCard() {
  const rule = state<string | null>('FREQ=MONTHLY;BYMONTHDAY=1')
  return (
    <Card title="Rotate certificates">
      <Stack gap="group">
        <Text subtle>edge-cache renews its certificates on this schedule.</Text>
        <RecurrenceField label="Repeats" dtstart="2026-12-01" value={rule} preview={3} locale="en-US" />
      </Stack>
    </Card>
  )
}
