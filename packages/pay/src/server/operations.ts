import { PayError, type PayRail, type Product, type RailEvent } from '../index'
import type {
  CheckoutInput,
  PayContext,
  PayOptions,
  PayReport,
  PayStore,
  Purchase,
} from '../server'
import { lineOf } from './catalog'

const BODY = 1 << 20
const hex = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
const errorMessage = (e: unknown) => String((e as Error | null)?.message ?? e)

type Services<P extends Product> = {
  options: PayOptions<P>
  urls: PayOptions<P>['urls']
  userOf: (ctx: PayContext) => string | null | undefined
  store: PayStore
  railFor: (key?: string) => Promise<PayRail>
  live: (purchase: Purchase) => boolean
  byId: Map<string, P>
}

/** Create the checkout operation for this pay instance. */
export function checkoutFor<P extends Product>({
  options,
  urls,
  userOf,
  store,
  railFor,
  live,
  byId,
}: Services<P>) {
  async function checkout(ctx: PayContext, input: CheckoutInput<P>) {
    const user = userOf(ctx)
    if (!user)
      throw new PayError(
        'PAY010',
        'Sign in before buying: a purchase has to belong to someone',
        401,
      )
    const line = lineOf(byId, input)
    const rail = await railFor()
    const mine = await store.byUser(user)
    if (line.mode === 'subscription' && mine.some((p) => p.product === line.product && live(p)))
      throw new PayError('PAY023', `You already have \`${line.product}\``, 409)
    const origin = options.origin ?? new URL(ctx.request.url).origin
    const customer = mine.find((p) => p.customer && p.rail === rail.id)?.customer ?? undefined
    const idempotencyKey = await hex(JSON.stringify([user, line, Math.floor(Date.now() / 60_000)]))
    const { url } = await rail.checkout({
      user,
      ...(customer && { customer }),
      line,
      successUrl: new URL(urls.success, origin).href,
      cancelUrl: new URL(urls.cancel, origin).href,
      idempotencyKey,
    })
    return url
  }
  return checkout
}

/** Create the portal operation for this pay instance. */
export function portalFor<P extends Product>({
  options,
  urls,
  userOf,
  store,
  railFor,
}: Services<P>) {
  async function portal(ctx: PayContext) {
    const user = userOf(ctx)
    if (!user) throw new PayError('PAY010', 'Sign in first', 401)
    const rail = await railFor()
    const customer = (await store.byUser(user)).find(
      (p) => p.customer && p.rail === rail.id,
    )?.customer
    if (!customer)
      throw new PayError('PAY024', 'Nothing to manage yet: this user has bought nothing here', 404)
    const origin = options.origin ?? new URL(ctx.request.url).origin
    return (
      await rail.portal({ customer, returnUrl: new URL(urls.portal ?? urls.cancel, origin).href })
    ).url
  }
  return portal
}

/** Create the verified delivery operation for this pay instance. */
export function webhookFor(
  railFor: (key?: string) => Promise<PayRail>,
  ingest: (rail: string, events: RailEvent[], report?: PayReport) => Promise<string[]>,
) {
  async function webhook(key: string, request: Request, report?: PayReport) {
    const plain = (body: string, status: number) => ({
      response: new Response(body, { status, headers: { 'content-type': 'text/plain' } }),
      tags: [],
    })
    if (request.method !== 'POST') return plain('Method not allowed', 405)
    let rail: PayRail
    try {
      rail = await railFor(key)
    } catch {
      return plain('Not found', 404)
    }
    if (Number(request.headers.get('content-length') ?? 0) > BODY) return plain('Too large', 413)
    const body = await request.text() // the exact bytes: a parsed and re-encoded body can't be verified
    if (body.length > BODY) return plain('Too large', 413)
    let events: RailEvent[]
    try {
      events = await rail.verify({ body, headers: request.headers })
    } catch (e) {
      // A retry can't fix this one, and the reason stays in the log: a forger learns nothing.
      report?.({
        code: (e as { code?: string } | null)?.code ?? 'PAY011',
        severity: 'error',
        message: `a ${key} webhook failed verification: ${errorMessage(e)}`,
      })
      return plain('Bad signature', 400)
    }
    try {
      return {
        response: new Response('{"received":true}', {
          headers: { 'content-type': 'application/json' },
        }),
        tags: await ingest(rail.id, events, report),
      }
    } catch (e) {
      report?.({
        code: 'E_PAY',
        severity: 'error',
        message: `a ${key} webhook failed, and it will be redelivered: ${errorMessage(e)}`,
      })
      return plain('Try again', 500)
    }
  }
  return webhook
}
