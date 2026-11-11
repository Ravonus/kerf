import { fireEvent } from '@testing-library/dom'
import { state } from '@kerf/core'
import { render } from '@kerf/core/test'
import type { CartLine } from '@kerf/veneer-core'
import { PayFrame } from '../../src/admin/Billing'
import { Checkout, type OrderDraft, type PlaceOrderResult } from '../../src/admin/Checkout'
import { Toaster } from '../../src/Toast'
import { CART, SHIPPING } from '../fixtures/pack-admin'
import { byText, field, tick, toasts, type } from './support'

function suiteContext() {
  const mount = (place: (o: OrderDraft) => Promise<PlaceOrderResult>, key?: string) => {
    const cart = state<CartLine[]>(CART)
    const steps: string[] = []
    const view = render(() => (
      <>
        <Checkout
          cart={cart}
          shipping={SHIPPING}
          countries={['US', 'GB', 'DE']}
          taxRate={0.1}
          idempotencyKey={key}
          coupon={(c) => (c === 'VENEER10' ? { code: c, percentOff: 10 } : undefined)}
          payment={<PayFrame title="Card" testMode />}
          onPlaceOrder={place}
          onStepChange={(s) => steps.push(s)}
        />
        <Toaster />
      </>
    ))
    return { c: view.container, cart, steps }
  }
  const active = (c: HTMLElement) =>
    c.querySelector<HTMLElement>('[data-state="active"]')!.dataset.step
  const toReview = async (c: HTMLElement) => {
    byText(c, 'Continue to address').click()
    await tick()
    const s = c.querySelector<HTMLElement>('[data-step="address"]')!
    type(field(s, 'Full name'), 'Ines')
    type(field(s, 'Email for receipt'), 'ines@acme.dev')
    type(field(s, 'Street address'), '1 Main')
    type(field(s, 'City'), 'SF')
    type(field(s, 'State'), 'CA')
    type(field(s, 'ZIP code'), '94107')
    await tick()
    fireEvent.submit(s.querySelector('form')!)
    await tick()
    byText(c, 'Continue to payment').click()
    await tick()
    byText(c, 'Review order').click()
    await tick()
  }
  return { mount, active, toReview }
}

function registerTheAddressStepKeepsErrors(ctx: ReturnType<typeof suiteContext>) {
  const { mount, active } = ctx
  test('the address step keeps errors at the source, by country, and focuses the first', async () => {
    const { c } = mount(() => Promise.resolve({ order: { id: 'A' } }))
    byText(c, 'Continue to address').click()
    await tick()
    expect(document.activeElement!.getAttribute('data-part')).toBe('step-title')
    const s = c.querySelector<HTMLElement>('[data-step="address"]')!
    fireEvent.submit(s.querySelector('form')!)
    await tick()
    expect(active(c)).toBe('address')
    expect(document.activeElement).toBe(field(s, 'Full name'))
    expect(s.querySelector('[data-scope="alert"]')!.textContent).toContain('fields need attention')
    type(field(s, 'ZIP code'), '123')
    await tick()
    fireEvent.submit(s.querySelector('form')!)
    await tick()
    expect(s.textContent).toContain('A ZIP code is 5 digits')
  })
  test('a coupon applies as a chip with Undo and moves the total', async () => {
    const { c } = mount(() => Promise.resolve({ order: { id: 'A' } }))
    const sum = c.querySelector<HTMLElement>('[data-part="summary"]')!
    const total = () => sum.querySelector('[data-part="total"] dd')!.textContent
    expect(total()).toBe('$82.50')
    const code = field(sum, 'Discount code')
    type(code, 'nope')
    fireEvent.submit(code.closest('form')!)
    await tick()
    expect(sum.querySelector('[data-part="error"]')!.textContent).toMatch(/isn’t valid/)
    type(code, 'veneer10')
    fireEvent.submit(code.closest('form')!)
    await tick()
    expect(total()).toBe('$74.25')
    byText(sum, 'Remove VENEER10').click()
    await tick()
    expect(total()).toBe('$82.50')
    byText(document.body, 'Undo').click()
    await tick()
    expect(total()).toBe('$74.25')
  })
}

function registerReviewHasEditLinksPay(ctx: ReturnType<typeof suiteContext>) {
  const { mount, active, toReview } = ctx
  test('review has Edit links; pay is single-flight, keyed, and ends on the confirmation', async () => {
    const orders: OrderDraft[] = []
    let finish!: (r: PlaceOrderResult) => void
    const { c, steps } = mount((o) => {
      orders.push(o)
      return new Promise((r) => {
        finish = r
      })
    }, 'key-1')
    await toReview(c)
    byText(c, 'Edit delivery').click()
    await tick()
    expect(active(c)).toBe('shipping')
    expect((document.activeElement as HTMLInputElement).value).toBe('std')
    byText(c, 'Continue to payment').click()
    await tick()
    byText(c, 'Review order').click()
    await tick()
    const pay = byText(c, 'Pay $82.50')
    pay.click()
    pay.click()
    await tick()
    expect(orders.length).toBe(1)
    expect(orders[0]!.idempotencyKey).toBe('key-1')
    expect(orders[0]!.address.postalCode).toBe('94107')
    expect(pay.hasAttribute('data-loading')).toBe(true)
    finish({ order: { id: 'A-2041' } })
    await tick()
    expect(active(c)).toBe('done')
    expect(c.querySelector('[data-step="done"] h2')!.textContent).toBe('Order #A-2041 confirmed')
    expect(c.querySelector('[data-scope="tracker"] [aria-current="step"]')!.textContent).toBe(
      'Placed',
    )
    expect(c.querySelector('nav[data-scope="steps"]')).toBeNull()
    expect(steps.at(-1)).toBe('done')
  })
}

function registerErrorsReturnToWhereThey(ctx: ReturnType<typeof suiteContext>) {
  const { mount, active, toReview } = ctx
  test('errors return to where they can be fixed; a timeout retries with the same key', async () => {
    const answers: (PlaceOrderResult | Error)[] = [
      new Error('timeout'),
      { error: { code: 'CARD_DECLINED', reason: 'The bank said no.' } },
      { error: { code: 'PRICE_CHANGED', total: 90 } },
      { error: { code: 'OUT_OF_STOCK', sku: 'b' } },
    ]
    const keys: string[] = []
    const { c } = mount((o) => {
      keys.push(o.idempotencyKey)
      const a = answers.shift()!
      return a instanceof Error ? Promise.reject(a) : Promise.resolve(a)
    })
    await toReview(c)
    byText(c, 'Pay $82.50').click()
    await tick()
    expect(active(c)).toBe('review')
    expect(toasts()).toContain('We couldn’t reach the store')
    byText(document.body, 'Retry').click()
    await tick()
    expect(keys[1]).toBe(keys[0])
    expect(active(c)).toBe('payment')
    expect(c.querySelector('[data-step="payment"] [role="alert"]')!.textContent).toContain(
      'The bank said no.',
    )
    byText(c, 'Review order').click()
    await tick()
    byText(c, 'Pay $82.50').click()
    await tick()
    expect(keys[2]).not.toBe(keys[1])
    expect(active(c)).toBe('review')
    expect(c.querySelector('[data-step="review"]')!.textContent).toContain('The total is now $90')
    byText(c, 'Pay $90').click()
    await tick()
    expect(active(c)).toBe('cart')
    expect(c.querySelector('[data-id="b"]')!.textContent).toContain('Out of stock')
    expect((byText(c, 'Continue to address') as HTMLButtonElement).disabled).toBe(true)
  })
}

export function registerCheckout() {
  describe('Checkout', () => {
    const ctx = suiteContext()
    registerTheAddressStepKeepsErrors(ctx)
    registerReviewHasEditLinksPay(ctx)
    registerErrorsReturnToWhereThey(ctx)
  })
}
