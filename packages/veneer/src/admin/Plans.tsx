import {
  meterParts,
  money,
  planPrice,
  prorate,
  uid,
  type BillingInterval,
  type Proration,
} from '@kerf/veneer-core'
import { derived, state, type State, untrack } from '@kerf/core'
import { Alert } from '../Alert'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { Modal } from '../Modal'
import { Segmented } from '../Choice'
import { toast } from '../Toast'
import { Sweep, latch } from './atoms'
import '../styles'
import '@kerf/veneer-core/styles/flows/tokens.css'
import '@kerf/veneer-core/styles/flows/base.css'
import '@kerf/veneer-core/styles/rich/helpers.css'
import '@kerf/veneer-core/styles/layout/tokens.css'
import '@kerf/veneer-core/styles/layout/row.css'
import '@kerf/veneer-core/styles/layout/stack.css'
import '@kerf/veneer-core/styles/flows/plans.css'
import '@kerf/veneer-core/styles/flows/plan-card.css'
import '@kerf/veneer-core/styles/flows/lines.css'
import '@kerf/veneer-core/styles/flows/usage.css'
import '@kerf/veneer-core/styles/flows/meter.css'
import '@kerf/veneer-core/styles/flows/confirm.css'

/** A plan on offer. */
export type BillingPlan = {
  id: string
  name: string
  /** Per seat, per month. */ price: number
  description?: string | undefined
  features: string[]
  limits?: Record<string, number>
}

/** Props for PlanPicker. */
export interface PlanPickerProps {
  /** The plans to compare, one card each. */
  plans: BillingPlan[]
  current: string
  /** The checked card; a usage meter can preselect the next tier through it. */
  selected?: State<string>
  interval?: State<BillingInterval>
  seats: number
  daysLeft: number
  periodDays?: number
  /** The ISO 4217 code prices are shown in, such as `EUR`. */
  currency?: string
  locale?: string
  /** The server's proration. Default: `prorate` from the numbers above. */
  preview?: (plan: BillingPlan, interval: BillingInterval) => Promise<Proration> | Proration
  /** What stops working on a downgrade, listed in the dialog. */
  losses?: (plan: BillingPlan) => string[]
  /** Resolve with a message (card declined, seat limit) to keep the dialog with an Alert. */
  onChange: (plan: BillingPlan, interval: BillingInterval) => Promise<string | void> | string | void
}

function planConfirm({
  props,
  next,
  cycle,
  open,
  busy,
  problem,
  up,
}: {
  props: PlanPickerProps
  next: { readonly value: BillingPlan }
  cycle: State<BillingInterval>
  open: State<boolean>
  busy: State<boolean>
  problem: State<string>
  up: { readonly value: boolean }
}) {
  const confirm = async () => {
    if (busy.value) return
    busy.value = true
    try {
      const msg = await props.onChange(next.value, cycle.value)
      if (msg) problem.value = msg
      else {
        open.value = false
        toast.show({
          title: `You’re on ${next.value.name}`,
          description: up.value
            ? 'New limits are live. A receipt is on its way.'
            : 'The change applies at the end of this period.',
          tone: 'positive',
        })
      }
    } catch {
      toast.show({
        title: 'The plan didn’t change',
        description: 'Try again in a moment.',
        tone: 'critical',
        action: { label: 'Retry', onClick: confirm },
      })
    } finally {
      busy.value = false
    }
  }
  return confirm
}

function planModel(props: PlanPickerProps) {
  const group = uid('plan')
  const picked = untrack(() => props.selected) ?? state(untrack(() => props.current))
  const cycle = untrack(() => props.interval) ?? state<BillingInterval>('month')
  const open = state(false)
  const armed = latch(open)
  const quote = state<Proration | undefined>(undefined)
  const busy = state(false)
  const problem = state('')
  const find = (id: string) => props.plans.find((p) => p.id === id)!
  const cost = (n: number) => money(n, props.currency, props.locale)
  const now = derived(() => find(props.current))
  const next = derived(() => find(picked.value))
  const up = derived(() => next.value.price > now.value.price)
  const same = derived(() => picked.value === props.current)
  const per = (p: BillingPlan) =>
    !p.price
      ? 'free forever'
      : cycle.value === 'year'
        ? 'per seat / month, billed yearly'
        : 'per seat / month'
  const pitch = derived(() => {
    if (same.value) return `You’re on ${now.value.name}. Pick a plan to compare.`
    return up.value
      ? `${next.value.name} adds more. You pay the difference for the rest of this period.`
      : `${next.value.name} starts at the end of this period.`
  })
  const review = async () => {
    const p = next.value
    const c = cycle.value
    problem.value = ''
    quote.value = props.preview
      ? await props.preview(p, c)
      : prorate({
          from: { name: now.value.name, price: planPrice(now.value.price, c) },
          to: { name: p.name, price: planPrice(p.price, c) },
          seats: props.seats,
          daysLeft: props.daysLeft,
          periodDays: props.periodDays === undefined ? 30 : props.periodDays,
        })
    open.value = true
  }
  const confirm = planConfirm({ props, next, cycle, open, busy, problem, up })
  const lost = derived(() => (up.value || same.value ? [] : (props.losses?.(next.value) ?? [])))
  return {
    planGroup: group,
    picked,
    cycle,
    open,
    armed,
    planQuote: quote,
    busy,
    problem,
    cost,
    up,
    same,
    per,
    pitch,
    review,
    confirm,
    lost,
    next,
  }
}

function planDialog(model: ReturnType<typeof planModel>) {
  const { open, up, next, busy, confirm, problem, planQuote: quote, cost, lost } = model
  return (
    <Modal
      open={open}
      size="sm"
      title={`${up.value ? 'Upgrade' : 'Switch'} to ${next.value.name}`}
      description={
        up.value
          ? 'Your new limits apply as soon as you confirm.'
          : 'This applies at the end of this period.'
      }
      footer={
        <>
          <Button emphasis="frame" data-close="">
            Cancel
          </Button>
          <Button autofocus loading={busy.value} onClick={confirm}>
            {up.value ? 'Confirm upgrade' : 'Confirm switch'}
          </Button>
        </>
      }
    >
      <div data-scope="stack">
        {problem.value && (
          <Alert tone="critical" live title="The plan didn’t change">
            {problem.value}
          </Alert>
        )}
        <dl data-scope="lines">
          {(quote.value?.lines ?? []).map((l) => (
            <div key={l.label}>
              <dt>{l.label}</dt>
              <dd>{l.amount < 0 ? `−${cost(-l.amount)}` : cost(l.amount)}</dd>
            </div>
          ))}
          <div data-part="total">
            <dt>{quote.value?.due === 'today' ? 'Due today' : 'Due next period'}</dt>
            <dd>{cost(quote.value?.total ?? 0)}</dd>
          </div>
        </dl>
        {lost.value.length > 0 && (
          <div data-scope="confirm">
            <span class="muted">These stop working:</span>
            <ul>
              {lost.value.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}
        <span class="muted">Charged to the default card.</span>
      </div>
    </Modal>
  )
}

function planView(props: PlanPickerProps, model: ReturnType<typeof planModel>) {
  const { planGroup: group, picked, cycle, armed, cost, up, same, per, pitch, review, next } = model
  return (
    <div data-scope="stack">
      <div data-scope="row">
        <Segmented
          label="Billing period"
          value={cycle.value}
          onChange={(v) => (cycle.value = v)}
          size="sm"
          options={[
            { value: 'month', label: 'Monthly' },
            { value: 'year', label: 'Annual · save 20%' },
          ]}
        />
      </div>
      <div data-scope="plans">
        <div data-part="grid" role="radiogroup" aria-label="Plan">
          {props.plans.map((p) => (
            <label key={p.id} data-scope="plan-card" data-sweep="">
              <Sweep />
              <input
                type="radio"
                name={group}
                value={p.id}
                checked={p.id === picked.value}
                onChange={() => (picked.value = p.id)}
              />
              <span data-part="name">
                <span class="row">
                  <span data-part="radio" aria-hidden="true"></span>
                  {p.name}
                </span>
                {p.id === props.current && <Badge tone="neutral">Current</Badge>}
              </span>
              <span data-part="price">
                <b>{cost(planPrice(p.price, cycle.value))}</b>
                <span>{per(p)}</span>
              </span>
              {p.description && <span class="muted">{p.description}</span>}
              <ul>
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </label>
          ))}
        </div>
        <div data-scope="row" data-justify="between">
          <span class="muted" role="status">
            {pitch.value}
          </span>
          {same.value && (
            <Button emphasis="soft" tone="neutral" disabled>
              Current plan
            </Button>
          )}
          {!same.value && up.value && (
            <Button onClick={review}>Upgrade to {next.value.name}</Button>
          )}
          {!same.value && !up.value && (
            <Button emphasis="frame" onClick={review}>
              Switch to {next.value.name}
            </Button>
          )}
        </div>
      </div>
      {armed.value && planDialog(model)}
    </div>
  )
}

/**
 * The plan picker (09 §4.3): radio cards in a radiogroup, the checked card's sweep pinned, Monthly/Annual above. Arrow
 * keys only compare; the primary opens the proration dialog: line items, the new total, when it applies, Confirm.
 */
export function PlanPicker(props: PlanPickerProps) {
  const live = untrack(() => props)
  return planView(live, planModel(live))
}

/** Props for UsageMeter. */
export interface UsageMeterProps {
  label: string
  value: number
  limit: number
  format?: ((n: number) => string) | undefined
  /** Past the limit: "+ $12.40 overage". */
  overage?: string
  note?: string
  /** A link to the plan picker preselected on the next tier. */
  action?: unknown
}

/** A usage meter (09 §4.3): the warning tick at 80%, caution from 80%, critical at 100%, stripes past the limit. */
export function UsageMeter({
  label,
  value,
  limit,
  format = String,
  overage,
  note,
  action,
}: UsageMeterProps) {
  const m = derived(() => meterParts(value, limit))
  const said = derived(() =>
    m.value.over
      ? (overage ?? `${m.value.percent}% used.`)
      : `${m.value.percent}% used.${m.value.tone && note ? ` ${note}` : ''}`,
  )
  return (
    <div data-scope="meter" data-tone={m.value.tone}>
      <div data-part="head">
        <b>{label}</b>
        <span>
          {format(value)} / {format(limit)}
        </span>
      </div>
      <span
        data-part="rail"
        data-on=""
        role="meter"
        aria-label={label}
        aria-valuemin="0"
        aria-valuemax={limit}
        aria-valuenow={Math.min(value, limit)}
        aria-valuetext={`${format(value)} of ${format(limit)}`}
        style={`--v:${m.value.fill}%;--over:${m.value.over}%;--warn:${m.value.warn}%`}
      >
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
export const UsageMeters = ({ children }: { children: unknown }) => (
  <div data-scope="usage">{children}</div>
)
