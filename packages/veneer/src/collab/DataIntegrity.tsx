import { uid, type IntegrityStats } from '@kerf-js/veneer-core'
import { derived } from '@kerf-js/core'
import { Button } from '../Button'
import { LiveStatus, type LiveState } from '../parts'
import { read, type Live } from './peer'
import '../styles'
import '@kerf-js/veneer-core/styles/app/tokens.css'
import '@kerf-js/veneer-core/styles/app/integrity.css'

/** One event of a replication trace. */
export interface IntegrityEvent {
  id: string
  seq: number
  kind: string
  route: string
  note?: string
  lag: number
}

/**
 * The dev-tools panel on a channel (07 §6.4): Sent, Received, Duplicate (caution), Out of order (critical), Lag p95, a
 * recent-events log, and inject and reset controls for testing a client's dedupe. `integrityCounter` keeps the counts.
 */
export function DataIntegrity({
  channel,
  stats,
  events,
  live,
  onInjectDuplicate,
  onInjectReorder,
  onReset,
}: {
  channel: string
  stats: Live<IntegrityStats>
  events: Live<IntegrityEvent[]>
  live?: LiveState | undefined
  onInjectDuplicate?: () => void
  onInjectReorder?: () => void
  onReset?: () => void
}) {
  const id = uid('integrity')
  const s = derived(() => read(stats))
  const log = derived(() => read(events))
  const hasLive = derived(() => live !== undefined)
  return (
    <section data-scope="integrity" aria-labelledby={id}>
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px">
        <h3 id={id}>Data integrity · channel “{channel}”</h3>
        {hasLive.value && <LiveStatus state={live!} />}
      </div>
      <dl>
        <div>
          <dt>Sent</dt>
          <dd data-numeric="">{s.value.sent}</dd>
        </div>
        <div>
          <dt>Received</dt>
          <dd data-numeric="">{s.value.received}</dd>
        </div>
        <div>
          <dt>Duplicate</dt>
          <dd data-numeric="" data-tone={s.value.duplicate ? 'caution' : undefined}>
            {s.value.duplicate}
          </dd>
        </div>
        <div>
          <dt>Out of order</dt>
          <dd data-numeric="" data-tone={s.value.outOfOrder ? 'critical' : undefined}>
            {s.value.outOfOrder}
          </dd>
        </div>
        <div>
          <dt>Lag p95</dt>
          <dd data-numeric="">{s.value.lagP95} ms</dd>
        </div>
      </dl>
      <ol aria-label="Recent events" tabindex="0">
        {log.value.map((e) => (
          <li key={e.id}>
            <b>#{e.seq}</b>
            <span>{e.kind}</span>
            <span>
              {e.route}
              {e.note ? ` · ${e.note}` : ''}
            </span>
            <span>{e.lag} ms</span>
          </li>
        ))}
      </ol>
      <div>
        <Button emphasis="outline" tone="neutral" size="sm" onClick={() => onInjectDuplicate?.()}>
          Inject a duplicate
        </Button>{' '}
        <Button emphasis="outline" tone="neutral" size="sm" onClick={() => onInjectReorder?.()}>
          Inject a reorder
        </Button>{' '}
        <Button emphasis="ghost" tone="neutral" size="sm" onClick={() => onReset?.()}>
          Reset counts
        </Button>
      </div>
    </section>
  )
}
