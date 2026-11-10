// The Square rail against mocked Square HTTP: `fetch` refuses anything it wasn't told to expect, so nothing reaches a
// network, and every signature is real HMAC over a placeholder key and URL.
import { createHmac } from 'node:crypto'
import { expect, test } from 'vitest'
import { payRailSuite } from '@weft-js/pay/test'
import { definePay, memoryPayStore } from '@weft-js/pay/server'
import { product, type PurchaseState } from '@weft-js/pay'
import { squareRail } from '../src/square'

const KEY = 'sq_sig_placeholder_for_tests'
const HOOK = 'https://shop.test/_weft/x/pay/square'

interface Call {
  url: string
  method: string
  body: Record<string, unknown> | undefined
}

function mock(
  orderMeta: Record<string, string> = {
    weft_user: 'guest:r1',
    weft_product: 'order',
    weft_plan: 'r1',
  },
) {
  const calls: Call[] = []
  const fetcher = ((url: string, init: RequestInit) => {
    if (!url.startsWith('https://connect.squareup'))
      return Promise.reject(new Error(`unexpected request to ${url}`))
    const body = init.body ? JSON.parse(init.body as string) : undefined
    calls.push({ url, method: String(init.method), body })
    const answer = url.includes('/payment-links')
      ? { payment_link: { url: 'https://square.link/u/abc', order_id: 'ord_1' } }
      : url.includes('/v2/orders/')
        ? {
            order: {
              metadata: orderMeta,
              tenders: [{ payment_id: 'pay_1' }],
              total_money: { amount: 1085, currency: 'USD' },
            },
          }
        : {}
    return Promise.resolve(new Response(JSON.stringify(answer)))
  }) as unknown as typeof fetch
  return { calls, fetcher }
}

const rail = (fetcher: typeof fetch, over = {}) =>
  squareRail({
    accessToken: 'EAAA_test',
    locationId: 'L1',
    signatureKey: KEY,
    notificationUrl: HOOK,
    fetch: fetcher,
    ...over,
  })

const payment = (status: string, over: object = {}, id = `evt_${status}`) => ({
  event_id: id,
  type: 'payment.updated',
  created_at: new Date().toISOString(),
  data: {
    type: 'payment',
    id: 'pay_1',
    object: {
      payment: {
        id: 'pay_1',
        order_id: 'ord_1',
        status,
        updated_at: new Date().toISOString(),
        total_money: { amount: 1085, currency: 'USD' },
        ...over,
      },
    },
  },
})

const signed = (event: unknown, key = KEY, url = HOOK) => {
  const body = JSON.stringify(event)
  const sig = createHmac('sha256', key)
    .update(url + body)
    .digest('base64')
  return { body, headers: new Headers({ 'x-square-hmacsha256-signature': sig }) }
}

test('passes the rail suite as a payments-only rail', async () => {
  const { fetcher } = mock()
  const checks = await payRailSuite({
    rail: rail(fetcher),
    delivery: () => signed(payment('COMPLETED')),
  })
  expect(checks.filter((c) => !c.ok)).toEqual([])
})

test('an order becomes one payment link, with its lines, metadata and the buyer email', async () => {
  const { calls, fetcher } = mock()
  const { url } = await rail(fetcher).checkout({
    user: 'guest:r1',
    line: {
      product: 'order',
      plan: 'r1',
      name: 'Order r1',
      amount: 1085,
      currency: 'usd',
      mode: 'payment',
      quantity: 1,
    },
    lines: [
      {
        product: 'order',
        plan: 'r1',
        name: 'Latte',
        amount: 500,
        currency: 'usd',
        mode: 'payment',
        quantity: 2,
      },
      {
        product: 'order',
        plan: 'r1',
        name: 'Oat milk',
        amount: 85,
        currency: 'usd',
        mode: 'payment',
        quantity: 1,
      },
    ],
    email: 'sam@example.com',
    successUrl: 'https://shop.test/order/r1',
    cancelUrl: 'https://shop.test/cart',
    idempotencyKey: 'k'.repeat(64),
  })
  expect(url).toBe('https://square.link/u/abc')
  const sent = calls[0]!.body as Record<string, { length?: number }>
  expect(calls[0]!.url).toBe('https://connect.squareup.com/v2/online-checkout/payment-links')
  expect(sent.idempotency_key).toHaveLength(45)
  expect(sent.order).toMatchObject({
    location_id: 'L1',
    reference_id: 'r1',
    line_items: [
      { name: 'Latte', quantity: '2', base_price_money: { amount: 500, currency: 'USD' } },
      { name: 'Oat milk', quantity: '1', base_price_money: { amount: 85, currency: 'USD' } },
    ],
    metadata: { weft_user: 'guest:r1', weft_product: 'order', weft_plan: 'r1' },
  })
  expect(sent.checkout_options).toEqual({ redirect_url: 'https://shop.test/order/r1' })
  expect(sent.pre_populated_data).toEqual({ buyer_email: 'sam@example.com' })
})

test('sandbox talks to the sandbox host', async () => {
  const { calls, fetcher } = mock()
  await rail(fetcher, { environment: 'sandbox' }).checkout({
    user: 'u',
    line: {
      product: 'pie',
      name: 'Pie',
      amount: 2400,
      currency: 'usd',
      mode: 'payment',
      quantity: 1,
    },
    successUrl: 'https://s.test/',
    cancelUrl: 'https://s.test/',
    idempotencyKey: 'k',
  })
  expect(calls[0]!.url).toMatch(/^https:\/\/connect\.squareupsandbox\.com\//)
})

test('a subscription and the portal are refused, not faked', async () => {
  const { fetcher } = mock()
  const r = rail(fetcher)
  await expect(
    r.checkout({
      user: 'u',
      line: {
        product: 'pro',
        plan: 'month',
        interval: 'month',
        name: 'Pro',
        amount: 999,
        currency: 'usd',
        mode: 'subscription',
        quantity: 1,
      },
      successUrl: 'https://s.test/',
      cancelUrl: 'https://s.test/',
      idempotencyKey: 'k',
    }),
  ).rejects.toMatchObject({ code: 'PAY022' })
  await expect(r.portal({ customer: 'c', returnUrl: 'https://s.test/' })).rejects.toMatchObject({
    code: 'PAY022',
  })
})

test.each<[string, object, PurchaseState]>([
  ['COMPLETED', {}, 'active'],
  ['APPROVED', {}, 'pending'],
  ['FAILED', {}, 'expired'],
  ['COMPLETED', { refunded_money: { amount: 1085, currency: 'USD' } }, 'refunded'],
  ['COMPLETED', { refunded_money: { amount: 100, currency: 'USD' } }, 'active'],
])('a %s payment %j is %s, with who and what read from its order', async (status, over, state) => {
  const { calls, fetcher } = mock()
  const [e] = await rail(fetcher).verify(signed(payment(status, over)))
  expect(e).toMatchObject({
    purchase: 'ord_1',
    state,
    user: 'guest:r1',
    product: 'order',
    plan: 'r1',
  })
  expect(calls.map((c) => c.method + ' ' + c.url)).toEqual([
    'GET https://connect.squareup.com/v2/orders/ord_1',
  ])
})

test('a wrong key, URL or byte is refused before Square is asked anything', async () => {
  const { calls, fetcher } = mock()
  const r = rail(fetcher)
  const good = signed(payment('COMPLETED'))
  for (const bad of [
    signed(payment('COMPLETED'), 'other-key'),
    signed(payment('COMPLETED'), KEY, 'https://evil.test/hook'),
    { body: `${good.body} `, headers: good.headers },
    { body: good.body, headers: new Headers() },
  ])
    await expect(r.verify(bad)).rejects.toMatchObject({ code: 'PAY011' })
  expect(calls).toEqual([])
  await expect(squareRail({ fetch: fetcher }).verify(good)).rejects.toMatchObject({
    code: 'PAY011',
  })
})

test('through the ledger: paid, a repeat is quiet, and a whole refund is heard', async () => {
  const { fetcher } = mock()
  const heard: PurchaseState[] = []
  const pay = definePay({
    catalog: [product({ id: 'pie', kind: 'one-time', use: 'physical', price: { usd: 2400 } })],
    store: memoryPayStore(),
    urls: { success: '/', cancel: '/' },
    onOrder: ({ state }) => void heard.push(state),
  })
  pay.use(rail(fetcher))
  const post = (event: unknown) => {
    const { body, headers } = signed(event)
    return pay.webhook('square', new Request(HOOK, { method: 'POST', body, headers }))
  }
  expect((await post(payment('COMPLETED'))).tags).toEqual(['orders', 'order:r1'])
  await post(payment('COMPLETED'))
  const later = new Date(Date.now() + 60_000).toISOString()
  await post(
    payment(
      'COMPLETED',
      { updated_at: later, refunded_money: { amount: 1085, currency: 'USD' } },
      'evt_refund',
    ),
  )
  expect(heard).toEqual(['active', 'refunded'])
})

test('a refund from the server refunds the order’s payment in full', async () => {
  const { calls, fetcher } = mock()
  await rail(fetcher).refund!({ purchase: 'ord_1' })
  expect(calls.at(-1)).toMatchObject({
    url: 'https://connect.squareup.com/v2/refunds',
    body: { payment_id: 'pay_1', amount_money: { amount: 1085, currency: 'USD' } },
  })
})
