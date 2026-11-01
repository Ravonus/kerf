# 37 — `weft/pay`, the web half: what was built, and what changed from research 10

Built 2026-10-31 from PLAN §4.4 and Phase 6c, inside §7c's slot model. Native rails, the policy table, `weft pay explain`
and `weft pay sync` are not built. Everything here was checked with `fakePay`, mocked Stripe HTTP and a local mock server,
and no run has completed against a Stripe account (see §8).

## 1. Where the code went

| Piece | Where | Why there |
|---|---|---|
| Catalog, `price`, `PayRail` | `weft/pay` | Client-safe, no dependencies. Nothing in weft imports it |
| Ledger, `definePay`, `memoryPayStore` | `weft/pay/server` | Rail-neutral, so a rail is only an adapter (research 13 §6). Q012 keeps it out of the client graph |
| `fakePay` | `weft/test` | Same place as `fakeMeasure`. It needs the ledger, which is why the ledger is in weft |
| `payRailSuite` | `weft/test/plugins` | Every slot ships a conformance suite (P119) |
| Webhook route, `ctx.entitlements`, `requires` | `@weft/start` | Mounted from `src/pay.server.ts`, the way `src/auth.server.ts` is |
| `drizzlePayStore` | `@weft/start/pay/drizzle` | Beside `auth/drizzle`, and research 10's `@weft/db-pay` isn't needed yet |
| Stripe | `@weft/plugin-pay-stripe` | The one new package. `fetch`, no SDK, server side only |

P118 says no plugin adds a route behind the app's back. The webhook exists because the app has `src/pay.server.ts`, and the
rail only answers it.

## 2. Zero bytes

The client graph never sees a rail: the provider declares only the `server` side, and Checkout is a redirect, so no page
needs Stripe.js or a publishable key. An app that doesn't import `weft/pay` has none of it in its bundle, which the packed
gate asserts. An app with no `src/pay.server.ts` gets `export default undefined` from `virtual:weft/pay`. What's left on
the server is one `options.pay` branch in the route function, a helper of a few lines and the `requires` check in `call`.
`bun`/`deno`: the ledger and the rail use only `fetch` and WebCrypto; `fakePay` uses `node:crypto`, in tests.

## 3. Changes from research 10

- **`entitlements` and `checkout` are the app's own server functions**, in `src/server/pay.ts`, not imports from
  `weft/pay`. `weft/start` gives a function its id from `export const x = query({…})` in a server module, and §7c wants
  nothing hidden. So a page reads `entitlements.live().value?.includes('pro')`: a list, since a `Set` doesn't survive JSON.
- **`checkout` returns no `Resource<CheckoutResult>`.** On the web it's a mutation that redirects, and `purchased` is
  unknowable at that moment anyway. The native half can add one.
- **`price()` is a plain value** from the catalog. A rail's live prices matter for store builds.
- **Keys are read from the server env**, and `weft.config.ts` has no `pay` block: `publishableKey` has no use on Checkout,
  and options land in a generated file.
- **Product catalog sync isn't needed for Stripe:** without `prices`, a session sends `price_data` from the catalog.

## 4. The ledger

At-least-once and out-of-order delivery is handled by making an application idempotent, rather than by claiming an event
first: a claimed event that crashes before its write would be lost. `ingest` skips events it has seen, applies by the
rail's clock, and marks last, so a crash redelivers and lands on what's already written. Two concurrent deliveries of one
event write the same row. A tie in Stripe's second-resolution clock goes to `refunded`/`revoked`. Identity merges whatever
the order, so a dispute before its payment still ends `revoked`.

A subscription's `checkout.session.completed` is ignored: it would overwrite a `trial` with `active` at the same second,
and `customer.subscription.*` carries everything. Only `refunded: true` is a refund; a part refund keeps what was bought.
`expires` plus a 3-day `leeway` bounds access if a renewal event never comes.

## 5. Query tags take `ctx`

`tags` could only read the input, and a client-supplied user id in a tag would be wrong. `tagsOf` in `exec.ts` passes `ctx`
to a `tags` function of two parameters, on the fetch, refresh and `.live` paths. One-parameter functions and arrays behave
as before.

## 6. Diagnostics

Research 10 §7's web codes are built: PAY003, PAY004, PAY005, PAY008, PAY010, T030. New: PAY011 (a webhook left unverified),
PAY012 (a rail's id in client code), PAY013 (checked only on the client), PAY014 (a rail and no ledger), PAY015 (an
unawaited `has`, which passes everyone) and PAY016 (a memory ledger). `weft fix` awaits PAY015 in an `async` function, and
PAY008 suggests the integer. PAY001, 002, 006, 007 and 020 need the native half or the policy table.

They read syntax, so they miss things. PAY013 knows `requires` and `entitlements.has` by name: a check through a helper
looks like no check. PAY004 keys on names (`isPro`, `paid`), so that a spinner stays quiet. PAY011's handler check looks for
known event names.

## 7. What was tested

- `fakePay`: a purchase through a real mutation, webhook, ledger and `.live` poke; the renewal, grace, recovery, trial,
  refund, dispute and leeway paths on the clock; forged, repeated, out-of-order and failed deliveries (`start/test/pay.test.tsx`).
- Mocked Stripe HTTP: request encoding, signatures, each status, the conformance suite (`plugin-pay-stripe/test`).
- A real handler and SQLite (`start/test/pay-server.test.ts`).
- The packed gate: `weft add pay` on tarballs, `tsc`, `weft check`, a build, then a sign-up, a checkout at a local mock, and
  forged, signed, cancelling and repeated webhooks against the built server, with its `fetch` limited to loopback.

## 8. Not verified

- **Stripe itself.** The field names, event shapes and the pinned `apiVersion` come from memory of Stripe's API, and mocks
  can only repeat that memory. Run a real test-mode purchase before trusting this.
- **`drizzlePayStore` on Postgres and MySQL:** only SQLite was run. The tables and the upserts are written for all three.
- A subscription's refund or dispute lands on its payment, not the subscription, so access follows
  `customer.subscription.*` rather than the charge.
- Prisma and native-SQL apps get `memoryPayStore()` and a next step: there is no store for those layers yet.
