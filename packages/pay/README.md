<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">@weft-js/pay</h1>

<p align="center">
  <strong>Payments for Weft apps: products, one ledger for every rail, and entitlements you enforce on the server.</strong><br>
  App code names products, never a provider. Stripe is one line in <code>plugins</code>, and a grant only ever comes from a verified event.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@weft-js/pay"><img src="https://img.shields.io/npm/v/@weft-js/pay?color=145c3c&label=npm" alt="npm version"></a>
  <a href="https://github.com/Ravonus/weft/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <a href="https://github.com/Ravonus/weft/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ravonus/weft/quality.yml?branch=main&label=checks" alt="checks"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="https://github.com/Ravonus/weft/tree/main/docs">Docs</a> ·
  <a href="https://github.com/Ravonus/weft/tree/main/examples">Examples</a> ·
  <a href="https://github.com/Ravonus/weft/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/Ravonus/weft">GitHub</a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** APIs can change between minor versions. Pin the version and read the
> [changelog](https://github.com/Ravonus/weft/blob/main/CHANGELOG.md) before you upgrade.

`@weft-js/pay` sells subscriptions, one-time purchases and consumables from a Weft app. You define products once, in a
catalog that is safe to ship to the browser. A checkout opens the payment provider's hosted page. The provider's signed
webhook is verified on the exact bytes, written to one ledger, and turned into entitlements that `ctx.entitlements` and
`requires: [...]` check on the server.

It is also Weft's reference plugin. Nothing in `@weft-js/start` or the CLI names it, so reading
[`plugin.mjs`](https://github.com/Ravonus/weft/blob/main/packages/pay/plugin.mjs) next to
[`weft docs plugins`](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/plugins.md) shows how to build your own.

## Highlights

- **Products, not price ids.** `product()` takes whole minor units with an ISO currency (`{ usd: 999 }`) and rejects floats
  and missing currencies (PAY008). A rail's ids never reach client code (PAY012).
- **A grant comes only from a verified event.** `checkout()` returns a URL and grants nothing. The rail's webhook at
  `/_weft/x/pay/<rail>` is the only way a purchase changes.
- **At-least-once, any order.** Each event is applied by the rail's own clock, and its id is recorded after it applies, so a
  redelivery is a no-op and an old event changes nothing.
- **Enforced on the server.** `requires: ['pro']` on any `query` or `mutation` answers a typed 403
  (`ENTITLEMENT_REQUIRED`). `await ctx.entitlements.has('pro')` works in any `query`, `mutation` or `load`.
- **Live by default.** A verified event pokes the `entitlements:<user>` tag, so a page reading entitlements with `.live()`
  updates without a reload.
- **One rail is one line.** `stripe()` from `@weft-js/pay/stripe/plugin` provides the `pay.rail` slot. Any plugin that
  implements `PayRail` and passes `payRailSuite` replaces it, and app code stays the same.
- **A real fake.** `fakePay` from `@weft-js/pay/test` signs its events and sends them through your own webhook and ledger, with
  renewals, refunds, pauses and disputes on demand. No key, no network.
- **No Stripe code by default.** The `.`, `./server`, `./drizzle` and `./test` entries reach no Stripe file (a test holds
  that), and no page loads Stripe.js.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Products and prices](#products-and-prices)
- [The ledger: `definePay`](#the-ledger-definepay)
- [Checkout, portal and webhooks](#checkout-portal-and-webhooks)
- [Entitlements](#entitlements)
- [Stripe](#stripe)
- [Square](#square)
- [Sandbox and test mode](#sandbox-and-test-mode)
- [Storing the ledger](#storing-the-ledger)
- [Writing another rail](#writing-another-rail)
- [Testing with `fakePay`](#testing-with-fakepay)
- [API reference](#api-reference)
- [Recipes](#recipes)
- [Limits](#limits)
- [Troubleshooting](#troubleshooting)
- [Related packages](#related-packages)

## Install

```bash
# npm
npm install @weft-js/pay

# pnpm
pnpm add @weft-js/pay

# bun
bun add @weft-js/pay
```

Or let the `weft` CLI install it and add it to `weft.config.ts` in one step:

```bash
npx weft add pay
```

`weft add pay` needs a database and auth in the app, and stops without changes if either is missing. It also adds the
Stripe rail (`@weft-js/pay/stripe`) to `plugins`, so `weft.config.ts` ends up with:

```ts
// weft.config.ts
import { defineConfig } from '@weft-js/core/config'
import pay from '@weft-js/pay/plugin'
import stripe from '@weft-js/pay/stripe/plugin'

export default defineConfig({
  plugins: [pay(), stripe()],
})
```

`weft add` writes a default import named after the package. Both plugin modules also have a named export (`{ pay }`,
`{ stripe }`), which works the same.

### What `weft add pay` writes

| File                   | What it holds                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/pay/catalog.ts`   | A `pro` subscription: `month` at `{ usd: 999 }`, `year` at `{ usd: 7999, trialDays: 7 }`, granting `pro`. Client-safe. |
| `src/pay.server.ts`    | `export default definePay({ catalog, store, urls: { success: '/', cancel: '/' } })`                                    |
| `src/server/pay.ts`    | The `entitlements` query and the `checkout` and `portal` mutations.                                                    |
| `src/db/pay.schema.ts` | The `purchases` and `pay_events` tables, for SQLite, Postgres or MySQL. Drizzle apps only.                             |
| `src/env.server.ts`    | `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` added to the `server` block.                                           |
| `.env`, `.env.example` | `STRIPE_MODE=test`, `STRIPE_SECRET_KEY=sk_test_placeholder`, `STRIPE_WEBHOOK_SECRET=whsec_placeholder`                  |

On Drizzle, `src/pay.server.ts` uses `drizzlePayStore(db, { purchases, payEvents })`; then run `npx weft db generate` and
the migration applies on the next request. On another data layer it starts on `memoryPayStore()`, and you write a
`PayStore` before production (PAY016).

### Setup checklist

| Need                      | Where                          | Notes                                                                                                                                        |
| ------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| A database                | `weft add` refuses without one | Holds the ledger.                                                                                                                            |
| Auth                      | `weft add` refuses without it  | A purchase belongs to `ctx.user.id`.                                                                                                         |
| `STRIPE_MODE`             | `.env`, server only            | `test` until launch: a live key is then refused (PAY032). Set `live` with the live keys. See [Sandbox and test mode](#sandbox-and-test-mode). |
| `STRIPE_SECRET_KEY`       | `.env`, server only            | Replace the placeholder with a real test key. The placeholder is refused before anything is sent (PAY003).                                   |
| `STRIPE_WEBHOOK_SECRET`   | `.env`, server only            | Without it every webhook is refused (PAY011).                                                                                                |
| A Stripe webhook endpoint | Stripe dashboard               | URL `https://<your-app>/_weft/x/pay/stripe`. Events: `customer.subscription.*`, `checkout.session.*`, `charge.refunded`, `charge.dispute.*`. |

Nothing calls Stripe until a user checks out.

## Quick start

The catalog names what you sell. It reaches the client, so it holds names and amounts only:

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
```

The ledger is the default export of `src/pay.server.ts`:

```ts
// src/pay.server.ts
import { drizzlePayStore } from '@weft-js/pay/drizzle'
import { definePay } from '@weft-js/pay/server'
import { db } from '#/db/index.server'
import { payEvents, purchases } from '#/db/schema'
import * as catalog from './pay/catalog'

// Served at /_weft/x/pay/<rail>, the webhook URL to give your
// provider.
export default definePay({
  catalog,
  store: drizzlePayStore(db, { purchases, payEvents }),
  urls: { success: '/', cancel: '/' },
})
```

Server functions expose it to pages:

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

A page sells and reads, by product name:

```tsx
// src/routes/pricing.tsx
import { price } from '@weft-js/pay'
import { pro } from '#/pay/catalog'
import { checkout, entitlements, portal } from '#/server/pay'

export default function Pricing() {
  const mine = entitlements.live()
  return (
    <section>
      <button
        type="button"
        onClick={() => checkout({ product: 'pro', plan: 'year' })}
      >
        Go Pro · {price(pro, 'year').display}
      </button>
      <button type="button" onClick={() => portal()}>
        Manage
      </button>
      {mine.value?.includes('pro') && <p>You have Pro.</p>}
    </section>
  )
}
```

And the server enforces it:

```ts
// src/server/report.ts
import { query } from '@weft-js/start'

export const report = query({
  auth: 'user',
  requires: ['pro'], // a typed 403, ENTITLEMENT_REQUIRED, without it
  run: () => 'the numbers',
})
```

The buyer clicks, lands on Stripe Checkout, pays, and comes back to `urls.success`. Stripe posts the event to
`/_weft/x/pay/stripe`, the ledger records it, and the `.live()` reader on the page shows Pro.

## Products and prices

`product(def)` checks a definition and returns it frozen. It is the only place products are defined.

| Field      | Type                                           | Default  | What it does                                                                                                |
| ---------- | ---------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `id`       | `string`                                       | required | Lowercase letters, digits and dashes (PAY021 otherwise). What `checkout` and `requires` name.               |
| `kind`     | `'subscription' \| 'one-time' \| 'consumable'` | required | A subscription renews, a one-time purchase stays, a consumable is used up.                                  |
| `use`      | `'digital' \| 'physical' \| 'service'`         | required | What the buyer gets.                                                                                        |
| `name`     | `string`                                       | the `id` | Display name at checkout.                                                                                   |
| `plans`    | `Record<string, Plan>`                         | none     | Subscriptions only, and required for them. Each plan is `Amounts` plus optional `trialDays` and `interval`. |
| `price`    | `Amounts`                                      | none     | One-time and consumable products only.                                                                      |
| `grants`   | `string[]`                                     | `[]`     | Entitlements a live purchase gives.                                                                         |
| `shipping` | `boolean`                                      | `false`  | Collect a shipping address at checkout.                                                                     |

`Amounts` is `Record<currency, number>`: lowercase ISO codes, non-negative whole minor units. `{ usd: 999 }` is $9.99.
A plan's interval is its name when the name is `day`, `week`, `month` or `year`; any other name needs `interval`.

```ts
import { product } from '@weft-js/pay'

export const team = product({
  id: 'team',
  kind: 'subscription',
  use: 'service',
  plans: { quarterly: { usd: 2500, eur: 2300, interval: 'month' } },
  grants: ['pro', 'team'],
})

export const credits = product({
  id: 'credits',
  kind: 'consumable',
  use: 'digital',
  price: { usd: 500 },
  grants: ['credits'],
})
```

`price(product, plan?, { currency?, locale? })` returns `{ amount, currency, display, plan?, interval?, trialDays? }`. It
uses the first currency listed unless you name one, and formats by the currency's own exponent (JPY has none, KWD has
three) for the reader's locale. Show `price(pro, 'month').display` instead of typing `$9.99` into a page (PAY005).

## The ledger: `definePay`

`definePay(options)` from `@weft-js/pay/server` is the app's one ledger. `src/pay.server.ts` default-exports it, and the
plugin mounts it as a `server.extension` at `/_weft/x/pay/...`. An app with no `src/pay.server.ts` has no route and no code
from any of this.

| Option    | Type                                     | Default              | What it does                                                                                            |
| --------- | ---------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| `catalog` | `Product[]` or `Record<string, Product>` | required             | `import * as catalog from './pay/catalog'` works.                                                       |
| `store`   | `PayStore`                               | required             | Where purchases and seen events live.                                                                   |
| `urls`    | `{ success, cancel, portal? }`           | required             | Paths or URLs a buyer returns to. Never from the client. The portal returns to `portal`, else `cancel`. |
| `user`    | `(ctx) => string \| null \| undefined`   | `ctx.user?.id`       | Who a request is.                                                                                       |
| `rail`    | `string`                                 | the only bound rail  | Which rail takes payments when several are bound (PAY022 otherwise).                                    |
| `origin`  | `string`                                 | the request's origin | Absolute origin for `urls`, behind a proxy.                                                             |
| `leeway`  | `number` (ms)                            | 3 days               | How long past a paid period access lasts, while a late renewal event arrives.                           |
| `slot`    | `() => Promise<…>`                       | `weft:slot/pay.rail` | Where rails come from. Leave it alone outside tests.                                                    |

What it returns, besides the `server.extension` members Weft uses:

| Member                                | What it does                                                                                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pay.input`                           | A Standard Schema validator for a checkout mutation's `input`: `{ product, plan?, currency?, quantity? }`, checked against the catalog. `quantity` is a whole number under 1000. |
| `pay.checkout(ctx, input)`            | The hosted checkout URL for this buyer. Grants nothing.                                                                                                                          |
| `pay.portal(ctx)`                     | Where this buyer manages or cancels.                                                                                                                                             |
| `pay.entitlements(userId)`            | `{ has(id), list() }` for any user, as a job or webhook would read it.                                                                                                           |
| `pay.forContext(ctx)`                 | The same, for a request: what `ctx.entitlements` is.                                                                                                                             |
| `pay.purchases(userId)`               | The user's `Purchase` rows.                                                                                                                                                      |
| `pay.refund(purchaseId)`              | Asks the purchase's rail to refund it.                                                                                                                                           |
| `pay.webhook(rail, request, report?)` | One verified delivery: `{ response, tags }`.                                                                                                                                     |
| `pay.ingest(rail, events, report?)`   | Apply events that were already verified. Anything else goes through `webhook`.                                                                                                   |
| `pay.use(rail)` / `pay.reset()`       | Swap in a rail directly (what `fakePay` does), and go back to the slot.                                                                                                          |
| `pay.catalog`                         | The products, as a list.                                                                                                                                                         |

## Checkout, portal and webhooks

**Checkout.** `pay.checkout(ctx, input)` needs a signed-in user (PAY010, 401), resolves the line from the catalog, and
asks the rail for a hosted page. A subscription the user already holds live answers PAY023 (409). The same click within a
minute reuses one session: the idempotency key is a hash of the user, the line and the minute. Amounts always come from the
catalog; the client sends names only.

**Portal.** `pay.portal(ctx)` finds the user's customer id on the current rail. A user who has bought nothing there gets
PAY024 (404).

**Webhooks.** The rail posts to `/_weft/x/pay/<rail>`. For each delivery:

| Step                                                 | Result                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| Not a `POST`                                         | 405                                                                              |
| No rail bound under that name                        | 404                                                                              |
| Body over 1 MiB                                      | 413                                                                              |
| `verify` throws (bad or missing signature, a replay) | 400, and the reason goes to the server log, not the response                     |
| `ingest` fails                                       | 500, so the rail delivers it again                                               |
| Otherwise                                            | `{"received":true}`, and the affected `entitlements:<user>` tags are invalidated |

An event applies when it is newer than the purchase's last one by the rail's clock. On a tie, a terminal state wins: a
refund and a renewal in the same second is a refund. The event id is recorded after the purchase is saved, so a crash in
between means a redelivery, not a lost event.

### Purchase states

The same on every rail:

| State                                                                  | Gives access                       |
| ---------------------------------------------------------------------- | ---------------------------------- |
| `active`, `trial`, `grace`                                             | Yes, until `expires` plus `leeway` |
| `pending`, `billing-retry`, `paused`, `expired`, `refunded`, `revoked` | No                                 |

## Entitlements

Entitlements are the union of `grants` over a user's live purchases. On the server, in any `query`, `mutation` or `load`:

```ts
import { redirect } from '@weft-js/start'

// Await it: a promise is truthy, so without `await` everyone passes
// (PAY015).
if (!(await ctx.entitlements.has('pro'))) redirect('/pricing')
```

| Way                              | Where                       | What happens without the entitlement                        |
| -------------------------------- | --------------------------- | ----------------------------------------------------------- |
| `requires: ['pro']`              | any `query` or `mutation`   | A 403 with code `ENTITLEMENT_REQUIRED`                      |
| `await ctx.entitlements.has(id)` | `query`, `mutation`, `load` | Whatever you do: redirect, hide, refuse                     |
| `await ctx.entitlements.list()`  | same                        | The sorted list                                             |
| `entitlementTag(userId)`         | a query's `tags`            | The tag a verified event invalidates: `entitlements:<user>` |

What the client shows is decoration; a check only on the client is PAY013. A query with `cache: { life }` needs
`scope: 'user'` to read entitlements.

## Stripe

`stripe(options?)` from `@weft-js/pay/stripe/plugin` provides the `pay.rail` slot under the key `stripe`. It uses Stripe
Checkout and the billing portal over Stripe's REST API, server side only, and verifies webhooks itself with WebCrypto
HMAC-SHA256 on `<t>.<raw body>`, accepting any of several `v1` signatures while a secret rolls.

| Option              | Type                     | Default                  | What it does                                                                                                               |
| ------------------- | ------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `prices`            | `Record<string, string>` | none                     | Stripe Price ids by `<product>.<plan>` or `<product>`. Without an entry the amount comes from the catalog as `price_data`. |
| `api`               | `string`                 | `https://api.stripe.com` | The API origin; point it at a local mock.                                                                                  |
| `apiVersion`        | `string`                 | `2025-09-30.clover`      | Pinned, so an account's default version can't reshape the calls.                                                           |
| `tolerance`         | `number` (s)             | `300`                    | How old a signed delivery may be before it is refused as a replay.                                                         |
| `shippingCountries` | `string[]`               | `['US', 'CA']`           | Where a `shipping` product delivers.                                                                                       |
| `mode`              | `'test' \| 'live'`       | `STRIPE_MODE`, else the key | What the keys must be; one from the other mode is PAY032. See [Sandbox and test mode](#sandbox-and-test-mode).             |

Keys come from the server environment, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Don't pass a key as an option:
plugin options are written into `.weft/slots/`, a generated file (PAY003).

```ts
// weft.config.ts
import { defineConfig } from '@weft-js/core/config'
import pay from '@weft-js/pay/plugin'
import stripe from '@weft-js/pay/stripe/plugin'

export default defineConfig({
  plugins: [
    pay(),
    stripe({
      prices: { 'pro.month': 'price_…', 'pro.year': 'price_…' },
    }),
  ],
})
```

How Stripe events map to the ledger:

| Stripe event                                                                      | Ledger effect                                                                                                                                                                                        |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `customer.subscription.*`                                                         | `active`, `trialing` → `trial`, `past_due` → `grace`, `unpaid` → `billing-retry`, `paused`, `canceled` and `incomplete_expired` → `expired`, `incomplete` → `pending`; `expires` from the period end |
| `checkout.session.completed`, `…async_payment_succeeded`, `…async_payment_failed` | One-time payments only: `active`, `pending` while unpaid, or `expired` on failure                                                                                                                    |
| `charge.refunded`                                                                 | `refunded`, for a full refund only; a partial refund keeps what was bought                                                                                                                           |
| `charge.dispute.created` / `.closed`                                              | `revoked`, then `active` again if the dispute is won                                                                                                                                                 |

Who bought what travels in metadata (`weft_user`, `weft_product`, `weft_plan`) on the session, the subscription and the
payment intent. `pay.refund()` refunds one-time payments (`pi_…`); a subscription is cancelled in the portal.

## Square

`square(options?)` from `@weft-js/pay/square/plugin` provides `pay.rail` under the key `square`: Square payment links for
one-time payments (`pay.order` and one-time products), so web orders land in the same Square account as the shop's card
readers. Subscriptions and `portal` are PAY022 on it; sell those with Stripe.

| Option        | Type                         | Default                                        | What it does                                                    |
| ------------- | ---------------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| `environment` | `'sandbox' \| 'production'`  | `SQUARE_ENVIRONMENT` (or `SQUARE_ENV`), else production | Picks the API host. Any other value is PAY032, never a guess. |
| `api`         | `string`                     | from `environment`                             | The API origin; point it at a local mock.                       |
| `apiVersion`  | `string`                     | `2025-10-16`                                   | Pinned `Square-Version`.                                        |

Env, server only: `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID` (the shop the payments land in), and for the webhook at
`/_weft/x/pay/square` `SQUARE_WEBHOOK_SIGNATURE_KEY` plus `SQUARE_WEBHOOK_URL`, the exact URL given to Square, which it
signs. Subscribe the webhook to `payment.created` and `payment.updated`. `SQUARE_APPLICATION_ID` is optional and only
checked against the environment.

## Sandbox and test mode

Both rails have a sandbox that takes the provider's test cards and never moves money. Build and test against it, then
switch the environment's variables, not code, to go live. A key from the other mode is refused before anything is sent
(PAY032), so a live key can't reach a dev server and a test key can't quietly run a shop.

**Stripe.** Test mode is the keys: in the dashboard turn on *Test mode* (or open a sandbox) and copy them.

```bash
# .env
STRIPE_MODE=test               # `live` at launch, with sk_live_
STRIPE_SECRET_KEY=sk_test_…    # or a restricted rk_test_ key
STRIPE_WEBHOOK_SECRET=whsec_…  # from `stripe listen`, below
# STRIPE_PUBLISHABLE_KEY=pk_test_…  # only for Stripe.js
```

`STRIPE_WEBHOOK_SECRET` is the one `stripe listen` prints locally, or the endpoint's signing secret in the dashboard once
deployed. `STRIPE_PUBLISHABLE_KEY` is only checked to be the same mode as the secret key; nothing here sends it.

Locally, forward webhooks with the Stripe CLI and use the `whsec_` it prints:

```bash
stripe listen \
  --forward-to localhost:5173/_weft/x/pay/stripe
```

Pay on the hosted Checkout page with `4242 4242 4242 4242`, any future expiry, any CVC (`4000 0000 0000 9995` declines,
`4000 0025 0000 3155` asks for 3-D Secure). Refund from your admin with `pay.refund(id)`; `charge.refunded` comes back
through the webhook. `stripe trigger checkout.session.completed` sends a signed event without a browser.

**Square.** The sandbox has its own credentials: in the Developer Console open your application, switch to the
*Sandbox* tab, and take the sandbox access token and application id (`sandbox-sq0idb-…`), and a location of the
sandbox's test seller account (*Locations* page).

```bash
# .env
SQUARE_ENVIRONMENT=sandbox  # `production` at launch
SQUARE_ACCESS_TOKEN=…       # the Sandbox tab's token
SQUARE_LOCATION_ID=…        # a sandbox location
SQUARE_APPLICATION_ID=sandbox-sq0idb-…  # optional, checked
SQUARE_WEBHOOK_SIGNATURE_KEY=…  # the sandbox subscription's
SQUARE_WEBHOOK_URL=https://<tunnel>/_weft/x/pay/square
```

At launch, swap in the production token and location with `SQUARE_ENVIRONMENT=production`; a `sandbox-` application id
is then refused.

`SQUARE_ENVIRONMENT=sandbox` sends every call to `connect.squareupsandbox.com`; unset or `production`, to
`connect.squareup.com`. A sandbox webhook needs a public URL, so run a tunnel (`cloudflared tunnel --url
http://localhost:5173`) and give Square that URL plus `/_weft/x/pay/square`, the same string as `SQUARE_WEBHOOK_URL`.
Pay on the hosted sandbox page with `4111 1111 1111 1111`, any future expiry, CVV `111`, any ZIP. Square answers a
token sent to the other environment's host with a bare 401, so that PAY030 names the host it hit.

**In the app.** `rail.sandbox` is `true` for a sandbox, and `await pay.sandbox()` reads the bound rail's, for a banner:

```ts
export const testMode = query({ run: () => pay.sandbox() })
```

**Against the real sandboxes.** `test/sandbox.live.test.ts` in this package runs checkout and refund through each rail
against the provider's sandbox, paying with the published test instruments (`pm_card_visa`, `cnon:card-nonce-ok`). It
skips without credentials and refuses a live key or a production Square environment:

```bash
export PAY_SANDBOX=1 STRIPE_SECRET_KEY=sk_test_…
pnpm --filter @weft-js/pay test sandbox.live

export PAY_SANDBOX=1 SQUARE_ENVIRONMENT=sandbox \
  SQUARE_ACCESS_TOKEN=… SQUARE_LOCATION_ID=…
pnpm --filter @weft-js/pay test sandbox.live
```

## Storing the ledger

A `PayStore` is five methods:

| Method              | What it does                          |
| ------------------- | ------------------------------------- |
| `seen(eventId)`     | Whether an event was already applied. |
| `mark(eventId, at)` | Record that it was.                   |
| `purchase(id)`      | One `Purchase` by id, or `null`.      |
| `save(purchase)`    | Insert or replace by `id`.            |
| `byUser(user)`      | Every purchase of a user.             |

`drizzlePayStore(db, { purchases, payEvents })` from `@weft-js/pay/drizzle` implements it on Postgres, SQLite or MySQL, with
the tables `weft add pay` writes (times are milliseconds, so they need a 64-bit integer column on Postgres and MySQL). It
marks both tables as written by the webhook rather than by a server function.

`memoryPayStore()` is for dev and tests. A production server refuses to start with it (PAY016).

A `Purchase` row is `{ id, rail, user, product, plan, state, at, expires, customer }`, where `id` is `<rail>:<rail's id>`
and `user`, `product` and `plan` stay `null` until an event names them (a dispute can arrive before its payment).

## Writing another rail

A rail is a plugin that provides the `pay.rail` slot for the `server` side and implements `PayRail` from `@weft-js/pay`:

| Member                            | What it does                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                              | The rail's name, and its webhook path: `/_weft/x/pay/<id>`.                                                                                 |
| `checkout(request)`               | Open a hosted page for a `CheckoutRequest` (user, optional customer, the catalog line, return URLs, an idempotency key). Returns `{ url }`. |
| `portal({ customer, returnUrl })` | Returns `{ url }`.                                                                                                                          |
| `verify({ body, headers })`       | Gets the exact bytes received and returns normalised `RailEvent`s, or throws `PayError('PAY011', …)` for anything it can't prove.           |
| `refund({ purchase })`            | Optional.                                                                                                                                   |

Hold it to the contract with `payRailSuite` from `@weft-js/pay/test`:

```ts
import { payRailSuite } from '@weft-js/pay/test'
import { myRail, signedDelivery } from '../src/rail'

test('my rail passes pay.rail@1', async () => {
  const checks = await payRailSuite({
    rail: myRail({ fetch: mockFetch }),
    // A delivery the rail would accept, `age` ms old
    delivery: (age) => signedDelivery(age),
    tolerance: 300_000, // optional: runs the replay check
  })
  expect(checks.filter((c) => !c.ok)).toEqual([])
})
```

It checks that a genuine delivery verifies, that events have an id, a millisecond time and a purchase, that the same
delivery gives the same id, that a changed byte and a missing signature are refused, that an old delivery is refused as a
replay (with `tolerance`), and that `checkout` and `portal` answer absolute URLs. A failed check is P119.

Swap rails by replacing `stripe()` in `plugins`. Nothing in app code changes.

## Testing with `fakePay`

`fakePay` from `@weft-js/pay/test` is a rail with no key and no network. Its events are signed and go through your own
webhook and ledger, and it pokes live queries, so a test sees what a user would:

```tsx
import { net, render, screen, user } from '@weft-js/core/test'
import { fakePay } from '@weft-js/pay/test'
import pay from '#/pay.server'

test('checkout grants nothing; the verified event does', async () => {
  // Your `definePay`, or fakePay({ catalog })
  const fake = fakePay(pay)
  net.context({ user: { id: 'u1' } })
  render(Paywall)
  await net.settle()
  await user.click(screen.getByRole('button', { name: /Go Pro/ }))
  await net.settle()
  expect(screen.getByLabelText('plan').textContent).toBe('Free')

  await fake.complete() // the buyer finishes the hosted page
  expect(screen.getByLabelText('plan').textContent).toBe('Pro')

  await fake.simulate('refund')
  expect(screen.getByLabelText('plan').textContent).toBe('Free')
})
```

| Member                                  | What it does                                                                                                                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `complete(user?)`                       | The buyer finishes the newest open checkout, or that user's. Returns the purchase id.                                                                                                                                              |
| `abandon(user?)`                        | The buyer closes the page. Nothing is delivered.                                                                                                                                                                                   |
| `buy(user, product, plan?)`             | A whole purchase with no page in the way.                                                                                                                                                                                          |
| `simulate(what, purchase?)`             | `renewal`, `renewal-failed`, `grace-expired`, `recovered`, `cancel`, `pause`, `resume`, `refund`, `revoke`. Defaults to the newest purchase. `renewal` and `renewal-failed` move `clock` to the period's end when it is installed. |
| `redeliver()`                           | The last event again.                                                                                                                                                                                                              |
| `deliver(event, { forged? })`           | Any event, in any order. `forged: true` signs with the wrong key, so it answers 400.                                                                                                                                               |
| `sessions`, `deliveries`                | Every checkout opened, and every delivery with the status the app answered.                                                                                                                                                        |
| `entitlements(user)`, `purchases(user)` | Read the ledger.                                                                                                                                                                                                                   |
| `pay`, `rail`                           | The ledger in use and the fake rail.                                                                                                                                                                                               |

`fakePay` registers the ledger with `net.extension`, which resets it after each test. A live key in a test is PAY031.

## API reference

| Entry                        | Side              | Exports                                                                                                                                                                                                                          |
| ---------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@weft-js/pay`               | client and server | `product`, `price`, `entitlementTag`, `PayError`; types `Product`, `ProductDef`, `ProductKind`, `ProductUse`, `Plan`, `Amounts`, `Interval`, `Price`, `PurchaseState`, `PayRail`, `RailEvent`, `CheckoutRequest`, `CheckoutLine` |
| `@weft-js/pay/server`        | server            | `definePay`, `memoryPayStore`, `extension`; types `Pay`, `PayOptions`, `PayStore`, `Purchase`, `Entitlements`, `CheckoutInput`, `PayContext`, `PayReport`                                                                        |
| `@weft-js/pay/drizzle`       | server            | `drizzlePayStore`                                                                                                                                                                                                                |
| `@weft-js/pay/test`          | tests             | `fakePay`, `payRailSuite`; types `FakePay`, `PayScenario`, `PayRailSuiteOptions`, `Check`                                                                                                                                        |
| `@weft-js/pay/plugin`        | config            | `pay` (default and named): the `server.extension`, the PAY checks, `weft docs pay` and `weft add pay`                                                                                                                            |
| `@weft-js/pay/stripe`        | server            | `stripeRail`, `stripeKeyMode`; type `StripeOptions`                                                                                                                                                                                            |
| `@weft-js/pay/stripe/plugin` | config            | `stripe` (default and named): the `pay.rail` provider                                                                                                                                                                            |
| `@weft-js/pay/square`        | server            | `squareRail`, `squareSandbox`; type `SquareOptions`                                                                                                                                                                              |
| `@weft-js/pay/square/plugin` | config            | `square` (default and named): the `pay.rail` provider                                                                                                                                                                            |

Importing `@weft-js/pay/server` or `@weft-js/pay/drizzle` from client code is PAY017.

<details>
<summary><code>stripeRail(options)</code>: options the plugin doesn't document</summary>

`stripeRail` is what the plugin loads on the server. Besides the plugin options above, it accepts `secretKey` (default
`process.env.STRIPE_SECRET_KEY`), `publishableKey` (default `process.env.STRIPE_PUBLISHABLE_KEY`, only checked),
`webhookSecret` (default `process.env.STRIPE_WEBHOOK_SECRET`) and `fetch` (default the
global one). Use those in tests of the rail itself; in an app, keys stay in the environment.

</details>

<details>
<summary><code>PayError</code></summary>

`new PayError(code, message, status = 400)`. Every error this package throws has a stable `code`. `error.answer` is
`{ code, message, status }`, the shape `@weft-js/start` sends a plugin's error to the client in.

</details>

## Recipes

**Gate a page in `load`.**

```ts
import { redirect } from '@weft-js/start'

export const load = async ({ ctx }) => {
  if (!(await ctx.entitlements.has('pro'))) redirect('/pricing')
}
```

**Sell a one-time product with shipping.**

```ts
import { product } from '@weft-js/pay'

export const poster = product({
  id: 'poster',
  kind: 'one-time',
  use: 'physical',
  price: { usd: 2500 },
  shipping: true,
})
```

Then `checkout({ product: 'poster', quantity: 2 })`. Stripe collects an address in `shippingCountries`.

**Read entitlements from a job.** Outside a request, use the ledger directly:

```ts
import pay from '#/pay.server'

const isPro = await pay.entitlements(userId).has('pro')
```

**Charge in another currency.** `checkout({ product: 'pro', plan: 'month', currency: 'eur' })` uses the plan's `eur`
amount; `price(pro, 'month', { currency: 'eur' }).display` shows it.

## Limits

- Stripe is the only rail that ships. Native app-store rails, store policy and `weft pay sync` aren't built.
- Delivery is at-least-once and unordered by design; ordering uses the rail's clock, so an event without a newer timestamp
  doesn't change state.
- A webhook body over 1 MiB is refused (413).
- `quantity` is a whole number from 1 to 999. A subscription is always quantity 1.
- Only a full Stripe refund ends access. Only one-time payments refund through `pay.refund()`.
- An event for a purchase nobody has seen, with no user or product on it, is stored without an owner and grants nothing
  until a later event names them.
- A purchase for a product no longer in the catalog grants nothing, and the server logs PAY021 as a warning.

## Troubleshooting

`weft check` and `weft build` run the PAY checks. `weft docs PAY012` prints any code's page.

| Code   | When                                                                                                                                                  | Fix                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| PAY003 | A Stripe key in source, a server secret read in client code, a key in plugin options, or the placeholder key still in `.env` at run time              | Move it to the server env; roll any real key that was committed    |
| PAY004 | Paid state written on the client after `checkout()`                                                                                                   | Read `entitlements`: a grant arrives from a verified event         |
| PAY005 | A price typed into a page that sells something (warning)                                                                                              | `price(product, plan).display`                                     |
| PAY008 | A float or currency-less amount in `product()`                                                                                                        | Whole minor units: `{ usd: 999 }`                                  |
| PAY010 | A checkout mutation without `auth: 'user'`, or a checkout with no signed-in user (401)                                                                | Add `auth: 'user'`                                                 |
| PAY011 | A webhook handler with no signature check, a `verify` that ignores `headers`, no `STRIPE_WEBHOOK_SECRET`, or a delivery that fails verification (400) | Delete the handler: `/_weft/x/pay/<rail>` verifies. Set the secret |
| PAY012 | A rail's price or product id in client code                                                                                                           | Name the catalog; map ids in `stripe({ prices })`                  |
| PAY013 | An entitlement checked only on the client                                                                                                             | `requires: [...]`, or `await ctx.entitlements.has(...)`            |
| PAY014 | The plugin with no `src/pay.server.ts`: no webhook is mounted                                                                                         | Default-export `definePay({ … })` from it                          |
| PAY015 | `ctx.entitlements.has()` without `await`                                                                                                              | Await it (`weft fix` does, in an `async` function)                 |
| PAY016 | `memoryPayStore()` in `src/pay.server.ts` (warning); a production server refuses to start                                                             | `drizzlePayStore` or your own `PayStore`                           |
| PAY017 | `@weft-js/pay/server` or `/drizzle` imported in client code                                                                                           | Import them in a server module                                     |
| PAY018 | `src/pay.server.ts` with no `pay.rail` provider                                                                                                       | `weft add pay-stripe`                                              |
| PAY031 | A live key in a test                                                                                                                                  | `fakePay`                                                          |

At run time:

| Code                   | Status          | Means                                                                                                    |
| ---------------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| PAY021                 | 404             | No such product, plan or currency in the catalog (also thrown by `product()` for a bad definition)       |
| PAY022                 | 500 / 501 / 400 | No rail chosen while several are bound, a named rail isn't bound, or the rail can't refund this purchase |
| PAY023                 | 409             | The user already holds this subscription                                                                 |
| PAY024                 | 404             | Nothing to manage or refund                                                                              |
| PAY030                 | 502 / 503       | The rail's provider refused the call (503 when it rate-limited)                                          |
| PAY032                 | 500             | The keys and the chosen mode disagree (a live key with `STRIPE_MODE=test`, a sandbox app id in production), or a misspelled mode: nothing was sent |
| P101                   | 500             | `pay.rail` has no provider in `plugins`                                                                  |
| `ENTITLEMENT_REQUIRED` | 403             | A `requires` entitlement is missing                                                                      |
| `E_PAY`                | 500             | Applying a verified delivery failed; the rail will redeliver                                             |

## Related packages

| Package                                                          | What it is                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`@weft-js/start`](https://www.npmjs.com/package/@weft-js/start) | Server functions, `ctx`, `server.extension` and live queries that pay builds on |
| [`@weft-js/core`](https://www.npmjs.com/package/@weft-js/core)   | The plugin API (`definePlugin`, slots) and the test kit (`net`, `clock`)        |
| [`@weft-js/db`](https://www.npmjs.com/package/@weft-js/db)       | The database layer `drizzlePayStore` runs on                                    |
| [`@weft-js/cli`](https://www.npmjs.com/package/@weft-js/cli)     | `weft add pay`, `weft check`, `weft docs pay` and `weft docs plugins`           |

## Contributing

See [CONTRIBUTING.md](https://github.com/Ravonus/weft/blob/main/CONTRIBUTING.md). From the repository root:

```bash
pnpm --filter @weft-js/pay test
```

The tests run the ledger end to end over `fakePay`, the Stripe rail against a mocked API, the PAY checks, and the
`drizzlePayStore` on SQLite. None reach a network.

## License

[MIT](https://github.com/Ravonus/weft/blob/main/LICENSE)
