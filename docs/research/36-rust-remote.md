# 36. Rust sidecars: `remote()`, the `weft` crate and the supervisor

Status: built for Phase 5a, 2026-10-31. `native()` is [39](39-rust-native.md). It refines PLAN §4.3 and research 06. Spike:
`spikes/rust-remote/`. Exit check: `evals/phase5a-exit.mjs`, results in `evals/results/phase5a-exit.md`.

**Goal:** a server function's body can be Rust, and nothing on the client can tell. TS keeps the public edge.

## 1. What the spike settled

Sequential p50 on this Mac, against a real axum sidecar with the signed envelope:

| Transport | Node | Bun | Deno |
|---|---|---|---|
| `fetch` over loopback TCP, small body | 71 µs | 37 µs | 49 µs |

- A Unix socket saves under 10 µs on `node:http`, and is much worse on Deno (109 µs, p99 5.4 ms). Bun and Node's `fetch`
  don't share one socket API either. **Loopback TCP and `fetch`:** it's the same code on every runtime, and it's edge-safe.
- HMAC-SHA256 through WebCrypto costs at most ~20 µs, so there's no reason for a faster, runtime-specific path.
- typify 0.8 turns Zod 4's JSON Schema into serde types. Its gaps are small and are patched in `build.rs`: tuples need
  `min/maxItems` and `prefixItems` rewritten to `items`, and `::chrono`, `::uuid` and `::regress` are rewritten to
  `::weft::__rt::`, so an app needn't depend on them. `z.int().min(1)` becomes `NonZero<u64>`: exact, and a little unusual.
- A plain object `z.union` becomes an externally tagged enum, which is the wrong wire shape. So R102 is an error, and not a
  warning. Scalar unions are right.
- `schema.encode` works for codecs and throws on one-way transforms, which is how R101 can be exact.

## 2. The wire

`POST /_weft/fn/:id`, body `{"input":…}`, with two headers:

- `weft-ctx`: base64url of `{ user, requestId, deadlineMs, traceparent, iat }`.
- `weft-sig`: hex HMAC-SHA256 of `weft1\n<id>\n<ctx>\n<body>`.

`iat` must be within 60 s. The id is signed, so a captured call can't be replayed against another function. The vector in
`crates/weft/src/envelope.rs` is also asserted in `packages/start/test/rust.test.ts`.

The answer is `{ ok: true, value, tags, touched }` or `{ ok: false, error: { code, data } }`.

| Sidecar says | Status | TS raises |
|---|---|---|
| a declared error | 200 | that code, with checked `data` |
| `Refused` | 401 | R106 |
| `Drift` | 404, 422 | R103 |
| `Deadline` | 504 | R107 |
| `Internal` | 500 | R108, with the request id |

The wire is the input side of every schema. TS encodes its parsed input, so `.trim()` and defaults have run and a `Date` is
a string again. It validates the output with the schema, and keeps the parsed result, so a codec gives its `Date`.

## 3. The contract

`.weft/contract.json` gains an `impl` per function (`target`, `service`, `ctx`, wire `input`, `output`, `errors`) and
`services` (functions and a hash for each one). `build.rs` reads it, and generates types, a `Service` trait with one
method per function, and `functions()`. Rust never defines a schema.

**Schemars is dropped** (PLAN §4.3 had it detect drift). With generated types, it would compare typify's output with
itself. Drift is caught by `cargo`, by the contract hash in `/_weft/health`, by the input a sidecar fails to decode, and by
the output TS validates.

## 4. Three contexts

`Ctx`, `UserCtx` for `auth: 'user'` and `SharedCtx` for a shared cached query. `SharedCtx` has no `user()`, so a compiler
error stops a user's data going into a shared cache (a `compile_fail` doctest holds this). `auth` stays in TS, and a shared
query sends no user at all.

## 5. The supervisor

It lives in the CLI's side of `@weft-js/start` (`sidecar.mjs`), and never in the server bundle, so `remote()` stays `fetch` and
edge presets can call a sidecar run elsewhere.

- **dev:** a small HTTP proxy holds a stable port. A rebuild starts a new child, waits for health, swaps, and drains the
  old one. A failed build keeps the old child.
- **start:** a fixed loopback port, restart with backoff, gone when the server goes.
- **build:** contract, then `cargo build --release` into `.weft/sidecars/`, then run them while Nitro prerenders, since a
  card's `load` may read one. Nitro empties `.output`, so they reach `.output/rust/` afterwards, with a manifest.

**Dev waits for the first build before it listens.** Queueing requests instead looks kinder, but a signed `iat` and a client
timeout would expire in a queue of ~20 s, and a first request that fails is worse than a dev server that starts later.

## 6. Decisions

| Decision | Why | One setting away |
|---|---|---|
| `@weft-js/start/rust`, not `weft/rust` | `weft` has no server; every server export lives here | |
| The address is env, not config | It differs per deployment, and it sits next to the secret | `url` on `remote()` |
| External sidecars | Some belong on another host | `rust.services.<name>.external` |
| Another crate path | `crates/<name>` is the default | `rust.services.<name>.crate` |
| Output validated on every call | The boundary is the point, and it's the cheapest place to catch drift | `validate: false` |
| Claims are `id`, `roles`, `tenant` | The least that's useful; never the whole user | `claims` |
| Plain unions are an error | The generated type would be wrong silently | `rust.unions: 'allow'` |
| `errors` + `raise()` in TS as well | A swap can't change what a client catches | |
| `locale` isn't sent | Nothing in 5a reads it; add it with a use | |
| One `weft` crate, with a `build` feature | One version for runtime and codegen, so they can't disagree | |
| Not published | Path dependency for now; distribution is open (§9) | |

## 7. What it costs

From `evals/results/phase5a-exit.md`, the same tf-idf search over 20,000 documents, on a busy Mac (load 40–60), so read the
ratios loosely:

| Runtime | Body | p50 ms | p99 ms | calls/s, 32 callers |
|---|---|---|---|---|
| Node | TS `run` | 5.9 | 14.44 | 214 |
| Node | Rust | 8.87 | 35.44 | 851 |
| Bun | TS `run` | 5.66 | 25.88 | 211 |
| Bun | Rust | 3.55 | 6.86 | 1755 |
| Deno | TS `run` | 12.28 | 35.31 | 96 |
| Deno | Rust | 3.59 | 5.69 | 1922 |

Throughput is the gain: 4–20× here, because a TS `run` holds the event loop and a sidecar doesn't. One sequential call
isn't reliably faster (Node's p50 was worse in this run, and on 2,000 documents TS won on p50 too, 0.86 ms to 1.32 ms). PLAN
§4.3's ≥ ~1 ms rule stands.

## 8. Diagnostics

| Code | When | By |
|---|---|---|
| R101 | No `output`, a type JSON can't carry, a one-way input transform | contract |
| R102 | A plain `z.union` of objects | contract |
| R103 | Rust and contract disagree: cargo, a binary's hash, an output, an undeclared error, or a `run` with an `impl` | cargo, start |
| R106 | No address, no secret, a refused signature | start |
| R107 | Unreachable, or past the deadline | start |
| R108 | A panic or `weft::Error` | start |
| R109 | A compile error no function explains, no crate, no `cargo` | cargo |

R104 and R105 are in [39 §8](39-rust-native.md). Cargo's JSON messages are mapped to a function by the generated
names, so R103 names the id and the place in the Rust.

## 9. Not done

- The crate isn't on crates.io, and no check has been made that the name `weft` is free. An app uses a path dependency.
- ~~No `weft add rust`, and no template.~~ Done in 5b ([39](39-rust-native.md)).
- `remote(…)` on `channel` (PLAN §4.3's `world`) isn't built. It wasn't in 5a's list, and Rust owning a socket is another design.
- `otel` is only unit-tested on parsing a `traceparent`; no real collector has seen a span.
- `remote()` hasn't been run on an edge preset, or a sidecar on Windows.
- ~~R105 waits for 5b.~~ Done ([39 §8](39-rust-native.md)).
