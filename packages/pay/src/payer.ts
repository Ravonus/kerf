// Who paid, read off a rail's payment: for an app matching a buyer to its own customers. Every field is optional, and
// a field the rail left empty is left out.
import type { Payer } from './index'

type Maybe<T> = T | null | undefined
type Card = NonNullable<Payer['card']>

/** A payer holding only what the rail knew, or undefined when it knew nothing. */
export function payerFrom(p: {
  email?: Maybe<string>
  name?: Maybe<string>
  phone?: Maybe<string>
  card?: Maybe<{ [K in keyof Card]?: Maybe<Card[K]> }>
}): Payer | undefined {
  const card: Card = {}
  for (const [k, v] of Object.entries(p.card ?? {})) if (v) Object.assign(card, { [k]: v })
  const out: Payer = {}
  if (p.email) out.email = p.email
  if (p.name) out.name = p.name
  if (p.phone) out.phone = p.phone
  if (Object.keys(card).length) out.card = card
  return Object.keys(out).length ? out : undefined
}

interface StripeCharge {
  billing_details?: { email?: string | null; name?: string | null; phone?: string | null } | null
  payment_method_details?: {
    card?: {
      fingerprint?: string
      brand?: string
      last4?: string
      exp_month?: number
      exp_year?: number
    } | null
  } | null
}

/** A paid Checkout session's payer: its customer details, then the card off the payment's charge. A failed read leaves
 *  the card out rather than the event: the order is paid either way. */
export async function stripePayer(
  details:
    | { email?: string | null; name?: string | null; phone?: string | null }
    | null
    | undefined,
  intent: string,
  get: (path: string) => Promise<unknown>,
): Promise<Payer | undefined> {
  let charge: StripeCharge | null = null
  try {
    const pi = (await get(
      `/v1/payment_intents/${encodeURIComponent(intent)}?expand[]=latest_charge`,
    )) as { latest_charge?: StripeCharge | string | null } | null
    if (pi && typeof pi.latest_charge === 'object') charge = pi.latest_charge
  } catch {
    // the card is a nicety; the payment is the fact
  }
  const b = charge?.billing_details
  const c = charge?.payment_method_details?.card
  return payerFrom({
    email: details?.email ?? b?.email,
    name: details?.name ?? b?.name,
    phone: details?.phone ?? b?.phone,
    card: c && {
      fingerprint: c.fingerprint,
      brand: c.brand,
      last4: c.last4,
      expMonth: c.exp_month,
      expYear: c.exp_year,
    },
  })
}
