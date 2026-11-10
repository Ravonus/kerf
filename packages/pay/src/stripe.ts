// Stripe's signature is HMAC-SHA256 of `<t>.<raw body>`, in a header `t=…,v1=…` that can carry several `v1` while a secret
// rolls. Stripe has no ordering guarantee, so each event carries the object's `created` or the event's own time, and the
// ledger orders by that. A price is the catalog's unless `prices` maps `pro.month` to a Stripe id, on the server.

import {
  PayError,
  type CheckoutLine,
  type PayRail,
  type PurchaseState,
  type RailEvent,
} from './index'

/** Options of `stripeRail()`. The keys default to the environment, which is where they belong. */
export interface StripeOptions {
  /** Stripe Price ids by `<product>.<plan>` or `<product>`, from your own config. Default: amounts from the catalog. */
  prices?: Record<string, string>
  /** The API's origin: point it at a local mock. */
  api?: string
  /** Pinned, so an account's default version can't reshape these calls. */
  apiVersion?: string
  /** Seconds a signed delivery stays acceptable. Default 300, Stripe's own. */
  tolerance?: number
  /** ISO countries a `shipping` product delivers to. Default US and CA. */
  shippingCountries?: string[]
  /** Default `process.env.STRIPE_SECRET_KEY`. */
  secretKey?: string
  /** Default `process.env.STRIPE_WEBHOOK_SECRET`. */
  webhookSecret?: string
  /** Default the global one. */
  fetch?: typeof fetch
}

const STATES: Record<string, PurchaseState> = {
  active: 'active',
  trialing: 'trial',
  past_due: 'grace',
  unpaid: 'billing-retry',
  paused: 'paused',
  canceled: 'expired',
  incomplete_expired: 'expired',
  incomplete: 'pending',
}

const API = 'https://api.stripe.com'
const encoder = new TextEncoder()

const fromHex = (s: string) =>
  /^[0-9a-f]{64}$/.test(s) ? Uint8Array.from(s.match(/../g)!, (b) => parseInt(b, 16)) : undefined

/** The runtime's constant-time compare. */
async function verified(secret: string, text: string, signatures: string[]) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const message = encoder.encode(text)
  let ok = false
  for (const s of signatures) {
    const bytes = fromHex(s)
    if (bytes && (await crypto.subtle.verify('HMAC', key, bytes, message))) ok = true
  }
  return ok
}

/** Stripe's form encoding: `a[b][0]=c`. */
function form(body: Record<string, unknown>) {
  const out = new URLSearchParams()
  const put = (key: string, v: unknown) => {
    if (v === undefined || v === null) return
    if (Array.isArray(v)) v.forEach((x, i) => put(`${key}[${i}]`, x))
    else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) put(`${key}[${k}]`, x)
    else out.append(key, `${v as string | number | boolean}`)
  }
  for (const [k, v] of Object.entries(body)) put(k, v)
  return out
}

const seconds = (s?: number | null) => (s ? s * 1000 : undefined)
/** The fields of a Stripe object that an event can carry, whichever kind of object it is. */
interface StripeObject {
  id: string
  status: string
  customer?: unknown
  metadata?: Record<string, string> | null
  mode?: string
  payment_intent?: unknown
  payment_status?: string
  refunded?: boolean
  current_period_end?: number | null
  items?: { data?: { current_period_end?: number | null }[] } | null
}
interface StripeEvent {
  id?: string
  type: string
  created: number
  data?: { object?: StripeObject }
}

/** A reference that Stripe expands into its object on some API versions. */
const id = (x: unknown): string | undefined =>
  typeof x === 'string' ? x : (x as { id?: string } | null | undefined)?.id
const identity = (object: StripeObject) => {
  const m = object?.metadata ?? {}
  return {
    ...(m.weft_user && { user: m.weft_user }),
    ...(m.weft_product && { product: m.weft_product }),
    ...(m.weft_plan && { plan: m.weft_plan }),
  }
}

/** A subscription's paid-through time, which moved onto its items in 2025 API versions. */
const periodEnd = (sub: StripeObject) =>
  seconds(sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end)

/** One Stripe event as the ledger's, or null for one that says nothing about access. */
function normalise(event: StripeEvent): RailEvent | null {
  const object = event.data?.object
  if (!event.id || !object) return null
  const base = { id: event.id, at: event.created * 1000 }
  const { type } = event
  if (type.startsWith('customer.subscription.')) {
    const state = STATES[object.status]
    if (!state) return null
    const customer = id(object.customer)
    const expires = periodEnd(object)
    return {
      ...base,
      purchase: object.id,
      state,
      ...identity(object),
      ...(customer && { customer }),
      ...(expires && { expires }),
    }
  }
  if (
    type === 'checkout.session.completed' ||
    type === 'checkout.session.async_payment_succeeded' ||
    type === 'checkout.session.async_payment_failed'
  ) {
    if (object.mode !== 'payment') return null // `customer.subscription.*` says what a subscription is doing, trial included
    const purchase = id(object.payment_intent)
    if (!purchase) return null
    const customer = id(object.customer)
    const state: PurchaseState = type.endsWith('failed')
      ? 'expired'
      : object.payment_status === 'unpaid'
        ? 'pending'
        : 'active'
    return { ...base, purchase, state, ...identity(object), ...(customer && { customer }) }
  }
  if (type === 'charge.refunded') {
    const purchase = id(object.payment_intent)
    return purchase && object.refunded
      ? { ...base, purchase, state: 'refunded', ...identity(object) }
      : null // `refunded` is whole: a part refund keeps what was bought
  }
  if (type === 'charge.dispute.created' || type === 'charge.dispute.closed') {
    const purchase = id(object.payment_intent)
    if (!purchase) return null
    if (type.endsWith('created')) return { ...base, purchase, state: 'revoked' }
    return object.status === 'won' ? { ...base, purchase, state: 'active' } : null
  }
  return null
}

function stripeCall(
  options: StripeOptions,
  api: string,
  apiVersion: string,
  fetcher: typeof fetch,
) {
  const secret = () => {
    const key = options.secretKey ?? process.env.STRIPE_SECRET_KEY
    if (!key) throw new PayError('PAY003', '`STRIPE_SECRET_KEY` is not set on the server', 500)
    if (api === API && /placeholder/i.test(key))
      throw new PayError(
        'PAY003',
        '`STRIPE_SECRET_KEY` is still the placeholder `weft add pay` wrote: nothing was sent to Stripe',
        500,
      ) // a mock may take one
    return key
  }

  async function call(path: string, body: Record<string, unknown>, idempotencyKey?: string) {
    const res = await fetcher(`${api}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret()}`,
        'content-type': 'application/x-www-form-urlencoded',
        'stripe-version': apiVersion,
        ...(idempotencyKey && { 'idempotency-key': idempotencyKey }),
      },
      body: form(body),
    })
    const data = (await res.json().catch(() => null)) as {
      url?: string
      error?: { message?: string }
    } | null
    if (!res.ok)
      throw new PayError(
        'PAY030',
        `Stripe refused ${path}: ${data?.error?.message ?? res.status}`,
        res.status === 429 ? 503 : 502,
      )
    return data
  }

  return call
}

async function verifyStripe(
  options: StripeOptions,
  tolerance: number,
  { body, headers }: Parameters<PayRail['verify']>[0],
) {
  const signing = options.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET
  if (!signing)
    throw new PayError(
      'PAY011',
      '`STRIPE_WEBHOOK_SECRET` is not set: refusing every webhook rather than trusting one',
    )
  const parts = (headers.get('stripe-signature') ?? '').split(',').map((p) => p.trim().split('='))
  const t = Number(parts.find(([k]) => k === 't')?.[1])
  const given = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '')
  if (!Number.isInteger(t) || !given.length)
    throw new PayError('PAY011', 'no `stripe-signature` to check')
  if (!(await verified(signing, `${t}.${body}`, given)))
    throw new PayError('PAY011', 'the signature does not match this body')
  if (Math.abs(Date.now() / 1000 - t) > tolerance)
    throw new PayError('PAY011', 'the signature is too old: a replay, or a clock adrift')
  const event = normalise(JSON.parse(body) as StripeEvent)
  return event ? [event] : []
}

/** The Stripe `pay.rail` provider: hosted Checkout, the customer portal, and webhooks verified here. */
export function stripeRail(options: StripeOptions = {}): PayRail {
  const { prices = {}, api = API, apiVersion = '2025-09-30.clover', tolerance = 300 } = options
  const fetcher = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const call = stripeCall(options, api, apiVersion, fetcher)

  function lineItem(line: CheckoutLine) {
    const known = prices[line.plan ? `${line.product}.${line.plan}` : line.product]
    if (known) return { price: known, quantity: line.quantity }
    return {
      quantity: line.quantity,
      price_data: {
        currency: line.currency,
        unit_amount: line.amount,
        product_data: { name: line.name },
        ...(line.interval && { recurring: { interval: line.interval } }),
      },
    }
  }

  return {
    id: 'stripe',
    async checkout(request) {
      const { line, user, customer } = request
      const metadata = {
        weft_user: user,
        weft_product: line.product,
        ...(line.plan && { weft_plan: line.plan }),
      }
      const session = await call(
        '/v1/checkout/sessions',
        {
          mode: line.mode,
          line_items: (request.lines ?? [line]).map(lineItem),
          success_url: request.successUrl,
          cancel_url: request.cancelUrl,
          client_reference_id: user,
          customer,
          customer_email: customer ? undefined : request.email,
          metadata,
          // What the later events carry: a charge and a subscription don't inherit the session's metadata.
          ...(line.mode === 'subscription'
            ? { subscription_data: { metadata, trial_period_days: line.trialDays } }
            : {
                payment_intent_data: { metadata },
                customer_creation: customer ? undefined : 'always',
                ...(line.shipping && {
                  shipping_address_collection: {
                    allowed_countries: options.shippingCountries ?? ['US', 'CA'],
                  },
                }),
              }),
        },
        request.idempotencyKey,
      )
      if (typeof session?.url !== 'string')
        throw new PayError('PAY030', 'Stripe answered a session with no url', 502)
      return { url: session.url }
    },
    async portal({ customer, returnUrl }) {
      const session = await call('/v1/billing_portal/sessions', { customer, return_url: returnUrl })
      return { url: session!.url! }
    },
    verify: (delivery) => verifyStripe(options, tolerance, delivery),
    async refund({ purchase }) {
      if (!purchase.startsWith('pi_'))
        throw new PayError(
          'PAY022',
          'Only a one-time payment refunds here: a subscription is cancelled in the portal',
          400,
        )
      await call('/v1/refunds', { payment_intent: purchase }, `refund:${purchase}`)
    },
  }
}
