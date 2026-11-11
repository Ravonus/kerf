// The rails against the providers' real sandboxes, with PAY_SANDBOX=1 and sandbox credentials (README: Sandbox and test
// mode). It refuses a live key or a production Square environment, pays with the published test instruments
// (`pm_card_visa`, `cnon:card-nonce-ok`), never card data, and refunds through the rail's own `refund`.
import { describe, expect, test } from 'vitest'
import { stripeKeyMode, stripeRail } from '../src/stripe'
import { squareRail, squareSandbox } from '../src/square'
import type { CheckoutRequest } from '@kerf/pay'

const on = process.env.PAY_SANDBOX === '1'
const stripeKey = process.env.STRIPE_SECRET_KEY
const squareToken = process.env.SQUARE_ACCESS_TOKEN
const squareLocation = process.env.SQUARE_LOCATION_ID

if (on && stripeKey && stripeKeyMode(stripeKey) !== 'test')
  throw new Error(
    'sandbox.live: STRIPE_SECRET_KEY is not an sk_test_/rk_test_ key; refusing to run',
  )
if (on && squareToken && !squareSandbox())
  throw new Error(
    'sandbox.live: set SQUARE_ENVIRONMENT=sandbox; refusing to run against production',
  )

const run = `${Date.now()}`
const request = (over: Partial<CheckoutRequest> = {}): CheckoutRequest => ({
  user: 'sandbox-user',
  line: {
    product: 'order',
    plan: `t${run}`,
    name: 'Sandbox pie',
    amount: 1200,
    currency: 'usd',
    mode: 'payment',
    quantity: 1,
  },
  successUrl: 'https://example.com/ok',
  cancelUrl: 'https://example.com/no',
  idempotencyKey: `kerf-sandbox-${run}`,
  ...over,
})

describe.runIf(on && stripeKey)('Stripe test mode', () => {
  const rail = stripeRail({ mode: 'test' })
  const stripe = async (path: string, body: Record<string, string>) => {
    const res = await fetch(`https://api.stripe.com${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${stripeKey}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body),
    })
    const data = (await res.json()) as Record<string, unknown>
    expect(res.ok, JSON.stringify(data)).toBe(true)
    return data
  }

  test('reports sandbox', () => expect(rail.sandbox).toBe(true))

  test('a checkout session opens on checkout.stripe.com', async () => {
    const { url } = await rail.checkout(request())
    expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//)
  })

  test('a test payment refunds through the rail', async () => {
    const pi = await stripe('/v1/payment_intents', {
      amount: '1200',
      currency: 'usd',
      payment_method: 'pm_card_visa',
      confirm: 'true',
      'automatic_payment_methods[enabled]': 'true',
      'automatic_payment_methods[allow_redirects]': 'never',
    })
    expect(pi.status).toBe('succeeded')
    await rail.refund!({ purchase: pi.id as string })
  })
})

/** The two answers this reads: an order made, then a payment on it. */
interface SquareAnswer {
  order: { id: string; total_money: unknown }
  payment: { status: string }
}

describe.runIf(on && squareToken && squareLocation)('Square sandbox', () => {
  const rail = squareRail()
  const square = async (path: string, body: unknown) => {
    const res = await fetch(`https://connect.squareupsandbox.com${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${squareToken}`,
        'content-type': 'application/json',
        'square-version': '2025-10-16',
      },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as SquareAnswer
    expect(res.ok, JSON.stringify(data)).toBe(true)
    return data
  }

  test('reports sandbox', () => expect(rail.sandbox).toBe(true))

  test('a payment link opens on the sandbox checkout', async () => {
    const { url } = await rail.checkout(request())
    expect(url).toMatch(/^https:\/\/[^/]*square[^/]*\//)
  })

  test('an order paid with the sandbox nonce refunds through the rail', async () => {
    const { order } = await square('/v2/orders', {
      idempotency_key: `o-${run}`,
      order: {
        location_id: squareLocation,
        line_items: [
          {
            name: 'Sandbox pie',
            quantity: '1',
            base_price_money: { amount: 1200, currency: 'USD' },
          },
        ],
      },
    })
    const { payment } = await square('/v2/payments', {
      idempotency_key: `p-${run}`,
      source_id: 'cnon:card-nonce-ok',
      order_id: order.id,
      location_id: squareLocation,
      amount_money: order.total_money,
    })
    expect(payment.status).toBe('COMPLETED')
    await rail.refund!({ purchase: order.id })
  })
})
