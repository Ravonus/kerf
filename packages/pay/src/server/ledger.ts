import { entitlementTag, type Product, type PurchaseState, type RailEvent } from '../index'
import type { Entitlements, PayReport, PayStore, Purchase } from '../server'

const ACCESS: ReadonlySet<PurchaseState> = new Set(['active', 'trial', 'grace'])
const FINAL: ReadonlySet<PurchaseState> = new Set(['refunded', 'revoked'])

/** Derive access and apply verified events against one store. */
export function makeLedger<P extends Product>(
  store: PayStore,
  byId: Map<string, P>,
  leeway: number,
) {
  const live = (p: Purchase) =>
    ACCESS.has(p.state) && (p.expires === null || Date.now() < p.expires + leeway)

  async function granted(user: string) {
    const out = new Set<string>()
    for (const p of await store.byUser(user))
      if (live(p)) for (const g of byId.get(p.product!)?.grants ?? []) out.add(g)
    return [...out].sort()
  }

  const entitlements = (user: string | null | undefined): Entitlements => {
    let list: Promise<string[]> | undefined
    const read = () => (list ??= user ? granted(user) : Promise.resolve([]))
    return { has: (id) => read().then((l) => l.includes(id)), list: read }
  }

  /** One event onto its purchase. Identity always merges; state moves only forward on the rail's clock. */
  async function apply(rail: string, e: RailEvent, report?: PayReport): Promise<string | null> {
    const id = `${rail}:${e.purchase}`
    const had = await store.purchase(id)
    const newer =
      !had || e.at > had.at || (e.at === had.at && (!FINAL.has(had.state) || FINAL.has(e.state)))
    const next: Purchase = {
      id,
      rail,
      user: had?.user ?? e.user ?? null,
      product: had?.product ?? e.product ?? null,
      plan: e.plan ?? had?.plan ?? null,
      customer: e.customer ?? had?.customer ?? null,
      state: newer ? e.state : had.state,
      at: newer ? e.at : had.at,
      expires: newer ? (e.expires ?? had?.expires ?? null) : had.expires,
    }
    await store.save(next)
    if (next.product && !byId.has(next.product))
      report?.({
        code: 'PAY021',
        severity: 'warning',
        message: `purchase \`${id}\` is for \`${next.product}\`, which isn't in the catalog: it grants nothing`,
      })
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

  return { live, entitlements, ingest }
}
