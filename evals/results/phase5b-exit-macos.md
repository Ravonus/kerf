# Phase 5b exit check

2026-11-01: **PASS**, 51 of 51 checks, on darwin-arm64, 14 threads, load 41.7 at the end. A CPU-bound demo beats its TS `run` by at least 5×.
The swap is scripted (`evals/phase5b-exit.mjs`, the app in `evals/phase5b/`), not done by an agent. `weft start` on node, bun, deno.

Changed under `src/`: `src/server/image.ts`, `src/server/rust.ts`, `src/server/thumb.ts`. Added: `crates/media`. Addon 712 KB, WASM 249 KB.

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
| node: the addon beats its TS `run` by at least 5× | pass | `{"latency":14.3,"throughput":77.7}` |
| bun: the addon beats its TS `run` by at least 5× | pass | `{"latency":7.7,"throughput":45.4}` |
| node: a tag Rust adds reaches the response | pass |  |
| node: a panic costs one call, in R108, with the detail in the log only | pass |  |
| node: past its deadline TS gives up with R107, and the loop stays free | pass | `{"duringSpinMs":25}` |
| node: more than 4 calls run at once | pass | `{"ms":208}` |
| node: a stale library is refused with R103 | pass |  |
| node: with the addon gone, its WASM gives the same answers | pass | `{"requests":8}` |
| node: on WASM a panic ends an instance, and the next call has a new one | pass |  |
| node: on WASM `ctx.remaining()` runs on the host's clock | pass |  |
| bun: a tag Rust adds reaches the response | pass |  |
| bun: a panic costs one call, in R108, with the detail in the log only | pass |  |
| bun: past its deadline TS gives up with R107, and the loop stays free | pass | `{"duringSpinMs":23}` |
| bun: more than 4 calls run at once | pass | `{"ms":203}` |
| bun: a stale library is refused with R103 | pass |  |
| bun: with the addon gone, its WASM gives the same answers | pass | `{"requests":8}` |
| bun: on WASM a panic ends an instance, and the next call has a new one | pass |  |
| bun: on WASM `ctx.remaining()` runs on the host's clock | pass |  |
| deno: a tag Rust adds reaches the response | pass |  |
| deno: a panic costs one call, in R108, with the detail in the log only | pass |  |
| deno: past its deadline TS gives up with R107, and the loop stays free | pass | `{"duringSpinMs":24}` |
| deno: more than 4 calls run at once | pass | `{"ms":208}` |
| deno: a stale library is refused with R103 | pass |  |
| deno: with the addon gone, its WASM gives the same answers | pass | `{"requests":8}` |
| deno: on WASM a panic ends an instance, and the next call has a new one | pass |  |
| deno: on WASM `ctx.remaining()` runs on the host's clock | pass |  |
| `node .output/server/index.mjs` finds the addon with no `weft start` | pass |  |
| `weft check` passes the clean app, with no warning | pass | `{"files":4,"tests":0,"errors":0,"warnings":0,"byCode":{}}` |
| R103: an edited schema stops cargo at the function it broke, named by id | pass | `{"line":97,"why":"`thumbnail.0814fc`: the Rust no longer matches the contract: missing field `format` in initi` |
| R104: an edge preset is refused with the fix, before anything compiles | pass |  |
| R104: a crate that won't build for WASM is a warning here, with the way out | pass | `"`media` has no WASM fallback: cargo check failed in `media`:\nCompiling media v0.0.0 (/private/tmp/claude-501` |
| R105: a cached query with tags and no `touch`, at the method | pass | `{"line":108}` |
| dev: the first request works, after one build | pass | `{"firstMs":14788}` |
| dev: a crate edit reloads in place, with no failed request and no new worker | pass | `{"reloadMs":1472,"requests":68}` |
| dev: a compile error keeps the old library serving | pass |  |
| dev: a schema edit is reported as R103 with the id, and fixing the Rust recovers | pass |  |
| `weft add rust`: a native crate and a sidecar build, check clean and answer, on the first try | pass | `{"sizes":{"media":{"kind":"native","addon":"media.darwin-arm64.node","hash":"7c266b4191d20552","bytes":729008,` |

## Speed

A 1600×1200 RGBA image, four passes of a 5-tap blur each way and an 8× box shrink, through the public `GET /_weft/fn/<id>`. TS and Rust produce the same bytes, which the wire check holds them to.
Sequential p50 and p99, then 32 callers at once. A within-weft comparison of two server bodies: the `evals/compare` stacks have no server functions.

| Runtime | Body | p50 ms | p99 ms | calls/s | Over TS |
|---|---|---|---|---|---|
| node | TS `run` | 121.89 | 147.87 | 8.1 | |
| node | addon | 8.5 | 13.06 | 629.4 | **14.3× p50, 77.7× calls/s** |
| node | WASM | 16.07 | 22 | 64.6 | 7.6× p50 |
| bun | TS `run` | 107.5 | 143.17 | 6.9 | |
| bun | addon | 13.9 | 51.65 | 313.3 | **7.7× p50, 45.4× calls/s** |
| bun | WASM | 15.86 | 20.69 | 70.4 | 6.8× p50 |
| deno | TS `run` | 133.13 | 308.17 | 7.9 | |
| deno | addon | 12.69 | 17.14 | 351.8 | **10.5× p50, 44.5× calls/s** |
| deno | WASM | 15.62 | 24.48 | 61.7 | 8.5× p50 |
