// Delivery is at least once, in any order. An event applies by the rail's own clock, so an old one changes nothing and a
// repeat lands on what it already wrote; `mark` comes last, because a crash before it should redeliver. A failure answers
// 500 for the same reason. A terminal state wins a tie: a refund and a renewal in the same second is a refund.

import type { Context } from '@weft-js/start'
import { makeRails } from './server/rails'
import { makeLedger, ORDER } from './server/ledger'
import { checkoutInput } from './server/catalog'
import { checkoutFor, orderFor, portalFor, webhookFor } from './server/operations'
import type { ServerExtension } from '@weft-js/start/extension'
import {
  PayError,
  type Payer,
  type PayRail,
  type Product,
  type PurchaseState,
  type RailEvent,
} from './index'

declare module '@weft-js/start' {
  interface Context {
    /** What this user holds, from verified rail events. Await it. */
    entitlements: Entitlements
  }
  interface FnOptions {
    /** Entitlements this call needs, on the server: a typed 403 otherwise. */
    requires?: readonly string[]
  }
}

/** One row of the ledger: where a purchase stands now, whatever rail it came through. */
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

/** Where the ledger lives. `drizzlePayStore` in `@weft-js/start/pay/drizzle`, or write these five for any database. */
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

/** A ledger in memory, for dev and tests: `clear` empties it. */
export function memoryPayStore(): PayStore & { clear(): void } {
  const events = new Set<string>()
  const rows = new Map<string, Purchase>()
  return {
    memory: true,
    seen: (e) => Promise.resolve(events.has(e)),
    mark(e) {
      events.add(e)
      return Promise.resolve()
    },
    purchase: (id) => Promise.resolve(rows.get(id) ?? null),
    save(p) {
      rows.set(p.id, p)
      return Promise.resolve()
    },
    byUser: (user) => Promise.resolve([...rows.values()].filter((p) => p.user === user)),
    clear() {
      events.clear()
      rows.clear()
    },
  }
}

/** What one user holds, from the ledger and the catalog. */
export interface Entitlements {
  /** Await it: a promise is always truthy (PAY015). */
  has(id: string): Promise<boolean>
  list(): Promise<string[]>
}

/** What pay reads of `ctx`: the request's URL, and what `user` reads, `user.id` by default. A real `ctx` fits, and so does a test's. */
export type PayContext = Partial<Omit<Context, 'request'>> & {
  request: { url: string }
  user?: { id?: string | null } | null
}

/** What `definePay` takes. */
export interface PayOptions<P extends Product> {
  /** `import * as catalog from './pay/catalog'`, or a list. */
  catalog: readonly P[] | Record<string, P>
  store: PayStore
  /** Paths or URLs a buyer comes back to. They never come from the client. `order` and `orderCancel` may hold `{ref}`. */
  urls: { success: string; cancel: string; portal?: string; order?: string; orderCancel?: string }
  /** Hears each state an order (`pay.order`) moves to, from verified events only: mark it paid here. A throw redelivers. */
  onOrder?: OrderHook
  /** Who a request is. Default `ctx.user?.id`. */
  user?: (ctx: PayContext) => string | null | undefined
  /** With several rails bound, the one that takes payments. One rail needs no choosing. */
  rail?: string
  /** The `pay.rail` slot. Default the generated `weft:slot/pay.rail`, as any consumer of a slot reads it. */
  slot?: () => Promise<{ load(key: string): Promise<unknown>; providers?: Record<string, unknown> }>
  /** Absolute origin for `urls`, behind a proxy. Default the request's. */
  origin?: string
  /** How long past a paid period access lasts, while a late renewal event arrives. Default 3 days. */
  leeway?: number
}

/** The server log: @weft-js/start passes its own. */
export type PayReport = (d: { code: string; severity: string; message: string }) => void

/** What a client may ask for: names only. The catalog supplies every amount. */
export interface CheckoutInput<P extends Product = Product> {
  product: P['id']
  plan?: string
  currency?: string
  quantity?: number
}

/** One line of an order, priced by the app on the server: never from the client. */
export interface OrderLine {
  name: string
  /** Whole minor units, each. */
  amount: number
  quantity?: number
}

/** What `pay.order` takes: the app's own order id and the lines it priced. */
export interface OrderInput {
  /** The app's order id, 1–64 of `A-Z a-z 0-9 - _`. It comes back in `onOrder` and in `orderTag(ref)`. */
  ref: string
  lines: readonly OrderLine[]
  /** Lowercase ISO. Default `usd`. */
  currency?: string
  /** What the ledger's one line is called. Default `Order <ref>`. */
  title?: string
  /** A guest's email, for the rail's receipt. */
  email?: string
}

/** `onOrder`: an order's new state, and its row in the ledger. */
export type OrderHook = (order: {
  ref: string
  state: PurchaseState
  purchase: Purchase
  /** Who paid, when the rail says: email, name, phone and the card's brand, last four and fingerprint. */
  payer?: Payer
}) => Promise<void> | void

/** What `definePay` returns: the ledger's calls, and a `server.extension` that carries them to the server. */
export interface Pay<P extends Product = Product> extends ServerExtension {
  readonly catalog: readonly P[]
  /** For a mutation's `input`: the catalog decides what can be bought, and the client sends only names. */
  readonly input: {
    readonly '~standard': {
      version: 1
      vendor: 'weft'
      validate(v: unknown): { value: CheckoutInput<P> } | { issues: { message: string }[] }
      types?: { input: CheckoutInput<P>; output: CheckoutInput<P> }
    }
  }
  /** The hosted checkout's URL, for this buyer. Grants nothing. */
  checkout(ctx: PayContext, input: CheckoutInput<P>): Promise<string>
  /** The hosted page for one order the app priced, signed in or a guest. Pays nothing until `onOrder` hears `active`. */
  order(ctx: PayContext, input: OrderInput): Promise<string>
  /** Where this buyer manages or cancels. */
  portal(ctx: PayContext): Promise<string>
  /** Read for a user id, as a webhook or a job would. In a request, `ctx.entitlements`. */
  entitlements(user: string): Entitlements
  /** `ctx.entitlements` for this context. */
  forContext(ctx: PayContext): Entitlements
  purchases(user: string): Promise<Purchase[]>
  /** One verified delivery. `tags` go on to the app's live readers. */
  webhook(
    rail: string,
    request: Request,
    report?: PayReport,
  ): Promise<{ response: Response; tags: string[] }>
  /** Apply events that have been verified. Anything else must go through `webhook`. */
  ingest(rail: string, events: RailEvent[], report?: PayReport): Promise<string[]>
  refund(purchase: string): Promise<void>
  /** Whether the rail takes test payments, for a "test mode" banner. False when it can't tell. */
  sandbox(rail?: string): Promise<boolean>
  /** A rail in place of the slot: `fakePay`. */
  use(rail: PayRail | undefined): void
  /** Back to the slot, with an empty ledger if it can be emptied: `net.extension` calls this after each test. */
  reset(): void
}

const DAY = 86_400_000

/** The one ledger of an app: `src/pay.server.ts` default-exports what this returns. */
export function definePay<P extends Product>(options: PayOptions<P>): Pay<P> {
  const catalog = (
    Array.isArray(options.catalog) ? options.catalog : Object.values(options.catalog)
  ) as P[]
  const byId = new Map(catalog.map((p) => [p.id, p]))
  if (byId.has(ORDER))
    throw new PayError(
      'PAY021',
      `\`${ORDER}\` is the id \`pay.order\` records under: name the product something else`,
    )
  const { store, urls, leeway = 3 * DAY } = options
  const userOf = options.user ?? ((ctx) => ctx?.user?.id)
  const slot =
    options.slot ??
    (() => {
      // A generated module, declared in .weft/slots.d.ts only once bound: an expect-error would be wrong in one case or the other.
      // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- the cast is what lets this compile when the slot isn't declared
      return import('weft:slot/pay.rail' as string)
    })
  const rails = makeRails(options, slot)
  const { railFor } = rails

  const { live, entitlements, ingest } = makeLedger(store, byId, leeway, options.onOrder)

  const pay: Pay<P> = {
    catalog,
    input: checkoutInput(byId),
    checkout: checkoutFor({ options, urls, userOf, store, railFor, live, byId }),
    order: orderFor({ options, urls, userOf, store, railFor, live, byId }),
    portal: portalFor({ options, urls, userOf, store, railFor, live, byId }),
    entitlements,
    forContext: (ctx) => entitlements(userOf(ctx)),
    purchases: (user) => store.byUser(user),
    ingest,
    webhook: webhookFor(railFor, ingest),
    async refund(id) {
      const p = await store.purchase(id)
      if (!p) throw new PayError('PAY024', `no purchase \`${id}\``, 404)
      const rail = await railFor(p.rail)
      if (!rail.refund) throw new PayError('PAY022', `\`${rail.id}\` can't refund from here`, 501)
      await rail.refund({ purchase: id.slice(p.rail.length + 1) })
    },
    async sandbox(key) {
      return (await railFor(key)).sandbox === true
    },
    use(rail) {
      rails.use(rail)
    },
    reset() {
      rails.use(undefined)
      ;(store as { clear?(): void }).clear?.()
    },

    // ---- what makes this a `server.extension` ---------------------------------------------------------------------
    async handle(request, path, api) {
      const { response, tags } = await pay.webhook(path, request, (d) => api.report(d))
      await api.invalidate(tags)
      return response
    },
    context: (ctx) => ({ entitlements: pay.forContext(ctx) }),
    async guard(fn, ctx) {
      for (const id of (fn.def.requires as readonly string[] | undefined) ?? [])
        if (!(await ctx.entitlements.has(id)))
          throw new PayError('ENTITLEMENT_REQUIRED', `This needs \`${id}\``, 403)
    },
    options: ['requires'],
    personal: ['entitlements'],
    check(dev) {
      if (store.memory && !dev)
        throw new PayError(
          'PAY016',
          'The ledger is in memory: every purchase is gone on the next deploy. Pass a durable `store` to `definePay`',
          500,
        )
    },
  }
  return pay
}

/** The `server.extension` provider: `src/pay.server.ts` already built it, so this hands it over. */
export const extension = (app: Pay): ServerExtension => app

export type { Payer, PayRail, RailEvent } from './index'
