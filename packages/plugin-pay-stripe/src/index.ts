// `pay.rail@1` on Stripe (research 10 §5): hosted Checkout and the customer portal, over `fetch` with no SDK, and webhooks
// checked here rather than left to the app. Nothing runs in the browser: `checkout` is a redirect, so a page needs neither
// Stripe.js nor a publishable key.
//
// Stripe's signature is HMAC-SHA256 of `<t>.<raw body>`, in a header `t=…,v1=…` that can carry several `v1` while a secret
// rolls. Stripe has no ordering guarantee, so each event carries the object's `created` or the event's own time, and the
// ledger orders by that. A price is the catalog's unless `prices` maps `pro.month` to a Stripe id, on the server.

import { PayError, type CheckoutRequest, type PayRail, type PurchaseState, type RailEvent } from '@weft/pay'

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
  active: 'active', trialing: 'trial', past_due: 'grace', unpaid: 'billing-retry', paused: 'paused', canceled: 'expired', incomplete_expired: 'expired', incomplete: 'pending',
}

const API = 'https://api.stripe.com'
const encoder = new TextEncoder()
const toHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')

async function hmac(secret: string, text: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(text)))
}

/** Constant time for equal lengths; a hex signature's length isn't a secret. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

/** Stripe's form encoding: `a[b][0]=c`. */
function form(body: Record<string, unknown>) {
  const out = new URLSearchParams()
  const put = (key: string, v: unknown) => {
    if (v === undefined || v === null) return
    if (Array.isArray(v)) v.forEach((x, i) => put(`${key}[${i}]`, x))
    else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) put(`${key}[${k}]`, x)
    else out.append(key, String(v))
  }
  for (const [k, v] of Object.entries(body)) put(k, v)
  return out
}

const seconds = (s?: number | null) => (s ? s * 1000 : undefined)
const id = (x: any): string | undefined => (typeof x === 'string' ? x : x?.id)
const identity = (object: any) => {
  const m = object?.metadata ?? {}
  return { ...(m.weft_user && { user: m.weft_user }), ...(m.weft_product && { product: m.weft_product }), ...(m.weft_plan && { plan: m.weft_plan }) }
}

/** A subscription's paid-through time, which moved onto its items in 2025 API versions. */
const periodEnd = (sub: any) => seconds(sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end)

/** One Stripe event as the ledger's, or null for one that says nothing about access. */
function normalise(event: any): RailEvent | null {
  const object = event.data?.object
  if (!event.id || !object) return null
  const base = { id: event.id, at: event.created * 1000 }
  const type: string = event.type
  if (type.startsWith('customer.subscription.')) {
    const state = STATES[object.status]
    if (!state) return null
    const customer = id(object.customer)
    const expires = periodEnd(object)
    return { ...base, purchase: object.id, state, ...identity(object), ...(customer && { customer }), ...(expires && { expires }) }
  }
  if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded' || type === 'checkout.session.async_payment_failed') {
    if (object.mode !== 'payment') return null // `customer.subscription.*` says what a subscription is doing, trial included
    const purchase = id(object.payment_intent)
    if (!purchase) return null
    const customer = id(object.customer)
    const state: PurchaseState = type.endsWith('failed') ? 'expired' : object.payment_status === 'unpaid' ? 'pending' : 'active'
    return { ...base, purchase, state, ...identity(object), ...(customer && { customer }) }
  }
  if (type === 'charge.refunded') {
    const purchase = id(object.payment_intent)
    return purchase && object.refunded ? { ...base, purchase, state: 'refunded', ...identity(object) } : null // `refunded` is whole: a part refund keeps what was bought
  }
  if (type === 'charge.dispute.created' || type === 'charge.dispute.closed') {
    const purchase = id(object.payment_intent)
    if (!purchase) return null
    if (type.endsWith('created')) return { ...base, purchase, state: 'revoked' }
    return object.status === 'won' ? { ...base, purchase, state: 'active' } : null
  }
  return null
}

export function stripeRail(options: StripeOptions = {}): PayRail {
  const { prices = {}, api = API, apiVersion = '2025-09-30.clover', tolerance = 300 } = options
  const fetcher = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const secret = () => {
    const key = options.secretKey ?? process.env.STRIPE_SECRET_KEY
    if (!key) throw new PayError('PAY003', '`STRIPE_SECRET_KEY` is not set on the server', 500)
    if (api === API && /placeholder/i.test(key)) throw new PayError('PAY003', '`STRIPE_SECRET_KEY` is still the placeholder `weft add pay` wrote: nothing was sent to Stripe', 500) // a mock may take one
    return key
  }

  async function call(path: string, body: Record<string, unknown>, idempotencyKey?: string) {
    const res = await fetcher(`${api}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret()}`, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': apiVersion, ...(idempotencyKey && { 'idempotency-key': idempotencyKey }) },
      body: form(body),
    })
    const data: any = await res.json().catch(() => null)
    if (!res.ok) throw new PayError('PAY030', `Stripe refused ${path}: ${data?.error?.message ?? res.status}`, res.status === 429 ? 503 : 502)
    return data
  }

  function lineItem({ line }: CheckoutRequest) {
    const known = prices[line.plan ? `${line.product}.${line.plan}` : line.product]
    if (known) return { price: known, quantity: line.quantity }
    return {
      quantity: line.quantity,
      price_data: { currency: line.currency, unit_amount: line.amount, product_data: { name: line.name }, ...(line.interval && { recurring: { interval: line.interval } }) },
    }
  }

  return {
    id: 'stripe',
    async checkout(request) {
      const { line, user, customer } = request
      const metadata = { weft_user: user, weft_product: line.product, ...(line.plan && { weft_plan: line.plan }) }
      const session = await call('/v1/checkout/sessions', {
        mode: line.mode,
        line_items: [lineItem(request)],
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        client_reference_id: user,
        customer,
        metadata,
        // What the later events carry: a charge and a subscription don't inherit the session's metadata.
        ...(line.mode === 'subscription'
          ? { subscription_data: { metadata, trial_period_days: line.trialDays } }
          : { payment_intent_data: { metadata }, customer_creation: customer ? undefined : 'always', ...(line.shipping && { shipping_address_collection: { allowed_countries: options.shippingCountries ?? ['US', 'CA'] } }) }),
      }, request.idempotencyKey)
      if (typeof session?.url !== 'string') throw new PayError('PAY030', 'Stripe answered a session with no url', 502)
      return { url: session.url }
    },
    async portal({ customer, returnUrl }) {
      const session = await call('/v1/billing_portal/sessions', { customer, return_url: returnUrl })
      return { url: session.url }
    },
    async verify({ body, headers }) {
      const signing = options.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET
      if (!signing) throw new PayError('PAY011', '`STRIPE_WEBHOOK_SECRET` is not set: refusing every webhook rather than trusting one')
      const parts = (headers.get('stripe-signature') ?? '').split(',').map(p => p.trim().split('='))
      const t = Number(parts.find(([k]) => k === 't')?.[1])
      const given = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '')
      if (!Number.isInteger(t) || !given.length) throw new PayError('PAY011', 'no `stripe-signature` to check')
      const want = await hmac(signing, `${t}.${body}`)
      if (!given.some(v => same(v, want))) throw new PayError('PAY011', 'the signature does not match this body')
      if (Math.abs(Date.now() / 1000 - t) > tolerance) throw new PayError('PAY011', 'the signature is too old: a replay, or a clock adrift')
      const event = normalise(JSON.parse(body))
      return event ? [event] : []
    },
    async refund({ purchase }) {
      if (!purchase.startsWith('pi_')) throw new PayError('PAY022', 'Only a one-time payment refunds here: a subscription is cancelled in the portal', 400)
      await call('/v1/refunds', { payment_intent: purchase }, `refund:${purchase}`)
    },
  }
}
