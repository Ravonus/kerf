# 10 — Payments: one catalog, every rail, web + iOS + Android

> Built differently from this note in one way: pay is the plugin `@weft-js/pay`, not `weft/pay`, and `fakePay` comes from `@weft-js/pay/test`. T030 is PAY031. See research 38.

Research date: 2026-10-28. Store payment rules in the US are mid-litigation on that date. Every policy statement here
carries its source and date, and the design treats the rules as **versioned data**, not code. Statements marked
**(unverified)** could not be confirmed from a primary source.

**Built:** the web half, with what changed from this design: [38](38-pay-web.md).

**Question:** how does a weft app take money the same way on web, iOS and Android, from one declaration, when the
platforms process payments completely differently and the stores dictate which rail is allowed for what? Native
targets are in [09](09-native-targets.md).

---

## TL;DR

1. **`weft/pay`: declare products once, call `checkout()` once, read entitlements everywhere.** The rail (Stripe,
   StoreKit 2, Google Play Billing, a web link-out) is chosen per build from the product's kind, the platform, the
   storefront and a dated policy table. App code never names a rail.
2. **The rule that decides most of it:** digital goods and features used in the app (subscriptions, premium content,
   in-game currency, unlocks) go through the store's in-app purchase on iOS and Android unless a storefront's policy
   allows something else. Physical goods and real-world services go through Stripe on every platform, with Apple Pay
   and Google Pay inside it. Stripe's own mobile SDK README states the IAP rule for digital products.
3. **The policy is in flux, so it's data with a date.**
   - **Apple, US:** after the 2025 contempt ruling, US apps may link out to web checkout. The Ninth Circuit (Dec 2025)
     upheld contempt but allowed Apple to seek a cost-based fee, and the Supreme Court case was pending on
     2026-10-28. Apple proposed 5–15% on remand.
   - **Google, US:** a new Epic settlement (2026-03-04) awaits a revised injunction. Google says enrolled developers
     in its external-links and alternative-billing programs report transactions and pay service fees from
     2026-10-01.
   - So link-out is **opt-in per storefront**, ships with the fee and the source date, and `weft check` warns when the
     policy table is older than 90 days.
4. **One entitlement model on the server.** Stripe webhooks, App Store Server Notifications V2 and Google Real-Time
   Developer Notifications are verified and normalised into `purchases` and `entitlements` tables. Buy on iPhone,
   unlock on the web. `ctx.entitlements.has('pro')` on the server; `entitlements.live()` on the client, refreshed by
   the same tag pokes as any live query (PLAN §4.2).
5. **The mistakes that get apps rejected or robbed are compile/build errors** (PAY-codes): Stripe for digital goods
   in a store build, client-side entitlement grants, secret keys in the client graph, hardcoded prices, a missing
   Restore Purchases on iOS, float money.
6. **Testable without real money or a phone.** A fake provider in `@weft-js/core/test` plays renewals, failures, grace
   periods, refunds and revocations on the deterministic clock. Stripe test mode, StoreKit configuration files and
   Play license testers cover the device lanes. Agents only ever use test keys.

---

## 1. The developer surface

```ts
// pay/catalog.ts: the only place products are defined
export const pro = product({
  id: 'pro',
  kind: 'subscription',             // 'subscription' | 'one-time' | 'consumable'
  use: 'digital',                   // 'digital' (used in the app) | 'physical' | 'service'
  plans: { month: { usd: 999 }, year: { usd: 7999, trialDays: 7 } },   // minor units, always integers
  grants: ['pro'],                  // entitlements
})

export const tee = product({ id: 'tee', kind: 'one-time', use: 'physical', price: { usd: 2500 }, shipping: true })
```

```tsx
// any component, any platform
import { checkout, entitlements, price } from 'weft/pay'

const isPro = derived(() => entitlements.live().value?.has('pro'))
<Button onClick={() => checkout(pro, { plan: 'year' })}>Go Pro · {price(pro, 'year').display}</Button>
<RestorePurchases />            {/* required on iOS for store products; renders nothing where it isn't */}
```

- `checkout()` returns a `Resource<CheckoutResult>` (`.pending`, `.error`, and `.value` of `purchased | cancelled |
  pending-approval | deferred`). It **never** grants anything. The grant arrives from the server (§3).
- `price(product, plan)` is a live value. On a store build it comes from the store (StoreKit / Play), because store
  prices are localised per storefront and shown to the user by Apple and Google, so a hardcoded price is wrong in
  most countries. On web it comes from Stripe's Price objects.
- `<BuyButton>`, `<Paywall>` and `<ManageSubscription>` are warp components on top of these calls, resolved per
  platform like everything else ([09 §4.2](09-native-targets.md)). The system payment sheets are always system.

## 2. Rails and how one is picked

| Product `use` | web | iOS | Android |
|---|---|---|---|
| `physical`, `service` | Stripe Payment Element / Checkout (cards, wallets, Link, local methods) | Stripe PaymentSheet (native SDK) with Apple Pay | Stripe PaymentSheet with Google Pay |
| `digital` | Stripe (or a merchant-of-record adapter, §5) | **StoreKit 2** by default; link-out to web checkout where the policy table allows it and the app opted in | **Play Billing** by default; alternative billing or external links where the policy allows it and the app opted in |

The resolver takes `(product.use, platform, storefront, app opt-ins, policy table)` and returns one rail. It runs at
build time for what is fixed (platform, opt-ins) and at runtime for the storefront (the store reports it). `weft pay
explain pro --platform ios --storefront DE` prints the decision and the policy entry it came from, with its source
link and date.

```ts
// weft.config.ts
pay: {
  providers: { stripe: { publishableKey: env.STRIPE_PK } },     // secret key lives only in server env
  linkOut: { ios: ['US'], android: [] },                        // explicit, per storefront
}
```

Native rails are native modules ([09 §6.2](09-native-targets.md)) wrapping StoreKit 2, the Play Billing Library and
Stripe's iOS and Android SDKs. They are not webviews.

## 3. Server: one entitlement model

```
Stripe webhooks ───────────┐
App Store Server Notif. V2 ├─► verify ─► normalise ─► purchases ─► entitlements ─► tag poke `entitlements:<user>`
Google RTDN (Pub/Sub) ─────┘   (signature / JWS / Play Developer API)
```

- **Verification is built in, not left to the app:** Stripe signature checks, App Store signed transactions (JWS)
  checked with the App Store Server API, and Play purchase tokens checked with the Play Developer API. Apps don't
  write webhook handlers for these.
- **Identity before purchase.** The buyer's user id is attached to every rail (StoreKit `appAccountToken`, Play
  `obfuscatedAccountId`, Stripe customer), so a purchase on one platform maps to one account everywhere.
  `checkout()` on a store product requires a signed-in user (PAY010 at compile time where it can tell, a runtime
  error otherwise).
- **States** are normalised across rails: `active`, `trial`, `grace`, `billing-retry`, `paused`, `expired`,
  `refunded`, `revoked`. Events can arrive out of order and twice; ingestion is idempotent and ordered by the rail's
  own timestamps.
- **Reading it:** `ctx.entitlements.has('pro')` in any `query`/`mutation`, and an `entitlements` live query on the
  client. A mutation can declare `requires: ['pro']` and gets a typed `403` otherwise.
- **Drizzle schema ships** in `@weft-js/db-pay`, so the tables are inspectable and joinable like any other data.
- **Optional backends:** RevenueCat can stand in for the IAP verification and notification side **(adapter,
  later)**.

## 4. Catalog sync

- `weft pay sync` pushes the catalog to Stripe (Products and Prices), App Store Connect (in-app purchases and
  subscription groups via its API) and the Play Console (via the Play Developer API monetization endpoints).
  - It is a `task` with side effects and `requires: human`. It prints a diff first.
  - Store review of new products still happens in the stores.
- It also writes a local StoreKit configuration file for the simulator and a Stripe test fixture, so the device lanes
  work offline.
- Store-specific metadata (review screenshot, localised display names, subscription group ranking) goes in an
  optional `stores` block on the product, validated by Zod.

## 5. Other providers

Stripe is the first adapter because it covers web plus native card/Apple Pay/Google Pay with first-party mobile
SDKs. The provider interface (create intent, confirm, webhook ingest, refund, customer portal link) is public so
others plug in:

- **Merchant of record** for web digital sales (Paddle, Lemon Squeezy, Stripe's own MoR offerings if used): they
  handle sales tax/VAT. The stores are already the merchant of record for IAP. With plain Stripe you are, and Stripe
  Tax is a config flag.
- **Adyen, Braintree/PayPal** for teams already on them.
- Klarna, iDEAL, SEPA and similar come through Stripe's Payment Element where available, with no extra code.

## 6. Policy table (data, as of 2026-10-28)

| Storefront | Store | Digital goods default | Allowed alternative | Fee on alternative | Source |
|---|---|---|---|---|---|
| US | Apple | StoreKit 2 | Link-out to web checkout | None collected while the Supreme Court appeal is pending; Apple proposed 5–15% on remand | Ninth Circuit Dec 2025 (MacRumors); TechCrunch 2026-04-06; AppleInsider 2026-08-13; Tech-Insider (secondary) |
| US | Google | Play Billing | External content links, alternative billing (enrolled programs) | Service fees from 2026-10-01; final rates pending the revised injunction **(unverified rates)** | Play Console Help 15582165 |
| EU | Apple, Google | Store IAP | DMA alternative terms **(not researched here)** | per store terms | — |
| AU | Apple, Google | Store IAP | External links under the 2026 remedies and ACCC authorisation **(unverified details)** | — | Lexology 2026-10 |
| everywhere | both | — | Physical goods/services must **not** use IAP | — | store guidelines; Stripe RN SDK README |

- The table ships as a JSON file in `@weft-js/pay` with an `asOf` date and a source URL per row.
- `weft check` warns (PAY020) when the installed table is older than 90 days, and `weft pay explain` always prints
  the date.
- weft doesn't give legal advice. The table is a default that makes the common case pass review; the opt-ins make an
  app owner choose the rest on purpose.

## 7. Diagnostics

| Code | Catches | Fix |
|---|---|---|
| PAY001 | A `digital` product resolves to Stripe in an iOS/Android build, with no link-out opt-in for that storefront | Use the store rail (default), or opt in to link-out where the policy allows it |
| PAY002 | A `physical`/`service` product configured for IAP | Stripe rail |
| PAY003 | Stripe secret or restricted key reachable from the client graph (like W030) | Server env only |
| PAY004 | Granting access from `checkout()`'s client result | Read `entitlements`; grants come from verified server events |
| PAY005 | Hardcoded price text next to a store product | `price(product, plan).display` |
| PAY006 | iOS build sells store products without `<RestorePurchases>` reachable | Add it (autofix to the paywall/settings route) |
| PAY007 | Subscription sold without a reachable manage/cancel path | `<ManageSubscription>` |
| PAY008 | Money as a float, or a currency-less amount | Integer minor units with currency (`money` Zod type) |
| PAY010 | `checkout()` on a store product where no signed-in user is guaranteed | Require auth on the route, or sign in first |
| PAY020 | Policy table older than 90 days (warning) | Update `@weft-js/pay` |
| T030 | A payment test that uses a live key or the real network | Fake provider or test mode |

## 8. Testing

- **Fast lane:** `@weft-js/core/test` gives `fakePay`, which runs every rail's state machine on the deterministic clock:
  `pay.simulate('renewal-failed' | 'grace-expired' | 'refund' | 'revoke' | 'family-share' | 'ask-to-buy')`. A test
  asserts what the user sees and what the server grants, end to end, in milliseconds.
- **Device lanes:** StoreKit configuration file in the simulator (StoreKit Test), Play license testers on an
  internal track, Stripe test mode and test clocks for subscriptions.
- **Gate:** payment logic is exactly where fail-before and mutation testing (PLAN §7b) earn their cost, so every
  `weft/pay` scenario in the template app is gated.
- **Credentials:** agents use test keys from `.env.example` only. Live keys, store accounts and signing are human
  tasks.

## 9. Phasing

Part of [09 §12](09-native-targets.md) phase 6c, with the web half able to land earlier, in Phase 3 (`weft/start`):

| Step | Ships | Exit check |
|---|---|---|
| Web | Catalog, Stripe adapter, server ingest + entitlements, `fakePay`, PAY003/004/005/008 | An agent adds a subscription to the T3 todo app and the gate passes on renewal, failure and refund scenarios. |
| Native | StoreKit 2 and Play Billing modules, Stripe native SDK module, resolver + policy table, `weft pay sync`, PAY001/002/006/007/010 | The same `pro` product is bought on iOS (sandbox) and unlocks on web and Android with no app-code branch. |

## Sources

- Apple / Epic, US:
  - Ninth Circuit modification: https://www.macrumors.com/2025/12/11/apple-app-store-fees-external-payment-links/
  - Supreme Court: https://techcrunch.com/2026/04/06/apple-epic-games-lawsuit-supreme-court-appeal-app-store-commission/ ·
    https://thenextweb.com/news/supreme-court-apple-epic-contempt-app-store-commission ·
    https://tech-insider.org/apple-scotus-27-percent-app-store-fee-2026/ (secondary)
  - Remand proposal: https://appleinsider.com/articles/26/08/13/apples-latest-commission-rates-for-external-app-store-purchases-havent-satisfied-epic
  - Background: https://en.wikipedia.org/wiki/Epic_Games_v._Apple
- Google / Epic, US: https://support.google.com/googleplay/android-developer/answer/15582165 ·
  https://www.notebookcheck.net/Google-cuts-Play-Store-fees-as-Epic-settlement-reshapes-Android-app-payments.1243278.0.html
- Australia: https://www.lexology.com/library/detail.aspx?g=a0fda65b-6db0-4186-9a8c-c54bdabdf695
- Stripe mobile: https://docs.stripe.com/sdks/react-native · https://github.com/stripe/stripe-react-native (README: IAP
  rule for digital goods)
- StoreKit 2 and App Store Server API: https://developer.apple.com/storekit/ ·
  https://developer.apple.com/documentation/appstoreserverapi
- Play Billing and RTDN: https://developer.android.com/google/play/billing ·
  https://developer.android.com/google/play/billing/rtdn-reference
