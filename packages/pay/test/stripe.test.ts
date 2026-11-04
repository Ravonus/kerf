// The rail against mocked Stripe HTTP: `fetch` here refuses anything it wasn't told to expect, so these tests can't reach
// a network, and every signature is real HMAC over a placeholder secret.
import { createHmac } from 'node:crypto'
import { payRailSuite } from '@weft-js/pay/test'
import { definePay, memoryPayStore } from '@weft-js/pay/server'
import { product } from '@weft-js/pay'
import { stripeRail } from '../src/stripe'

const SECRET = 'whsec_placeholder_for_tests'
const KEY = 'sk_test_mocked'

interface Call {
  url: string
  headers: Record<string, string>
  body: URLSearchParams
}

function mock(
  answer: (url: string) => { status?: number; body: unknown } = () => ({
    body: { url: 'https://checkout.mock/s/1' },
  }),
) {
  const calls: Call[] = []
  const fetcher = ((url: string, init: RequestInit) => {
    if (!url.startsWith('https://api.stripe.com/'))
      return Promise.reject(new Error(`unexpected request to ${url}`))
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: init.body as URLSearchParams,
    })
    const { status = 200, body } = answer(url)
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }) as unknown as typeof fetch
  return { calls, fetcher }
}

const signed = (event: unknown, { secret = SECRET, age = 0 } = {}) => {
  const body = JSON.stringify(event)
  const t = Math.floor((Date.now() - age) / 1000)
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
  return { body, headers: new Headers({ 'stripe-signature': `t=${t},v1=${v1}` }) }
}

const now = () => Math.floor(Date.now() / 1000)
const sub = (status: string, over: object = {}) => ({
  id: `evt_${status}`,
  type: 'customer.subscription.updated',
  created: now(),
  data: {
    object: {
      id: 'sub_1',
      status,
      customer: 'cus_1',
      current_period_end: now() + 2_592_000,
      metadata: { weft_user: 'u1', weft_product: 'pro', weft_plan: 'month' },
      ...over,
    },
  },
})

const rail = (extra = {}) =>
  stripeRail({ secretKey: KEY, webhookSecret: SECRET, fetch: mock().fetcher, ...extra })

const pro = product({
  id: 'pro',
  kind: 'subscription',
  use: 'digital',
  name: 'Pro',
  plans: { month: { usd: 999 }, year: { usd: 7999, trialDays: 7 } },
  grants: ['pro'],
})
const tee = product({
  id: 'tee',
  kind: 'one-time',
  use: 'physical',
  price: { usd: 2500 },
  shipping: true,
  grants: ['tee'],
})

describe('pay.rail@1', () => {
  test('stripeRail passes the conformance suite', async () => {
    const checks = await payRailSuite({
      rail: rail(),
      delivery: (age) => signed(sub('active'), { age }),
      tolerance: 300_000,
    })
    expect(checks.filter((c) => !c.ok)).toEqual([])
  })
})

describe('checkout', () => {
  const line = {
    product: 'pro',
    name: 'Pro',
    amount: 999,
    currency: 'usd',
    mode: 'subscription',
    plan: 'month',
    interval: 'month',
    quantity: 1,
  } as const
  const request = {
    user: 'u1',
    line,
    successUrl: 'https://app.test/ok',
    cancelUrl: 'https://app.test/no',
    idempotencyKey: 'key-1',
  }

  test('form-encodes the session, with the key, the version and the user on what later events carry', async () => {
    const { calls, fetcher } = mock()
    const { url } = await rail({ fetch: fetcher }).checkout({
      ...request,
      line: { ...line, trialDays: 7 },
    })
    expect(url).toBe('https://checkout.mock/s/1')
    const { url: to, headers, body } = calls[0]!
    expect(to).toBe('https://api.stripe.com/v1/checkout/sessions')
    expect(headers).toMatchObject({
      authorization: `Bearer ${KEY}`,
      'idempotency-key': 'key-1',
      'content-type': 'application/x-www-form-urlencoded',
    })
    expect(headers['stripe-version']).toMatch(/^\d{4}-/)
    expect(Object.fromEntries(body)).toMatchObject({
      mode: 'subscription',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][unit_amount]': '999',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][recurring][interval]': 'month',
      'metadata[weft_user]': 'u1',
      'subscription_data[metadata][weft_user]': 'u1',
      'subscription_data[metadata][weft_product]': 'pro',
      'subscription_data[trial_period_days]': '7',
      client_reference_id: 'u1',
    })
  })

  test('a mapped price replaces the catalog amount', async () => {
    const { calls, fetcher } = mock()
    await rail({ fetch: fetcher, prices: { 'pro.month': 'price_mapped' } }).checkout(request)
    const sent = Object.fromEntries(calls[0]!.body)
    expect(sent['line_items[0][price]']).toBe('price_mapped')
    expect(sent['line_items[0][price_data][unit_amount]']).toBeUndefined()
  })

  test('a payment puts the metadata on the payment, which its charge inherits', async () => {
    const { calls, fetcher } = mock()
    await rail({ fetch: fetcher }).checkout({
      ...request,
      line: {
        product: 'tee',
        name: 'tee',
        amount: 2500,
        currency: 'usd',
        mode: 'payment',
        quantity: 2,
        shipping: true,
      },
    })
    expect(Object.fromEntries(calls[0]!.body)).toMatchObject({
      mode: 'payment',
      'line_items[0][quantity]': '2',
      'payment_intent_data[metadata][weft_product]': 'tee',
      'shipping_address_collection[allowed_countries][0]': 'US',
    })
  })

  test('Stripe saying no is a typed failure, without the key in it', async () => {
    const { fetcher } = mock(() => ({
      status: 402,
      body: { error: { message: 'Your card was declined' } },
    }))
    const failed = await rail({ fetch: fetcher })
      .checkout(request)
      .catch((e) => e)
    expect(failed).toMatchObject({ code: 'PAY030', status: 502 })
    expect(failed.message).toContain('declined')
    expect(failed.message).not.toContain(KEY)
  })

  test('no secret key stops before any request', async () => {
    const { calls, fetcher } = mock()
    const old = process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_SECRET_KEY
    await expect(stripeRail({ fetch: fetcher }).checkout(request)).rejects.toMatchObject({
      code: 'PAY003',
    })
    process.env.STRIPE_SECRET_KEY = old
    expect(calls).toEqual([])
  })

  test('a placeholder key never leaves for the real API, and a mock may take one', async () => {
    const { calls, fetcher } = mock()
    const placeholder = { secretKey: 'sk_test_placeholder' }
    await expect(rail({ fetch: fetcher, ...placeholder }).checkout(request)).rejects.toMatchObject({
      code: 'PAY003',
    })
    expect(calls).toEqual([])
    const local = vi.fn(() =>
      Promise.resolve(new Response('{"url":"http://127.0.0.1:1/s"}')),
    ) as unknown as typeof fetch
    await rail({ fetch: local, api: 'http://127.0.0.1:1', ...placeholder }).checkout(request)
    expect(local).toHaveBeenCalledOnce()
  })

  test('the portal and a refund post to their own endpoints', async () => {
    const { calls, fetcher } = mock(() => ({ body: { url: 'https://billing.mock/p/1' } }))
    const r = rail({ fetch: fetcher })
    expect((await r.portal({ customer: 'cus_1', returnUrl: 'https://app.test/a' })).url).toBe(
      'https://billing.mock/p/1',
    )
    await r.refund!({ purchase: 'pi_1' })
    expect(calls.map((c) => c.url.replace('https://api.stripe.com', ''))).toEqual([
      '/v1/billing_portal/sessions',
      '/v1/refunds',
    ])
    expect(calls[1]!.body.get('payment_intent')).toBe('pi_1')
    expect(calls[1]!.headers['idempotency-key']).toBe('refund:pi_1')
    await expect(r.refund!({ purchase: 'sub_1' })).rejects.toMatchObject({ code: 'PAY022' })
  })
})

describe('verify', () => {
  const refused = (d: { body: string; headers: Headers }, r = rail()) =>
    expect(r.verify(d)).rejects.toMatchObject({ code: 'PAY011' })

  test('reads a subscription', async () => {
    const [e] = await rail().verify(signed(sub('trialing')))
    expect(e).toMatchObject({
      id: 'evt_trialing',
      purchase: 'sub_1',
      state: 'trial',
      user: 'u1',
      product: 'pro',
      plan: 'month',
      customer: 'cus_1',
    })
    expect(e!.expires).toBeGreaterThan(Date.now())
  })

  test.each([
    ['active', 'active'],
    ['past_due', 'grace'],
    ['unpaid', 'billing-retry'],
    ['paused', 'paused'],
    ['canceled', 'expired'],
    ['incomplete', 'pending'],
    ['incomplete_expired', 'expired'],
  ])('maps %s to %s', async (status, state) => {
    expect((await rail().verify(signed(sub(status))))[0]!.state).toBe(state)
  })

  test('finds the period on the item, where later API versions keep it', async () => {
    const end = now() + 100
    const [e] = await rail().verify(
      signed(
        sub('active', {
          current_period_end: undefined,
          items: { data: [{ current_period_end: end }] },
        }),
      ),
    )
    expect(e!.expires).toBe(end * 1000)
  })

  test('a wrong secret, a changed byte, an old time and no header are all refused', async () => {
    await refused(signed(sub('active'), { secret: 'whsec_another' }))
    const good = signed(sub('active'))
    await refused({ body: good.body.replace('active', 'trialing'), headers: good.headers })
    await refused(signed(sub('active'), { age: 301_000 }))
    await refused({ body: good.body, headers: new Headers() })
  })

  test('with no webhook secret, every delivery is refused', async () => {
    const old = process.env.STRIPE_WEBHOOK_SECRET
    delete process.env.STRIPE_WEBHOOK_SECRET
    await refused(signed(sub('active')), stripeRail({ secretKey: KEY, fetch: mock().fetcher }))
    process.env.STRIPE_WEBHOOK_SECRET = old
  })

  test('accepts any `v1` while a secret rolls', async () => {
    const d = signed(sub('active'))
    d.headers.set(
      'stripe-signature',
      d.headers.get('stripe-signature')!.replace('v1=', 'v1=00,v1='),
    )
    expect(await rail().verify(d)).toHaveLength(1)
  })

  test('a subscription checkout defers to the subscription events, so a trial stays a trial', async () => {
    expect(
      await rail().verify(
        signed({
          id: 'evt_s',
          type: 'checkout.session.completed',
          created: now(),
          data: {
            object: {
              mode: 'subscription',
              subscription: 'sub_1',
              customer: 'cus_1',
              metadata: {},
            },
          },
        }),
      ),
    ).toEqual([])
  })

  const session = (over: object, type = 'checkout.session.completed') => ({
    id: 'evt_p',
    type,
    created: now(),
    data: {
      object: {
        mode: 'payment',
        payment_intent: 'pi_1',
        payment_status: 'paid',
        customer: 'cus_1',
        metadata: { weft_user: 'u1', weft_product: 'tee' },
        ...over,
      },
    },
  })

  test('a paid payment is active; a bank transfer is pending until it clears', async () => {
    expect((await rail().verify(signed(session({}))))[0]).toMatchObject({
      purchase: 'pi_1',
      state: 'active',
      user: 'u1',
      product: 'tee',
    })
    expect((await rail().verify(signed(session({ payment_status: 'unpaid' }))))[0]!.state).toBe(
      'pending',
    )
    expect(
      (await rail().verify(signed(session({}, 'checkout.session.async_payment_failed'))))[0]!.state,
    ).toBe('expired')
  })

  test('only a whole refund is a refund', async () => {
    const charge = (refunded: boolean) => ({
      id: 'evt_r',
      type: 'charge.refunded',
      created: now(),
      data: { object: { payment_intent: 'pi_1', refunded, metadata: {} } },
    })
    expect(await rail().verify(signed(charge(false)))).toEqual([])
    expect((await rail().verify(signed(charge(true))))[0]).toMatchObject({
      purchase: 'pi_1',
      state: 'refunded',
    })
  })

  test('a dispute revokes, and winning it restores', async () => {
    const dispute = (type: string, status: string) => ({
      id: type,
      type,
      created: now(),
      data: { object: { payment_intent: 'pi_1', status } },
    })
    expect(
      (await rail().verify(signed(dispute('charge.dispute.created', 'needs_response'))))[0]!.state,
    ).toBe('revoked')
    expect((await rail().verify(signed(dispute('charge.dispute.closed', 'won'))))[0]!.state).toBe(
      'active',
    )
    expect(await rail().verify(signed(dispute('charge.dispute.closed', 'lost')))).toEqual([])
  })

  test('an event that says nothing about access is ignored', async () => {
    expect(
      await rail().verify(
        signed({ id: 'evt_x', type: 'invoice.created', created: now(), data: { object: {} } }),
      ),
    ).toEqual([])
  })
})

describe('through the ledger', () => {
  const app = (over = {}) => {
    const store = memoryPayStore()
    const pay = definePay({
      catalog: [pro, tee],
      store,
      urls: { success: '/ok', cancel: '/no' },
      ...over,
    })
    pay.use(rail())
    return pay
  }
  const post = (d: { body: string; headers: Headers }) =>
    new Request('http://localhost/_weft/pay/stripe', {
      method: 'POST',
      body: d.body,
      headers: d.headers,
    })

  test('a signed subscription grants, a canceled one takes away, and a forged one changes nothing', async () => {
    const pay = app()
    const first = await pay.webhook('stripe', post(signed(sub('active'))))
    expect(first.response.status).toBe(200)
    expect(first.tags).toEqual(['entitlements:u1'])
    expect(await pay.entitlements('u1').has('pro')).toBe(true)

    const forged = await pay.webhook(
      'stripe',
      post(signed({ ...sub('canceled'), id: 'evt_forged' }, { secret: 'whsec_wrong' })),
    )
    expect(forged.response.status).toBe(400)
    expect(await pay.entitlements('u1').has('pro')).toBe(true)

    const later = { ...sub('canceled'), created: now() + 5 }
    await pay.webhook('stripe', post(signed(later)))
    expect(await pay.entitlements('u1').has('pro')).toBe(false)
  })
})
