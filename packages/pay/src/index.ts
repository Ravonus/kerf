// @weft-js/pay (PLAN §4.4, research 10): the catalog, and what a `pay.rail` provider implements. Safe in the client graph: nothing
// here reaches a rail or a server. App code names products and plans; a rail is one line in `plugins`. `@weft-js/pay/server`
// holds the ledger, and `checkout()` never grants anything: the grant arrives from a verified rail event.
//
//   export const pro = product({ id: 'pro', kind: 'subscription', use: 'digital', plans: { month: { usd: 999 } }, grants: ['pro'] })
//   <button onClick={() => checkout({ product: 'pro', plan: 'month' })}>Go Pro · {price(pro, 'month').display}</button>

export type ProductKind = 'subscription' | 'one-time' | 'consumable'
export type ProductUse = 'digital' | 'physical' | 'service'
export type Interval = 'day' | 'week' | 'month' | 'year'

/** Minor units per ISO currency: `{ usd: 999 }` is $9.99. Integers, always (PAY008). */
export type Amounts = Record<string, number>

export interface Plan { [currency: string]: unknown; trialDays?: number; interval?: Interval }

export interface ProductDef<G extends string = string, P extends string = string> {
  id: string
  kind: ProductKind
  use: ProductUse
  /** Display name at checkout. Default: the id. */
  name?: string
  /** A subscription's billing options: `{ month: { usd: 999 }, year: { usd: 7999, trialDays: 7 } }`. */
  plans?: Record<P, Plan>
  /** A one-time or consumable product's price. */
  price?: Amounts
  /** The entitlements a live purchase of this product gives. */
  grants?: readonly G[]
  /** One-time and physical goods: collect an address. */
  shipping?: boolean
}

export interface Product<G extends string = string, P extends string = string> extends ProductDef<G, P> {
  readonly grants: readonly G[]
}

const INTERVALS: readonly string[] = ['day', 'week', 'month', 'year']
const META = new Set(['trialDays', 'interval'])

/** Thrown with a stable `code`. `answer` is the shape @weft-js/start sends any plugin's error to the client in. */
export class PayError extends Error {
  override name = 'PayError'
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message)
  }
  get answer() { return { code: this.code, message: this.message, status: this.status } }
}

const amounts = (p: object) => Object.entries(p).filter(([k]) => !META.has(k)) as [string, number][]

function checkAmounts(id: string, list: [string, unknown][]) {
  if (!list.length) throw new PayError('PAY008', `\`${id}\` has no amount: give one in minor units with its currency, like \`{ usd: 999 }\``)
  for (const [currency, n] of list) {
    if (!/^[a-z]{3}$/.test(currency)) throw new PayError('PAY008', `\`${id}\`: \`${currency}\` isn't a lowercase ISO currency`)
    if (!Number.isSafeInteger(n) || (n as number) < 0) throw new PayError('PAY008', `\`${id}\`: ${currency} ${String(n)} isn't whole minor units (999 is $9.99)`)
  }
}

/** One thing you sell. The only place products are defined, and safe in the client graph: it holds no rail's ids. */
export function product<const G extends string = never, const P extends string = never>(def: ProductDef<G, P>): Product<G, P> {
  const { id, kind, plans, price } = def
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new PayError('PAY021', `product id \`${id}\` must be lowercase letters, digits and dashes`)
  if (kind === 'subscription') {
    if (!plans || !Object.keys(plans).length) throw new PayError('PAY021', `subscription \`${id}\` has no \`plans\``)
    if (price) throw new PayError('PAY021', `subscription \`${id}\` is priced per plan: drop \`price\``)
    for (const [name, p] of Object.entries<Plan>(plans)) {
      checkAmounts(`${id}.${name}`, amounts(p))
      if (intervalOf(name, p) === null) throw new PayError('PAY021', `plan \`${id}.${name}\` is no interval: name it \`month\` or \`year\`, or add \`interval\``)
    }
  } else {
    if (plans) throw new PayError('PAY021', `\`${id}\` is ${kind}: \`plans\` are for subscriptions, so use \`price\``)
    checkAmounts(id, Object.entries(price ?? {}))
  }
  return Object.freeze({ ...def, grants: Object.freeze([...(def.grants ?? [])]) }) as Product<G, P>
}

const intervalOf = (name: string, p: Plan): Interval | null => p.interval ?? (INTERVALS.includes(name) ? (name as Interval) : null)

export interface Price {
  amount: number
  currency: string
  /** Formatted for the reader's locale: `$9.99`. */
  display: string
  plan?: string
  interval?: Interval
  trialDays?: number
}

/** The figure in major units, by the currency's own exponent: JPY has none, KWD has three. */
function formatted(amount: number, currency: string, locale?: string) {
  const f = new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase() })
  return f.format(amount / 10 ** (f.resolvedOptions().maximumFractionDigits ?? 2))
}

/** The price of a product or one of its plans. The first currency listed, unless you name one. */
export function price<P extends string>(p: Product<string, P>, plan?: P, options: { currency?: string; locale?: string } = {}): Price {
  const row: Record<string, unknown> | undefined = plan === undefined ? (p.price ?? (p.plans && Object.values(p.plans)[0] as Plan)) : p.plans?.[plan]
  const name = plan ?? (p.plans ? Object.keys(p.plans)[0] : undefined)
  if (!row) throw new PayError('PAY021', `\`${p.id}\` has no plan \`${String(plan)}\``)
  const list = amounts(row)
  const pick = options.currency ? list.find(([c]) => c === options.currency) : list[0]
  if (!pick) throw new PayError('PAY021', `\`${p.id}\` has no ${options.currency} price`)
  const [currency, amount] = pick
  const plain = { amount, currency, display: formatted(amount, currency, options.locale) }
  if (!name) return plain
  const meta = row as Plan
  return { ...plain, plan: name, interval: intervalOf(name, meta)!, ...(meta.trialDays ? { trialDays: meta.trialDays } : {}) }
}

/** What a query reads, tagged so a verified event pokes it: `tags: (_, ctx) => [entitlementTag(ctx.user.id)]`. */
export const entitlementTag = (user: string) => `entitlements:${user}`

// ---- pay.rail@1 ---------------------------------------------------------------------------------------------------

/** What a purchase is doing now, on any rail (research 10 §3). */
export type PurchaseState = 'pending' | 'active' | 'trial' | 'grace' | 'billing-retry' | 'paused' | 'expired' | 'refunded' | 'revoked'

/** One line a rail charges for, from the catalog. It never comes from the client. */
export interface CheckoutLine {
  product: string
  plan?: string
  name: string
  amount: number
  currency: string
  mode: 'subscription' | 'payment'
  interval?: Interval
  trialDays?: number
  quantity: number
  shipping?: boolean
}

export interface CheckoutRequest {
  /** Who is buying: attached to the rail's records, and read back from its events. */
  user: string
  /** This user's id on the rail, when a purchase gave one. */
  customer?: string
  line: CheckoutLine
  successUrl: string
  cancelUrl: string
  /** The same click twice gives one session. */
  idempotencyKey: string
}

/** A rail's event, normalised. `checkout` and these are all that a rail and the ledger say to each other. */
export interface RailEvent {
  /** The rail's own id for the event: what makes a redelivery a no-op. */
  id: string
  /** The rail's own clock, in ms: events arrive out of order, and this orders them. */
  at: number
  /** The rail's id for the purchase: a subscription, a payment. */
  purchase: string
  state: PurchaseState
  /** Set when the rail's event carries them; an event for a purchase nobody knows without them is dropped. */
  user?: string
  product?: string
  plan?: string
  customer?: string
  /** When a paid period ends, in ms. */
  expires?: number
}

/**
 * `pay.rail@1`. A provider implements this and declares it for the `server` side. `verify` is the only way in for an
 * event: it gets the exact bytes received, and throws `PayError('PAY011', …)` for anything it can't prove.
 */
export interface PayRail {
  readonly id: string
  checkout(request: CheckoutRequest): Promise<{ url: string }>
  /** Where a buyer manages or cancels. */
  portal(request: { customer: string; returnUrl: string }): Promise<{ url: string }>
  verify(request: { body: string; headers: Headers }): RailEvent[] | Promise<RailEvent[]>
  refund?(request: { purchase: string }): Promise<void>
}
