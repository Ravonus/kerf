// fakePay (research 10 §8): a `pay.rail` provider for weft/test that keeps a rail's state machine in memory. Every event
// goes the way a real one does, signed, through the app's own `webhook`, ledger and tag pokes, so a test asserts what the
// user sees and what the server grants. It holds no key and opens no connection.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { definePay, memoryPayStore, type Pay, type PayOptions, type Purchase } from './pay-server'
import { PayError, type CheckoutRequest, type Interval, type PayRail, type Product, type PurchaseState, type RailEvent } from './pay'

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

export interface FakeHooks {
  /** Move the deterministic clock when it's installed. */
  advance(ms: number): Promise<void>
  /** Hand the tags to the fake realtime hub. */
  poke(tags: string[]): Promise<void>
  /** Put this ledger behind `ctx.entitlements`. */
  attach(pay: Pay<any> | undefined): void
}

const sign = (secret: string, t: number, body: string) => createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
const SECRET = 'fake-pay-signing-key'

export function createFakePay(app: Pay<any> | Pick<PayOptions<Product>, 'catalog'> & Partial<PayOptions<Product>>, hooks: FakeHooks): FakePay {
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

  const pay: Pay<any> = '$weft' in app ? (app as Pay<any>) : definePay({ store: memoryPayStore(), urls: { success: '/', cancel: '/' }, ...(app as PayOptions<Product>) })
  pay.$weft.use(rail)
  hooks.attach(pay)

  async function post(event: RailEvent, secret: string) {
    const body = JSON.stringify([event]), t = Date.now()
    const request = new Request('http://localhost/_weft/pay/fake', { method: 'POST', body, headers: { 'x-fake-signature': `${t},${sign(secret, t, body)}` } })
    const { response, tags } = await pay.webhook('fake', request)
    deliveries.push({ event, status: response.status })
    if (tags.length) await hooks.poke(tags)
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
      await hooks.advance(Math.max(0, b.expires! - Date.now()))
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
