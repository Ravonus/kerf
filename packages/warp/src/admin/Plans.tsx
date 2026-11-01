import { meterParts, money, planPrice, prorate, uid, type BillingInterval, type Proration } from '@weft/warp-core'
import { derived, state, type State, untrack } from 'weft'
import { Alert } from '../Alert'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { Modal } from '../Modal'
import { Segmented } from '../Choice'
import { toast } from '../Toast'
import { Sweep, latch } from './atoms'
import '../styles'
import '@weft/warp-core/styles/flows/tokens.css'
import '@weft/warp-core/styles/flows/base.css'
import '@weft/warp-core/styles/rich/helpers.css'
import '@weft/warp-core/styles/layout/tokens.css'
import '@weft/warp-core/styles/layout/row.css'
import '@weft/warp-core/styles/layout/stack.css'
import '@weft/warp-core/styles/flows/plans.css'
import '@weft/warp-core/styles/flows/plan-card.css'
import '@weft/warp-core/styles/flows/lines.css'
import '@weft/warp-core/styles/flows/usage.css'
import '@weft/warp-core/styles/flows/meter.css'
import '@weft/warp-core/styles/flows/confirm.css'

export type BillingPlan = { id: string; name: string; /** Per seat, per month. */ price: number; description?: string; features: string[]; limits?: Record<string, number> }

export interface PlanPickerProps {
  plans: BillingPlan[]
  current: string
  /** The checked card; a usage meter can preselect the next tier through it. */
  selected?: State<string>
  interval?: State<BillingInterval>
  seats: number
  daysLeft: number
  periodDays?: number
  currency?: string
  locale?: string
  /** The server's proration. Default: `prorate` from the numbers above. */
  preview?: (plan: BillingPlan, interval: BillingInterval) => Promise<Proration> | Proration
  /** What stops working on a downgrade, listed in the dialog. */
  losses?: (plan: BillingPlan) => string[]
  /** Resolve with a message (card declined, seat limit) to keep the dialog with an Alert. */
  onChange: (plan: BillingPlan, interval: BillingInterval) => Promise<string | void> | string | void
}

/**
 * The plan picker (09 §4.3): radio cards in a radiogroup, the checked card's sweep pinned, Monthly/Annual above. Arrow
 * keys only compare; the primary opens the proration dialog: line items, the new total, when it applies, Confirm.
 */
export function PlanPicker({ plans, current, selected, interval, seats, daysLeft, periodDays = 30, currency, locale, preview, losses, onChange }: PlanPickerProps) {
  const group = uid('plan')
  const picked = untrack(() => selected) ?? state(untrack(() => current))
  const cycle = untrack(() => interval) ?? state<BillingInterval>('month')
  const open = state(false)
  const armed = latch(open)
  const quote = state<Proration | undefined>(undefined)
  const busy = state(false)
  const problem = state('')
  const find = (id: string) => plans.find(p => p.id === id)!
  const cost = (n: number) => money(n, currency, locale)
  const now = derived(() => find(current))
  const next = derived(() => find(picked.value))
  const up = derived(() => next.value.price > now.value.price)
  const same = derived(() => picked.value === current)
  const per = (p: BillingPlan) => (!p.price ? 'free forever' : cycle.value === 'year' ? 'per seat / month, billed yearly' : 'per seat / month')
  const pitch = derived(() => {
    if (same.value) return `You’re on ${now.value.name}. Pick a plan to compare.`
    return up.value ? `${next.value.name} adds more. You pay the difference for the rest of this period.` : `${next.value.name} starts at the end of this period.`
  })
  const review = async () => {
    const p = next.value
    const c = cycle.value
    problem.value = ''
    quote.value = preview ? await preview(p, c) : prorate({ from: { name: now.value.name, price: planPrice(now.value.price, c) }, to: { name: p.name, price: planPrice(p.price, c) }, seats, daysLeft, periodDays })
    open.value = true
  }
  const confirm = async () => {
    if (busy.value) return
    busy.value = true
    try {
      const msg = await onChange(next.value, cycle.value)
      if (msg) problem.value = msg
      else {
        open.value = false
        toast.show({ title: `You’re on ${next.value.name}`, description: up.value ? 'New limits are live. A receipt is on its way.' : 'The change applies at the end of this period.', tone: 'positive' })
      }
    } catch {
      toast.show({ title: 'The plan didn’t change', description: 'Try again in a moment.', tone: 'critical', action: { label: 'Retry', onClick: confirm } })
    } finally { busy.value = false }
  }
  const lost = derived(() => (up.value || same.value ? [] : losses?.(next.value) ?? []))
  return (
    <div data-scope="stack">
      <div data-scope="row"><Segmented label="Billing period" value={cycle.value} onChange={v => (cycle.value = v as BillingInterval)} size="sm" options={[{ value: 'month', label: 'Monthly' }, { value: 'year', label: 'Annual · save 20%' }]} /></div>
      <div data-scope="plans">
        <div data-part="grid" role="radiogroup" aria-label="Plan">
          {plans.map(p => (
            <label key={p.id} data-scope="plan-card" data-sweep="">
              <Sweep />
              <input type="radio" name={group} value={p.id} checked={p.id === picked.value} onChange={() => (picked.value = p.id)} />
              <span data-part="name"><span class="row"><span data-part="radio" aria-hidden="true"></span>{p.name}</span>{p.id === current && <Badge tone="neutral">Current</Badge>}</span>
              <span data-part="price"><b>{cost(planPrice(p.price, cycle.value))}</b><span>{per(p)}</span></span>
              {p.description && <span class="muted">{p.description}</span>}
              <ul>{p.features.map(f => <li key={f}>{f}</li>)}</ul>
            </label>
          ))}
        </div>
        <div data-scope="row" data-justify="between">
          <span class="muted" role="status">{pitch.value}</span>
          {same.value && <Button emphasis="soft" tone="neutral" disabled>Current plan</Button>}
          {!same.value && up.value && <Button onClick={review}>Upgrade to {next.value.name}</Button>}
          {!same.value && !up.value && <Button emphasis="frame" onClick={review}>Switch to {next.value.name}</Button>}
        </div>
      </div>
      {armed.value && (
        <Modal open={open} size="sm" title={`${up.value ? 'Upgrade' : 'Switch'} to ${next.value.name}`} description={up.value ? 'Your new limits apply as soon as you confirm.' : 'This applies at the end of this period.'} footer={<><Button emphasis="frame" data-close="">Cancel</Button><Button autofocus loading={busy.value} onClick={confirm}>{up.value ? 'Confirm upgrade' : 'Confirm switch'}</Button></>}>
          <div data-scope="stack">
            {problem.value && <Alert tone="critical" live title="The plan didn’t change">{problem.value}</Alert>}
            <dl data-scope="lines">
              {(quote.value?.lines ?? []).map(l => <div key={l.label}><dt>{l.label}</dt><dd>{l.amount < 0 ? `−${cost(-l.amount)}` : cost(l.amount)}</dd></div>)}
              <div data-part="total"><dt>{quote.value?.due === 'today' ? 'Due today' : 'Due next period'}</dt><dd>{cost(quote.value?.total ?? 0)}</dd></div>
            </dl>
            {lost.value.length > 0 && <div data-scope="confirm"><span class="muted">These stop working:</span><ul>{lost.value.map(t => <li key={t}>{t}</li>)}</ul></div>}
            <span class="muted">Charged to the default card.</span>
          </div>
        </Modal>
      )}
    </div>
  )
}

export interface UsageMeterProps {
  label: string
  value: number
  limit: number
  format?: (n: number) => string
  /** Past the limit: "+ $12.40 overage". */
  overage?: string
  note?: string
  /** A link to the plan picker preselected on the next tier. */
  action?: any
}

/** A usage meter (09 §4.3): the warning tick at 80%, caution from 80%, critical at 100%, stripes past the limit. */
export function UsageMeter({ label, value, limit, format = String, overage, note, action }: UsageMeterProps) {
  const m = derived(() => meterParts(value, limit))
  const said = derived(() => (m.value.over ? overage ?? `${m.value.percent}% used.` : `${m.value.percent}% used.${m.value.tone && note ? ` ${note}` : ''}`))
  return (
    <div data-scope="meter" data-tone={m.value.tone}>
      <div data-part="head"><b>{label}</b><span>{format(value)} / {format(limit)}</span></div>
      <span data-part="rail" data-on="" role="meter" aria-label={label} aria-valuemin="0" aria-valuemax={limit} aria-valuenow={Math.min(value, limit)} aria-valuetext={`${format(value)} of ${format(limit)}`} style={`--v:${m.value.fill}%;--over:${m.value.over}%;--warn:${m.value.warn}%`}>
        <span data-part="rail-fill"></span>
        {m.value.over > 0 && <span data-part="over"></span>}
        <span data-part="tick" aria-hidden="true"></span>
      </span>
      <p data-part="note">{said.value}</p>
      {action}
    </div>
  )
}

/** The group of usage meters. */
export const UsageMeters = ({ children }: { children: any }) => <div data-scope="usage">{children}</div>
