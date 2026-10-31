import { addressProblems, announce, cartCount, cartTotals, errorStep, money, newOrderKey, openWhenWide, uid, type Address, type AddressPart, type CartLine, type CheckoutError } from '@weft/ui-core'
import { derived, state, type State, untrack } from 'weft'
import { Alert } from '../Alert'
import { Button } from '../Button'
import { Checkbox } from '../Choice'
import { Input } from '../Field'
import { Icon } from '../Icon'
import { Glyph } from '../parts'
import { AddressField, type AddressProvider } from '../PlaceField'
import { Tag } from '../Tag'
import { toast } from '../Toast'
import { use } from '../use'
import { LineItem } from './Cart'
import { OrderConfirmation, type OrderStage } from './Order'
import { StepBar } from './StepBar'
import { GLYPH, Sweep, afterFlush } from './atoms'
import '../styles'
import '@weft/ui-core/styles/flows/tokens.css'
import '@weft/ui-core/styles/flows/base.css'
import '@weft/ui-core/styles/rich/helpers.css'
import '@weft/ui-core/styles/layout/tokens.css'
import '@weft/ui-core/styles/layout/row.css'
import '@weft/ui-core/styles/layout/stack.css'
import '@weft/ui-core/styles/flows/flow.css'
import '@weft/ui-core/styles/flows/checkout.css'
import '@weft/ui-core/styles/flows/choice.css'
import '@weft/ui-core/styles/flows/plan-card.css'
import '@weft/ui-core/styles/flows/line-item.css'
import '@weft/ui-core/styles/flows/lines.css'
import '@weft/ui-core/styles/flows/auth.css' // the "or with a card" divider

export type ShippingOption = { id: string; name: string; /** "Arrives Thu 6 Nov" */ eta: string; price: number }
export type Coupon = { code: string; percentOff: number }
export type CheckoutStep = 'cart' | 'address' | 'shipping' | 'payment' | 'review' | 'done'
export type OrderDraft = { lines: CartLine[]; name: string; email: string; phone: string; address: Address; billing: Address; shipping: string; coupon?: string; total: number; idempotencyKey: string }
export type PlaceOrderResult = { order: { id: string; stage?: OrderStage } } | { error: CheckoutError }

export interface CheckoutProps {
  cart: State<CartLine[]>
  shipping: ShippingOption[]
  countries?: string[]
  defaultCountry?: string
  addressProvider?: AddressProvider
  taxRate?: number
  currency?: string
  locale?: string
  /** The Payment step's body: a PayFrame, in a provider's slot. warp never renders card fields. */
  payment: any
  /** The saved wallet's frame button, above the divider. */
  wallet?: { label: string; onClick: () => void }
  /** Checks a code; resolve undefined when it isn't valid. */
  coupon?: (code: string) => Promise<Coupon | undefined> | Coupon | undefined
  /** The client's key for this attempt. Without one a key is made; a retry after a timeout resends it. */
  idempotencyKey?: string
  /** Throw on a transport failure: values stay, a Toast offers Retry with the same key. */
  onPlaceOrder: (order: OrderDraft) => Promise<PlaceOrderResult>
  onStepChange?: (step: CheckoutStep) => void
  onContinueShopping?: () => void
  signInHref?: string
}

const STEPS: { id: CheckoutStep; title: string }[] = [{ id: 'cart', title: 'Cart' }, { id: 'address', title: 'Address' }, { id: 'shipping', title: 'Shipping' }, { id: 'payment', title: 'Payment' }, { id: 'review', title: 'Review' }]
const WIDE = 860

/**
 * Checkout (09 §6.2): Cart → Address → Shipping → Payment → Review → Confirmation, guest first. Each step's title takes
 * focus and the step is announced; back goes to a step without losing a value. Place order is idempotent by a client
 * key; CARD_DECLINED returns to Payment, OUT_OF_STOCK to Cart with the line marked, PRICE_CHANGED stays on Review.
 */
export function Checkout({ cart, shipping, countries, defaultCountry = 'US', addressProvider, taxRate = 0, currency, locale, payment, wallet, coupon, idempotencyKey, onPlaceOrder, onStepChange, onContinueShopping, signInHref }: CheckoutProps) {
  const id = uid('co')
  const step = state<CheckoutStep>('cart')
  const dir = state<'back' | undefined>(undefined)
  const name = state('')
  const email = state('')
  const phone = state('')
  const address = state<Address | null>(null)
  const billing = state<Address | null>(null)
  const sameBilling = state(true)
  const nameError = state('')
  const emailError = state('')
  const addressErrors = state<Partial<Record<AddressPart, string>>>({})
  const billingErrors = state<Partial<Record<AddressPart, string>>>({})
  const addressAlert = state('')
  const ship = state(untrack(() => shipping[0]?.id ?? ''))
  const code = state('')
  const codeError = state('')
  const applied = state<Coupon | undefined>(undefined)
  const checking = state(false)
  const placing = state(false)
  const declined = state('')
  const outOfStock = state('')
  const newTotal = state<number | undefined>(undefined)
  const placed = state<{ id: string; stage?: OrderStage } | undefined>(undefined)
  const paySlot = derived(() => payment)
  let root: HTMLElement | undefined
  let summary: HTMLDetailsElement | undefined
  let key: string | undefined
  use(openWhenWide, () => summary, () => WIDE)

  const lines = derived(() => cart.value)
  const option = derived(() => shipping.find(o => o.id === ship.value))
  const totals = derived(() => cartTotals(lines.value, { shipping: option.value?.price ?? 0, percentOff: applied.value?.percentOff, taxRate }))
  const total = derived(() => newTotal.value ?? totals.value.total)
  const cost = (n: number) => money(n, currency, locale)
  const at = derived(() => STEPS.findIndex(s => s.id === step.value))
  const stepTitle = (id: CheckoutStep) => (id === 'done' ? 'Order confirmed' : STEPS.find(s => s.id === id)!.title)
  const section = (id: CheckoutStep) => root?.querySelector<HTMLElement>(`[data-step="${id}"]`)

  const go = (to: CheckoutStep, focus?: 'field', back?: boolean) => {
    dir.value = back ? 'back' : undefined
    step.value = to
    onStepChange?.(to)
    if (root) announce(root.ownerDocument, to === 'done' ? stepTitle(to) : `Step ${STEPS.findIndex(s => s.id === to) + 1} of ${STEPS.length}, ${stepTitle(to)}`)
    afterFlush(() => {
      const s = section(to)
      const field = focus && s?.querySelector<HTMLElement>('input:not([type="hidden"]):checked, input:not([type="hidden"]), button[data-part="trigger"]')
      ;(field || s?.querySelector<HTMLElement>('[data-part="step-title"]'))?.focus()
    })
  }
  const prev = (to: CheckoutStep) => go(to, undefined, true)
  const submitAddress = (e: Event) => {
    e.preventDefault()
    nameError.value = name.value.trim() ? '' : 'Enter the name for delivery.'
    emailError.value = !email.value ? 'We send the receipt here.' : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value) ? '' : 'That doesn’t look like an email.'
    addressErrors.value = addressProblems(address.value, defaultCountry)
    billingErrors.value = sameBilling.value ? {} : addressProblems(billing.value, defaultCountry)
    const n = [nameError.value, emailError.value].filter(Boolean).length + Object.keys(addressErrors.value).length + Object.keys(billingErrors.value).length
    addressAlert.value = n ? `${n === 1 ? '1 field needs' : `${n} fields need`} attention` : ''
    if (!n) return go('shipping')
    if (root) announce(root.ownerDocument, addressAlert.value)
    afterFlush(() => section('address')?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }
  const apply = async (e: Event) => {
    e.preventDefault()
    const v = code.value.trim().toUpperCase()
    if (!v) return void (codeError.value = 'Enter a code first.')
    checking.value = true
    const c = await coupon?.(v)
    checking.value = false
    if (!c) return void (codeError.value = 'That code isn’t valid or has expired.')
    applied.value = c
    code.value = ''
    codeError.value = ''
    toast.show({ title: `${c.code} applied`, description: `${c.percentOff}% off your items.`, tone: 'positive' })
  }
  const unapply = () => {
    const c = applied.value!
    applied.value = undefined
    toast.show({ title: `${c.code} removed`, action: { label: 'Undo', onClick: () => (applied.value = c) } })
  }
  const pay = async () => {
    if (placing.value) return // a double tap: the first press owns the key
    placing.value = true
    const useKey = idempotencyKey ?? (key ??= newOrderKey())
    const a = address.value!
    try {
      const r = await onPlaceOrder({ lines: lines.value, name: name.value, email: email.value, phone: phone.value, address: a, billing: sameBilling.value ? a : billing.value!, shipping: ship.value, coupon: applied.value?.code, total: total.value, idempotencyKey: useKey })
      if ('order' in r) { placed.value = r.order; key = undefined; return go('done') }
      key = undefined // a definite answer: the next attempt is a new one
      const err = r.error
      declined.value = err.code === 'CARD_DECLINED' ? err.reason : ''
      outOfStock.value = err.code === 'OUT_OF_STOCK' ? err.sku : ''
      newTotal.value = err.code === 'PRICE_CHANGED' ? err.total : undefined
      if (err.code === 'PRICE_CHANGED') {
        if (root) announce(root.ownerDocument, `The total changed to ${cost(err.total)}`, true)
        return
      }
      go(errorStep(err) as CheckoutStep, undefined, true)
    } catch {
      toast.show({ title: 'We couldn’t reach the store', description: 'You weren’t charged twice. Try again.', tone: 'critical', action: { label: 'Retry', onClick: pay } })
    } finally { placing.value = false }
  }
  const edits = derived(() => [
    { step: 'address' as CheckoutStep, label: 'Ship to', text: `${name.value}, ${[address.value?.lines[0], address.value?.locality, address.value?.postalCode].filter(Boolean).join(', ')}` },
    { step: 'shipping' as CheckoutStep, label: 'Delivery', text: `${option.value?.name ?? ''} · ${option.value?.eta ?? ''}` },
    { step: 'payment' as CheckoutStep, label: 'Payment', text: 'Card from your provider' },
  ])
  const count = derived(() => cartCount(lines.value))
  const Nav = ({ back, children }: { back: CheckoutStep; children: any }) => (
    <div data-part="nav"><Button emphasis="ghost" tone="neutral" icon="left" onClick={() => prev(back)}>Back</Button>{children}</div>
  )
  return (
    <div ref={(n: any) => (root = n)} data-scope="checkout">
      <div data-part="layout">
        <div data-scope="stack">
          {step.value !== 'done' && <StepBar label="Checkout steps" steps={STEPS} current={at.value} />}
          <div data-scope="flow" data-dir={dir.value}>
            <section data-part="step" data-step="cart" data-state={step.value === 'cart' ? 'active' : undefined} aria-labelledby={`${id}-cart`}>
              <div data-part="step-body">
                <h2 data-part="step-title" id={`${id}-cart`} tabindex="-1">Your cart</h2>
                {signInHref && <span class="muted">Checking out as a guest. <a href={signInHref}>Sign in</a></span>}
                {outOfStock.value && <Alert tone="critical" live title="Part of your order just sold out">Remove the marked line to continue.</Alert>}
                {lines.value.length
                  ? lines.value.map(l => <LineItem key={l.id} line={l} cart={cart} currency={currency} locale={locale} problem={l.id === outOfStock.value ? 'Out of stock' : undefined} />)
                  : <span class="muted">Your cart is empty.</span>}
                <div data-part="nav">
                  {onContinueShopping ? <Button emphasis="link" onClick={onContinueShopping}>Continue shopping</Button> : <span></span>}
                  <Button disabled={!count.value || lines.value.some(l => l.id === outOfStock.value)} onClick={() => go('address')}>Continue to address</Button>
                </div>
              </div>
            </section>
            <section data-part="step" data-step="address" data-state={step.value === 'address' ? 'active' : undefined} aria-labelledby={`${id}-address`}>
              <form data-part="step-body" novalidate onSubmit={submitAddress}>
                <h2 data-part="step-title" id={`${id}-address`} tabindex="-1">Where should it go?</h2>
                {addressAlert.value && <Alert tone="critical">{addressAlert.value}</Alert>}
                <div data-part="cols">
                  <Input label="Full name" autocomplete="name" value={name.value} error={nameError.value} onInput={e => { name.value = e.currentTarget.value; nameError.value = '' }} />
                  <Input label="Email for receipt" type="email" autocomplete="email" inputmode="email" value={email.value} error={emailError.value} onInput={e => { email.value = e.currentTarget.value; emailError.value = '' }} />
                </div>
                <AddressField label="Shipping address" value={address} countries={countries} defaultCountry={defaultCountry} provider={addressProvider} locale={locale} errors={addressErrors.value} />
                <Input label="Phone (optional)" type="tel" autocomplete="tel" inputmode="tel" hint="Only for the courier, if they can’t find you." value={phone.value} onInput={e => (phone.value = e.currentTarget.value)} />
                <Checkbox checked={sameBilling.value} onChange={(e: any) => (sameBilling.value = e.currentTarget.checked)}>Use as billing address</Checkbox>
                {!sameBilling.value && <AddressField label="Billing address" value={billing} countries={countries} defaultCountry={defaultCountry} locale={locale} errors={billingErrors.value} />}
                <Nav back="cart"><Button type="submit">Continue to shipping</Button></Nav>
              </form>
            </section>
            <section data-part="step" data-step="shipping" data-state={step.value === 'shipping' ? 'active' : undefined} aria-labelledby={`${id}-shipping`}>
              <div data-part="step-body">
                <h2 data-part="step-title" id={`${id}-shipping`} tabindex="-1">How fast?</h2>
                <fieldset data-scope="choice">
                  <legend data-part="sr-only">Shipping speed</legend>
                  {shipping.map(o => (
                    <label key={o.id} data-scope="plan-card" data-sweep="" data-phase="idle">
                      <Sweep />
                      <input type="radio" name={`${id}-ship`} value={o.id} checked={o.id === ship.value} onChange={() => (ship.value = o.id)} />
                      <span data-part="radio" aria-hidden="true"></span>
                      <span><b>{o.name}</b><small>{o.eta}</small></span>
                      <b>{o.price ? cost(o.price) : 'Free'}</b>
                    </label>
                  ))}
                </fieldset>
                <Nav back="address"><Button onClick={() => go('payment')}>Continue to payment</Button></Nav>
              </div>
            </section>
            <section data-part="step" data-step="payment" data-state={step.value === 'payment' ? 'active' : undefined} aria-labelledby={`${id}-payment`}>
              <div data-part="step-body">
                <h2 data-part="step-title" id={`${id}-payment`} tabindex="-1">Payment</h2>
                {declined.value && <Alert tone="critical" live title="Your card was declined">{declined.value} Try another card.</Alert>}
                {wallet && <Button emphasis="frame" full onClick={wallet.onClick}>{wallet.label}</Button>}
                {wallet && <div data-scope="auth" data-embedded=""><div data-part="divider">or with a card</div></div>}
                {paySlot.value}
                <Nav back="shipping"><Button onClick={() => { declined.value = ''; go('review') }}>Review order</Button></Nav>
              </div>
            </section>
            <section data-part="step" data-step="review" data-state={step.value === 'review' ? 'active' : undefined} aria-labelledby={`${id}-review`}>
              <div data-part="step-body">
                <h2 data-part="step-title" id={`${id}-review`} tabindex="-1">Review and pay</h2>
                {newTotal.value !== undefined && <Alert tone="caution" title={`The total is now ${cost(newTotal.value)}`}>The price changed while you were checking out. Look it over, then pay again.</Alert>}
                <dl data-scope="lines">
                  {edits.value.map(r => (
                    <div key={r.step}>
                      <dt>{r.label}<br /><span>{r.text}</span></dt>
                      <dd><Button emphasis="link" aria-label={`Edit ${r.label.toLowerCase()}`} onClick={() => go(r.step, 'field', true)}>Edit</Button></dd>
                    </div>
                  ))}
                </dl>
                <span class="muted">By paying you agree to the terms of sale. You can cancel within 1 hour.</span>
                <Nav back="payment"><Button size="lg" loading={placing.value} onClick={pay}><Glyph d={GLYPH.lock} />{`Pay ${cost(total.value)}`}</Button></Nav>
              </div>
            </section>
            <section data-part="step" data-step="done" data-state={step.value === 'done' ? 'active' : undefined} aria-labelledby={`${id}-done`}>
              {placed.value && <OrderConfirmation titleId={`${id}-done`} orderId={placed.value.id} email={email.value} stage={placed.value.stage} note={`${option.value?.name ?? ''} delivery. ${option.value?.eta ?? ''}.`} onContinue={onContinueShopping} />}
            </section>
          </div>
        </div>
        <details ref={(n: any) => (summary = n)} data-part="summary">
          <summary><span class="row"><Glyph d={GLYPH.bag} />Order summary</span><span class="row"><b>{cost(total.value)}</b><Icon name="down" /></span></summary>
          {lines.value.map(l => (
            <div key={l.id} data-scope="line-item">
              <span data-part="thumb">{l.art && <img src={l.art} alt="" />}</span>
              <span><b>{l.name}</b><small>Qty {l.quantity}</small></span>
              <span data-part="price">{cost(l.price * l.quantity)}</span>
            </div>
          ))}
          {coupon && (
            <form data-scope="row" data-wrap="none" data-align="start" novalidate onSubmit={apply}>
              <div data-grow=""><Input label="Discount code" value={code.value} error={codeError.value} onInput={e => { code.value = e.currentTarget.value; codeError.value = '' }} /></div>
              <Button emphasis="frame" type="submit" loading={checking.value}>Apply</Button>
            </form>
          )}
          {applied.value && <div class="chips"><Tag label={applied.value.code} onRemove={unapply}>{applied.value.code}</Tag></div>}
          <dl data-scope="lines">
            <div><dt>Subtotal</dt><dd>{cost(totals.value.subtotal)}</dd></div>
            {applied.value && <div><dt>Discount · {applied.value.code}</dt><dd>−{cost(totals.value.discount)}</dd></div>}
            <div><dt>Shipping · {option.value?.name}</dt><dd>{totals.value.shipping ? cost(totals.value.shipping) : 'Free'}</dd></div>
            <div><dt>Estimated tax</dt><dd>{cost(totals.value.tax)}</dd></div>
            <div data-part="total"><dt>Total</dt><dd data-changed={newTotal.value !== undefined ? '' : undefined}>{cost(total.value)}</dd></div>
          </dl>
        </details>
      </div>
    </div>
  )
}
