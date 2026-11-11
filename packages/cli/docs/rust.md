# Rust: `native()` and `remote()`

Rust is optional. kerf needs no Rust toolchain to create, run, build or check an app, on any platform: the compiler ships as
WASM, and a prebuilt native addon installs by itself where one fits, which makes builds faster and changes no output.
`kerf doctor` says which one is running. Rust is for this page: the code you choose to write in it, which is the only thing
that calls `cargo`.

A server function can have a Rust body. The client doesn't change: the same import, call, cache, tags and errors. Zod
stays the only schema. Reach for this at about 1 ms of CPU per call or on byte payloads (search, parsing, images), not for
IO-bound CRUD.

| | `native('media')` | `remote('rust://search')` |
|---|---|---|
| Runs | in the server's process: an addon, or WASM where one can't load | a sidecar, over loopback or another host |
| Good for | one hot CPU function | many functions, IO, anything with its own state or runtime |
| Costs per call | ~10–30 µs | ~50–80 µs |
| A panic costs | that call | that call |
| A hang costs | a worker thread until it returns | nothing here: the sidecar is killable |

`kerf add rust [name]` writes a working crate, its module and one function, with `native()`; `--remote` writes a sidecar.
The crate's code is the same `impl Service` either way, so moving between them is a line in `src/server/rust.ts` and the
glue at the bottom of the crate.

## Swap a `run` for `impl`

```ts
// src/server/rust.ts: the only place Rust targets are named
import { remote } from '@kerf/start/rust'
export const search = remote('rust://search')
```

<!-- example: skip imports src/server/rust.ts from the block above -->
```ts
// src/server/docs.ts
import { query } from '@kerf/start'
import { z } from 'zod'
import { search } from './rust'

export const searchDocs = query({
  input: z.object({
    q: z.string().trim().min(1).max(200),
    limit: z.int().min(1).max(50).default(10),
  }),
  output: z.array(z.object({
    id: z.string(), title: z.string(), score: z.number(),
  })),
  tags: ['docs'],
  // Was: run: ({ input }) => rank(input.q, input.limit)
  impl: search,
})
```

`output` is required on an `impl`. `crates/search` is the crate, unless config says otherwise. `kerf add rust` writes all of
this; the `kerf` path is inside `@kerf/start`, because the crate isn't on crates.io yet:

```toml
# crates/search/Cargo.toml
[dependencies]
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
kerf = { path = "../../node_modules/@kerf/start/crate" }

[build-dependencies.kerf]
path = "../../node_modules/@kerf/start/crate"
default-features = false
features = ["build"]
```

```rust
// crates/search/build.rs
fn main() { kerf::build::generate("search"); }
```

```rust
// crates/search/src/main.rs
// Types and the `Service` trait are generated from Zod.
kerf::contract!();
use contract::*;

struct Search;

impl Service for Search {
    async fn search_docs(
        &self,
        ctx: kerf::Ctx,
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

Use Rust 1.99 or newer (`rust-toolchain.toml` pins it). A method is the function's name in snake case; a type is its name plus `Input`, `Output`, or a
property's name in pascal case.

## In-process: `native()`

The same `Service`, in a library. `crate-type = ["cdylib"]`, and `features = ["native"]` on `kerf` in place of the server:

```rust
// crates/media/src/lib.rs
kerf::contract!();
use contract::*;

struct Media;
impl Service for Media {
    async fn thumbnail(
        &self,
        ctx: kerf::Ctx,
        input: ThumbnailInput,
    ) -> Result<ThumbnailOutput, kerf::Error> { /* … */ }
}

kerf::native!(contract::functions(Media));
```

```ts
// src/server/rust.ts
import { native } from '@kerf/start/rust'
// Options: timeout, claims, validate, as for remote().
export const media = native('media')
```

- An addon runs each call on the worker pool, so a long one doesn't hold the event loop. `native()` sizes the pool to the
  machine unless `UV_THREADPOOL_SIZE` is set.
- `kerf build` also builds `wasm32-unknown-unknown` with SIMD on. With no addon for the platform, the server loads the
  `.wasm` and says so. WASM runs on the event loop, as a TS `run` does.
- There's no async runtime in it. A method may be `async`, but one that waits on IO belongs in `remote()`; on WASM, one that
  waits is R108.
- `timeout` stops TS waiting (R107). A call can't be stopped from outside: check `ctx.cancelled()` in a long loop.
- A panic is R108 for that call. On WASM it ends the instance, and the next call gets a new one, so a static is lost.
- Bytes cross as JSON, so `z.base64()` for now: the call costs more than the `Buffer` it could be.

## What happens where

TS keeps the public edge: sessions, CSRF, input validation, the cache, `auth`, `tags`, `invalidates`. Rust gets one crossing
per call (a signed POST for a sidecar): the parsed input, the user's claims (never cookies), `traceparent` and a deadline.
TS then validates the output, in production too. Set `remote(target, { validate: false })` to trust it.

Options on `remote(target, options)`: `url` (else `KERF_RUST_<NAME>_URL`), `timeout` (ms, default 10000), `claims`
(`user => …`, default `id`, `roles`, `tenant`), `validate`.

## The context

| A function that is | Its `ctx` | `user()` |
|---|---|---|
| `auth: 'user'` | `kerf::UserCtx` | `&User`, always there |
| cached with shared scope | `kerf::SharedCtx` | doesn't exist, so it can't leak into a shared cache |
| anything else | `kerf::Ctx` | `Option<&User>` |

All three have `ctx.touch(table)`, `ctx.tag(tag)`, `ctx.remaining()`, `ctx.cancelled()`, `ctx.request_id()`,
`ctx.traceparent()`.

- `ctx.touch("docs")` reports a table it read or wrote. In dev it feeds Q011, like a TS `run`'s. A cached query with `tags`
  that never calls it is R105; a query that reads no table should drop `tags`.
- `ctx.tag("doc:7")` adds a cache tag. It joins the declared ones; Rust can't remove any.

## Typed errors

<!-- example: skip a fragment of src/server/docs.ts -->
```ts
export const getDoc = query({
  input, output,
  errors: { NotFound: z.object({ id: z.string() }) },
  impl: search,
})
// A TS body raises the same thing:
// run: () => raise('NotFound', { id })
```

```rust
async fn get_doc(
    &self,
    ctx: kerf::Ctx,
    input: GetDocInput,
) -> Result<GetDocOutput, GetDocError> {
    Err(GetDocError::NotFound(GetDocNotFound {
        id: input.id.to_string(),
    }))
}
```

The client catches `e.code === 'NotFound'` and `e.data`, either way. A panic or `kerf::Error` is R108: the client gets a
request id, and the detail stays in the sidecar's log.

## Types that cross

- JSON only. `z.date()` is R101: use `z.iso.datetime()`, or `z.codec(z.iso.datetime(), z.date(), …)` for a `Date` in TS.
- `.trim()`, `.default()` and codecs are fine. A one-way `.transform()` on an input is R101, as it can't be encoded back.
- An output may transform: TS parses what Rust sends.
- `z.void()` is R101: use `z.null()`.
- Tag a union of objects with `z.discriminatedUnion`. A plain one is R102, or set `rust: { unions: 'allow' }`.
- The wire is the input side of each schema, so Rust sees what the codec encodes.

## `kerf dev`, `build`, `start`

- `kerf dev` builds each sidecar, waits for the first build, and rebuilds on an edit. The new binary starts beside the old
  one, takes over when it's healthy, and the old one drains, so no request fails. A failed build keeps the old one
  running and prints R103 or R109.
- A `native()` crate rebuilds the same way, and no restart is needed: each build is a new file, the next call loads it, and
  calls on the old one finish. An addon can't be unloaded, so a long session holds its old copies (about 0.5 MB each); they
  go when `kerf dev` stops.
- `kerf check` runs `cargo check`, and stops at the Rust a schema edit broke, with the function's id (R103). For a
  `native()` crate it checks the WASM build too (R104), and reads each cached query for `touch` (R105).
- `kerf build` runs `cargo build --release`, runs the sidecars while it prerenders, and ships them in `.output/rust/`.
  A `native()` crate's addon and `.wasm` go in `.output/server/rust/`, so whatever moves the server moves them.
- `kerf start` runs them on loopback, restarts a crash with backoff, and stops them when it stops. A dead sidecar costs
  its functions (R107), not the server.

## Deployment and settings

```ts
// kerf.config.ts
rust: {
  unions: 'allow', // let plain object unions through (R102)
  services: {
    search: { crate: 'native/search' }, // default: crates/<name>
    core: { external: true }, // built and run elsewhere: no cargo
    // Links C; this host has an addon, so no fallback (R104).
    imaging: { wasm: false },
  },
}
```

A sidecar on another host needs `external: true`, `KERF_RUST_<NAME>_URL`, and the same `KERF_RUST_SECRET` on both sides;
`kerf dev` and `kerf start` make those themselves for sidecars they run. Bind it privately: it trusts only the signature,
and the claims in it. The binary reads `KERF_LISTEN` (default a free loopback port); a build reads `KERF_CONTRACT`, or finds
`.kerf/contract.json` above the crate. `GET /_kerf/health` gives its service, contract hash, functions and pid. An edge preset can call `remote()`, as it is only
`fetch`, but something else must run the sidecar. `native()` needs a file system, so on an edge preset it's R104: use
`remote()`, the same crate behind `kerf::router`.

Each call is a `tracing` span with `trace_id` and `parent_id`. With the `otel` feature and your own OpenTelemetry layer,
the span continues TS's trace.

In a test, `handlers` replaces a function as it does a `run`, and nothing crosses.

## Diagnostics

- **R101** no `output`, a type JSON can't carry, or a one-way input transform.
- **R102** a plain `z.union` of objects.
- **R103** the Rust and the contract disagree: at `cargo`, in a binary's hash, or in an output or undeclared error at runtime.
- **R104** `native()` on a preset that can't run it, a `.wasm` that won't build, or a build with nothing for this platform.
- **R105** a cached query with `tags` that reports no table.
- **R106** no address, no secret, or a refused signature.
- **R107** not answering, or past the deadline.
- **R108** a panic or `kerf::Error`.
- **R109** the crate doesn't build for a reason unrelated to the contract, or it isn't there.
