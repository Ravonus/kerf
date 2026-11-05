import { PayError, type CheckoutLine, type Interval, type Plan, type Product } from '../index'
import type { CheckoutInput, Pay } from '../server'

const issue = (message: string) => ({ issues: [{ message }] })

/** Resolve a checkout line from the catalog. */
export function lineOf<P extends Product>(
  byId: Map<string, P>,
  input: CheckoutInput<P>,
): CheckoutLine {
  const p = byId.get(input.product)
  if (!p) throw new PayError('PAY021', `no product \`${input.product}\``, 404)
  const subscription = p.kind === 'subscription'
  const name = subscription ? (input.plan ?? Object.keys(p.plans!)[0]) : undefined
  const row: Plan | undefined = subscription ? p.plans![name as keyof typeof p.plans] : p.price
  if (!row) throw new PayError('PAY021', `\`${p.id}\` has no plan \`${input.plan}\``, 404)
  const currency =
    input.currency ?? Object.keys(row).find((k) => k !== 'trialDays' && k !== 'interval')!
  const amount = row[currency]
  if (typeof amount !== 'number')
    throw new PayError('PAY021', `\`${p.id}\` has no ${currency} price`, 404)
  return {
    product: p.id,
    name: p.name ?? p.id,
    amount,
    currency,
    mode: subscription ? 'subscription' : 'payment',
    quantity: subscription ? 1 : (input.quantity ?? 1),
    ...(subscription
      ? {
          plan: name!,
          interval: (row.interval ?? name) as Interval,
          ...(row.trialDays ? { trialDays: row.trialDays } : {}),
        }
      : {}),
    ...(p.shipping ? { shipping: true } : {}),
  }
}

/** Validate checkout input against this catalog. */
export function checkoutInput<P extends Product>(byId: Map<string, P>): Pay<P>['input'] {
  return {
    '~standard': {
      version: 1,
      vendor: 'weft',
      validate(v: unknown) {
        const { product, plan, currency, quantity } = (
          v && typeof v === 'object' ? v : {}
        ) as Partial<Record<keyof CheckoutInput, unknown>>
        if (typeof product !== 'string') return issue('`product` is required')
        const p = byId.get(product)
        if (!p) return issue(`no product \`${product}\``)
        if (plan !== undefined && (typeof plan !== 'string' || !p.plans || !(plan in p.plans)))
          return issue(
            `\`${p.id}\` has no plan \`${typeof plan === 'string' ? plan : JSON.stringify(plan)}\``,
          )
        if (currency !== undefined && typeof currency !== 'string')
          return issue('`currency` is a string')
        if (
          quantity !== undefined &&
          !(
            typeof quantity === 'number' &&
            Number.isInteger(quantity) &&
            quantity > 0 &&
            quantity < 1000
          )
        )
          return issue('`quantity` is a whole number under 1000')
        return {
          value: {
            product,
            ...(plan !== undefined && { plan }),
            ...(currency !== undefined && { currency }),
            ...(quantity !== undefined && { quantity }),
          },
        }
      },
    },
  }
}
