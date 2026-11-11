<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">kerf (Rust crate)</h1>

<p align="center">
  <strong>The Rust side of Kerf's <code>remote()</code> and <code>native()</code>: server functions declared in TypeScript, implemented in Rust.</strong><br>
  Zod stays the source of truth. The crate generates the types, a <code>Service</code> trait and the transport, so a contract change stops <code>cargo</code> where the Rust no longer fits.
</p>

<p align="center">
  <a href="../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/rust-1.99.1-145c3c" alt="Rust toolchain 1.99.1">
  <img src="https://img.shields.io/badge/edition-2024-145c3c" alt="Rust edition 2024">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="../../site/content/learn/rust.md">Rust guide</a> ·
  <a href="../../packages/cli/docs/rust.md">Rust reference</a> ·
  <a href="../README.md">All crates</a>
</p>

> [!NOTE]
> This crate is not on crates.io. `@kerf-js/start` ships a copy of it in its package as `crate/` (written at `prepack`
> by `packages/start/scripts/crate.mjs`, without `target/` and `tests/`), and an app's `Cargo.toml` points there by
> path. That copy is always the version the installed TypeScript speaks. `kerf add rust` writes the dependency for you.

A Kerf server function can have a Rust body instead of a TypeScript `run`. You declare it in TypeScript with Zod, as
any other function, and give it `impl: <target>`. `kerf check`, `kerf dev` and `kerf build` write the schemas to
`.kerf/contract.json`, and this crate's `build` feature turns that file into Rust: a struct per input and output, a
typed error enum per function, and one `Service` trait. You implement the trait; the crate serves it as an HTTP sidecar
(`remote()`) or exports it in-process as a Node-API addon or a `.wasm` (`native()`).

TypeScript keeps the public edge: sessions, CSRF, the cache and validation on both sides of the call. Rust only sees
input that already passed, and claims, never cookies.

## Highlights

- **No hand-written Rust types.** `kerf::build::generate("<service>")` reads `.kerf/contract.json` and writes the types
  with typify, the error enums, the `Service` trait and `functions()` into `OUT_DIR`.
- **Drift stops the build.** A contract that changes reruns the build script, and `cargo` fails exactly where the
  implementation no longer fits. Kerf reports it as `R103` with the function's id.
- **The context matches the declaration.** A function gets `Ctx`, `UserCtx` (`auth: 'user'`) or `SharedCtx` (a shared
  cache), and `SharedCtx` has no `user()` at all, so leaking per-user data into a shared result is a compile error.
- **Signed calls.** A sidecar call carries `kerf-ctx` and `kerf-sig` headers: an HMAC-SHA256 over the function id, the
  context and the body, with `iat` checked against a 60-second skew.
- **One reply shape on every transport.** `{ "ok": true, "value", "tags", "touched" }` or
  `{ "ok": false, "error": { "code", … } }`, from HTTP, Node-API and WASM alike.
- **A panic is one failed call.** Each sidecar call runs in its own task with the deadline TypeScript sent; a panic or
  an overrun answers that call and leaves the process serving.
- **Feature-gated.** A `native()` addon links no server and no tokio; a build script links only the generator.

## Contents

- [Quick start](#quick-start)
- [Features](#features)
- [The generated contract](#the-generated-contract)
- [Contexts](#contexts)
- [`remote()`: the sidecar](#remote-the-sidecar)
- [`native()`: in-process](#native-in-process)
- [Errors](#errors)
- [API reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Build and test](#build-and-test)

## Quick start

In an app, let the CLI write the crate:

```bash
kerf add rust media            # native(): an in-process addon
kerf add rust search --remote  # remote(): a sidecar
```

For `remote()`, the crate depends on `kerf` twice: the default features for the sidecar, and only `build` for the build
script. With the copy inside `@kerf-js/start`, that looks like this:

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
kerf = { path = "../../node_modules/@kerf-js/start/crate" }

[build-dependencies]
kerf = { path = "../../node_modules/@kerf-js/start/crate", default-features = false, features = ["build"] }
```

```rust
// build.rs
fn main() {
    kerf::build::generate("search");
}
```

```rust
// src/main.rs
kerf::contract!();
use contract::*;

struct Search;

impl Service for Search {
    async fn search_docs(
        &self,
        ctx: kerf::SharedCtx,
        input: SearchDocsInput,
    ) -> Result<SearchDocsOutput, kerf::Error> {
        ctx.touch("docs");
        Ok(vec![])
    }
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    kerf::serve(kerf::router(contract::functions(Search))).await
}
```

For `native()`, the crate is a `cdylib`, depends on `kerf` with `default-features = false, features = ["native"]`, and
replaces `main` with one line:

```rust
kerf::native!(contract::functions(Media));
```

The [Rust guide](../../site/content/learn/rust.md) walks through both, including the TypeScript side.

## Features

| Feature | Default | Enables | Use it for |
|---|---|---|---|
| `core` | via `server` | `chrono`, `regress`, `serde`, `serde_json`, `uuid`; the `Ctx` types, `Functions`, `Error` | What generated code needs on any target |
| `server` | yes | `core` plus `axum`, `tokio`, `hmac`, `sha2`, `base64`, `tracing`, `tracing-subscriber`; `router`, `router_with`, `serve`, `sign`, `verify` | A `remote()` sidecar |
| `native` | no | `core` plus `napi`, `napi-derive` (not on wasm); `kerf::native!` | A `native()` crate, as an addon or a `.wasm`. No server, no tokio |
| `otel` | no | `server` plus `opentelemetry`, `tracing-opentelemetry` | Continue the trace TypeScript started, for an app that installs an OpenTelemetry layer |
| `build` | no | `typify`, `schemars`, `syn`, `prettyplease`, `napi-build`, `serde_json`; `kerf::build::generate` | A sidecar's or addon's `build.rs` |

## The generated contract

`kerf::build::generate(service)` does this, in a build script:

1. Finds the contract: `KERF_CONTRACT` if set, else the nearest `.kerf/contract.json` above the crate.
2. Turns each function of `service` into Rust. Names convert from camelCase: `searchDocs` becomes the method
   `search_docs` and the types `SearchDocsInput`, `SearchDocsOutput`. Two files that export the same name are kept
   apart by the function id.
3. Writes `OUT_DIR/kerf_contract.rs`, and a copy to read at `.kerf/rust/<service>.rs` (a build never depends on the
   copy).
4. For a `native` service on a non-wasm target, runs `napi_build::setup()` so the linker accepts the host's `napi_*`
   symbols.

`kerf::contract!()` includes the generated file as `pub mod contract`, which holds:

| Item | What it is |
|---|---|
| `<Name>Input`, `<Name>Output` | serde types for each function, from its Zod schemas |
| `<Name>Error` | A typed error enum, for each function that declares `errors` |
| `trait Service` | One `async fn` per function, each taking the context its declaration calls for |
| `fn functions(service) -> kerf::Functions` | The dispatch table that `kerf::router` serves and `kerf::native!` exports |
| `const CONTRACT_HASH` | The contract's hash. The sidecar's health check reports it, and neither side runs a binary built from another one |

## Contexts

The generated trait picks one context per function, from its declaration in TypeScript:

| Type | When | `user()` |
|---|---|---|
| `kerf::Ctx` | default | `Option<&User>`, as `ctx.user` is nullable in TypeScript |
| `kerf::UserCtx` | `auth: 'user'` | `&User`: TypeScript refused the call otherwise |
| `kerf::SharedCtx` | a shared cache (`cache: { life }`) | none: the value is shared by every user |

All three dereference to `kerf::Base`, which has:

| Method | What it does |
|---|---|
| `touch(table)` | Report a table this call read or wrote. `kerf dev` checks it against the function's tags (Q011) |
| `tag(tag)` | Add a cache tag to the result, or in a mutation a tag to invalidate. Rust can add tags, never remove declared ones |
| `function()` | The function's id, as the contract spells it |
| `request_id()` | The id TypeScript gave this request. The client sees it on an `Internal` failure, so log it |
| `traceparent()` | The W3C `traceparent` TypeScript sent, if any |
| `remaining()` | What's left of the deadline |
| `cancelled()` | `true` once the deadline has passed, so long CPU loops can stop |

`kerf::User` carries `id`, `roles`, an optional `tenant`, and any other claims in `extra`; `has_role(role)` checks
`roles`. These are only what `remote({ claims })` chose to send.

## `remote()`: the sidecar

`kerf::router(functions)` returns an axum `Router`, so a sidecar can be one binary or part of a larger axum app:

| Route | What it does |
|---|---|
| `POST /_kerf/fn/{id}` | Verify the signature, deserialize `{ "input": … }`, run the function in its own task under the deadline, answer |
| `GET /_kerf/health` | `{ ok, service, contract, functions, pid }`, for the supervisor |

`router` reads its key from `KERF_RUST_SECRET` and panics with `R106` when it is unset, because a sidecar that took
unsigned calls would trust any process that could reach it. `router_with(functions, secret)` takes the key directly.

`kerf::serve(router)` listens on `KERF_LISTEN` (`127.0.0.1:0` when unset), prints `kerf-listening <addr>` for the
supervisor, logs to stderr by `RUST_LOG` (default `info`) unless the app installed a subscriber, and drains on SIGTERM
or Ctrl-C.

### The envelope

Each call carries two headers:

```text
kerf-ctx: base64url(JSON of the Envelope)
kerf-sig: hex(HMAC-SHA256(secret, "kerf1\n" + id + "\n" + kerf-ctx + "\n" + body))
```

The envelope is `{ user, requestId, deadlineMs, traceparent, iat }`. The signature covers the function id and the body
as well as the claims, so a signed call can't be replayed against another function or with another input, and `iat`
bounds how long it can be replayed at all (`MAX_SKEW_MS` is `60_000`). `kerf::sign` and `kerf::verify` are public, for
tests and other hosts.

### What a call answers

| Outcome | Status | Body |
|---|---|---|
| Value | 200 | `{ "ok": true, "value": …, "tags": […], "touched": […] }` |
| Declared error | 200 | `{ "ok": false, "error": { "code": …, "data": … } }` |
| Panic, `kerf::Error`, or a result that doesn't serialize | 500 | `{ "ok": false, "error": { "code": "Internal", "requestId": … } }`; the detail stays in the sidecar's log |
| Input serde refuses, or claims that don't fit the context | 422 | `{ "ok": false, "error": { "code": "Drift", "message": … } }` |
| Unknown function id | 404 | `Drift`, naming the id |
| Missing, malformed or wrong signature, or stale `iat` | 401 | `Refused` |
| Deadline passed | 504 | `Deadline` |

When TypeScript hangs up, axum drops the handler's future and the crate aborts the task.

### Tracing

Each call runs in a `kerf.fn` span with `function`, `request_id`, `trace_id` and `parent_id` fields, taken from the
envelope's `traceparent`. With the `otel` feature, the span's parent is set from `traceparent`, so the call continues
the trace TypeScript started.

## `native()`: in-process

`kerf::native!(contract::functions(Svc))` exports the service from a `cdylib`. There is no HTTP and no signature,
because nothing outside the process can reach it. The service is built on the first call, not while the library loads.

| Target | Exports | How a call runs |
|---|---|---|
| Node-API addon | `call(id, ctx, body)` (async), `contract()` | On the host's worker pool, so a long call doesn't hold the event loop |
| `wasm32` | `kerf_init`, `kerf_alloc`, `kerf_free`, `kerf_call`, `kerf_contract`; imports `kerf.now` and `kerf.panicked` | On whatever thread calls it. Returns `pointer << 32 | length` |

`contract()` returns `{ service, hash, functions }`, and TypeScript refuses a library built from another contract
(R103).

> [!WARNING]
> `native()` brings no async runtime. It is for CPU work. A function that waits on IO belongs in `remote()`: on the
> WASM build a method that doesn't complete without waiting panics.

## Errors

A function that declares no `errors` returns `kerf::Error`. Any `std::error::Error` converts into it, so `?` works, and
`kerf::Error::msg("…")` makes one from text. It always becomes an `Internal` failure: the client gets the request id
and the detail stays on the server.

A function that declares `errors` returns its generated `<Name>Error` enum, which implements `kerf::Failure` and
serializes as `{ "code": …, "data": … }`. TypeScript checks it against the declaration, and the client catches
`e.code` and `e.data`.

## API reference

| Item | Feature | Description |
|---|---|---|
| `kerf::contract!()` | any | Include the generated contract as `pub mod contract` |
| `kerf::native!(functions)` | `native` | Export the functions as a Node-API addon, or as a `.wasm` on that target |
| `kerf::build::generate(service)` | `build` | Generate the contract in a build script. Panics with `R103` and a fix when it can't |
| `kerf::router(functions)` | `server` | An axum `Router` keyed by `KERF_RUST_SECRET` |
| `kerf::router_with(functions, secret)` | `server` | The same, with the key in hand |
| `kerf::serve(router)` | `server` | Serve on `KERF_LISTEN` and drain on SIGTERM or Ctrl-C |
| `kerf::sign(secret, id, ctx, body)` | `server` | The `kerf-sig` value for a call |
| `kerf::verify(secret, id, ctx, sig, body, now_ms)` | `server` | Check a call and decode its `Envelope`, or say why it is `Refused` |
| `kerf::Refused` | `server` | `Malformed`, `BadSignature` or `Stale` |
| `kerf::Ctx`, `UserCtx`, `SharedCtx` | `core` | The three contexts |
| `kerf::Base`, `FromBase` | `core` | What every context has, and how generated code builds a context from it |
| `kerf::User`, `Envelope` | `core` | The claims, and what TypeScript sends about a call |
| `kerf::Functions` | `core` | A service's functions by contract id |
| `kerf::Error`, `Failure`, `Failed` | `core` | The default error, the trait an error type implements, and what it becomes on the wire |

## Troubleshooting

| Message | Cause and fix |
|---|---|
| `R103: no .kerf/contract.json above this crate` | The build script found no contract. Run `kerf dev` or `kerf check` in the app, or set `KERF_CONTRACT` |
| `R103: …` with a function's name from `cargo` | The contract changed and the Rust no longer matches. Update the `impl Service` |
| `R106: KERF_RUST_SECRET is not set` | `kerf dev` and `kerf start` set it. A sidecar deployed on its own needs the same value as the server |
| `Refused`: the signature doesn't match | `KERF_RUST_SECRET` differs between the two sides |
| `Refused`: signed too long ago | A clock is more than 60 seconds off |
| `Drift` | The sidecar and TypeScript were built from different contracts. Rebuild the sidecar |

The full list of Rust codes, R101 to R109, is in the [Rust reference](../../packages/cli/docs/rust.md).

## Build and test

The toolchain is pinned in `rust-toolchain.toml` to Rust `1.99.1` with `clippy` and `rustfmt`.

```bash
cd crates/kerf
cargo test                                 # default features: unit tests, tests/router.rs and doc tests
cargo test --features build,otel           # also the generator's and the otel layer's unit tests
cargo clippy --all-targets -- -D warnings
```

The `build` and `otel` modules exist only with their features, so their unit tests run only when those are on.

`tests/router.rs` drives the router as TypeScript meets it: a signed POST and each way a call can end (a value with
both reports, the declared context enforced at run time, a typed error, a panic, the deadline, drift, an unknown
function, a bad signature, and the health check). `src/ctx.rs` holds a `compile_fail` doc test proving `SharedCtx` has
no `user()`. `evals/gates/phase5a-exit.mjs` and `evals/gates/phase5b-exit.mjs` build real crates against this one.

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the repository workflow.

## License

[MIT](../../LICENSE)
