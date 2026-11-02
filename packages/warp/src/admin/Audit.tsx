import { agoText, announce, plural } from '@weft/warp-core'
import { derived, onCleanup, state, type State } from 'weft'
import { Button } from '../Button'
import { LiveStatus, type LiveState } from '../parts'
import { Tooltip } from '../Tooltip'
import { Segmented } from '../Choice'
import { Select } from '../Select'
import { Table, type Column } from '../Table'
import { read } from './atoms'
import '../styles'
import '@weft/warp-core/styles/flows/tokens.css'
import '@weft/warp-core/styles/flows/base.css'
import '@weft/warp-core/styles/rich/helpers.css'
import '@weft/warp-core/styles/layout/tokens.css'
import '@weft/warp-core/styles/layout/row.css'
import '@weft/warp-core/styles/layout/stack.css'

export type AuditEvent = { id: string; at: string; actor: string; category: string; verb: string; target: string; href?: string; ip: string; diff?: { field: string; from: string; to: string }[] }

export interface AuditLogProps {
  events: readonly AuditEvent[] | State<readonly AuditEvent[]>
  now: string
  categories?: { value: string; label: string }[]
  /** The realtime pill, when the rows come from a live query. */
  live?: LiveState
  /** Resolve with `{ retryAfter }` (seconds) when rate limited (§5.5). */
  onExport?: () => Promise<{ retryAfter?: number } | void>
}

const RANGES = [{ value: 'all', label: 'Any time', hours: Infinity }, { value: '24h', label: 'Last 24 hours', hours: 24 }, { value: '7d', label: 'Last 7 days', hours: 168 }, { value: '30d', label: 'Last 30 days', hours: 720 }]

/**
 * The audit log (09 §4.5): a read-only DataTable. Time is relative, exact on hover and focus; each event opens its diff.
 * Filters: actor, action, date range. New rows arrive by key, so a live query never rebuilds the table.
 */
export function AuditLog({ events, now, categories = [{ value: 'all', label: 'All' }], live, onExport }: AuditLogProps) {
  const category = state('all')
  const actor = state('all')
  const range = state('all')
  const wait = state(0)
  const list = derived(() => read(events) as readonly AuditEvent[])
  const actors = derived(() => [{ value: 'all', label: 'Everyone' }, ...[...new Set(list.value.map(e => e.actor))].map(a => ({ value: a, label: a }))])
  const shown = derived(() => {
    const hours = RANGES.find(r => r.value === range.value)!.hours
    return list.value.filter(e => (category.value === 'all' || e.category === category.value) && (actor.value === 'all' || e.actor === actor.value) && Date.parse(now) - Date.parse(e.at) <= hours * 36e5)
  })
  let tick: ReturnType<typeof setInterval> | undefined
  let root: HTMLElement | undefined
  const say = (t: string) => { if (root) announce(root.ownerDocument, t) }
  onCleanup(() => clearInterval(tick))
  const refilter = () => queueMicrotask(() => say(`${plural(shown.value.length, 'event')} shown`))
  const exportIt = async () => {
    const r = await onExport?.()
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
  const columns: Column<AuditEvent>[] = [
    { id: 'at', header: 'When', sort: r => r.at, cell: e => <Tooltip content={e.at.replace('T', ' ').replace(/:\d\dZ$/, ' UTC')}><time datetime={e.at} tabindex="0">{agoText(e.at, now)}</time></Tooltip> },
    { id: 'actor', header: 'Who', rowHeader: true, card: 'title' },
    { id: 'what', header: 'What', value: e => `${e.verb} ${e.target}`, cell: e => <>{e.verb} {e.href ? <a href={e.href}>{e.target}</a> : e.target}</> },
    { id: 'ip', header: 'IP', priority: 2, cell: e => <code>{e.ip}</code> },
  ]
  const diff = (e: AuditEvent) => (e.diff?.length
    ? <dl data-scope="desc">{e.diff.map(d => <div key={d.field}><dt>{d.field}</dt><dd>{d.from} → {d.to}</dd></div>)}</dl>
    : <span class="muted">No field changes were recorded.</span>)
  const hasLive = derived(() => live !== undefined)
  return (
    <div data-scope="stack">
      <div data-scope="row" data-justify="between">
        <Segmented label="Filter events" size="sm" value={category.value} options={categories} onChange={v => { category.value = v; refilter() }} />
        {hasLive.value && <LiveStatus state={live!} label="Audit log" />}
      </div>
      <div data-scope="row">
        <div data-grow=""><Select label="Actor" size="sm" options={actors.value} value={actor.value} onChange={(e: any) => { actor.value = e.currentTarget.value; refilter() }} /></div>
        <div data-grow=""><Select label="Date range" size="sm" options={RANGES} value={range.value} onChange={(e: any) => { range.value = e.currentTarget.value; refilter() }} /></div>
        {onExport && <Button emphasis="frame" aria-disabled={wait.value > 0 ? 'true' : undefined} onClick={exportIt}>{wait.value > 0 ? `Try again in ${wait.value}s` : 'Export CSV'}</Button>}
      </div>
      <Table caption="Recent events" captionHidden rows={shown as any} columns={columns} picker={false} heading={3} details="sheet" expand={diff} empty={{ title: 'Nothing matches', text: 'Try a wider filter.' }} />
    </div>
  )
}
