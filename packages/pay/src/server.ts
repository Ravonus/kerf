// @weft/pay/server (research 10 §3, 37): one ledger for every rail. A rail's `verify` turns the bytes it received into events;
// `ingest` folds them into `purchases`; entitlements are read from those, against the catalog, so nothing else can grant
// anything. `src/pay.server.ts` default-exports what `definePay` returns, and that value is a `server.extension`: it is
// how this package reaches the server, through the slot any plugin can use. No line of @weft/start names payments.
//
// Delivery is at least once, in any order. An event applies by the rail's own clock, so an old one changes nothing and a
// repeat lands on what it already wrote; `mark` comes last, because a crash before it should redeliver. A failure answers
// 500 for the same reason. A terminal state wins a tie: a refund and a renewal in the same second is a refund.

import type { ServerExtension } from '@weft/start/extension'
import { entitlementTag, PayError, type CheckoutLine, type Interval, type PayRail, type Plan, type Product, type PurchaseState, type RailEvent } from './index'

declare module '@weft/start' {
  interface Context {
    /** What this user holds, from verified rail events. Await it. */
    entitlements: Entitlements
  }
  interface FnOptions {
    /** Entitlements this call needs, on the server: a typed 403 otherwise. */
    requires?: readonly string[]
  }
}

export interface Purchase {
  /** `<rail>:<rail's id>`. */
  id: string
  rail: string
  /** Null until an event names them: a dispute can arrive before the payment it disputes. */
  user: string | null
  product: string | null
  plan: string | null
  state: PurchaseState
  /** The rail's time of the last event applied. */
  at: number
  expires: number | null
  customer: string | null
}

/** Where the ledger lives. `drizzlePayStore` in `@weft/start/pay/drizzle`, or write these five for any database. */
export interface PayStore {
  /** Not durable: refused on a production server (PAY016). */
  readonly memory?: boolean
  seen(event: string): Promise<boolean>
  mark(event: string, at: number): Promise<void>
  purchase(id: string): Promise<Purchase | null>
  /** Insert or replace by `id`. */
  save(purchase: Purchase): Promise<void>
  byUser(user: string): Promise<Purchase[]>
}

export function memoryPayStore(): PayStore & { clear(): void } {
  const events = new Set<string>()
  const rows = new Map<string, Purchase>()
  return {
    memory: true,
    seen: async e => events.has(e),
    mark: async e => void events.add(e),
    purchase: async id => rows.get(id) ?? null,
    save: async p => void rows.set(p.id, p),
    byUser: async user => [...rows.values()].filter(p => p.user === user),
    clear() { events.clear(); rows.clear() },
  }
}

export interface Entitlements {
  /** Await it: a promise is always truthy (PAY015). */
  has(id: string): Promise<boolean>
  list(): Promise<string[]>
}

export interface PayOptions<P extends Product> {
  /** `import * as catalog from './pay/catalog'`, or a list. */
  catalog: readonly P[] | Record<string, P>
  store: PayStore
  /** Paths or URLs a buyer comes back to. They never come from the client. */
  urls: { success: string; cancel: string; portal?: string }
  /** Who a request is. Default `ctx.user?.id`. */
  user?: (ctx: any) => string | null | undefined
  /** With several rails bound, the one that takes payments. One rail needs no choosing. */
  rail?: string
  /** The `pay.rail` slot. Default the generated `weft:slot/pay.rail`, as any consumer of a slot reads it. */
  slot?: () => Promise<{ load(key: string): Promise<unknown>; providers?: Record<string, unknown> }>
  /** Absolute origin for `urls`, behind a proxy. Default the request's. */
  origin?: string
  /** How long past a paid period access lasts, while a late renewal event arrives. Default 3 days. */
  leeway?: number
}

/** The server log: @weft/start passes its own. */
export type PayReport = (d: { code: string; severity: string; message: string }) => void

export interface CheckoutInput<P extends Product = Product> {
  product: P['id']
  plan?: string
  currency?: string
  quantity?: number
}

export interface Pay<P extends Product = Product> extends ServerExtension {
  readonly catalog: readonly P[]
  /** For a mutation's `input`: the catalog decides what can be bought, and the client sends only names. */
  readonly input: { readonly '~standard': { version: 1; vendor: 'weft'; validate(v: unknown): { value: CheckoutInput<P> } | { issues: { message: string }[] }; types?: { input: CheckoutInput<P>; output: CheckoutInput<P> } } }
  /** The hosted checkout's URL, for this buyer. Grants nothing. */
  checkout(ctx: any, input: CheckoutInput<P>): Promise<string>
  /** Where this buyer manages or cancels. */
  portal(ctx: any): Promise<string>
  /** Read for a user id, as a webhook or a job would. In a request, `ctx.entitlements`. */
  entitlements(user: string): Entitlements
  /** `ctx.entitlements` for this context. */
  forContext(ctx: any): Entitlements
  purchases(user: string): Promise<Purchase[]>
  /** One verified delivery. `tags` go on to the app's live readers. */
  webhook(rail: string, request: Request, report?: PayReport): Promise<{ response: Response; tags: string[] }>
  /** Apply events that have been verified. Anything else must go through `webhook`. */
  ingest(rail: string, events: RailEvent[], report?: PayReport): Promise<string[]>
  refund(purchase: string): Promise<void>
  /** A rail in place of the slot: `fakePay`. */
  use(rail: PayRail | undefined): void
  /** Back to the slot, with an empty ledger if it can be emptied: `net.extension` calls this after each test. */
  reset(): void
}

const ACCESS: ReadonlySet<PurchaseState> = new Set(['active', 'trial', 'grace'])
const FINAL: ReadonlySet<PurchaseState> = new Set(['refunded', 'revoked'])
const DAY = 86_400_000
const BODY = 1 << 20

const hex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, '0')).join('')
const issue = (message: string) => ({ issues: [{ message }] })

export function definePay<P extends Product>(options: PayOptions<P>): Pay<P> {
  const catalog = (Array.isArray(options.catalog) ? options.catalog : Object.values(options.catalog)) as P[]
  const byId = new Map(catalog.map(p => [p.id, p]))
  const { store, urls, leeway = 3 * DAY } = options
  const userOf = options.user ?? (ctx => ctx?.user?.id)
  const slot = options.slot ?? (() => {
    // @ts-ignore a generated module, declared in .weft/slots.d.ts once bound
    return import('weft:slot/pay.rail')
  })
  let override: PayRail | undefined
  const rails = new Map<string, Promise<PayRail>>()

  async function railFor(key?: string): Promise<PayRail> {
    if (override) return override
    const { load, providers = {} } = await slot()
    const bound = Object.keys(providers).filter(k => providers[k])
    if (!bound.length) throw new PayError('P101', '`pay.rail` has no provider: add one to `plugins` in weft.config.ts', 500)
    const pick = key ?? options.rail ?? (bound.length === 1 ? bound[0] : undefined)
    if (!pick || !bound.includes(pick)) throw new PayError('PAY022', pick ? `no rail \`${pick}\` is bound (${bound.join(', ')})` : `${bound.join(' and ')} are both bound: set \`rail\` in \`definePay\``, 500)
    let r = rails.get(pick)
    if (!r) rails.set(pick, (r = load(pick) as Promise<PayRail>))
    return r
  }

  function lineOf(input: CheckoutInput<P>): CheckoutLine {
    const p = byId.get(input.product)
    if (!p) throw new PayError('PAY021', `no product \`${input.product}\``, 404)
    const subscription = p.kind === 'subscription'
    const name = subscription ? input.plan ?? Object.keys(p.plans!)[0] : undefined
    const row = (subscription ? p.plans![name as keyof typeof p.plans] : p.price) as Plan | undefined
    if (!row) throw new PayError('PAY021', `\`${p.id}\` has no plan \`${input.plan}\``, 404)
    const currency = input.currency ?? Object.keys(row).find(k => k !== 'trialDays' && k !== 'interval')!
    const amount = row[currency]
    if (typeof amount !== 'number') throw new PayError('PAY021', `\`${p.id}\` has no ${currency} price`, 404)
    return {
      product: p.id, name: p.name ?? p.id, amount, currency, mode: subscription ? 'subscription' : 'payment', quantity: subscription ? 1 : input.quantity ?? 1,
      ...(subscription ? { plan: name, interval: (row.interval ?? name) as Interval, ...(row.trialDays ? { trialDays: row.trialDays } : {}) } : {}),
      ...(p.shipping ? { shipping: true } : {}),
    }
  }

  const live = (p: Purchase) => ACCESS.has(p.state) && (p.expires === null || Date.now() < p.expires + leeway)

  async function granted(user: string) {
    const out = new Set<string>()
    for (const p of await store.byUser(user)) if (live(p)) for (const g of byId.get(p.product!)?.grants ?? []) out.add(g)
    return [...out].sort()
  }

  const entitlements = (user: string | null | undefined): Entitlements => {
    let list: Promise<string[]> | undefined
    const read = () => (list ??= user ? granted(user) : Promise.resolve([]))
    return { has: id => read().then(l => l.includes(id)), list: read }
  }

  /** One event onto its purchase. Identity always merges; state moves only forward on the rail's clock. */
  async function apply(rail: string, e: RailEvent, report?: PayReport): Promise<string | null> {
    const id = `${rail}:${e.purchase}`
    const had = await store.purchase(id)
    const newer = !had || e.at > had.at || (e.at === had.at && (!FINAL.has(had.state) || FINAL.has(e.state)))
    const next: Purchase = {
      id, rail,
      user: had?.user ?? e.user ?? null, product: had?.product ?? e.product ?? null, plan: e.plan ?? had?.plan ?? null, customer: e.customer ?? had?.customer ?? null,
      state: newer ? e.state : had.state, at: newer ? e.at : had.at, expires: newer ? e.expires ?? had?.expires ?? null : had.expires,
    }
    await store.save(next)
    if (next.product && !byId.has(next.product)) report?.({ code: 'PAY021', severity: 'warning', message: `purchase \`${id}\` is for \`${next.product}\`, which isn't in the catalog: it grants nothing` })
    return next.user && entitlementTag(next.user)
  }

  async function ingest(rail: string, events: RailEvent[], report?: PayReport) {
    const tags = new Set<string>()
    for (const e of events) {
      const key = `${rail}:${e.id}`
      if (await store.seen(key)) continue
      const tag = await apply(rail, e, report)
      await store.mark(key, e.at)
      if (tag) tags.add(tag)
    }
    return [...tags]
  }

  const pay: Pay<P> = {
    catalog,
    input: {
      '~standard': {
        version: 1,
        vendor: 'weft',
        validate(v: any) {
          if (!v || typeof v !== 'object' || typeof v.product !== 'string') return issue('`product` is required')
          const p = byId.get(v.product)
          if (!p) return issue(`no product \`${v.product}\``)
          if (v.plan !== undefined && (typeof v.plan !== 'string' || !p.plans || !(v.plan in p.plans))) return issue(`\`${p.id}\` has no plan \`${v.plan}\``)
          if (v.currency !== undefined && typeof v.currency !== 'string') return issue('`currency` is a string')
          if (v.quantity !== undefined && !(Number.isInteger(v.quantity) && v.quantity > 0 && v.quantity < 1000)) return issue('`quantity` is a whole number under 1000')
          return { value: { product: v.product, ...(v.plan !== undefined && { plan: v.plan }), ...(v.currency !== undefined && { currency: v.currency }), ...(v.quantity !== undefined && { quantity: v.quantity }) } }
        },
      },
    },
    async checkout(ctx, input) {
      const user = userOf(ctx)
      if (!user) throw new PayError('PAY010', 'Sign in before buying: a purchase has to belong to someone', 401)
      const line = lineOf(input)
      const rail = await railFor()
      const mine = await store.byUser(user)
      if (line.mode === 'subscription' && mine.some(p => p.product === line.product && live(p))) throw new PayError('PAY023', `You already have \`${line.product}\``, 409)
      const origin = options.origin ?? new URL(ctx.request.url).origin
      const customer = mine.find(p => p.customer && p.rail === rail.id)?.customer ?? undefined
      const idempotencyKey = await hex(JSON.stringify([user, line, Math.floor(Date.now() / 60_000)]))
      const { url } = await rail.checkout({ user, ...(customer && { customer }), line, successUrl: new URL(urls.success, origin).href, cancelUrl: new URL(urls.cancel, origin).href, idempotencyKey })
      return url
    },
    async portal(ctx) {
      const user = userOf(ctx)
      if (!user) throw new PayError('PAY010', 'Sign in first', 401)
      const rail = await railFor()
      const customer = (await store.byUser(user)).find(p => p.customer && p.rail === rail.id)?.customer
      if (!customer) throw new PayError('PAY024', 'Nothing to manage yet: this user has bought nothing here', 404)
      const origin = options.origin ?? new URL(ctx.request.url).origin
      return (await rail.portal({ customer, returnUrl: new URL(urls.portal ?? urls.cancel, origin).href })).url
    },
    entitlements,
    forContext: ctx => entitlements(userOf(ctx)),
    purchases: user => store.byUser(user),
    ingest,
    async webhook(key, request, report) {
      const plain = (body: string, status: number) => ({ response: new Response(body, { status, headers: { 'content-type': 'text/plain' } }), tags: [] })
      if (request.method !== 'POST') return plain('Method not allowed', 405)
      let rail: PayRail
      try { rail = await railFor(key) } catch { return plain('Not found', 404) }
      if (Number(request.headers.get('content-length') ?? 0) > BODY) return plain('Too large', 413)
      const body = await request.text() // the exact bytes: a parsed and re-encoded body can't be verified
      if (body.length > BODY) return plain('Too large', 413)
      let events: RailEvent[]
      try {
        events = await rail.verify({ body, headers: request.headers })
      } catch (e: any) {
        // A retry can't fix this one, and the reason stays in the log: a forger learns nothing.
        report?.({ code: e?.code ?? 'PAY011', severity: 'error', message: `a ${key} webhook failed verification: ${e?.message ?? e}` })
        return plain('Bad signature', 400)
      }
      try {
        return { response: new Response('{"received":true}', { headers: { 'content-type': 'application/json' } }), tags: await ingest(rail.id, events, report) }
      } catch (e: any) {
        report?.({ code: 'E_PAY', severity: 'error', message: `a ${key} webhook failed, and it will be redelivered: ${e?.message ?? e}` })
        return plain('Try again', 500)
      }
    },
    async refund(id) {
      const p = await store.purchase(id)
      if (!p) throw new PayError('PAY024', `no purchase \`${id}\``, 404)
      const rail = await railFor(p.rail)
      if (!rail.refund) throw new PayError('PAY022', `\`${rail.id}\` can't refund from here`, 501)
      await rail.refund({ purchase: id.slice(p.rail.length + 1) })
    },
    use(rail) { override = rail },
    reset() {
      override = undefined
      ;(store as { clear?(): void }).clear?.()
    },

    // ---- what makes this a `server.extension` ---------------------------------------------------------------------
    async handle(request, path, api) {
      const { response, tags } = await pay.webhook(path, request, api.report)
      await api.invalidate(tags)
      return response
    },
    context: ctx => ({ entitlements: pay.forContext(ctx) }),
    async guard(fn, ctx) {
      for (const id of fn.def.requires ?? []) if (!(await ctx.entitlements.has(id))) throw new PayError('ENTITLEMENT_REQUIRED', `This needs \`${id}\``, 403)
    },
    options: ['requires'],
    personal: ['entitlements'],
    check(dev) {
      if (store.memory && !dev) throw new PayError('PAY016', 'The ledger is in memory: every purchase is gone on the next deploy. Pass a durable `store` to `definePay`', 500)
    },
  }
  return pay
}

/** The `server.extension` provider: `src/pay.server.ts` already built it, so this hands it over. */
export const extension = (app: Pay<any>): ServerExtension => app

export type { PayRail, RailEvent } from './index'
