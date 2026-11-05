import { fireEvent } from '@testing-library/dom'
import { state } from '@weft-js/core'
import { render } from '@weft-js/core/test'
import type { CartLine } from '@weft-js/warp-core'
import { Checkout, type CheckoutProps, type Coupon } from '../src/admin/Checkout'
import { CART, SHIPPING } from './fixtures/pack-admin'
import { field, tick, type } from './admin/support'

function checkoutProps(): CheckoutProps {
  return {
    cart: state<CartLine[]>(CART),
    shipping: SHIPPING,
    payment: null,
    onPlaceOrder: () => Promise.resolve({ order: { id: 'ok' } }),
  }
}

function discountForm(container: HTMLElement) {
  const input = field(container, 'Discount code')
  return { input, form: input.closest('form')! }
}

test('coupon uses the original props and captures a getter result once', async () => {
  const props = checkoutProps()
  const calls: unknown[] = []
  props.coupon = () => undefined
  const { container } = render(() => Checkout(props))
  const { input, form } = discountForm(container)
  type(input, '  warp10  ')
  await tick()
  const first = function (this: CheckoutProps, code: string): Coupon {
    calls.push('first', this, code)
    return { code, percentOff: 10 }
  }
  const second = function (this: CheckoutProps, code: string): Coupon {
    calls.push('second', this, code)
    return { code, percentOff: 20 }
  }
  let reads = 0
  Object.defineProperty(props, 'coupon', {
    configurable: true,
    get() {
      reads++
      Object.defineProperty(props, 'coupon', { configurable: true, writable: true, value: second })
      return first
    },
  })
  fireEvent.submit(form)
  await tick()
  expect(reads).toBe(1)
  expect(calls).toEqual(['first', props, 'WARP10'])
  expect(container.textContent).toContain('WARP10')
  type(input, 'again')
  await tick()
  fireEvent.submit(form)
  await tick()
  expect(calls).toEqual(['first', props, 'WARP10', 'second', props, 'AGAIN'])
})

test('an absent coupon hides the form and suppresses a removed callback', async () => {
  const props = checkoutProps()
  const empty = render(() => Checkout(props))
  expect(empty.container.textContent).not.toContain('Discount code')
  const calls: string[] = []
  props.coupon = (code) => {
    calls.push(code)
    return undefined
  }
  const view = render(() => Checkout(props))
  const { input, form } = discountForm(view.container)
  type(input, 'missing')
  await tick()
  delete props.coupon
  fireEvent.submit(form)
  await tick()
  expect(calls).toEqual([])
  expect(view.container.textContent).toContain('That code isn’t valid or has expired.')
})

test('a coupon promise keeps its receiver and applies its eventual result', async () => {
  const props = checkoutProps()
  const receivers: unknown[] = []
  let finish!: (coupon: Coupon) => void
  props.coupon = function (code) {
    receivers.push(this, code)
    return new Promise((resolve) => {
      finish = resolve
    })
  }
  const { container } = render(() => Checkout(props))
  const { input, form } = discountForm(container)
  type(input, 'wait')
  await tick()
  fireEvent.submit(form)
  await tick()
  expect(receivers).toEqual([props, 'WAIT'])
  expect(form.querySelector('button')!.hasAttribute('data-loading')).toBe(true)
  finish({ code: 'WAIT', percentOff: 15 })
  await tick()
  expect(container.textContent).toContain('WAIT')
})
