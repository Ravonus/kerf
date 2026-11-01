// fakePay (research 10 §8): a second `pay.rail` provider, which keeps a rail's state machine in memory. Every event goes the
// way a real one does, signed, through the app's own `webhook`, ledger and tag pokes, so a test asserts what the user sees
// and what the server grants. It holds no key and opens no connection, and it reaches weft/test only through `net` and
// `clock`, which any plugin can use. `payRailSuite` is what a rail, this one included, is held to.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { clock, net } from 'weft/test'
import { definePay, memoryPayStore, type Pay, type PayOptions, type Purchase } from './server'
import { PayError, type CheckoutRequest, type Interval, type PayRail, type Product, type PurchaseState, type RailEvent } from './index'

const DAY = 86_400_000
const PERIOD: Record<Interval, number> = { day: DAY, week: 7 * DAY, month: 30 * DAY, year: 365 * DAY }
const TERMS = { 'renewal-failed': 'grace', 'grace-expired': 'expired', recovered: 'active', cancel: 'expired', pause: 'paused', resume: 'active', refund: 'refunded', revoke: 'revoked' } as const

export type PayScenario = 'renewal' | keyof typeof TERMS

interface Bought { id: string; user: string; product: string; plan?: string; interval?: Interval; state: PurchaseState; expires?: number; customer: string }

export interface FakePay {
  readonly pay: Pay<any>
  readonly rail: PayRail
  /** Every checkout opened, newest last. */
  readonly sessions: CheckoutRequest[]
  /** Every delivery and how the app answered. */
  readonly deliveries: { event: RailEvent; status: number }[]
  /** The buyer finishes the hosted page: the newest open session, or the one for `user`. */
  complete(user?: string): Promise<string>
  /** The buyer closes the page. Nothing happens, as nothing does on a real rail. */
  abandon(user?: string): void
  /** A whole purchase, with no checkout screen in the way. */
  buy(user: string, product: string, plan?: string): Promise<string>
  /**
   * What the rail does next: `renewal` moves a clock to the period's end first. `purchase` defaults to the newest.
   * `renewal-failed`, `grace-expired`, `recovered`, `cancel`, `pause`, `resume`, `refund`, `revoke`.
   */
  simulate(what: PayScenario, purchase?: string): Promise<void>
  /** The last event again: a redelivery. */
  redeliver(): Promise<number>
  /** An event by hand, in any order. `{ forged: true }` signs it with the wrong key. */
  deliver(event: RailEvent, options?: { forged?: boolean }): Promise<number>
  entitlements(user: string): Promise<string[]>
  purchases(user: string): Promise<Purchase[]>
}

const sign = (secret: string, t: number, body: string) => createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
const SECRET = 'fake-pay-signing-key'

/** `fakePay(pay)` with the app's own `definePay`, or `fakePay({ catalog })`. It backs `ctx.entitlements` for this test. */
export function fakePay(app: Pay<any> | (Pick<PayOptions<Product>, 'catalog'> & Partial<PayOptions<Product>>)): FakePay {
  const sessions: CheckoutRequest[] = [], deliveries: FakePay['deliveries'] = []
  const purchases = new Map<string, Bought>()
  let seq = 0, last: RailEvent | undefined
  const next = (prefix: string) => `${prefix}_${++seq}`

  const rail: PayRail = {
    id: 'fake',
    async checkout(request) {
      sessions.push(request)
      return { url: `https://fake-pay.test/checkout/${next('cs')}` }
    },
    portal: async ({ customer }) => ({ url: `https://fake-pay.test/portal/${customer}` }),
    verify({ body, headers }) {
      const [t, v1] = (headers.get('x-fake-signature') ?? '').split(',')
      const want = Buffer.from(sign(SECRET, Number(t), body)), got = Buffer.from(v1 ?? '')
      if (want.length !== got.length || !timingSafeEqual(want, got)) throw new PayError('PAY011', 'no valid fake signature')
      return JSON.parse(body)
    },
    async refund({ purchase }) {
      await simulate('refund', purchase)
    },
  }

  const pay: Pay<any> = 'webhook' in app ? (app as Pay<any>) : definePay({ store: memoryPayStore(), urls: { success: '/', cancel: '/' }, ...(app as PayOptions<Product>) })
  pay.use(rail)
  net.extension(pay)

  async function post(event: RailEvent, secret: string) {
    const body = JSON.stringify([event]), t = Date.now()
    const request = new Request('http://localhost/_weft/pay/fake', { method: 'POST', body, headers: { 'x-fake-signature': `${t},${sign(secret, t, body)}` } })
    const { response, tags } = await pay.webhook('fake', request)
    deliveries.push({ event, status: response.status })
    if (tags.length && net.subscriptions().length) await net.poke(...tags)
    return response.status
  }
  const deliver: FakePay['deliver'] = (event, options) => { if (!options?.forged) last = event; return post(event, options?.forged ? 'not-the-key' : SECRET) }

  const event = (b: Bought): RailEvent => ({ id: next('evt'), at: Date.now(), purchase: b.id, state: b.state, user: b.user, product: b.product, ...(b.plan && { plan: b.plan }), customer: b.customer, ...(b.expires !== undefined && { expires: b.expires }) })

  async function open(s: CheckoutRequest) {
    const { line, user } = s
    const b: Bought = { id: next(line.mode === 'subscription' ? 'sub' : 'pay'), user, product: line.product, state: line.trialDays ? 'trial' : 'active', customer: s.customer ?? next('cus'), ...(line.plan && { plan: line.plan }), ...(line.interval && { interval: line.interval }) }
    if (b.interval) b.expires = Date.now() + (line.trialDays ? line.trialDays * DAY : PERIOD[b.interval])
    purchases.set(b.id, b)
    await deliver(event(b))
    return b.id
  }

  const take = (user?: string) => {
    const i = user ? sessions.findLastIndex(s => s.user === user) : sessions.length - 1
    if (i < 0) throw new Error(`fakePay: no open checkout${user ? ` for ${user}` : ''}: call \`checkout\` first`)
    return sessions.splice(i, 1)[0]
  }

  async function simulate(what: PayScenario, id?: string) {
    const b = id ? purchases.get(id) : [...purchases.values()].at(-1)
    if (!b) throw new Error(`fakePay: no purchase${id ? ` \`${id}\`` : ' yet'} to ${what}`)
    if (what === 'renewal' || what === 'renewal-failed') {
      if (!b.interval) throw new Error(`fakePay: \`${b.id}\` is one payment: only a subscription renews`)
      if (clock.installed) await clock.advance(Math.max(0, b.expires! - Date.now()))
    }
    if (what === 'renewal') Object.assign(b, { state: 'active', expires: b.expires! + PERIOD[b.interval!] })
    else b.state = TERMS[what]
    await deliver(event(b))
  }

  return {
    pay, rail, sessions, deliveries, deliver, simulate,
    complete: user => open(take(user)),
    abandon: user => void take(user),
    async buy(user, product, plan) {
      await pay.checkout({ user: { id: user }, request: { url: 'http://localhost/' } }, { product, ...(plan && { plan }) })
      return open(take(user))
    },
    redeliver() {
      if (!last) throw new Error('fakePay: nothing delivered yet')
      return post(last, SECRET)
    },
    entitlements: user => pay.entitlements(user).list(),
    purchases: user => pay.purchases(user),
  }
}

export interface Check { name: string; ok: boolean; detail: string }

export interface PayRailSuiteOptions {
  rail: PayRail
  /** A delivery the rail would accept, `age` ms old, for a purchase event. Omit `age` for one just sent. */
  delivery(age?: number): { body: string; headers: Headers }
  /** How old a delivery may be before a rail refuses it as a replay. Without it the replay check isn't run. */
  tolerance?: number
}

/** One Check per requirement of `pay.rail@1`, against whatever `fetch` the rail was given. Any `ok: false` is P119. */
export async function payRailSuite({ rail, delivery, tolerance }: PayRailSuiteOptions): Promise<Check[]> {
  const out: Check[] = []
  const check = (name: string, ok: boolean, detail = '') => void out.push({ name, ok, detail })
  const refused = async (d: { body: string; headers: Headers }) => {
    try { await rail.verify(d); return false } catch (e: any) { return e?.code === 'PAY011' }
  }
  const good = delivery()
  const events = await rail.verify(good)
  const e = events[0]
  check('a genuine delivery verifies', events.length > 0, `${events.length} events`)
  check('an event has an id, a time in ms and a purchase', !!e && typeof e.id === 'string' && e.id !== '' && e.at > 1e11 && typeof e.purchase === 'string', JSON.stringify(e))
  check('the same delivery gives the same id, so a repeat is a no-op', (await rail.verify(good))[0]?.id === e?.id)
  check('a changed byte is refused', await refused({ body: `${good.body} `, headers: good.headers }))
  check('no signature is refused', await refused({ body: good.body, headers: new Headers() }))
  if (tolerance) check('an old delivery is refused as a replay', await refused(delivery(tolerance + 60_000)))
  const line = { product: 'pro', name: 'Pro', amount: 999, currency: 'usd', mode: 'subscription', plan: 'month', interval: 'month', quantity: 1 } as const
  const { url } = await rail.checkout({ user: 'u1', line, successUrl: 'https://app.test/ok', cancelUrl: 'https://app.test/no', idempotencyKey: 'k1' })
  check('`checkout` answers an absolute URL', /^https?:\/\//.test(url), url)
  const portal = await rail.portal({ customer: 'c1', returnUrl: 'https://app.test/account' })
  check('`portal` answers an absolute URL', /^https?:\/\//.test(portal.url), portal.url)
  return out
}
