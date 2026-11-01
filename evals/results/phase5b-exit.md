# Phase 5b exit check

2026-11-01: **PASS**, 51 of 51 checks, on linux-x64, 28 threads, load 2.6 at the end. A CPU-bound demo beats its TS `run` by at least 5×.
The swap is scripted (`evals/phase5b-exit.mjs`, the app in `evals/phase5b/`), not done by an agent. `weft start` on node, bun, deno.

Changed under `src/`: `src/server/image.ts`, `src/server/rust.ts`, `src/server/thumb.ts`. Added: `crates/media`. Addon 776 KB, WASM 248 KB.

| Check | Result | Detail |
|---|---|---|
| a build with no `native()` has none of it | pass |  |
| the swap touches server modules only | pass | `{"changed":["src/server/image.ts","src/server/rust.ts","src/server/thumb.ts"]}` |
| node: the client is byte-identical | pass | `{"files":25}` |
| node: /thumb serves the same HTML | pass |  |
| node: every request gets the same answer, to the byte | pass | `{"requests":8}` |
| node: the same e2e passes in Chromium | pass | `{"failed":"TooLarge:10000000000"}` |
| bun: the client is byte-identical | pass | `{"files":25}` |
| bun: /thumb serves the same HTML | pass |  |
| bun: every request gets the same answer, to the byte | pass | `{"requests":8}` |
| bun: the same e2e passes in Chromium | pass | `{"failed":"TooLarge:10000000000"}` |
| deno: the client is byte-identical | pass | `{"files":25}` |
| deno: /thumb serves the same HTML | pass |  |
| deno: every request gets the same answer, to the byte | pass | `{"requests":8}` |
| deno: the same e2e passes in Chromium | pass | `{"failed":"TooLarge:10000000000"}` |
| node: the addon beats its TS `run` by at least 5× | pass | `{"latency":7.2,"throughput":15.1}` |
| bun: the addon beats its TS `run` by at least 5× | pass | `{"latency":5.1,"throughput":13.4}` |
| node: a tag Rust adds reaches the response | pass |  |
| node: a panic costs one call, in R108, with the detail in the log only | pass |  |
| node: past its deadline TS gives up with R107, and the loop stays free | pass | `{"duringSpinMs":23}` |
| node: more than 4 calls run at once | pass | `{"ms":207}` |
| node: a stale library is refused with R103 | pass |  |
| node: with the addon gone, its WASM gives the same answers | pass | `{"requests":8}` |
| node: on WASM a panic ends an instance, and the next call has a new one | pass |  |
| node: on WASM `ctx.remaining()` runs on the host's clock | pass |  |
| bun: a tag Rust adds reaches the response | pass |  |
| bun: a panic costs one call, in R108, with the detail in the log only | pass |  |
| bun: past its deadline TS gives up with R107, and the loop stays free | pass | `{"duringSpinMs":22}` |
| bun: more than 4 calls run at once | pass | `{"ms":203}` |
| bun: a stale library is refused with R103 | pass |  |
| bun: with the addon gone, its WASM gives the same answers | pass | `{"requests":8}` |
| bun: on WASM a panic ends an instance, and the next call has a new one | pass |  |
| bun: on WASM `ctx.remaining()` runs on the host's clock | pass |  |
| deno: a tag Rust adds reaches the response | pass |  |
| deno: a panic costs one call, in R108, with the detail in the log only | pass |  |
| deno: past its deadline TS gives up with R107, and the loop stays free | pass | `{"duringSpinMs":23}` |
| deno: more than 4 calls run at once | pass | `{"ms":207}` |
| deno: a stale library is refused with R103 | pass |  |
| deno: with the addon gone, its WASM gives the same answers | pass | `{"requests":8}` |
| deno: on WASM a panic ends an instance, and the next call has a new one | pass |  |
| deno: on WASM `ctx.remaining()` runs on the host's clock | pass |  |
| `node .output/server/index.mjs` finds the addon with no `weft start` | pass |  |
| `weft check` passes the clean app, with no warning | pass | `{"files":4,"tests":0,"errors":0,"warnings":0,"byCode":{}}` |
| R103: an edited schema stops cargo at the function it broke, named by id | pass | `{"line":97,"why":"`thumbnail.0814fc`: the Rust no longer matches the contract: missing field `format` in initi` |
| R104: an edge preset is refused with the fix, before anything compiles | pass |  |
| R104: a crate that won't build for WASM is a warning here, with the way out | pass | `"`media` has no WASM fallback: cargo check failed in `media`:\nCompiling media v0.0.0 (/root/wk/5b-app/crates/` |
| R105: a cached query with tags and no `touch`, at the method | pass | `{"line":108}` |
| dev: the first request works, after one build | pass | `{"firstMs":6112}` |
| dev: a crate edit reloads in place, with no failed request and no new worker | pass | `{"reloadMs":602,"requests":49}` |
| dev: a compile error keeps the old library serving | pass |  |
| dev: a schema edit is reported as R103 with the id, and fixing the Rust recovers | pass |  |
| `weft add rust`: a native crate and a sidecar build, check clean and answer, on the first try | pass | `{"sizes":{"media":{"kind":"native","addon":"media.linux-x64.node","hash":"7c266b4191d20552","bytes":794832,"wa` |

## Speed

A 1600×1200 RGBA image, four passes of a 5-tap blur each way and an 8× box shrink, through the public `GET /_weft/fn/<id>`. TS and Rust produce the same bytes, which the wire check holds them to.
Sequential p50 and p99, then 32 callers at once. A within-weft comparison of two server bodies: the `evals/compare` stacks have no server functions.

| Runtime | Body | p50 ms | p99 ms | calls/s | Over TS |
|---|---|---|---|---|---|
| node | TS `run` | 105.96 | 115.78 | 9.5 | |
| node | addon | 14.62 | 18.69 | 143.7 | **7.2× p50, 15.1× calls/s** |
| node | WASM | 16.65 | 19.66 | 63 | 6.4× p50 |
| bun | TS `run` | 91.59 | 99.73 | 11 | |
| bun | addon | 17.85 | 20.22 | 147.4 | **5.1× p50, 13.4× calls/s** |
| bun | WASM | 17.99 | 21.34 | 57.9 | 5.1× p50 |
| deno | TS `run` | 90.67 | 99.53 | 10.9 | |
| deno | addon | 14.33 | 18.65 | 146.4 | **6.3× p50, 13.4× calls/s** |
| deno | WASM | 16.37 | 20.72 | 65.3 | 5.5× p50 |
