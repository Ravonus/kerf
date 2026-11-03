import { announce } from '@weft-js/warp-core'
import { derived, onMount } from '@weft-js/core'
import { Button } from '../Button'
import '../styles'
import '@weft-js/warp-core/styles/flows/tokens.css'
import '@weft-js/warp-core/styles/flows/base.css'
import '@weft-js/warp-core/styles/rich/helpers.css'
import '@weft-js/warp-core/styles/layout/tokens.css'
import '@weft-js/warp-core/styles/layout/row.css'
import '@weft-js/warp-core/styles/layout/stack.css'
import '@weft-js/warp-core/styles/flows/meter.css'
import '@weft-js/warp-core/styles/flows/confirmation.css'
import '@weft-js/warp-core/styles/flows/tracker.css'

/** How far an order has got. */
export type OrderStage = 'placed' | 'packed' | 'shipped' | 'delivered'
const STAGES: { id: OrderStage; title: string }[] = [{ id: 'placed', title: 'Placed' }, { id: 'packed', title: 'Packed' }, { id: 'shipped', title: 'Shipped' }, { id: 'delivered', title: 'Delivered' }]

/** The order tracker (09 §6.3): ordered → packed → shipped → delivered, the current stop filled. */
export function OrderTracker({ stage = 'placed' }: { stage?: OrderStage | undefined }) {
  const at = derived(() => STAGES.findIndex(s => s.id === stage))
  return (
    <ol data-scope="tracker" aria-label="Order status">
      {STAGES.flatMap((s, i) => [
        ...(i ? [<li key={`r-${s.id}`} aria-hidden="true"><span data-part="rail" data-on={i <= at.value ? '' : undefined} style={`--v:100%;--dl:${i * 300}ms`}><span data-part="rail-fill"></span></span></li>] : []),
        <li key={s.id}><span data-part="stop" data-on={i <= at.value ? '' : undefined} aria-current={i === at.value ? 'step' : undefined} style={`--dl:${i * 300}ms`}><i></i>{s.title}</span></li>,
      ])}
    </ol>
  )
}

/** Props for OrderConfirmation. */
export interface OrderConfirmationProps {
  orderId: string
  email?: string
  note?: string
  stage?: OrderStage | undefined
  summary?: unknown
  titleId?: string
  onTrack?: () => void
  onContinue?: (() => void) | undefined
}

/** The confirmation (09 §6.3): the mark strokes in, the order number, where the receipt went, the tracker. Announced politely. */
export function OrderConfirmation({ orderId, email, note, stage, summary, titleId, onTrack, onContinue }: OrderConfirmationProps) {
  let root: HTMLElement | undefined
  onMount(() => { queueMicrotask(() => { if (root) announce(root.ownerDocument, `Order ${orderId} confirmed`) }) })
  return (
    <div ref={n => (root = n)} data-scope="confirmation">
      <span data-part="mark" data-tone="positive"><svg viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" data-draw="" d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
      <div>
        <h2 data-part="step-title" id={titleId} tabindex="-1">Order #{orderId} confirmed</h2>
        <span class="muted">{email ? `A receipt is on its way to ${email}.` : 'A receipt is on its way.'} {note}</span>
      </div>
      <OrderTracker stage={stage} />
      {summary}
      <div data-scope="row">
        {onTrack && <Button onClick={onTrack}>Track order</Button>}
        {onContinue && <Button emphasis="frame" onClick={onContinue}>Continue shopping</Button>}
      </div>
    </div>
  )
}
