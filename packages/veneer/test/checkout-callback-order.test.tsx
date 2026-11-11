import { state } from '@kerf-js/core'
import { render } from '@kerf-js/core/test'
import type { CartLine } from '@kerf-js/veneer-core'
import { Checkout, type CheckoutProps, type PlaceOrderResult } from '../src/admin/Checkout'
import type { checkoutModel } from '../src/admin/Checkout-model'
import { CART, SHIPPING } from './fixtures/pack-admin'

type Model = ReturnType<typeof checkoutModel>
const captured = vi.hoisted(() => ({ current: undefined as Model | undefined }))

vi.mock('../src/admin/Checkout-view', () => ({
  checkoutView(model: Model) {
    captured.current = model
    return document.createElement('div')
  },
}))

test.each([false, true])(
  'order lookup precedes field reads when a field throws: %s',
  async (throws) => {
    const trace: string[] = []
    const props: CheckoutProps = {
      cart: state<CartLine[]>(CART),
      shipping: SHIPPING,
      payment: null,
      onPlaceOrder: () => Promise.resolve({ order: { id: 'initial' } }),
    }
    render(() => Checkout(props))
    const model = captured.current!
    model.s.newTotal.value = 82.5
    let finish!: (value: PlaceOrderResult) => void
    let callback = function (this: unknown) {
      expect(this).toBe(props)
      trace.push('original')
      return new Promise<PlaceOrderResult>((resolve) => {
        finish = resolve
      })
    }
    Object.defineProperty(props, 'onPlaceOrder', {
      get() {
        trace.push('lookup')
        return callback
      },
    })
    Object.defineProperty(model.s.lines, 'value', {
      get() {
        trace.push('lines')
        callback = function (this: unknown) {
          expect(this).toBe(props)
          trace.push('replacement')
          return Promise.resolve({ order: { id: 'replacement' } })
        }
        if (throws) throw new Error('order field')
        return CART
      },
    })
    const pending = model.pay()
    if (throws) {
      await pending
      expect(trace).toEqual(['lookup', 'lines'])
    } else {
      expect(trace).toEqual(['lookup', 'lines', 'original'])
      expect(model.s.placing.value).toBe(true)
      finish({ order: { id: 'original' } })
      await pending
      expect(model.s.placed.value?.id).toBe('original')
    }
    expect(model.s.placing.value).toBe(false)
  },
)
