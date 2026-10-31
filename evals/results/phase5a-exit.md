# Phase 5a exit check

2026-10-31: **PASS**, 28 of 28 checks. A search sidecar replaces a TS `query` with no client change.
The swap is scripted (`evals/phase5a-exit.mjs`, the app in `evals/phase5a/`), not done by an agent. 20000 documents; `weft start` on node, bun, deno.

Changed under `src/`: `src/server/docs.ts`, `src/server/rank.ts`, `src/server/rust.ts`. Added: `crates/search`.

| Check | Result | Detail |
|---|---|---|
| the swap touches server modules only | pass | `{"changed":["src/server/docs.ts","src/server/rank.ts","src/server/rust.ts"]}` |
| the app type-checks before and after, with the same client types | pass |  |
| node: the client is byte-identical | pass | `{"files":29}` |
| node: /search serves the same HTML | pass |  |
| node: every request gets the same answer | pass | `{"requests":12}` |
| node: the same e2e passes in Chromium | pass | `{"compassTop":"w1kw wup wdp 5.770738","added":"Zebra lantern 19.807175"}` |
| bun: the client is byte-identical | pass | `{"files":29}` |
| bun: /search serves the same HTML | pass |  |
| bun: every request gets the same answer | pass | `{"requests":12}` |
| bun: the same e2e passes in Chromium | pass | `{"compassTop":"w1kw wup wdp 5.770738","added":"Zebra lantern 19.807175"}` |
| deno: the client is byte-identical | pass | `{"files":29}` |
| deno: /search serves the same HTML | pass |  |
| deno: every request gets the same answer | pass | `{"requests":12}` |
| deno: the same e2e passes in Chromium | pass | `{"compassTop":"w1kw wup wdp 5.770738","added":"Zebra lantern 19.807175"}` |
| a tag Rust adds reaches the response | pass | `{"tags":["docs","doc:doc-7"]}` |
| a forged or unsigned call to the sidecar is refused | pass |  |
| a killed sidecar costs that function, not the server, and comes back | pass | `{"backMs":428}` |
| stopping `weft start` stops the sidecar | pass |  |
| `weft check` passes the clean sidecar app | pass | `{"files":4,"tests":0,"errors":0,"warnings":0,"byCode":{}}` |
| R101: a date, a void and a one-way transform | pass | `["`nothing.60957a`: `output` has a type JSON can't carry, so n","`shout.60957a`: `input` has a one-way `.trans` |
| R102: a plain union of objects, and not a nullable or a scalar union | pass |  |
| R103: an edited schema stops cargo at the function it broke, named by id | pass | `{"file":"crates/search/src/main.rs","line":70,"why":"`searchDocs.60957a`: the Rust no longer matches the contr` |
| R109: a compile error no function explains is told apart | pass |  |
| dev: the first request works, after one build | pass | `{"firstMs":12634}` |
| dev: a crate edit reloads with no failed request | pass | `{"reloadMs":3246,"requests":78}` |
| dev: a schema edit is reported as R103 with the id, and fixing the Rust recovers | pass | `{"noted":"R103 error: `searchDocs.60957a`: the Rust no longer matches the contract: missing field `lang` in in` |
| dev: a crash restarts the sidecar | pass |  |
| stopping `weft dev` stops the sidecar | pass |  |

## Speed

The same tf-idf search over one corpus, through the public `GET /_weft/fn/<id>`, on one machine. Sequential p50 and p99, then 32 callers at once.
A within-weft comparison of two server bodies: the `evals/compare` stacks have no server functions, so they have no counterpart.

| Runtime | Body | p50 ms | p99 ms | calls/s |
|---|---|---|---|---|
| node | TS `run` | 5.9 | 14.44 | 214 |
| node | Rust sidecar | 8.87 | 35.44 | 851 |
| bun | TS `run` | 5.66 | 25.88 | 211 |
| bun | Rust sidecar | 3.55 | 6.86 | 1755 |
| deno | TS `run` | 12.28 | 35.31 | 96 |
| deno | Rust sidecar | 3.59 | 5.69 | 1922 |
