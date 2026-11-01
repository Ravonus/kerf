# 37. Rust in-process: `native()`, the WASM fallback and `weft add rust`

Status: built for Phase 5b, 2026-10-31. It refines PLAN §4.3 and settles the addon half of §11's question. Spike:
`spikes/rust-native/`. Exit check: `evals/phase5b-exit.mjs`, results in `evals/results/phase5b-exit.md`. Its sibling is
[36](36-rust-remote.md): same `Service`, same contract, same reply.

**Goal:** one hot function's body is Rust in the server's own process, nothing on the client can tell, and an app that
doesn't use it pays nothing.

## 1. The spike: a rebuilt addon needs no restart

§11 assumed that since an addon can't be unloaded, dev reload means restarting the server worker. It doesn't. The same addon
built twice, on each runtime, in one process (`reload.mjs`):

| | macOS arm64 | Linux x64 (WSL) |
|---|---|---|
| A rebuild at the same path, after a rename | loads the new code | **keeps the old code** |
| A rebuild at a new path | both live, side by side | both live, side by side |
| A slow call on the old copy while the new one serves | finishes, on the old code | the same |
| 50 more copies: time, RSS | 5.2 s, 2–14 MB | 13 ms, 23 MB |
| Load in a worker, terminate, load the next | works; statics survive the worker | the same |

Node, Bun and Deno gave the same answers on both machines, so this is `dlopen`, not a runtime. **A new path per build** is all
it takes: no worker restart, no dropped request, and calls in flight finish on the code they started on. Each reload strands
about 0.5 MB until `weft dev` stops, and no thread, since the addon has none of its own (§3).

A call's cost in the same run, a 2 KB string each way:

| | Node | Bun | Deno |
|---|---|---|---|
| Sync, macOS | 0.35 µs | 0.30 µs | 0.31 µs |
| Through the pool, macOS | 8.7 µs | 10.8 µs | 9.8 µs |
| Through the pool, Linux | 27 µs | 33 µs | 28 µs |

The pool costs less than a sidecar's loopback (43–81 µs), and it's what keeps the event loop free, so every call takes it.

Addons on Deno also work, against §11's worry. PLAN said Deno falls back to WASM; it now loads the addon like the others, since
this and the exit check both pass there, and falls back only if the addon fails to load. napi-rs still doesn't test Deno, so
that's held by the exit check on each run and nothing upstream.

## 2. The crate

`weft` splits into `core` (`Functions`, `Ctx`, the reply), `server` (axum, tokio, HMAC) and `native`. The generated contract
doesn't change at all, so a crate moves between `remote()` and `native()` by its last line:

```rust
weft::native!(contract::functions(Media));
```

`weft::build::generate` calls `napi_build::setup()` when the contract says the service is native, since macOS's linker needs
telling that `napi_*` is the host's. An app depends on neither `napi` crate: the macro reaches them through `weft::__rt`, and
the `#[napi]` functions live in `weft`.

`Functions` now takes bytes and gives JSON text, not a `serde_json::Value`: nothing on the Rust side reads a result, so it
needn't be a tree first. That's a small win for a sidecar too.

## 3. The call

`call(id, ctx, body) → Promise<string>`, where `ctx` is `{ user, requestId, deadlineMs, traceparent }` and the reply is a
sidecar's body. There's no signature, because nothing outside the process can reach it. TS shares `settled()` between both, so
an error can't read differently.

- **On the worker pool, with no async runtime.** A call is an `AsyncTask`, and the `async fn` is polled there with a parking
  waker. A tokio runtime per addon would be a pool per dev reload, stranded forever. This is for CPU; IO belongs in `remote()`.
- **`native()` sizes libuv's pool** to the machine unless `UV_THREADPOOL_SIZE` is set, since its 4 would be a ceiling nobody
  chose. It's set when `native()` runs at module load, before the first use. The check: 8 spins of 200 ms take 207 ms.
- **Bytes are JSON for now.** §4.3's ~0.2 µs `Buffer` isn't reachable from a Zod schema yet: that needs a binary type in the
  contract, which is its own design.

## 4. The fallback

`cargo build --target wasm32-unknown-unknown`, with `+simd128`, and no `wasm-bindgen`: a small ABI (`weft_alloc`, `weft_free`,
`weft_call`, `weft_contract`) and two imports (`now`, `panicked`). The host's clock is needed because `Instant::now()` panics
on that target.

A panic aborts on this target, so it can't be caught: the hook sends the message out, the instance traps, and TS builds a new
one for the next call. It's a sidecar's crash and restart in miniature, and statics go with it.

WASM runs on the event loop, like a TS `run`. Its latency is close to the addon's and its throughput isn't (§7): that's the
price of having no threads, and a worker per engine wasn't worth it for a fallback.

The loader takes what the manifest offers: the addon for this `platform-arch`, then the `.wasm`, then R104. So a host with
another architecture gets WASM with no setting.

## 5. Where the files go

| | Path | Why |
|---|---|---|
| dev | `.weft/native/<name>-<n>.node`, `manifest.json` | A new path per build. The server stats the manifest on each call, in dev only |
| build | `.weft/sidecars/` | Prerender reads them there, through `WEFT_NATIVE_DIR` |
| shipped | `.output/server/rust/` | Inside the server, so whatever moves the server moves them |

A built server finds them by walking up from its own module, so `node .output/server/index.mjs` needs no `weft start` and no
variable. A failed dev build leaves the manifest alone, so the old library keeps serving, as a sidecar's old child does.

## 6. Decisions

| Decision | Why | One setting away |
|---|---|---|
| Addon first on Deno too | §1 and the exit check | |
| No Node module imported | `process.getBuiltinModule`, so a bundle that doesn't call it has none of it | |
| R104 on an edge preset | No file to read, and Cloudflare forbids compiling WASM at run time. Importing a `.wasm` through Nitro is the likely way in, and nothing here can run one to check it | `remote()` |
| A `.wasm` that won't build is a warning | The addon runs on this machine; it's only an error on a preset that needs the fallback | `rust.services.<name>.wasm: false` |
| `weft::native!`, not a `#[napi]` in the app | An app shouldn't learn napi, and the same line builds for WASM | |
| R105 needs `tags` | A cached query with no tags reads no table: that's a pure function, and asking it to `touch` would be noise | |
| The crate ships inside `@weft/start` | It isn't on crates.io, and this way runtime, codegen and TS can't disagree on a version | |
| `native` is `weft add rust`'s default | One hot function is the common case, and it's the one with nothing to run | `--remote` |

## 7. What it costs

From `evals/results/phase5b-exit.md`: a 1600×1200 image, four passes of a 5-tap blur each way and an 8× shrink, on Linux x64
with 28 threads. TS is typed arrays with no allocation in a loop, and both give the same bytes, which the wire check holds.

| Runtime | Body | p50 ms | calls/s, 32 callers | Over TS |
|---|---|---|---|---|
| Node | TS `run` | 106.0 | 9.5 | |
| Node | addon | 14.6 | 143.7 | 7.2× p50, 15.1× calls/s |
| Node | WASM | 16.7 | 63.0 | 6.4× p50 |
| Bun | TS `run` | 91.6 | 11.0 | |
| Bun | addon | 17.9 | 147.4 | **5.1× p50**, 13.4× calls/s |
| Bun | WASM | 18.0 | 57.9 | 5.1× p50 |
| Deno | TS `run` | 90.7 | 10.9 | |
| Deno | addon | 14.3 | 146.4 | 6.3× p50, 13.4× calls/s |
| Deno | WASM | 16.4 | 65.3 | 5.5× p50 |

Bun's p50 clears 5× narrowly. The body was picked to vectorize, which is where the ratio comes from: it's the case for
`native()`, and a branchy body will gain less, by an amount nothing here measured. On an M4 Max under load 40 (`phase5b-exit-macos.md`, also 51 of 51) the addon gave 14.3× on Node and 7.7× on Bun at p50, and 77.7× and
45.4× in calls/s. An addon is built for the baseline CPU, so x64 gets SSE2, and it's barely ahead of WASM's 128-bit SIMD.

The addon is 776 KB, the `.wasm` 248 KB. A build with no `native()` has neither, and no loader: the check greps its server
bundle.

## 8. Diagnostics

| Code | When | By |
|---|---|---|
| R104 | An edge preset, or `wasm: false` on a preset that may not match this machine: an error, before anything compiles. A `.wasm` that won't build: a warning, or an error on a preset that needs it. Neither file at run time: 503 | contract, cargo, start |
| R105 | A cached query with `tags` and no table reported: `weft check` reads the method, `weft dev` sees the call | check, start |

R103 gains a library from another contract, refused when it loads. A name used by both `remote()` and `native()` is R109.

## 9. Not done

- WASM on an edge isolate: it's R104, with `remote()` as the way out. §4.3 still says WASM there.
- Bytes without JSON (§3).
- Windows itself: the spike ran on macOS and Linux only. A DLL is locked while it's loaded, which a path per build allows for,
  but nothing has run it. The same goes for a host that isn't the build machine: the fallback is tested by deleting the addon.
- A call can't be stopped. `timeout` gets R107 to the client, and the thread runs until the Rust returns or checks
  `ctx.cancelled()`, so a hung addon holds a pool thread for good. A sidecar can be killed, which is a reason to pick one.
- WASM holds the event loop for the whole call.
- `UV_THREADPOOL_SIZE` is set from JS, which holds only if nothing used the pool first. The check passes on `weft start`; an app
  that does disk IO at module load before `native()` runs would keep 4.
- The crate still isn't on crates.io. `weft add rust` writes a path into `node_modules/@weft/start/crate`, so `cargo` needs
  `npm install` to have run.
