# Payments

`weft add pay` needs a database and auth. It adds the Stripe rail to `plugins` and writes `src/pay/catalog.ts`,
`src/pay.server.ts` and `src/server/pay.ts`, plus `src/db/pay.schema.ts` and placeholder keys. The keys go in `.env`
with real test values before you run it. Nothing is called until a user checks out.

App code names products, never a rail:

```tsx
// src/pay/catalog.ts: reaches the client, so names and amounts only
export const pro = product({ id: 'pro', kind: 'subscription', use: 'digital',
  plans: { month: { usd: 999 }, year: { usd: 7999, trialDays: 7 } }, grants: ['pro'] })

// a page
import { price } from 'weft/pay'
import { pro } from '#/pay/catalog'
import { checkout, entitlements, portal } from '#/server/pay'

const mine = entitlements.live()
<button onClick={() => checkout({ product: 'pro', plan: 'year' })}>Go Pro · {price(pro, 'year').display}</button>
<button onClick={() => portal()}>Manage</button>
{mine.value?.includes('pro') && <Dashboard />}
```

`kind` is `subscription` (with `plans`), `one-time` or `consumable` (with `price`). Amounts are whole minor units with a
currency (PAY008). `price(p, plan)` formats by the currency's exponent, for the reader's locale.

**A grant comes only from a verified event.** `checkout` goes to the rail's hosted page and grants nothing (PAY004). The
rail then posts `/_weft/pay/<rail>`, which is the URL to give it, and `/_weft/pay/stripe` for Stripe. Each delivery is
verified on the exact bytes, applied to `purchases`, and pokes `entitlements:<user>`, so a `.live()` reader updates.
Delivery is at least once and in any order: a repeat is a no-op, and an old event changes nothing, by the rail's own clock.
A bad signature answers 400; a failure answers 500, so the rail delivers it again.

**Enforce on the server.** What the client shows is decoration (PAY013):

```ts
export const report = query({ auth: 'user', requires: ['pro'], run: … })     // a typed 403: ENTITLEMENT_REQUIRED
if (!(await ctx.entitlements.has('pro'))) redirect('/pricing')               // await it (PAY015)
```

`ctx.entitlements` has `has(id)` and `list()`, and works in any `query`, `mutation` or `load`. A query with `cache: { life }`
needs `scope: 'user'` to read it. A query's `tags` can take `ctx`, which is how one user's tag is written.

States are the same on every rail: `active`, `trial` and `grace` give access; `pending`, `billing-retry`, `paused`,
`expired`, `refunded` and `revoked` don't. Access also ends `leeway` (3 days) after a paid period, if no renewal came.

`definePay({ catalog, store, urls, user?, rail?, origin?, leeway? })`. `urls` are where a buyer returns, never from the
client. `pay.checkout(ctx, input)`, `pay.portal(ctx)`, `pay.entitlements(userId)`, `pay.purchases(userId)` and
`pay.refund(purchaseId)` are server calls. `store` is `drizzlePayStore(db, { purchases, payEvents })` from
`@weft/start/pay/drizzle`, or five methods of your own (`PayStore`). `memoryPayStore()` is for tests: a production server
refuses it (PAY016).

**Another provider is one setting.** Replace `stripe()` in `plugins` with any plugin for the `pay.rail` slot; nothing else
changes. A rail implements `PayRail` from `weft/pay`: `checkout`, `portal`, `verify`, optionally `refund`, declared for the
`server` side, and passes `payRailSuite` from `weft/test/plugins`. `verify` gets the exact body and throws
`PayError('PAY011', …)` for anything it can't prove. An app with no `src/pay.server.ts` has no route and no code from any
of this.

`stripe({ prices?, api?, apiVersion?, tolerance?, shippingCountries? })`. It reads `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` from the server env, and never takes a key in options, which land in a generated file (PAY003).
`prices` maps `'pro.month'` to a Stripe Price id; without it, amounts come from the catalog. Subscribe the webhook to
`customer.subscription.*`, `checkout.session.*`, `charge.refunded` and `charge.dispute.*`. No page loads Stripe.js.

## Testing

`fakePay` from `weft/test` is a rail with no key and no network. Its events are signed and go through your own webhook and
ledger, so a test sees what a user would:

```tsx
const fake = fakePay(pay)                     // your `definePay`, or fakePay({ catalog })
net.context({ user: { id: 'u1' } })
render(Paywall)
await user.click(screen.getByRole('button', { name: /Go Pro/ }))
await fake.complete()                          // the buyer finishes the hosted page
expect(screen.getByLabelText('plan').textContent).toBe('Pro')
await fake.simulate('renewal-failed')          // renewal, recovered, grace-expired, cancel, pause, resume, refund, revoke
```

`fake.buy(user, product, plan)` skips the page. `renewal` and `renewal-failed` move `clock` to the period's end when it's
installed. `fake.redeliver()`, `fake.deliver(event, { forged: true })`, `fake.deliveries`, `fake.sessions`,
`fake.entitlements(user)`.

## Diagnostics

| Code | Catches |
|---|---|
| PAY003 | A key in the source, or a server secret in client code |
| PAY004 | Paid state written on the client after `checkout()` |
| PAY005 | A price typed into a page that sells something (warning) |
| PAY008 | A float or a currency-less amount in `product()` |
| PAY010 | A checkout mutation without `auth: 'user'` |
| PAY011 | A webhook left unverified, or no `STRIPE_WEBHOOK_SECRET` |
| PAY012 | A rail's price or product id in client code |
| PAY013 | An entitlement checked only on the client |
| PAY014 | A rail bound with no `src/pay.server.ts` |
| PAY015 | `ctx.entitlements.has()` tested without `await` |
| PAY016 | `memoryPayStore()` in `src/pay.server.ts` (warning) |
| T030 | A live key in a test |

At run time: PAY021 (not in the catalog), PAY022 (no rail chosen), PAY023 (already subscribed, 409), PAY024 (nothing to
manage or refund), PAY030 (the rail refused). Native rails, store policy and `weft pay sync` aren't built.
