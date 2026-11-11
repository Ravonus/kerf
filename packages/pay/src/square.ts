// Square's signature is base64 HMAC-SHA256 of `<notification URL><raw body>` with the subscription's signature key, in
// `x-square-hmacsha256-signature`. It carries no time, so a replay is stopped by the ledger's event ids. A payment's event
// doesn't carry the order's metadata, so after the signature checks out the rail reads the order once to learn who and what.
// Square sells one-time payments here: subscriptions and a customer portal are Stripe's (PAY022).

import {
  PayError,
  type CheckoutLine,
  type CheckoutRequest,
  type PayRail,
  type PurchaseState,
  type RailEvent,
} from './index'

/** Options of `squareRail()`. Secrets default to the environment, which is where they belong. */
export interface SquareOptions {
  /** `sandbox` talks to connect.squareupsandbox.com with a sandbox token. Default `process.env.SQUARE_ENVIRONMENT` (or
   * `SQUARE_ENV`), else production. Any other value is refused (PAY032) rather than read as production. */
  environment?: 'sandbox' | 'production'
  /** Default `process.env.SQUARE_APPLICATION_ID`. Only checked: a `sandbox-sq0idb-…` id says sandbox, `sq0idp-…`
   * production, and one that disagrees with `environment` is PAY032. */
  applicationId?: string
  /** The API's origin: point it at a local mock. Default from `environment`. */
  api?: string
  /** Pinned, so an account's default version can't reshape these calls. */
  apiVersion?: string
  /** Default `process.env.SQUARE_ACCESS_TOKEN`. */
  accessToken?: string
  /** Default `process.env.SQUARE_LOCATION_ID`: the shop the payments land in. */
  locationId?: string
  /** Default `process.env.SQUARE_WEBHOOK_SIGNATURE_KEY`. */
  signatureKey?: string
  /** The exact URL given to Square for the webhook; it's part of what's signed. Default `process.env.SQUARE_WEBHOOK_URL`. */
  notificationUrl?: string
  /** Default the global one. */
  fetch?: typeof fetch
}

interface Money {
  amount?: number
  currency?: string
}
interface SquarePayment {
  id: string
  order_id?: string
  status?: string
  updated_at?: string
  created_at?: string
  customer_id?: string
  total_money?: Money
  amount_money?: Money
  refunded_money?: Money
}
interface SquareEvent {
  event_id?: string
  type?: string
  created_at?: string
  data?: { object?: { payment?: SquarePayment } }
}

const PAYMENT: Record<string, PurchaseState> = {
  APPROVED: 'pending',
  PENDING: 'pending',
  COMPLETED: 'active',
  CANCELED: 'expired',
  FAILED: 'expired',
}

const encoder = new TextEncoder()
const env = (name: string) => (typeof process === 'undefined' ? undefined : process.env[name])

async function signatureOk(key: string, text: string, given: string) {
  const k = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = Uint8Array.from(atob(given), (c) => c.charCodeAt(0))
  } catch {
    return false
  }
  return crypto.subtle.verify('HMAC', k, bytes, encoder.encode(text))
}

/** One Square payment as a ledger state: a whole refund is final, a part refund keeps what was bought. */
function stateOf(p: SquarePayment): PurchaseState | null {
  const paid = p.total_money?.amount ?? p.amount_money?.amount ?? 0
  if (p.refunded_money?.amount && paid && p.refunded_money.amount >= paid) return 'refunded'
  return PAYMENT[p.status ?? ''] ?? null
}

/** `true` for the sandbox, after checking the environment's spelling and the application id against it. */
export function squareSandbox(options: Pick<SquareOptions, 'environment' | 'applicationId'> = {}) {
  const raw = options.environment ?? env('SQUARE_ENVIRONMENT') ?? env('SQUARE_ENV')
  const value = (raw ?? '').trim().toLowerCase()
  if (value && value !== 'sandbox' && value !== 'production')
    throw new PayError(
      'PAY032',
      `\`SQUARE_ENVIRONMENT\` is \`${raw}\`: set it to \`sandbox\` or \`production\``,
      500,
    )
  const sandbox = value === 'sandbox'
  const app = options.applicationId ?? env('SQUARE_APPLICATION_ID')
  if (app && app.startsWith('sandbox-') !== sandbox)
    throw new PayError(
      'PAY032',
      sandbox
        ? '`SQUARE_ENVIRONMENT` is `sandbox` but `SQUARE_APPLICATION_ID` is a production app: take the token and id from the Sandbox tab of the Developer Console'
        : '`SQUARE_APPLICATION_ID` is a sandbox app (`sandbox-…`) but `SQUARE_ENVIRONMENT` is not `sandbox`: set `SQUARE_ENVIRONMENT=sandbox`, or use the production credentials',
      500,
    )
  return sandbox
}

const SANDBOX_API = 'https://connect.squareupsandbox.com'
const PRODUCTION_API = 'https://connect.squareup.com'

function squareCall(options: SquareOptions, fetcher: typeof fetch) {
  const version = options.apiVersion ?? '2025-10-16'
  return async function call(path: string, body?: unknown) {
    const sandbox = squareSandbox(options)
    const api = options.api ?? (sandbox ? SANDBOX_API : PRODUCTION_API)
    const token = options.accessToken ?? env('SQUARE_ACCESS_TOKEN')
    if (!token) throw new PayError('PAY003', '`SQUARE_ACCESS_TOKEN` is not set on the server', 500)
    if (!options.api && /placeholder/i.test(token))
      throw new PayError(
        'PAY003',
        '`SQUARE_ACCESS_TOKEN` is still a placeholder: nothing was sent to Square',
        500,
      )
    const res = await fetcher(`${api}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'square-version': version,
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok) {
      const errors = (data?.errors as { detail?: string }[] | undefined) ?? []
      // A token only works on its own host, and Square says no more than UNAUTHORIZED when it's sent to the other one.
      const hint =
        res.status === 401 && !options.api
          ? sandbox
            ? ' (this is the sandbox host: is `SQUARE_ACCESS_TOKEN` the sandbox token, from the Sandbox tab?)'
            : ' (this is the production host: a sandbox token needs `SQUARE_ENVIRONMENT=sandbox`)'
          : ''
      throw new PayError(
        'PAY030',
        `Square refused ${path}: ${errors[0]?.detail ?? res.status}${hint}`,
        res.status === 429 ? 503 : 502,
      )
    }
    return data ?? {}
  }
}

const upper = (c: string) => c.toUpperCase()
const lineItem = (l: CheckoutLine) => ({
  name: l.name,
  quantity: String(l.quantity),
  base_price_money: { amount: l.amount, currency: upper(l.currency) },
})

type Call = ReturnType<typeof squareCall>

/** One payment link for a checkout's lines, with the metadata its order carries back to `verify`. */
async function paymentLink(call: Call, options: SquareOptions, request: CheckoutRequest) {
  const { line, user } = request
  if (line.mode !== 'payment')
    throw new PayError(
      'PAY022',
      'The Square rail takes one-time payments: sell subscriptions with Stripe',
      501,
    )
  const location = options.locationId ?? env('SQUARE_LOCATION_ID')
  if (!location) throw new PayError('PAY003', '`SQUARE_LOCATION_ID` is not set on the server', 500)
  const data = (await call('/v2/online-checkout/payment-links', {
    idempotency_key: request.idempotencyKey.slice(0, 45),
    order: {
      location_id: location,
      ...(line.plan && line.product === 'order' && { reference_id: line.plan.slice(0, 40) }),
      line_items: (request.lines ?? [line]).map(lineItem),
      metadata: {
        kerf_user: user.slice(0, 255),
        kerf_product: line.product,
        ...(line.plan && { kerf_plan: line.plan }),
      },
    },
    checkout_options: { redirect_url: request.successUrl },
    ...(request.email && { pre_populated_data: { buyer_email: request.email } }),
  })) as { payment_link?: { url?: string } }
  const url = data.payment_link?.url
  if (typeof url !== 'string')
    throw new PayError('PAY030', 'Square answered a link with no url', 502)
  return { url }
}

/** The Square `pay.rail` provider: hosted payment links and webhooks verified here. One-time payments only. */
export function squareRail(options: SquareOptions = {}): PayRail {
  const fetcher = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const call = squareCall(options, fetcher)

  async function identity(orderId: string) {
    const { order } = (await call(`/v2/orders/${encodeURIComponent(orderId)}`)) as {
      order?: { metadata?: Record<string, string> }
    }
    const m = order?.metadata ?? {}
    return {
      ...(m.kerf_user && { user: m.kerf_user }),
      ...(m.kerf_product && { product: m.kerf_product }),
      ...(m.kerf_plan && { plan: m.kerf_plan }),
    }
  }

  return {
    id: 'square',
    modes: ['payment'],
    get sandbox() {
      try {
        return squareSandbox(options)
      } catch {
        return undefined // a misspelled environment: every call says so (PAY032)
      }
    },
    checkout: (request) => paymentLink(call, options, request),
    portal() {
      return Promise.reject(
        new PayError('PAY022', 'Square has no customer portal: a buyer manages nothing here', 501),
      )
    },
    async verify({ body, headers }) {
      const key = options.signatureKey ?? env('SQUARE_WEBHOOK_SIGNATURE_KEY')
      const url = options.notificationUrl ?? env('SQUARE_WEBHOOK_URL')
      if (!key || !url)
        throw new PayError(
          'PAY011',
          '`SQUARE_WEBHOOK_SIGNATURE_KEY` and `SQUARE_WEBHOOK_URL` must both be set: refusing every webhook rather than trusting one',
        )
      const given = headers.get('x-square-hmacsha256-signature') ?? ''
      if (!given || !(await signatureOk(key, url + body, given)))
        throw new PayError('PAY011', 'the signature does not match this body and URL')
      const event = JSON.parse(body) as SquareEvent
      const p = event.data?.object?.payment
      if (!event.event_id || !p?.order_id || !event.type?.startsWith('payment.')) return []
      const state = stateOf(p)
      if (!state) return []
      const at = Date.parse(p.updated_at ?? event.created_at ?? '') || Date.now()
      const out: RailEvent = {
        id: event.event_id,
        at,
        purchase: p.order_id,
        state,
        ...(await identity(p.order_id)),
        ...(p.customer_id && { customer: p.customer_id }),
      }
      return [out]
    },
    async refund({ purchase }) {
      const { order } = (await call(`/v2/orders/${encodeURIComponent(purchase)}`)) as {
        order?: { tenders?: { payment_id?: string }[]; total_money?: Money }
      }
      const payment = order?.tenders?.[0]?.payment_id
      if (!payment || !order?.total_money)
        throw new PayError('PAY024', `order \`${purchase}\` has no payment to refund`, 404)
      await call('/v2/refunds', {
        idempotency_key: `refund-${purchase}`.slice(0, 45),
        payment_id: payment,
        amount_money: order.total_money,
      })
    },
  }
}
