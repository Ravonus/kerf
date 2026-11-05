import { agoText, announce, plural } from '@weft-js/warp-core'
import { derived, onCleanup, state, type State } from '@weft-js/core'
import { Button } from '../Button'
import { LiveStatus, type LiveState } from '../parts'
import { Tooltip } from '../Tooltip'
import { Segmented } from '../Choice'
import { Select } from '../Select'
import { Table, type Column } from '../Table'
import { read } from './atoms'
import '../styles'
import '@weft-js/warp-core/styles/flows/tokens.css'
import '@weft-js/warp-core/styles/flows/base.css'
import '@weft-js/warp-core/styles/rich/helpers.css'
import '@weft-js/warp-core/styles/layout/tokens.css'
import '@weft-js/warp-core/styles/layout/row.css'
import '@weft-js/warp-core/styles/layout/stack.css'

/** One line of the audit log. */
export type AuditEvent = {
  id: string
  at: string
  actor: string
  category: string
  verb: string
  target: string
  href?: string
  ip: string
  diff?: { field: string; from: string; to: string }[]
}

/** Props for AuditLog. */
export interface AuditLogProps {
  events: readonly AuditEvent[] | State<readonly AuditEvent[]>
  now: string
  categories?: { value: string; label: string }[]
  /** The realtime pill, when the rows come from a live query. */
  live?: LiveState | undefined
  /** Resolve with `{ retryAfter }` (seconds) when rate limited (§5.5). */
  onExport?: () => Promise<{ retryAfter?: number } | void>
}

const RANGES = [
  { value: 'all', label: 'Any time', hours: Infinity },
  { value: '24h', label: 'Last 24 hours', hours: 24 },
  { value: '7d', label: 'Last 7 days', hours: 168 },
  { value: '30d', label: 'Last 30 days', hours: 720 },
]

/**
 * The audit log (09 §4.5): a read-only DataTable. Time is relative, exact on hover and focus; each event opens its diff.
 * Filters: actor, action, date range. New rows arrive by key, so a live query never rebuilds the table.
 */
const stamp = (at: string) => at.replace('T', ' ').replace(/:\d\dZ$/, ' UTC')

/** The audit log: who did what and when, filtered by category and actor, with an export. */
export function AuditLog({
  events,
  now,
  categories = [{ value: 'all', label: 'All' }],
  live,
  onExport,
}: AuditLogProps) {
  const category = state('all')
  const actor = state('all')
  const range = state('all')
  const wait = state(0)
  const { actors, shown } = auditFilters(
    () => events,
    () => now,
    { category, actor, range },
  )
  let root: HTMLElement | undefined
  const say = auditAnnouncer(() => root)
  const exportIt = auditExport(() => onExport?.(), wait, say)
  const refilter = () => queueMicrotask(() => say(`${plural(shown.value.length, 'event')} shown`))
  const columns = auditColumns(() => now)
  const diff = (event: AuditEvent) => auditDiff(event)
  const hasLive = derived(() => live !== undefined)
  return (
    <div ref={(n) => (root = n)} data-scope="stack">
      <div data-scope="row" data-justify="between">
        <Segmented
          label="Filter events"
          size="sm"
          value={category.value}
          options={categories}
          onChange={(v) => setAuditFilter(category, v, refilter)}
        />
        {hasLive.value && <LiveStatus state={live!} label="Audit log" />}
      </div>
      <div data-scope="row">
        <div data-grow="">
          <Select
            label="Actor"
            size="sm"
            options={actors.value}
            value={actor.value}
            onChange={(e: Event) => auditInput(e, actor, refilter)}
          />
        </div>
        <div data-grow="">
          <Select
            label="Date range"
            size="sm"
            options={RANGES}
            value={range.value}
            onChange={(e: Event) => auditInput(e, range, refilter)}
          />
        </div>
        {onExport && (
          <Button
            emphasis="frame"
            aria-disabled={wait.value > 0 ? 'true' : undefined}
            onClick={exportIt}
          >
            {wait.value > 0 ? `Try again in ${wait.value}s` : 'Export CSV'}
          </Button>
        )}
      </div>
      <Table
        caption="Recent events"
        captionHidden
        rows={shown}
        columns={columns}
        picker={false}
        heading={3}
        details="sheet"
        expand={diff}
        empty={{ title: 'Nothing matches', text: 'Try a wider filter.' }}
      />
    </div>
  )
}

function auditColumns(now: () => string): Column<AuditEvent>[] {
  return [
    {
      id: 'at',
      header: 'When',
      sort: (r) => r.at,
      cell: (e) => {
        const at = stamp(e.at)
        return (
          <Tooltip content={at}>
            <time datetime={e.at} tabindex="0">
              {agoText(e.at, now())}
            </time>
          </Tooltip>
        )
      },
    },
    { id: 'actor', header: 'Who', rowHeader: true, card: 'title' },
    {
      id: 'what',
      header: 'What',
      value: (e) => `${e.verb} ${e.target}`,
      cell: (e) => (
        <>
          {e.verb} {e.href ? <a href={e.href}>{e.target}</a> : e.target}
        </>
      ),
    },
    { id: 'ip', header: 'IP', priority: 2, cell: (e) => <code>{e.ip}</code> },
  ]
}

function auditDiff(e: AuditEvent) {
  return e.diff?.length ? (
    <dl data-scope="desc">
      {e.diff.map((d) => (
        <div key={d.field}>
          <dt>{d.field}</dt>
          <dd>
            {d.from} → {d.to}
          </dd>
        </div>
      ))}
    </dl>
  ) : (
    <span class="muted">No field changes were recorded.</span>
  )
}

function auditFilters(
  events: () => AuditLogProps['events'],
  now: () => string,
  {
    category,
    actor,
    range,
  }: { category: State<string>; actor: State<string>; range: State<string> },
) {
  const list = derived(() => read(events()))
  const actors = derived(() => [
    { value: 'all', label: 'Everyone' },
    ...[...new Set(list.value.map((e) => e.actor))].map((a) => ({ value: a, label: a })),
  ])
  const shown = derived(() => {
    const hours = RANGES.find((r) => r.value === range.value)!.hours
    return list.value.filter(
      (e) =>
        (category.value === 'all' || e.category === category.value) &&
        (actor.value === 'all' || e.actor === actor.value) &&
        Date.parse(now()) - Date.parse(e.at) <= hours * 36e5,
    )
  })
  return { actors, shown }
}

function auditExport(
  onExport: () => ReturnType<NonNullable<AuditLogProps['onExport']>> | undefined,
  wait: State<number>,
  say: (t: string) => void,
) {
  let tick: ReturnType<typeof setInterval> | undefined
  onCleanup(() => clearInterval(tick))
  const exportIt = async () => {
    const r = await onExport()
    if (!r?.retryAfter) return
    wait.value = r.retryAfter
    say(`Export limit reached. Try again in ${r.retryAfter} seconds.`)
    tick = setInterval(() => {
      wait.value -= 1
      if (wait.value > 0) return
      clearInterval(tick)
      say('You can export again.')
    }, 1000)
  }
  return exportIt
}

function auditAnnouncer(root: () => HTMLElement | undefined) {
  return (text: string) => {
    const element = root()
    if (element) announce(element.ownerDocument, text)
  }
}

function setAuditFilter(filter: State<string>, value: string, refilter: () => void) {
  filter.value = value
  refilter()
}

function auditInput(e: Event, filter: State<string>, refilter: () => void) {
  setAuditFilter(filter, (e.currentTarget as HTMLInputElement).value, refilter)
}
