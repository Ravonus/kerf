# 06 — Runtimes (Node, Bun, Deno) and the optional Rust path

> `remote()` as built, with the decisions that refine this: [36](36-rust-remote.md).

Research date: 2026-10-28. Versions come from `npm view` and the crates.io API on that date unless a source is cited.
Statements marked **(unverified)** could not be confirmed from a primary source. Numbers marked **(measured)** were
run for this doc on an M4 Max (Node 22.22.1, Bun 1.3.14, napi 3.15, Rust 1.93, release + LTO). The scripts were
throwaway and are not in the repo.

**Decided by the user:**
- Node, Bun and Deno are all supported out of the box. Node is the default.
- Rust is an **optional, opinionated plugin path**. It can go as far as "almost replace everything" on the server.
- The **TypeScript + Zod declaration stays the single source of truth**. Rust types are generated from it, never the
  other way round.

---

## TL;DR

1. **Runtimes are mostly free through Nitro v3.** srvx serves HTTP on all three, crossws does WebSocket on all
   three, and Nitro has `node`, `bun` and `deno_server` presets. What breaks per runtime:
   - **native addons** (Deno is untested by napi-rs, Bun is best-effort)
   - **the SQLite driver** (no single driver works on all three)
   - **dev parity:** Nitro's dev server always runs on Node

   weft picks the driver per runtime and runs e2e against built output on each runtime in CI.
2. **Contract: Zod 4 → JSON Schema 2020-12 → typify.**
   - Zod's native `z.toJSONSchema` covers the wire shape.
   - typify 0.8 (Oxide, active) turns that into serde types:
     - discriminated unions become `#[serde(tag)]` enums
     - defaults, `date-time` and `uuid` survive
     - string length and pattern checks survive
   - **Refinements, brands and integer bounds don't survive.** So TS always validates input before it crosses, and
     validates Rust's output after.
   - Skip OpenAPI, TypeSpec and protobuf as the contract format. OpenAPI is an *export* of the same JSON Schema.
3. **The boundary is cheap per call but expensive per byte of structure** (measured).

   | Call | Cost |
   |---|---|
   | napi scalar call | 17–160 ns |
   | 1 MB `Buffer` into napi (zero-copy) | ~0.2 µs |
   | 100-object payload as JS objects | 176 µs (6× JS's own parse+stringify) |
   | Same payload as a JSON string | 58 µs |
   | Loopback HTTP to an axum sidecar | 43–81 µs per call |

   Rust wins only when one call does **≥ ~1 ms of CPU** or moves **bytes, not object graphs**.
4. **Prisma 7 removed its Rust engine** for this reason:
   - Serialization across the JS↔Rust boundary cost more than Rust saved.
   - Native binaries hurt installs, serverless and edge.

   Rolldown (hook filters) and Oxc (raw transfer) relearned it. weft's Rust path must be **coarse-grained**, one call
   per server function, never per row or per hook.
5. **The degrees, by mechanism:**
   - Degree 1 is `impl: native()`: napi-rs, with a WASM build as the edge fallback.
   - Degrees 2 and 3 are both `impl: remote()`: a Rust service speaking weft's own `/_weft/fn/:id` protocol.

   TS keeps the public edge in every degree: routing, SSR, auth session, CSRF, the tagged cache and input validation.
6. **Phase it after Start.**
   - **Phase 3:** emit the contract (`.weft/contract.json`) at no extra cost; it also feeds OpenAPI and MCP.
   - **Phase 5a:** `remote()` and the `weft` crate, which covers degrees 2 and 3.
   - **Phase 5b:** `native()`.
   - Don't let Rust own the public HTTP edge, the cache, or the schema.

---

## 1. Runtimes on Nitro v3: what's free, what breaks

Nitro `3.0.260903-beta` is built on h3 2.0.8 and srvx 1.0.8. Presets are `node` (default), `bun` and `deno_server`.
In v3 `deno_deploy` is removed, because Deno Deploy Classic shut down on 2026-07-20 (Nitro docs).

| Concern | Node 22/24 | Bun 1.3 | Deno 2.x | Notes |
|---|---|---|---|---|
| HTTP serve | srvx | srvx (native `Bun.serve`) | srvx (`Deno.serve`) | Free. One fetch-style handler. |
| WebSocket | crossws over `ws` (uWS optional) | native | native | Free. `features.websocket` + `defineWebSocketHandler`, with pub/sub. crossws 0.4.17 still calls itself "under development". |
| Streaming SSR | Web Streams via srvx's Node adapter | native | native | Free. The Node adapter's overhead isn't measured here. |
| Node-API addons | first class | Bun implements ~95% of Node-API. napi-rs CI runs Bun with `continue-on-error`. Bun on Windows is reported to crash on some addons | Supported only with a `node_modules` dir (`nodeModulesDir`). Lifecycle scripts don't run by default. **Not in napi-rs's CI** | Biggest per-runtime risk. See §3. |
| napi-rs WASI fallback | CI-tested | known gaps (napi-rs #2965) | known gaps | napi-rs says not to present it as supported on Bun or Deno. |
| Drizzle SQLite | `better-sqlite3` (native) or `node:sqlite` (Node ≥22.5; Drizzle detects it in 1.0 beta) | `bun:sqlite` (native, documented) | `node:sqlite` **(unverified on Deno)** | No single driver works on all three. weft picks per preset. |
| Drizzle Postgres | `postgres` / `pg` | same | same via npm **(unverified on Deno)** | Pure JS, so it's portable. |
| Better Auth 1.7.14 | yes | yes, `bun:sqlite` documented | no official guide found **(unverified)** | It's a Web `Request` handler, so it should be portable. Its CLI on Bun needs `bunx --bun`. |
| `nitro dev` | Node worker | **still Node** | **still Node** | Dev never exercises Bun or Deno. |

What weft does about it:

- **`weft.config.ts` → `runtime: 'node' | 'bun' | 'deno'`** sets the Nitro preset and the `weft/db` driver
  (`node:sqlite`/`better-sqlite3`, `bun:sqlite`, `node:sqlite`). Postgres/libSQL-remote is the same everywhere.
- **`weft test --e2e --runtime <r>`** runs Playwright against `nitro build` output on that runtime. `create-weft`'s CI
  template runs all three, because dev can't catch a Bun or Deno break.
- **P-code:** a native dependency in the server graph when `runtime` is `deno` or an edge preset (see R104 in §8).

---

## 2. The contract: format, direction, and what survives

### Options

| Path | Status (Oct 2026) | Verdict |
|---|---|---|
| **Zod 4 `z.toJSONSchema`** (zod 4.6.7) | Native. Draft 2020-12 by default, also draft-07 and openapi-3.0. `io: 'input' \| 'output'`. Registries give `$defs`, and `.meta()` is copied through | **Use.** No extra tool, and the source of truth is unchanged. |
| OpenAPI 3.1 | Is JSON Schema 2020-12 plus paths | **Export, not contract.** Generate it from the contract for public APIs (oRPC-style, [02 §3](02-fullstack-and-t3.md)). |
| TypeSpec (`@typespec/compiler` 1.17) | Active. Emits JSON Schema, OpenAPI and protobuf | **Reject.** A third language would compete with Zod as the source of truth. |
| protobuf / ConnectRPC (`@bufbuild/protobuf` 2.16, `@connectrpc/connect` 2.3, Rust `connectrpc` 0.9.1 from the official connectrpc org) | Mature. Binary codec, streaming | **Not as the contract.** There's no native Zod → proto path, and constraints and defaults are lost. Keep it as a possible later *wire codec*. |
| JSON Schema → Rust: **typify** 0.8.0 (oxidecomputer, updated 2026-10-14) | Active. `cargo typify`, `import_types!`, builder API for `build.rs` | **Use.** |
| JSON Schema → Rust: schemafy 0.6 | Last release 2021 | Dead. |
| JSON Schema → Rust: quicktype 26 | Multi-language, maintained | Weaker on serde idioms **(unverified)**. Fallback only. |
| Rust → TS: ts-rs 12.0.1, specta 2.0.0-rc.27, schemars 1.2.3 | All active. specta 2 has been an RC for a long time | **Wrong direction for weft.** Use **schemars** only to check drift (Rust types → JSON Schema, diffed against the contract). |

**Direction:** TS/Zod → `.weft/contract.json` (JSON Schema 2020-12 plus a weft manifest) → typify in the crate's
`build.rs` → serde types and a trait per function. CI diffs schemars output against the contract.

### What survives the trip (measured with zod 4.6.7 and typify 0.8.0)

| Zod | JSON Schema emitted | typify Rust | Survives? |
|---|---|---|---|
| `.default(2)` | `"default": 2` | `#[serde(default = …)]` | **Yes.** TS sends values with defaults already applied anyway. |
| `z.discriminatedUnion('kind', …)` | `oneOf` + `const` on `kind` | `#[serde(tag = "kind")] enum` | **Yes.** |
| Plain `z.union` | `anyOf` | struct with optional flattened fields (typify calls this its weak spot) | **Poorly.** R-code: use `discriminatedUnion` in contract functions. |
| `.min/.max/.regex` on strings | `minLength`/`maxLength`/`pattern` | newtype + `TryFrom` check | **Yes.** |
| `z.int().min(0).max(5)` | `minimum`/`maximum` | plain `i64`, bounds **not** enforced | **No.** TS validates. |
| `z.uuid()` | `format: uuid` | `uuid::Uuid` | **Yes.** |
| `z.iso.datetime()` or a `z.codec(z.iso.datetime(), z.date())` codec with `io: 'input'` | `format: date-time` | `chrono::DateTime<Utc>` | **Yes, via the codec.** |
| `z.date()` | throws "cannot be represented" | — | **No.** R-code + autofix to the ISO codec. |
| `z.bigint()` / `z.int64()` | throws | — | **No.** weft ships `w.int64()` = decimal-string codec, with `x-rust-type` → `weft::I64Str` (typify's `x-rust-type` is opt-in per crate). |
| `.refine()` / `.superRefine()` | **silently dropped** | — | **No.** Runs in TS only. |
| `.brand('UserId')` | **silently dropped** | — | Only if the schema has a `.meta({ id: 'UserId' })` → named `$def` → named Rust type **(unverified that a bare string `$def` becomes a newtype rather than an alias)**. |
| `.transform()` | throws on `io: 'output'`; input side only on `io: 'input'` | — | Wire shape only. The transform runs in TS. |
| `tags: z.array(…).optional()` | not in `required` | `Vec<T>` with `#[serde(default)]` | **Lossy.** "absent" and `[]` collapse. Use `.nullable()` if the difference matters. |

**Rule that follows:** the contract describes the **wire shape**. Zod in TS is the validator of record, on both sides
of the call:

1. TS parses input (refinements, bounds, transforms).
2. TS encodes it with `z.encode`.
3. Rust deserializes it with serde (structure only).
4. Rust returns the output.
5. TS parses the output against `output`. This is always on in dev and on by default in prod.

---

## 3. Calling Rust from the JS server

### Measured per-call cost (measured)

| Operation | Node 22 | Bun 1.3 |
|---|---|---|
| JS function `add` | 1.0 ns | 2.1 ns |
| napi `noop()` | 17 ns | 37 ns |
| napi `add(f64, f64)` (argument conversion) | 127 ns | 158 ns |
| WASM `add(f64, f64)` (raw export, no bindgen) | 5.7 ns | 5.1 ns |
| 100 todo objects (5.7 KB): JS `JSON.parse` + `stringify` | 28.7 µs | 20.7 µs |
| same, into napi as a **JSON string** → serde → string → `JSON.parse` | 57.8 µs | 48.1 µs |
| same, into napi as **JS objects** → `serde_json::Value` → JS objects | 175.7 µs | 120.2 µs |
| 1 MB `Buffer` into napi (borrowed, no copy) | 0.2 µs | 0.2 µs |
| 1 MB copied into WASM linear memory | 12.7 µs | 12.6 µs |
| SHA-256 chained 100,000× — `node:crypto` loop | 121.8 ms | 29.9 ms |
| same — one napi call doing the loop | 12.9 ms | 12.6 ms |
| same — one WASM call doing the loop | 11.3 ms | 19.0 ms |
| loopback HTTP `fetch` → axum `noop` (keep-alive) | 81 µs | 43 µs |
| loopback HTTP `fetch` → axum JSON echo, 100 items | 194 µs | 132 µs |

How to read it:
- The SHA-256 win isn't "Rust hashes faster". `node:crypto` is OpenSSL. The win is **1 crossing instead of 100,000**
  (Node pays ~1.2 µs of `createHash` overhead per call).
- Moving structured data costs more than the work for typical CRUD payloads. Prisma hit exactly this.

### Mechanisms

| | napi-rs v3 (`@napi-rs/cli` 3.10.9, `napi` 3.15) | WASM (raw, wasm-bindgen, or component model via jco 1.40) | Sidecar (HTTP/UDS) |
|---|---|---|---|
| Per-call | 20–200 ns + marshalling | ~5 ns + copy in/out | 40–200 µs loopback; ms across a network |
| Data | zero-copy `Buffer`/typed arrays; objects are expensive | everything is copied through linear memory | serialized (JSON) |
| Threads/async | `AsyncTask` on the libuv pool, tokio for async. `AbortSignal` cancels only *before* a task starts | single-threaded unless WASI threads; WASI 0.3 async became official 2026-06-11, jco support is catching up **(unverified)** | Its own tokio runtime. No GC pauses in the JS process |
| Node / Bun / Deno | Node CI-tested / Bun best-effort / Deno untested | all three | all three |
| Crash isolation | a panic or segfault takes down the JS server (napi-rs panic catching **(unverified)**) | trapped | isolated, restartable |
| Packaging | one prebuilt `.node` per target triple as `optionalDependencies` (glibc vs musl, x64 vs arm64) | one portable `.wasm` | one binary or container per service |

### Deployment cost

| Target | napi | WASM | Sidecar |
|---|---|---|---|
| Node/Bun/Deno server or container (Fly, Railway, k8s) | ✅ ship the matching triple | ✅ | ✅ second process: supervisor, port/UDS, health check |
| Node serverless (Vercel, Netlify, Lambda) | ✅ if the linux binary is traced into the bundle. Size limits apply (Lambda 250 MB unzipped **(unverified)**) | ✅ | ⚠️ no co-located process. It becomes a separate service, with **ms** per call |
| Cloudflare Workers | ❌ Node-API addons unsupported | ✅ 64 MiB uncompressed, 1 s startup, 128 MB memory per isolate (shared with JS) | ⚠️ a separate Rust Worker (workers-rs) or container, via a service binding **(binding latency unverified)** |
| Deno Deploy | ❌ assume none **(unverified)** | ✅ | ⚠️ remote only |

**Where each wins:**
- **napi:** CPU-heavy work on bytes, on a Node server.
- **WASM:** the same function where it must run on edge or Deno, and as napi-rs v3's WASI fallback build of the same
  crate.
- **Sidecar:** many functions, long-lived state (search index, game world), crash isolation, independent scaling, or
  a team that wants to own a Rust service.

---

## 4. Prior art

| Project | Status (Oct 2026) | Lesson for weft |
|---|---|---|
| **Prisma 7** | 7.0 GA 2025-11-19, 7.10.1 latest stable, 8.0 in RC. Its "Rust-free" client generates a query plan with a small WASM query compiler plus TS, and runs it through JS driver adapters | **The key data point.** The stated reasons:<br>1. "The cost of serializing data between Rust and TypeScript is very high."<br>2. Binary installs fail on restricted networks.<br>3. Edge and serverless pain.<br><br>Results: bundle ~14 MB → ~1.6 MB, and `findMany` of 25k rows 185 → 55 ms. On small results it was a wash. Critics say "Rust-free" just means "no native library". **Don't put Rust in the per-row path, and don't make a native binary mandatory.** |
| **Convex** | Open-source backend, mostly Rust: DB, sync, scheduler. User functions are TS in V8 isolates ("Funrun") | The *opposite* split from Prisma, and it works: Rust owns a coarse **engine**, and app logic stays TS. That's weft's degree 3 at most, not "rewrite handlers in Rust". |
| **Rolldown** 1.2 / **Oxc** 0.156 | Rust cores, napi-rs bindings | Rolldown measured an unfiltered JS hook per module: build time rose 745 → 2,792 ms with 10 plugins. Hook filters, evaluated in Rust, keep it flat at ~740 ms. Oxc's default path is JSON-serializing the AST. Its experimental **raw transfer** hands JS a 2 GiB buffer plus a generated deserializer (Node ≥ 22.18, 64-bit LE, not WASM). **Batch the crossing and pass bytes.** |
| **Turso** (`@tursodatabase/database` 0.8.3) / libSQL (`@libsql/client` 0.18) | A Rust rewrite of SQLite. One crate ships napi and WASM builds | The packaging model for degree 1: same crate, native where possible, WASM elsewhere. Still pre-1.0. |
| **rspc** | `rspc` 0.4.1 / 1.0.0-rc.5, untouched since 2025-02. The repo is marked unmaintained | Rust-first typed RPC to TS has failed to reach 1.0 more than once. Don't depend on it. |
| **specta 2 / tauri-specta** | 2.0.0-rc.27 / rc.26 (2026-10-21) | Active but RC for years. Rust → TS is the right model *for Tauri*, where Rust is the source. For weft it's the wrong direction. |
| **Leptos** 0.8.22 (0.9 RC) / **Dioxus** 0.7.10 | `server_fn` with pluggable codecs. Dioxus server fns become axum `MethodRouter`s | The server-function shape maps 1:1 onto axum handlers. The `weft` crate should generate an **axum `Router`**, so it fits any axum app. |
| **Loco** 1.2.0 | Rails-like: axum + SeaORM 2, jobs, mailers | Too opinionated to be weft's Rust side, but the `weft` crate must work *inside* a Loco or axum app. |
| **axum** 0.8.9 + **utoipa** 6.0 | Code-first OpenAPI from Rust | The right tool when Rust is the source. For weft it's only useful to cross-check exports. |

---

## 5. When Rust pays off (and when it doesn't)

**It pays when one call does a lot of CPU, or works on bytes:**

| Workload | Why | Use first |
|---|---|---|
| Image/video transforms | ms to s of CPU per call, input is bytes | `sharp` (libvips, C) already exists. Write Rust only for custom pipelines or WASM-on-edge (`@napi-rs/image` 1.16) |
| Password hashing, signatures, bulk crypto | CPU-bound, and blocks the event loop | `@node-rs/argon2` 2.2.2 already is napi-rs |
| Full-text / vector search in-process | Index in memory, ms of CPU per query (tantivy-class) | a sidecar (degree 2): long-lived index, crash isolation |
| Parsing/compiling (Markdown, code, CSV/Parquet) | Large input, flat output | napi with string/bytes in and out |
| Authoritative game-tick / physics servers | Fixed tick, no GC pauses, memory density for many sockets | a sidecar owning the WebSocket; TS issues the auth ticket |
| Hot loops with many tiny ops | The measured SHA case: 9.4× on Node, 2.4× on Bun | one napi call that owns the loop |

**It doesn't pay for:**

- **IO-bound CRUD.** The handler is a DB round trip (sub-ms to ms) plus pool wait. Independent comparisons find Node
  competitive on IO-bound concurrency, and pool wait, not language, dominating p99
  ([DESY/ESRF](https://events.hifis.net/event/1906/contributions/15677); besthub write-up, single author). Moving
  a 5.7 KB result through napi as objects costs 176 µs, more than the JS handler's own work.
- **Bun narrows the gap.** Bun's SHA loop was 4× faster than Node's, which halves Rust's margin. Re-measure on the
  runtime you deploy.
- **Small teams.** Two toolchains, per-triple binaries, slower CI (a release build of the tiny sidecar took 13 s
  here), and HMR that's a restart rather than a swap. That's a real tax for a 5% win.

**Rule of thumb for `weft check`:** only recommend Rust for a function whose JS `run` spends **≥ 1 ms of CPU** per
call in the dev profile, and whose input/output is bytes or under ~1 KB of structure.

---

## 6. Keeping weft's guarantees across the boundary

One envelope for napi, WASM and the sidecar. For napi and WASM it's a single string or `Buffer` argument. For the
sidecar it's `POST /_weft/fn/:id` (the same path shape as weft's public functions):

```jsonc
// request
{ "input": { /* z.encode(input, parsed) */ },
  "ctx": { "user": { "id": "u_1", "roles": ["admin"] } | null, "requestId": "…", "deadlineMs": 2500,
           "traceparent": "00-…-…-01", "locale": "en" } }
// response
{ "ok": true, "value": { /* output wire shape */ }, "tags": ["uploads:42"] }
{ "ok": false, "error": { "code": "NotFound", "data": { "id": "…" } } }
```

| Guarantee | How it holds |
|---|---|
| **Validation** | TS parses input before the call and parses output after (§2). Rust gets types that already passed refinements. serde rejects structural drift. |
| **`ctx.user`** | Better Auth runs in TS. Rust receives **claims only** (id, roles, tenant), never cookies or session tokens. A sidecar receives them in a `weft-ctx` header **signed with a per-deploy HMAC key** and listens on a UDS or private network. The `weft` crate verifies the signature in an axum extractor, `Ctx`. `ctx.user` stays `Option<User>`, matching TS's nullable. |
| **Cache tags / invalidation** | The cache lives in TS. Declared `cache.tags` and `invalidates` stay on the TS declaration. Rust may **add** tags in the response (`tags`) and never removes them. weft's dev "tables touched" check can't see into Rust, so the `weft` crate exposes `ctx.touch("todos")`, and `weft check` warns when a Rust-implemented cached query reports no touches. |
| **Cache safety** | `scope: 'shared'` queries get a `ctx` without `user` on the Rust side too. The generated trait takes `SharedCtx` instead of `Ctx`, so it's a compile error, not a convention. |
| **Typed errors** | `errors: { NotFound: z.object(…) }` on the declaration → `#[serde(tag = "code")] enum <Fn>Error` in Rust. A panic or unknown error becomes `Internal` with `requestId`, and its details never reach the client. |
| **Tracing** | W3C `traceparent` in the envelope. Rust uses `tracing` + `tracing-opentelemetry` 0.34, with spans named by function id. The TS span is the parent. |
| **Deadlines / cancel** | The sidecar uses an HTTP request abort plus `deadlineMs`. napi `AsyncTask::with_signal` aborts only queued work, so running Rust code must check `ctx.cancelled()` cooperatively. |

---

## 7. Dev mode and HMR with a Rust piece

- **Watcher:** `weft dev` watches `crates/**` with Vite's watcher and runs `cargo build --message-format=json`. Don't
  use `cargo-watch`: its last release is 8.5.3 from 2024-10. bacon 3.26 and watchexec 2.8 are the maintained
  alternatives if a standalone watcher is wanted. Cargo diagnostics are re-emitted in `weft check --json` and the Vite
  overlay.
- **Contract change:**
  1. Editing a Zod schema regenerates `.weft/contract.json`.
  2. `build.rs` regenerates the types, so cargo fails exactly where the Rust impl no longer matches.
  3. That failure is mapped to **R103** with the function id.

  This is the loop agents need: the error names the TS edit that caused it.
- **Sidecar reload:**
  1. Build.
  2. Start the new process on a fresh UDS.
  3. Health check.
  4. Atomically swap the proxy target.
  5. Drain and kill the old process.

  Requests during the first build are queued, not failed. There's no in-process state carry-over: state that must
  survive belongs in the DB.
- **napi reload:** Node can't unload an addon. Each build is copied to `.weft/native/<crate>-<hash>.node` and the Nitro
  dev worker is restarted. The old copy leaks until the dev server exits, which is acceptable in dev. That napi-rs
  addons reload cleanly in a fresh worker thread is **(unverified)**; spike it before Phase 5b.
- **WASM reload:** re-instantiate the module. It's the only true hot swap.

---

## 8. Recommendation for weft

### The API (one declaration, `impl` swaps the body)

`run` and `impl` are mutually exclusive. Calling any npm napi package (sharp, argon2) from a TS `run` is ordinary code
and needs no weft feature. `impl` is for when **the whole function body is Rust**.

```ts
// server/rust.ts — the only place Rust targets are named (explicit, greppable)
import { native, remote } from 'weft/rust'
export const media = native('media')            // crates/media → napi-rs (+ WASM fallback build)
export const search = remote('rust://search')   // crates/search → sidecar, URL from weft.config.ts
export const core = remote('rust://core')       // degree 3
```

**Degree 1: one hot function, in-process (napi, WASM on edge).**

```ts
export const thumbnail = mutation({
  input: z.object({ upload: z.uuid(), width: z.int().min(16).max(4096) }),
  output: z.object({ key: z.string(), bytes: z.int() }),
  errors: { NotFound: z.object({ upload: z.uuid() }) },
  invalidates: ['uploads'],
  impl: media,
})
```
```rust
// crates/media/src/lib.rs — types + trait generated from .weft/contract.json by build.rs (typify)
#[weft::implement("server/media.thumbnail")]
async fn thumbnail(ctx: Ctx, input: ThumbnailInput) -> Result<ThumbnailOutput, ThumbnailError> { … }
```

**Degree 2: a Rust service implementing several functions.**

```ts
// weft.config.ts
rust: { services: { search: { crate: 'crates/search', url: env.SEARCH_URL /* prod */, dev: 'cargo' } } }

// server/docs.ts
export const searchDocs = query({
  input: z.object({ q: z.string().min(1).max(200), limit: z.int().max(50).default(20) }),
  output: z.array(DocHit),
  cache: { life: 'minutes', tags: ['docs'] },
  impl: search,
})
```

**Degree 3: mostly Rust.** TS keeps routing, SSR, schema, auth, the cache and the public edge. Every server file is
declarations with `impl: core`, and the `core` crate is an axum `Router` from `weft::router()` (it embeds in
Loco/axum). A long-lived realtime piece (a game tick) can take the WebSocket directly: TS issues a signed one-time
ticket, and the browser connects to Rust.

```ts
export const listTodos = query({ input: ListTodos, output: z.array(Todo), cache: { life: 'minutes', tags: ['todos'] }, impl: core })
export const addTodo  = mutation({ input: schemas.todos.insert.pick({ title: true }), output: Todo, invalidates: ['todos'], impl: core })
export const world    = channel({ ticket: z.object({ room: z.string() }), impl: remote('rust://game') }) // WS owned by Rust
```

**New diagnostics (R1xx codes; R0xx is taken by real-time in [07](07-realtime-and-events.md)):**
- R101: a function with `impl` has a schema that can't be represented (date, bigint, transform output), with an
  autofix to a codec
- R102: a plain `z.union` in a contract (use `discriminatedUnion`)
- R103: the Rust impl doesn't match the contract (from cargo or schemars drift)
- R104: `native()` reachable on a Deno or edge preset with no WASM build
- R105: a cached Rust query reports no touched tables

### Phasing

| Phase | Ships |
|---|---|
| **3 (Start)** | **The contract only.** `weft build` writes `.weft/contract.json` from every `query`/`mutation` (`io: 'input'` and `'output'`, errors, cache, auth scope). OpenAPI and MCP exports read it. Per-runtime presets and drivers. A CI e2e matrix on Node, Bun and Deno. No Rust yet. |
| **5a (Rust: remote)** | `remote()`, the `weft` crate (codegen `build.rs`, `Ctx`/`SharedCtx` extractor, HMAC ctx, envelope, `touch`, tracing, `weft::router()`), the sidecar supervisor and dev reload, R101–R103. This covers **degrees 2 and 3**. It's the same protocol on every runtime and the lowest-risk path. |
| **5b (Rust: native)** | `native()` via napi-rs v3 with per-triple packages plus a WASM fallback build, napi dev reload, R104, R105. Exit check: one CPU-bound demo (image or search) beats its TS `run` by ≥5× on Node *and* Bun, with the delta shown by `weft check`. |
| **Later** | A degree-3 `create-weft --rust` template. A Connect/protobuf wire codec if JSON proves to be the bottleneck. A WASI component-model target once jco's async support is default. |

### Explicitly not doing

- **Not** a Rust-first schema (no specta, ts-rs or utoipa as the source). Rust → JSON Schema is used only to detect
  drift.
- **Not** letting Rust own the public HTTP edge, sessions, CSRF or the tagged cache. Rust receives claims, never
  cookies.
- **Not** per-row, per-hook or per-component crossings (no Rust inside `derived`, no Rust ORM driver under Drizzle).
  One crossing per server function.
- **Not** passing JS object graphs into napi. Pass a JSON string or `Buffer` (3× cheaper, measured).
- **Not** making any native binary mandatory for a default `create-weft` app. Prisma 7 is the warning.
- **Not** protobuf, TypeSpec or OpenAPI as the contract in v1, and not a mandatory Rust ORM choice: sqlx, SeaORM or
  Diesel is the user's pick.
- **Not** promising Deno or edge for `native()`. There, WASM or `remote()` is the answer.

---

## Sources

- Nitro v3: https://nitro.build/docs/websocket · https://nitro.build/deploy · https://nitro.build/deploy/runtimes/bun · https://nitro.build/deploy/runtimes/deno
- crossws: https://crossws.unjs.io · https://github.com/h3js/crossws
- napi-rs: https://napi.rs/blog/announce-v3 · https://napi.rs/docs/more/support-compatibility · https://napi.rs/docs/concepts/async-task
- Bun Node-API: https://bun.com/docs/runtime/node-api · Bun-on-Windows addon crash: https://registry-preview.bazel.build/modules/rules_node_addon/1.0.3
- Deno Node-API / npm: https://docs.deno.com/runtime/manual/node · https://infoworld.com/article/3976654/deno-2-3-adds-compile-improvements-support-for-local-npm-packages.html
- Drizzle drivers: https://orm.drizzle.team/docs/get-started-sqlite · https://orm.drizzle.team/docs/get-started/node-sqlite-new · https://newreleases.io/project/github/drizzle-team/drizzle-orm/release/v1.0.0-beta.18
- Better Auth SQLite / Bun: https://better-auth.com/docs/adapters/sqlite
- Zod JSON Schema: https://zod.dev/json-schema
- typify: https://github.com/oxidecomputer/typify · schemars: https://github.com/GREsau/schemars · ts-rs: https://docs.rs/ts-rs/12.0.1
- rspc / specta status: https://awesome.ecosyste.ms/projects/github.com%2Fspecta-rs%2Frspc · https://github.com/specta-rs/tauri-specta (versions from crates.io API)
- ConnectRPC Rust: https://github.com/connectrpc/connect-rust
- Prisma: https://www.prisma.io/blog/rust-to-typescript-update-boosting-prisma-orm-performance · https://www.prisma.io/blog/prisma-orm-without-rust-latest-performance-benchmarks · https://infoq.com/news/2026/01/prisma-7-performance/ · critique: https://zenn.dev/sora_kumo/articles/prisma-7-rust-free?locale=en
- Convex: https://docs.convex.dev/open-source · https://stack.convex.dev/horizontally-scaling-functions
- Rolldown hook filters: https://rolldown.rs/in-depth/why-plugin-hook-filter · https://rolldown.rs/plugins/hook-filters
- Oxc raw transfer: https://github.com/oxc-project/bench-javascript-parser · https://docs.rs/crate/oxc_parser_napi/latest/source/src/raw_transfer.rs
- Turso: https://github.com/tursodatabase/turso
- Leptos/Dioxus server fns: https://docs.rs/crate/server_fn/0.7.0-beta7 · https://docs.rs/dioxus-fullstack/0.7.0-rc.0/dioxus_fullstack/
- Loco: https://loco.rs · utoipa: https://github.com/juhaku/utoipa
- WASI 0.3: https://wasi.dev/releases/wasi-p3
- Cloudflare Workers limits / Node compat: https://developers.cloudflare.com/workers/platform/limits/ · https://developers.cloudflare.com/workers/runtime-apis/nodejs · Rust: https://developers.cloudflare.com/workers/languages/rust
- IO-bound comparisons: https://events.hifis.net/event/1906/contributions/15677 · https://www.besthub.dev/articles/why-the-fastest-language-doesn-t-win-at-scale-rust-go-and-node-under-1-million-requests-d3f4533c4a69
- Versions: `npm view <pkg> version time.modified` and `https://crates.io/api/v1/crates/<name>`, run 2026-10-28.
