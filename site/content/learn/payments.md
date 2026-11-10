# Payments

:::learn
- How to add payments with `weft add pay`, and what it writes
- How to describe what you sell in a catalog, in whole minor units
- Why `checkout` grants nothing, and how a verified webhook does
- How to enforce access on the server with `requires` and `ctx.entitlements`
- How to test the whole flow with test keys and `fakePay`, with no network
:::

Selling something is mostly bookkeeping that's easy to get subtly wrong. A price typed as `9.99` rounds badly. A button
that marks the user as paid when they click it gives Pro to anyone who opens the console. A webhook handler that doesn't
check signatures accepts forged events, and one that isn't idempotent grants twice when the provider retries.

Weft's answer is a plugin, `@weft-js/pay`. It's a plugin in the plain sense: nothing in Weft names it, and an app that
doesn't use it carries none of its code. It owns one ledger of purchases, verifies every event from the payment
provider, and turns what's in the ledger into *entitlements*: short names like `'pro'` that your server functions check.
The provider is a *rail*, and today's rail is Stripe.

:::demo server-paywall

## Adding payments

Payments need a database and sign-in, so add those first ([Database](/learn/database), [Auth](/learn/auth)). Then:

```bash
weft add pay
```

That adds the Stripe rail to `plugins` and writes five files, which this page walks through:

| File | What it holds |
|---|---|
| `src/pay/catalog.ts` | What you sell. It reaches the client, so names and amounts only. |
| `src/pay.server.ts` | The ledger: `definePay({ … })`. Its webhook is served at `/_weft/x/pay/stripe`. |
| `src/server/pay.ts` | The server functions your pages call: `entitlements`, `checkout`, `portal`. |
| `src/db/pay.schema.ts` | The `purchases` and `pay_events` tables, re-exported from `src/db/schema.ts`. |
| `.env` | `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, as placeholders. |

Then run `weft db generate` for the two tables, put your Stripe *test* keys in `.env`, and give Stripe the webhook URL
`https://<your app>/_weft/x/pay/stripe`, subscribed to `customer.subscription.*`, `checkout.session.*`,
`charge.refunded` and `charge.dispute.*`. Nothing calls Stripe until a user checks out, and no page loads Stripe.js.

:::note Keys live in the server's environment
`stripe()` reads `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from the server's environment. Never pass a key in its
options or write one in source: options land in a generated file, so `weft check` refuses a key there (**PAY003**), and a
server secret read in client code is PAY003 too. A missing `STRIPE_WEBHOOK_SECRET` is **PAY011**.
:::

## What you sell: the catalog

App code names products, never a provider's ids. A product says how it's paid for, what it is, what it costs and which
entitlements it grants:

```ts
// src/pay/catalog.ts
import { product } from '@weft-js/pay'

export const pro = product({
  id: 'pro',
  kind: 'subscription',
  use: 'digital',
  name: 'Pro',
  plans: { month: { usd: 999 }, year: { usd: 7999, trialDays: 7 } },
  grants: ['pro'],
})

export const credits = product({
  id: 'credits',
  kind: 'consumable',
  use: 'digital',
  name: '100 credits',
  price: { usd: 500, eur: 450 },
})
```

- `kind` is `'subscription'` (priced per plan in `plans`), `'one-time'` or `'consumable'` (priced with `price`).
- `use` is `'digital'`, `'physical'` or `'service'`; `shipping: true` collects an address for physical goods.
- Amounts are whole minor units with a lowercase currency: `{ usd: 999 }` is $9.99, and JPY has no minor unit at all. A
  float or an amount with no currency is **PAY008**, both in `weft check` and when the module loads.
- A plan named `month` or `year` is its own interval; any other name needs `interval`.
- `grants` lists the entitlements a live purchase gives.

To show a price, never type it into the page (that's **PAY005**): ask the catalog. `price(product, plan)` formats it
for the reader's locale, by the currency's own number of decimals:

```tsx
import { price } from '@weft-js/pay'
import { pro } from '#/pay/catalog'

export function Plans() {
  const year = price(pro, 'year')
  return (
    <p>
      {price(pro, 'month').display} a month, or {year.display} a year
      {year.trialDays ? ` with ${year.trialDays} days free` : ''}
    </p>
  )
}
```

## The ledger and the server functions

`src/pay.server.ts` is the one ledger of the app. Here it is as `weft add pay` writes it for a Drizzle app:

```ts
// src/db/pay.schema.ts
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const purchases = sqliteTable('purchases', {
  id: text().primaryKey(),
  rail: text().notNull(),
  user: text(),
  product: text(),
  plan: text(),
  state: text().notNull(),
  at: integer().notNull(),
  expires: integer(),
  customer: text(),
})

export const payEvents = sqliteTable('pay_events', {
  id: text().primaryKey(),
  at: integer().notNull(),
})
```

```ts
// src/pay.server.ts
import { drizzlePayStore } from '@weft-js/pay/drizzle'
import { definePay } from '@weft-js/pay/server'
import { db } from '#/db/index.server'
import { payEvents, purchases } from '#/db/pay.schema'
import * as catalog from './pay/catalog'

export default definePay({
  catalog,
  store: drizzlePayStore(db, { purchases, payEvents }),
  urls: { success: '/', cancel: '/' },
})
```

(`weft add pay` imports the tables from `#/db/schema`, which re-exports them; either path works.)

`urls` are where a buyer comes back to after paying or giving up. They're set here, on the server, and never come from
the client. `definePay` also takes `leeway` (how long access lasts past a paid period while a late renewal arrives, 3
days by default), `origin` for absolute URLs behind a proxy, and `user` if your user id isn't `ctx.user.id`.

Pages don't import the ledger. They call three server functions:

```ts
// src/server/pay.ts
import { entitlementTag } from '@weft-js/pay'
import { mutation, query, redirect } from '@weft-js/start'
import pay from '../pay.server'

export const entitlements = query({
  auth: 'user',
  tags: (_, ctx) => [entitlementTag(ctx.user.id)],
  run: ({ ctx }) => ctx.entitlements.list(),
})

export const checkout = mutation({
  auth: 'user',
  input: pay.input,
  run: async ({ input, ctx }) =>
    redirect(await pay.checkout(ctx, input), 303),
})

export const portal = mutation({
  auth: 'user',
  run: async ({ ctx }) => redirect(await pay.portal(ctx), 303),
})
```

`pay.input` is a schema built from the catalog: the client may send a product id, a plan, a currency and a quantity,
and every amount comes from the catalog on the server. A checkout mutation without `auth: 'user'` is **PAY010**, because
a purchase has to belong to someone.

## Checkout grants nothing

Here's a pricing page. The buttons call the mutations, and what the page shows comes from `entitlements`:

```tsx
// src/routes/pricing.tsx
import { price } from '@weft-js/pay'
import type { Meta } from '@weft-js/start'
import { pro } from '#/pay/catalog'
import { checkout, entitlements, portal } from '#/server/pay'

export const meta: Meta = {
  title: 'Pricing',
  description: 'Pro unlocks reports and exports, ' +
    'billed monthly or yearly.',
}

export default function Pricing() {
  const mine = entitlements.live()
  return (
    <section>
      <h1>Pricing</h1>
      {mine.value?.includes('pro') ? (
        <>
          <p aria-label="plan">Pro</p>
          <button type="button" onClick={() => portal()}>
            Manage your plan
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => checkout({ product: 'pro', plan: 'year' })}
        >
          Go Pro · {price(pro, 'year').display}
        </button>
      )}
    </section>
  )
}
```

`checkout` sends the buyer to the provider's hosted page, and that's all it does. When they finish paying, the
provider posts an event to `/_weft/x/pay/stripe`, and *that* is what grants Pro:

1. The event is verified against the exact bytes received, with `STRIPE_WEBHOOK_SECRET`. A bad signature answers 400.
2. It's applied to the purchase in the ledger.
3. It pokes the tag `entitlements:<user>`, so every `.live()` reader of `entitlements` for that user refetches, on every
   tab. The page above flips to "Pro" by itself, a moment after the buyer comes back.

Providers deliver at least once and in any order. A repeated event changes nothing, and an older event than the one
already applied changes nothing, by the provider's own clock. If applying fails, the webhook answers 500 so the event is
sent again.

:::pitfall Don't mark the user as paid after `checkout()`
It's tempting to set something like `isPro.value = true` after `await checkout(…)`, so the page updates at once. But
`checkout` only opened a page: the buyer may close it, the card may be declined, the bank may ask for more. Paid state
written on the client after `checkout()` is **PAY004**. Render from `entitlements` and let the event arrive; with
`.live()` it does, without a reload.
:::

:::deepdive Why there's no webhook handler to write
In most stacks you write the webhook route yourself: read the raw body before anything parses it, check the signature
with the right secret and tolerance, look up whether you've seen this event, apply it in order, and answer the right
status so the provider retries what failed. Each of those steps has a well-known way to go wrong, and **PAY011** flags
a handler of payment events with no signature check.

`definePay` is a *server extension*: the one way a plugin reaches the server, under `/_weft/x/<key>/`. It sees the raw
request before anything reads the body, and it can invalidate tags like a mutation, which is how a verified event
reaches your live readers. An app with no `src/pay.server.ts` has no such route and none of this code.
:::

## Orders: a cart the server prices

A shop, a café or a bakery doesn't sell a fixed catalog to signed-in users. It sells a cart: items from its own database,
with sizes and add-ons, often to a guest. `pay.order` covers that. The server prices each line from its own tables and
gives the order its own id, the *ref*; the client never sends an amount:

<!-- example: skip fragments of an app's server modules -->
```ts
// src/server/order.ts
import { orderTag } from '@weft-js/pay'
import { mutation, query, redirect } from '@weft-js/start'
import { z } from 'zod'
import pay from '../pay.server'
import { priceCart, saveOrder } from './cart'

export const placeOrder = mutation({
  input: z.object({
    email: z.email(),
    items: z.array(z.object({ id: z.int(), quantity: z.int() })),
  }),
  run: async ({ input, ctx }) => {
    const lines = await priceCart(ctx.db, input.items) // names and amounts from your tables
    const ref = await saveOrder(ctx.db, input.email, lines) // the order row, unpaid
    redirect(await pay.order(ctx, { ref, lines, email: input.email }), 303)
  },
})

export const orderStatus = query({
  input: z.object({ ref: z.string() }),
  tags: (input) => [orderTag(input.ref)],
  run: ({ input, ctx }) => readOrder(ctx.db, input.ref),
})
```

Like `checkout`, `order` only opens the rail's page, and no sign-in is needed. What marks the order paid is a verified
event, which `definePay` hands to `onOrder`:

<!-- example: skip a fragment of src/pay.server.ts -->
```ts
// src/pay.server.ts
export default definePay({
  catalog,
  store: drizzlePayStore(db, { purchases, payEvents }),
  urls: { success: '/', cancel: '/', order: '/order/{ref}', orderCancel: '/cart' },
  onOrder: ({ ref, state }) => markOrder(db, ref, state), // 'active' is paid, 'refunded' is refunded
})
```

`onOrder` runs before the event is recorded, so if it throws, the webhook answers 500 and the rail sends the event again.
A repeat of the same event doesn't call it twice. Each order event also pokes the tags `orders` and `order:<ref>`, so a
kitchen screen reading `orders` and the buyer's receipt page reading `orderTag(ref)` both update by themselves with
`.live()`.

Each line is `{ name, amount, quantity? }` in whole minor units. A ref is 1 to 64 letters, digits, `-` or `_`. `{ref}` in
`urls.order` and `urls.orderCancel` becomes the order's ref. Orders are recorded in the ledger under the product id
`order`, which a catalog product can't use, and they grant no entitlements.

## Enforce on the server

What the client shows is decoration. Anyone can call a server function directly, so the server decides. There are two
ways, and you'll use both.

`requires` on a query or mutation refuses the call unless the user holds every entitlement listed. The client gets a
typed 403 with the code `ENTITLEMENT_REQUIRED`:

```ts
// src/server/reports.ts
import { query } from '@weft-js/start'
import { eq } from 'drizzle-orm'
import { todos } from '#/db/schema'

export const report = query({
  tags: ['todos'],
  auth: 'user',
  requires: ['pro'],
  run: async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(todos)
      .where(eq(todos.userId, ctx.user.id))
    const done = rows.filter(t => t.done).length
    return { total: rows.length, done }
  },
})
```

`ctx.entitlements` works in any `query`, `mutation` or `load`, for decisions that aren't a plain yes or no. In a layout's
`load` it guards a whole section:

```tsx
// src/routes/reports/_layout.tsx
import { redirect, type LoadArgs } from '@weft-js/start'

export const load = async ({ ctx }: LoadArgs) => {
  if (!ctx.user) redirect('/login')
  if (!(await ctx.entitlements.has('pro'))) redirect('/pricing')
  return {}
}

export default function ReportsLayout(props: { children?: unknown }) {
  return <section>{props.children}</section>
}
```

:::pitfall Await `has`
`if (ctx.entitlements.has('pro'))` without `await` tests a promise, and a promise is always truthy, so everyone gets in.
That's **PAY015**, and `weft fix` adds the `await` in an `async` function.
:::

An entitlement checked only on the client, with nothing on the server enforcing it, is **PAY013**.

A query with `cache: { life }` shares its value across users, so it can't read `ctx.entitlements` unless it also says
`scope: 'user'`. And a query's `tags` can take `ctx`, which is how `entitlements` above gets one tag per user.

### Purchase states

Every rail's events land on the same states:

| State | Access |
|---|---|
| `active`, `trial`, `grace` | Yes |
| `pending`, `billing-retry`, `paused`, `expired`, `refunded`, `revoked` | No |

Access also ends `leeway` (3 days) after a paid period if no renewal came, so a missed event can't keep someone on Pro
forever. A refund or a revoke is final, and wins a tie with a renewal in the same second.

## Test mode

Two kinds of testing, for two jobs.

**Stripe's test mode**, for trying the real flow in a browser. Put your `sk_test_…` key and the test webhook secret in
`.env`, run the app, and pay with Stripe's test cards. To reach your machine from Stripe, use the Stripe CLI's
forwarding to `localhost:<port>/_weft/x/pay/stripe` and use the signing secret it prints as `STRIPE_WEBHOOK_SECRET`.

**`fakePay`**, for automated tests. It's a rail with no key and no network. Its events are signed and go through your
own webhook and ledger, so a test sees exactly what a user would. `net.context` sets who the test's requests come
from:

```tsx
import { net, render, screen, user } from '@weft-js/core/test'
import { fakePay } from '@weft-js/pay/test'
import { expect, test } from 'vitest'
import pay from '#/pay.server'
import Pricing from '#/routes/pricing'

test('Pro arrives with the event, not the click', async () => {
  const fake = fakePay(pay)
  net.context({ user: { id: 'u1' } })
  render(Pricing)
  const goPro = await screen.findByRole('button', { name: /Go Pro/ })
  await user.click(goPro)
  expect(screen.queryByLabelText('plan')).toBeNull()
  await fake.complete()
  expect((await screen.findByLabelText('plan')).textContent)
    .toBe('Pro')
  await fake.simulate('refund')
  expect(await screen.findByRole('button', { name: /Go Pro/ }))
    .toBeTruthy()
})
```

`fake.complete()` is the buyer finishing the hosted page; `fake.abandon()` is them closing it. `fake.simulate(…)` plays
what a rail does later: `renewal`, `renewal-failed`, `recovered`, `grace-expired`, `cancel`, `pause`, `resume`,
`refund` and `revoke`. `fake.redeliver()` and `fake.deliver(event, { forged: true })` check that a repeat is harmless and a
forgery is refused. The [Testing](/learn/testing) page covers `render`, `user` and the fake network.

A live key in a test is **PAY031**: tests never touch real money. And `memoryPayStore()` is for tests only; a production
server refuses to start with it (**PAY016**).

## Another provider

The catalog, the server functions and your pages never name Stripe, so another provider is one line: replace `stripe()`
in `plugins` with any plugin for the `pay.rail` slot. A rail implements `PayRail` from `@weft-js/pay` (`checkout`,
`portal`, `verify`, and optionally `refund`) and passes `payRailSuite` from `@weft-js/pay/test`. `verify` gets the exact
bytes received and throws `PayError('PAY011', …)` for anything it can't prove.

Stripe is the only rail that ships today. App-store rails, store policy and a `weft pay sync` command aren't built.

## Recap

- `weft add pay` writes a catalog, a ledger, three server functions and two tables. Keys live in the server's
  environment, never in source.
- Products are whole minor units with a currency. Show prices with `price(product, plan)`, never typed into the page.
- `checkout` only opens the provider's page. A verified event at `/_weft/x/pay/<rail>` is the only grant, and it pokes
  `entitlements:<user>`, so `.live()` readers update by themselves.
- A cart is `pay.order(ctx, { ref, lines })`: the server prices the lines, a guest can pay, and `onOrder` hears the
  verified result.
- Enforce on the server: `requires: ['pro']` on a function, or `await ctx.entitlements.has('pro')` in a `load`.
- Try the real flow with Stripe's test keys; test it automatically with `fakePay`, which runs your real webhook and
  ledger with no network.

## Try it

:::challenge Sell credits once
Add a one-time product, `lifetime`, that costs $149 or €139 and grants `'pro'` forever. Then show its price in euros on
the pricing page.
:::solution
```ts
// src/pay/lifetime.ts
import { product } from '@weft-js/pay'

export const lifetime = product({
  id: 'lifetime',
  kind: 'one-time',
  use: 'digital',
  name: 'Pro for life',
  price: { usd: 14900, eur: 13900 },
  grants: ['pro'],
})
```

Add it to `src/pay/catalog.ts` (an `export` there is what `import * as catalog` picks up). On the page,
`price(lifetime, undefined, { currency: 'eur' }).display` gives "€139.00" in an English locale. The amounts are whole
cents, and `price` divides by the currency's own exponent.
:::

:::challenge Find the hole
The export page hides its button from free users. Is the export protected?

```ts
import { mutation } from '@weft-js/start'
import { eq } from 'drizzle-orm'
import { todos } from '#/db/schema'

export const exportCsv = mutation({
  auth: 'user',
  run: async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(todos)
      .where(eq(todos.userId, ctx.user.id))
    return rows
      .map(t => `${t.id},${JSON.stringify(t.title)}`)
      .join('\n')
  },
})
```
:::solution
No. Anyone signed in can call `exportCsv` directly, whatever the page shows, which is **PAY013**'s point. Enforce it on
the server:

```ts
import { mutation } from '@weft-js/start'
import { eq } from 'drizzle-orm'
import { todos } from '#/db/schema'

export const exportCsv = mutation({
  auth: 'user',
  requires: ['pro'],
  run: async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(todos)
      .where(eq(todos.userId, ctx.user.id))
    return rows
      .map(t => `${t.id},${JSON.stringify(t.title)}`)
      .join('\n')
  },
})
```

A free user now gets a 403 with the code `ENTITLEMENT_REQUIRED`, which the page can turn into "Go Pro to export".
:::

:::challenge Test a failed renewal
Write the steps of a test that buys Pro for a user, makes the next renewal fail, and checks what they hold. Should they
still have Pro?
:::solution
```tsx
const fake = fakePay(pay)
await fake.buy('u1', 'pro', 'month')
await fake.simulate('renewal-failed')
expect(await fake.entitlements('u1')).toEqual(['pro'])
await fake.simulate('grace-expired')
expect(await fake.entitlements('u1')).toEqual([])
```

A failed renewal puts the purchase into `grace`, which still gives access while the provider retries the card. Only when
grace runs out (`grace-expired`) does Pro go. `fake.buy` skips the hosted page, which is what you want when the test is
about what happens after.
:::
