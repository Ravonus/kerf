// `pay.order`: one payment for lines the app priced on the server, by a guest or a signed-in buyer. It grants nothing;
// `onOrder` hears each verified state, and the event pokes `orders` and `order:<ref>`.
import { expect, test } from 'vitest'
import { orderTag, product, PayError, type PurchaseState } from '@weft-js/pay'
import { definePay, memoryPayStore } from '@weft-js/pay/server'
import { fakePay } from '@weft-js/pay/test'
import { stripeRail } from '@weft-js/pay/stripe'

const pro = product({
  id: 'pro',
  kind: 'one-time',
  use: 'digital',
  price: { usd: 500 },
  grants: ['pro'],
})
const ctx = { request: { url: 'https://shop.test/cart' } }

function shop() {
  const heard: { ref: string; state: PurchaseState }[] = []
  const pay = definePay({
    catalog: [pro],
    store: memoryPayStore(),
    urls: { success: '/', cancel: '/', order: '/order/{ref}', orderCancel: '/cart' },
    onOrder: ({ ref, state }) => void heard.push({ ref, state }),
  })
  return { pay, heard, fake: fakePay(pay) }
}

test('a guest pays for priced lines; the event, not the click, marks it paid', async () => {
  const { pay, heard, fake } = shop()
  const url = await pay.order(ctx, {
    ref: 'mh-41',
    email: 'sam@example.com',
    lines: [
      { name: 'Latte 16oz', amount: 500, quantity: 2 },
      { name: 'Oat milk', amount: 85 },
    ],
  })
  expect(url).toMatch(/^https:\/\/fake-pay\.test\//)
  expect(heard).toEqual([])
  const s = fake.sessions.at(-1)!
  expect(s.user).toBe('guest:mh-41')
  expect(s.email).toBe('sam@example.com')
  expect(s.successUrl).toBe('https://shop.test/order/mh-41')
  expect(s.cancelUrl).toBe('https://shop.test/cart')
  expect(s.line).toMatchObject({ product: 'order', plan: 'mh-41', amount: 1085, quantity: 1 })
  expect(s.lines!.map((l) => [l.name, l.amount, l.quantity])).toEqual([
    ['Latte 16oz', 500, 2],
    ['Oat milk', 85, 1],
  ])
  await fake.complete()
  expect(heard).toEqual([{ ref: 'mh-41', state: 'active' }])
  expect(await fake.entitlements('guest:mh-41')).toEqual([])
})

test('a repeat is quiet, a refund is heard, and both poke the order', async () => {
  const { pay, heard, fake } = shop()
  await pay.order(ctx, { ref: 'r1', lines: [{ name: 'Pie', amount: 2400 }] })
  await fake.complete()
  expect(await fake.redeliver()).toBe(200)
  expect(heard).toHaveLength(1)
  await fake.simulate('refund')
  expect(heard.at(-1)).toEqual({ ref: 'r1', state: 'refunded' })
  const tags = await pay.ingest('fake', [
    {
      id: 'evt-x',
      at: Date.now() + 5000,
      purchase: 'p-new',
      state: 'active',
      product: 'order',
      plan: 'r2',
    },
  ])
  expect(tags).toEqual(['orders', orderTag('r2')])
})

test('a throw in onOrder answers 500, so the rail delivers again', async () => {
  let fail = true
  const pay = definePay({
    catalog: [pro],
    store: memoryPayStore(),
    urls: { success: '/', cancel: '/' },
    onOrder: () => {
      if (fail) throw new Error('db down')
    },
  })
  const fake = fakePay(pay)
  await pay.order(ctx, { ref: 'x', lines: [{ name: 'Mocha', amount: 550 }] })
  await fake.complete()
  expect(fake.deliveries.at(-1)!.status).toBe(500)
  fail = false
  expect(await fake.redeliver()).toBe(200)
})

test.each([
  [{ ref: 'bad ref!', lines: [{ name: 'a', amount: 1 }] }, 'PAY021'],
  [{ ref: 'a', lines: [] }, 'PAY021'],
  [{ ref: 'a', lines: [{ name: 'a', amount: 1.5 }] }, 'PAY008'],
  [{ ref: 'a', lines: [{ name: 'a', amount: 0 }] }, 'PAY021'],
  [{ ref: 'a', lines: [{ name: 'a', amount: 100, quantity: 0 }] }, 'PAY021'],
  [{ ref: 'a', currency: 'USD', lines: [{ name: 'a', amount: 100 }] }, 'PAY008'],
])('refuses %j', async (input, code) => {
  const { pay } = shop()
  await expect(pay.order(ctx, input)).rejects.toMatchObject({ code })
})

test('a catalog product may not take the id orders use', () => {
  const order = product({ id: 'order', kind: 'one-time', use: 'digital', price: { usd: 1 } })
  expect(() =>
    definePay({ catalog: [order], store: memoryPayStore(), urls: { success: '/', cancel: '/' } }),
  ).toThrow(PayError)
})

test('Stripe charges each line and mails the guest a receipt', async () => {
  const calls: URLSearchParams[] = []
  const rail = stripeRail({
    secretKey: 'sk_test_x',
    fetch: async (_url, init) => {
      calls.push(new URLSearchParams(String(init!.body)))
      return new Response(JSON.stringify({ url: 'https://checkout.mock/s/1' }))
    },
  })
  const pay = definePay({
    catalog: [pro],
    store: memoryPayStore(),
    urls: { success: '/', cancel: '/' },
  })
  pay.use(rail)
  await pay.order(ctx, {
    ref: 'm1',
    email: 'sam@example.com',
    lines: [
      { name: 'Latte', amount: 500, quantity: 2 },
      { name: 'Scone', amount: 375 },
    ],
  })
  expect(Object.fromEntries(calls[0]!)).toMatchObject({
    mode: 'payment',
    'line_items[0][price_data][unit_amount]': '500',
    'line_items[0][quantity]': '2',
    'line_items[1][price_data][product_data][name]': 'Scone',
    customer_email: 'sam@example.com',
    'payment_intent_data[metadata][weft_product]': 'order',
    'payment_intent_data[metadata][weft_plan]': 'm1',
  })
})
