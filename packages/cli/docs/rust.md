# Rust sidecars: `remote()`

A server function can have a Rust body. The client doesn't change: the same import, call, cache, tags and errors. Zod
stays the only schema. Reach for this at about 1 ms of CPU per call or on byte payloads (search, parsing, images), not for
IO-bound CRUD.

## Swap a `run` for `impl`

```ts
// src/server/rust.ts: the only place Rust targets are named
import { remote } from '@weft/start/rust'
export const search = remote('rust://search')
```

```ts
// src/server/docs.ts
export const searchDocs = query({
  input: z.object({ q: z.string().trim().min(1).max(200), limit: z.int().min(1).max(50).default(10) }),
  output: z.array(z.object({ id: z.string(), title: z.string(), score: z.number() })),
  tags: ['docs'],
  impl: search,          // was: run: ({ input }) => rank(input.q, input.limit)
})
```

`output` is required on an `impl`. `crates/search` is the crate, unless config says otherwise:

```toml
# crates/search/Cargo.toml
[dependencies]
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
weft = { path = "<your weft checkout>/crates/weft" }  # not on crates.io yet

[build-dependencies]
weft = { path = "<your weft checkout>/crates/weft", default-features = false, features = ["build"] }
```

```rust
// crates/search/build.rs
fn main() { weft::build::generate("search"); }
```

```rust
// crates/search/src/main.rs
weft::contract!();          // types and a `Service` trait, generated from your Zod: never hand-written
use contract::*;

struct Search;

impl Service for Search {
    async fn search_docs(&self, ctx: weft::Ctx, input: SearchDocsInput) -> Result<SearchDocsOutput, weft::Error> {
        ctx.touch("docs");
        Ok(vec![])
    }
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    weft::serve(weft::router(contract::functions(Search))).await
}
```

Use Rust 1.99 or newer. A method is the function's name in snake case; a type is its name plus `Input`, `Output`, or a
property's name in pascal case.

## What happens where

TS keeps the public edge: sessions, CSRF, input validation, the cache, `auth`, `tags`, `invalidates`. Rust gets one signed
POST per call: the parsed input, the user's claims (never cookies), `traceparent` and a deadline. TS then validates the
output, in production too. Set `remote(target, { validate: false })` to trust it.

Options on `remote(target, options)`: `url` (else `WEFT_RUST_<NAME>_URL`), `timeout` (ms, default 10000), `claims`
(`user => …`, default `id`, `roles`, `tenant`), `validate`.

## The context

| A function that is | Its `ctx` | `user()` |
|---|---|---|
| `auth: 'user'` | `weft::UserCtx` | `&User`, always there |
| cached with shared scope | `weft::SharedCtx` | doesn't exist, so it can't leak into a shared cache |
| anything else | `weft::Ctx` | `Option<&User>` |

All three have `ctx.touch(table)`, `ctx.tag(tag)`, `ctx.remaining()`, `ctx.cancelled()`, `ctx.request_id()`,
`ctx.traceparent()`.

- `ctx.touch("docs")` reports a table it read or wrote. In dev it feeds Q011, like a TS `run`'s.
- `ctx.tag("doc:7")` adds a cache tag. It joins the declared ones; Rust can't remove any.

## Typed errors

```ts
export const getDoc = query({ input, output, errors: { NotFound: z.object({ id: z.string() }) }, impl: search })
// a TS body raises the same thing: run: () => raise('NotFound', { id })
```

```rust
async fn get_doc(&self, ctx: weft::Ctx, input: GetDocInput) -> Result<GetDocOutput, GetDocError> {
    Err(GetDocError::NotFound(GetDocNotFound { id: input.id.to_string() }))
}
```

The client catches `e.code === 'NotFound'` and `e.data`, either way. A panic or `weft::Error` is R108: the client gets a
request id, and the detail stays in the sidecar's log.

## Types that cross

- JSON only. `z.date()` is R101: use `z.iso.datetime()`, or `z.codec(z.iso.datetime(), z.date(), …)` for a `Date` in TS.
- `.trim()`, `.default()` and codecs are fine. A one-way `.transform()` on an input is R101, as it can't be encoded back.
- An output may transform: TS parses what Rust sends.
- `z.void()` is R101: use `z.null()`.
- Tag a union of objects with `z.discriminatedUnion`. A plain one is R102, or set `rust: { unions: 'allow' }`.
- The wire is the input side of each schema, so Rust sees what the codec encodes.

## `weft dev`, `build`, `start`

- `weft dev` builds each sidecar, waits for the first build, and rebuilds on an edit. The new binary starts beside the old
  one, takes over when it's healthy, and the old one drains, so no request fails. A failed build keeps the old one
  running and prints R103 or R109.
- `weft check` runs `cargo check`, and stops at the Rust a schema edit broke, with the function's id (R103).
- `weft build` runs `cargo build --release`, runs the sidecars while it prerenders, and ships them in `.output/rust/`.
- `weft start` runs them on loopback, restarts a crash with backoff, and stops them when it stops. A dead sidecar costs
  its functions (R107), not the server.

## Deployment and settings

```ts
// weft.config.ts
rust: {
  unions: 'allow',                                   // let plain object unions through (R102)
  services: {
    search: { crate: 'native/search' },              // default: crates/<name>
    core: { external: true },                        // built and run elsewhere: no cargo here
  },
}
```

A sidecar on another host needs `external: true`, `WEFT_RUST_<NAME>_URL`, and the same `WEFT_RUST_SECRET` on both sides;
`weft dev` and `weft start` make those themselves for sidecars they run. Bind it privately: it trusts only the signature,
and the claims in it. The binary reads `WEFT_LISTEN` (default a free loopback port); a build reads `WEFT_CONTRACT`, or finds
`.weft/contract.json` above the crate. `GET /_weft/health` gives its service, contract hash, functions and pid. An edge preset can call `remote()`, as it is only
`fetch`, but something else must run the sidecar.

Each call is a `tracing` span with `trace_id` and `parent_id`. With the `otel` feature and your own OpenTelemetry layer,
the span continues TS's trace.

In a test, `handlers` replaces a function as it does a `run`, and nothing crosses.

## Diagnostics

- **R101** no `output`, a type JSON can't carry, or a one-way input transform.
- **R102** a plain `z.union` of objects.
- **R103** the Rust and the contract disagree: at `cargo`, in a binary's hash, or in an output or undeclared error at runtime.
- **R106** no address, no secret, or a refused signature.
- **R107** not answering, or past the deadline.
- **R108** a panic or `weft::Error`.
- **R109** the crate doesn't build for a reason unrelated to the contract, or it isn't there.
