# 37 — `@weft-js/pay`, the web half: what was built, and what changed from research 10

Built 2026-10-31 from PLAN §4.4 and Phase 6c, inside §7c's slot model. Native rails, the policy table, `weft pay explain`
and `weft pay sync` are not built. Everything here was checked with `fakePay`, mocked Stripe HTTP and a local mock server,
and no run has completed against a Stripe account (see §8).

## 1. Where the code went

Pay is a plugin, and the reference one: `weft docs plugins` walks through it. It went into weft first and came out again,
because a framework feature can use private paths and a plugin can't, and nobody could copy the first version.

| Piece | Where | Why there |
|---|---|---|
| Catalog, `price`, `PayRail` | `@weft-js/pay` | Client-safe, no dependencies |
| Ledger, `definePay`, `memoryPayStore` | `@weft-js/pay/server` | Rail-neutral, so a rail is only an adapter (research 13 §6). PAY017 keeps it out of the client graph |
| `fakePay`, `payRailSuite` | `@weft-js/pay/test` | Core can't depend on a plugin, so this isn't `@weft-js/core/test`. It reaches that only through `net` and `clock` |
| PAY-codes, `weft add pay` | `src/checks.mjs`, `src/setup.mjs` | The `check` hook and the `setup` data, in the manifest |
| `drizzlePayStore` | `@weft-js/pay/drizzle` | Beside the ledger |
| Stripe | `@weft-js/pay/stripe` | A provider. `fetch`, no SDK, server side only |

What pay needed became API, each with a test that names no plugin:

| Added | For |
|---|---|
| `server.extension@1` (`@weft-js/start/extension`) | Routes under `/_weft/x/<key>/`, `ctx`, guards, enforced options, personal keys, a boot check |
| `FnOptions` | Options on `query` and `mutation`, by augmentation |
| 2-argument `tags` | Query tags that read `ctx` (§5) |
| `answer` on an error | Any plugin's typed error, status included |
| `net.extension` | A plugin's server part in `@weft-js/core/test` |
| `setup` in a manifest | `weft add` writes what a plugin describes |
| `docs` in a manifest, and plugin codes in `weft docs` | `weft docs pay`, `weft docs PAY012` |

Two things worth knowing. `requires` first failed open if the plugin went missing, since core ignored an option it didn't
know. An option no extension claims now refuses the call (P101). And `pay.rail` is still in weft's slot table and in Vite's
`CORE_SLOTS`, because §7c listed it and the server module imports it with no rail bound under test; a third-party plugin's
slot is named `<plugin>.<slot>`.

P118 says no plugin adds a route behind the app's back. An extension runs only if the app has `src/<key>.server.ts`, so the
webhook exists because `src/pay.server.ts` does.

## 2. Zero bytes

The client graph never sees a rail: the provider declares only the `server` side, and Checkout is a redirect, so no page
needs Stripe.js or a publishable key. An app without the plugin has none of it in its bundle, which the packed gate asserts;
that gate caught an error-name literal in `dbError` before pay moved out. In `@weft-js/start` nothing is left but the generic
seam. The ledger and the rail use only `fetch` and WebCrypto, so neither ties an app to Node.

## 3. Changes from research 10

- **`entitlements` and `checkout` are the app's own server functions**, in `src/server/pay.ts`, not imports from
  `@weft-js/pay`. `weft/start` gives a function its id from `export const x = query({…})` in a server module, and §7c wants
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

Research 10 §7's web codes are built: PAY003, PAY004, PAY005, PAY008, PAY010, PAY031. New: PAY011 (a webhook left unverified),
PAY012 (a rail's id in client code), PAY013 (checked only on the client), PAY014 (a rail and no ledger), PAY015 (an
unawaited `has`, which passes everyone) and PAY016 (a memory ledger). `weft fix` awaits PAY015 in an `async` function, and
PAY008 suggests the integer. PAY001, 002, 006, 007 and 020 need the native half or the policy table.

They read syntax, so they miss things. PAY013 knows `requires` and `entitlements.has` by name: a check through a helper
looks like no check. PAY004 keys on names (`isPro`, `paid`), so that a spinner stays quiet. PAY011's handler check looks for
known event names.

## 7. What was tested

- `fakePay`: a purchase through a real mutation, webhook, ledger and `.live` poke; the renewal, grace, recovery, trial,
  refund, dispute and leeway paths on the clock; forged, repeated, out-of-order and failed deliveries (`pay/test/pay.test.tsx`).
- Mocked Stripe HTTP: request encoding, signatures, each status, the conformance suite (`plugin-pay-stripe/test`).
- A real handler and SQLite (`pay/test/server.test.ts`).
- The packed gate: `weft add pay` on tarballs, `tsc`, `weft check`, a build, then a sign-up, a checkout at a local mock, and
  forged, signed, cancelling and repeated webhooks against the built server, with its `fetch` limited to loopback.

## 8. Rust and wasm: measured, and not used

The question was whether HMAC-SHA256 with a constant-time compare, in wasm, beats WebCrypto. `packages/pay/bench/verify.mjs`
and its crate (`hmac`, `sha2`, `subtle`, 23 KB after `wasm-opt`) measure one verification, key import included, as a median
of 7 runs of 20,000 on an M4 Max under load 20 to 30, so read these as ratios.

| Body | Runtime | Sign, then compare in JS | `subtle.verify` | Wasm |
|---|---|---|---|---|
| 2 KB | Node 26.13 | 26.0 µs | 21.3 µs | 10.0 µs |
| 2 KB | Bun 1.4.4 | 20.3 µs | 15.0 µs | 9.3 µs |
| 2 KB | Deno 2.9.8 | 26.1 µs | 27.4 µs | 8.7 µs |
| 200 KB | Node 26.13 | 130.9 µs | 134.2 µs | 585.1 µs |
| 200 KB | Bun 1.4.4 | 121.5 µs | 122.7 µs | 794.0 µs |
| 200 KB | Deno 2.9.8 | 165.6 µs | 198.7 µs | 746.1 µs |

Wasm saves 6 to 19 µs on a small event, probably by skipping WebCrypto's key import (not isolated), and loses by 4 to 6.5 times on a large one,
because native SHA-256 uses the CPU's SHA instructions and wasm can't. Interpolated, the crossover is around 5 to 7 KB. A webhook then
writes to a database, usually a matter of milliseconds, so the small win should be lost in that (the full request wasn't timed). Security doesn't favour it
either: `subtle` is best effort once a JIT compiles it, while `subtle.verify` is the runtime's native constant-time compare.
It would also add a build step and a binary to a package that has neither.

So verification stays on WebCrypto, and the rail moved from a hex loop in JS to `crypto.subtle.verify`: about the same speed, and
one less hand-written compare. Idempotency and entitlement checks are store reads, with nothing for Rust to speed up, so
they weren't measured. If this is revisited, a server-side `native()` binding (Phase 5b) could use the CPU's instructions,
which wasm can't. That's where it would move; nothing here depends on it. The bench isn't published with the package.

## 9. Not verified

- **Stripe itself.** The field names, event shapes and the pinned `apiVersion` come from memory of Stripe's API, and mocks
  can only repeat that memory. Run a real test-mode purchase before trusting this.
- **`drizzlePayStore` on Postgres and MySQL:** only SQLite was run. The tables and the upserts are written for all three.
- A subscription's refund or dispute lands on its payment, not the subscription, so access follows
  `customer.subscription.*` rather than the charge.
- Prisma and native-SQL apps get `memoryPayStore()` and a next step: there is no store for those layers yet.
