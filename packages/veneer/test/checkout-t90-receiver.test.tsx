import { fireEvent } from '@testing-library/dom'
import { state } from '@kerf/core'
import { render } from '@kerf/core/test'
import type { CartLine } from '@kerf/veneer-core'
import { Checkout, type CheckoutProps, type PlaceOrderResult } from '../src/admin/Checkout'
import { Toaster } from '../src/Toast'
import { CART, SHIPPING } from './fixtures/pack-admin'
import { byText, field, tick, type } from './admin/support'

const propsForCheckout = (): CheckoutProps => ({
  cart: state<CartLine[]>(CART),
  shipping: SHIPPING,
  countries: ['US', 'GB', 'DE'],
  taxRate: 0.1,
  idempotencyKey: 't90-key',
  payment: null,
  onPlaceOrder: () => Promise.resolve({ order: { id: 'initial' } }),
})

async function review(c: HTMLElement) {
  byText(c, 'Continue to address').click()
  await tick()
  const section = c.querySelector<HTMLElement>('[data-step="address"]')!
  type(field(section, 'Full name'), 'Ines')
  type(field(section, 'Email for receipt'), 'ines@acme.dev')
  type(field(section, 'Street address'), '1 Main')
  type(field(section, 'City'), 'SF')
  type(field(section, 'State'), 'CA')
  type(field(section, 'ZIP code'), '94107')
  await tick()
  fireEvent.submit(section.querySelector('form')!)
  await tick()
  byText(c, 'Continue to payment').click()
  await tick()
  byText(c, 'Review order').click()
  await tick()
}

test('step callbacks keep their receiver and use replacements after setup', async () => {
  const props = propsForCheckout()
  const seen: unknown[] = []
  props.onStepChange = function (step) {
    seen.push(this, step)
  }
  const { container } = render(() => Checkout(props))
  byText(container, 'Continue to address').click()
  await tick()
  expect(seen).toEqual([props, 'address'])
  props.onStepChange = function (step) {
    seen.push(this, step, 'replacement')
  }
  byText(container, 'Back').click()
  await tick()
  expect(seen).toEqual([props, 'address', props, 'cart', 'replacement'])
})

test('order callback keeps the receiver, live replacement, argument and pending result', async () => {
  const props = propsForCheckout()
  const receivers: unknown[] = []
  let order: Parameters<CheckoutProps['onPlaceOrder']>[0] | undefined
  let finish!: (value: PlaceOrderResult) => void
  const { container } = render(() => Checkout(props))
  props.onPlaceOrder = function (value) {
    receivers.push(this)
    order = value
    return new Promise((resolve) => {
      finish = resolve
    })
  }
  await review(container)
  const pay = byText(container, 'Pay $82.50')
  pay.click()
  await tick()
  expect(receivers).toEqual([props])
  expect(order?.lines).toBe(props.cart.value)
  expect(order?.idempotencyKey).toBe('t90-key')
  expect(pay.hasAttribute('data-loading')).toBe(true)
  finish({ order: { id: 'receiver-ok' } })
  await tick()
  expect(container.querySelector('[data-step="done"]')!.textContent).toContain('receiver-ok')
})

test('a rejected order can retry with a replacement callback and the same key', async () => {
  const props = propsForCheckout()
  const seen: unknown[] = []
  props.onPlaceOrder = function (order) {
    seen.push(this, order.idempotencyKey)
    return Promise.reject(new Error('offline'))
  }
  const { container } = render(() => (
    <>
      {Checkout(props)}
      <Toaster />
    </>
  ))
  await review(container)
  byText(container, 'Pay $82.50').click()
  await tick()
  props.onPlaceOrder = function (order) {
    seen.push(this, order.idempotencyKey)
    return Promise.resolve({ order: { id: 'retry-ok' } })
  }
  byText(document.body, 'Retry').click()
  await tick()
  expect(seen).toEqual([props, 't90-key', props, 't90-key'])
  expect(container.querySelector('[data-step="done"]')!.textContent).toContain('retry-ok')
})

test('an absent step callback stays optional', async () => {
  const props = propsForCheckout()
  const { container } = render(() => Checkout(props))
  byText(container, 'Continue to address').click()
  await tick()
  expect(container.querySelector('[data-state="active"]')!.getAttribute('data-step')).toBe(
    'address',
  )
})

test('a synchronous order throw follows the retry path', async () => {
  const props = propsForCheckout()
  props.onPlaceOrder = function () {
    throw new Error('offline')
  }
  const { container } = render(() => (
    <>
      {Checkout(props)}
      <Toaster />
    </>
  ))
  await review(container)
  byText(container, 'Pay $82.50').click()
  await tick()
  expect(byText(document.body, 'Retry')).toBeTruthy()
  expect(container.querySelector('[data-state="active"]')!.getAttribute('data-step')).toBe('review')
})
