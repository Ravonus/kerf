# 16 — Phase 1 compiler spike: Rust/Oxc, measured

Research date: 2026-10-28. Numbers marked **(measured)** were run for this doc on an M4 Max (1-minute load average
6–14, other agent sessions running) with Rust 1.98.0, Node 22.22.1, Vite 8.3.5, Vitest 5.0.5 and jsdom 30.1.3.
Numbers marked **(upstream CI)** come from GitHub Actions runs of `solidjs/solid`. Numbers marked **(derived)** are my
arithmetic on a measured figure. Statements marked **(unverified)** were not checked.

> **Superseded in part (2026-10-29):** weft now owns its code generator. This spike's back end (Solid 2's crate) stays
> in the build only until weft's own passes the same checks, then it is removed (PLAN §3.6, §12). The measurements
> and the pre-pass design below still stand.

**The question** (PLAN §3.6, §11 "Compiler spike outcome"): is a Rust/Oxc compiler built on Solid 2's native crate the
product path, or does weft fall back to forking `@solidjs/babel-plugin`? And does the spike say anything about the
other §11 question, "`.value` in JSX: required everywhere or auto-read"?

**What was built** (all on branch `claude/phase1-compiler-spike-281a6a`):

| Path | What |
|---|---|
| [`crates/weft-compiler`](../../crates/weft-compiler) | `analyze` (scopes, props, boxes, lists, diagnostics) → `transform` (props → live reads, `.map` → keyed list) → Solid 2's DOM back end through `compile_program`. One Oxc parse. `weftc` CLI and a napi binding. 30 tests. |
| [`packages/weft`](../../packages/weft) | Client runtime (`weft`, `weft/dom`), `weft/test` with `toTouchAtMost`, the `weft()` Vite plugin, size and bench scripts. 19 tests. |
| [`evals/reference-v3/weft`](../../evals/reference-v3/weft) | The v3 shop app ported to weft TSX. |
| [`evals/frameworks/weft`](../../evals/frameworks/weft) | Eval adapter, so the hidden v3 tests run on weft unchanged. `run-app.mjs reference` grades and measures any framework's reference app. |

---

## TL;DR

1. **Go on Rust/Oxc.** All four §3.6 checks pass or are on track (table below). The compiler compiles the v3 app,
   passes all 23 hidden tests, and compiles 1,000 generated components in **193 ms** natively, single-threaded,
   diagnostics included (budget 500 ms) **(measured)**.
2. **But not as a fork.** weft used Solid 2's `solidjs-compiler` crate **unmodified**, as a pinned git dependency
   (`02b52b5`), through its public `compile_program(allocator, program, source, options)` seam. Everything weft adds
   (props, lists, W-codes) is a pre-pass on the same Oxc AST before the hand-off. Nothing in the back end needed to
   change for props, lists, conditionals, events or attributes. Fork only when a back-end change is actually needed.
3. **The v3 app on weft** **(measured, same run as React and Solid)**:

   | | hidden tests | bundle gz | bundle br | price push | add one | type 3 chars |
   |---|---|---|---|---|---|---|
   | React ref | 23/23 | 67.7 KB | — | 3 DOM | 3 DOM | 167 DOM |
   | Solid ref | 23/23 | 9.9 KB | — | 1 DOM | 1 DOM | 152 DOM |
   | **weft ref** | **23/23** | **4.2 KB** | **3.5 KB** | **1 DOM** | **1 DOM** | **152 DOM** |

4. **Keying rows by key, not by object identity, defuses the v3 identity bug.** The same `{ ...p }` habit that cost
   Solid 300 DOM mutations per price push costs weft **1** mutation, but **756** reactive re-runs instead of 10. The
   new **W014** diagnostic flags the spread at compile time, and `toTouchAtMost(1, { runs: 10 })` fails on it in a
   test.
5. **`.value` in JSX: keep it required.** Auto-read can only work for boxes the compiler can see declared in the same
   file. Imported boxes, `defineState` members (`cart.count`) and box-typed props need types, which §3.6 keeps off the
   compile path. A required `.value` plus **W015** (bare local box in JSX, safe autofix) gets most of auto-read's
   benefit with one consistent rule.

---

## 1. Approach and why

PLAN §3.6 planned "fork Solid 2's native crate; weft adds a `weft-compiler` crate: `pre` → `diag` → the forked back
end". Before forking, I checked what the crate exposes:

- `solidjs-compiler` (`packages/compiler` on Solid's `next` branch, MIT, ~42k lines of Rust, `publish = false`) has a
  documented Rust entry point for exactly this case: `compile_program` takes an Oxc `Program` that another frontend
  built in the same allocator. Solid's own TSRX frontend uses it.
- Solid 2's DOM output already does what weft's semantics need:
  - Component props compile to getters (`count={count.value}` → `get count() { return count.value }`), which is
    §3.3's "live props" at the call site.
  - Member reads such as `x.value` count as dynamic, so `{count.value}` becomes a fine-grained binding with no
    weft-specific codegen.
  - Conditionals get memoised conditions, so a branch is built once per switch.
- So the spike tested the cheapest version of the plan: **pre-pass + upstream back end, unmodified**. A fork would be
  needed only if a test failed because of the back end. None did.

The pipeline, per file:

```
source ─ Oxc parse ─ SemanticBuilder ─ analyze ──────────────▶ diagnostics (JSON: code, span, line/col, fix)
                                        │ plan
                                        ▼
                       transform (same AST, VisitMut)
                         ({ a, b = 1, ...rest }) → (props), a → props.a, b → (props.b === undefined ? 1 : props.b)
                         {xs.map(x => <Row key={x.id} x={x}/>)} → <For each={xs} by={(x) => x.id}>{x => <Row x={x()}/>}</For>
                                        ▼
                       solidjs_compiler::compile_program (moduleName "weft/dom", builtIns ["For"])
                                        ▼
                       code + source map (TypeScript kept; Vite's Oxc pass strips it)
```

New AST nodes are built by parsing short snippets in the file's allocator and filling placeholders with nodes moved
out of the original program. They are unspanned, so source maps only point at authored code.

The runtime implements the helpers Solid's DOM output imports (`template`, `insert`, `effect`, `memo`,
`createComponent`, `setAttribute`, `setProperty`, `className`, `delegateEvents`, …) on weft's own signal graph
(push-pull, lazy `derived`, effects flushed in creation order on a microtask). It does not use `@solidjs/web` or
`solid-js`.

---

## 2. The §3.6 decision rule

| # | Check | Result | Status |
|---|---|---|---|
| 1 | Upstream's fixture corpus passes, in dom, ssr and hydratable modes | At the pinned rev: `cargo test` 90/90, JS fixture suite **6880 passed, 2 skipped, 0 failed** across 49 files **(measured)**. The first run had 16 failures, all from parity suites that need `@solidjs/babel-plugin` built; building it cleared them. weft calls the crate unmodified, so this is the back end weft ships. | **Pass** |
| 2 | `pre` does §3.3 props (6 forms) and §3.4 keyed `.map`; `diag` does W001, W006, W010 with spans and autofix | Props: `({a,b})`, `(props)`, defaults, `...rest` (live `omit` proxy), nested (W006 + lowered live anyway). **`children` memoisation is not done.** Lists: keyed `.map` with live item and index accessors, `filter().sort().map()` chains, destructured items, primitives keyed by value, lists inside conditionals. Diagnostics: W001 (unsafe suggested fix), W005, **W006 (safe autofix)**, **W010 (safe autofix when the item has `.id`)**, W013, plus new W014 and W015. All have byte spans, 1-based line/column (UTF-16) and JSON fixes. | **Pass**, except `children` |
| 3 | CI builds all 6 binary targets in ≤ 15 min | **Not run for weft** (no CI in this repo yet). Upstream runs the same 6-target napi matrix on the same crate (darwin x64/arm64, linux x64/arm64-gnu, win32-x64-msvc, wasm32-wasip1-threads). Over its 9 latest successful runs, the slowest job took **283–333 s**, build and tests included, with `rust-cache` **(upstream CI)**. A cold local release build of weft-compiler (Solid + Oxc + napi, fat LTO) took **39.5 s** wall **(measured)**. | **On track (inferred)** |
| 4 | 1k components compile in ≤ 0.5 s, single-threaded | **193 ms** native full compile, **20 ms** check-only (`weftc --bench 9`, median); **236 ms** through napi, **254 ms** with source maps **(measured)**. | **Pass** (2–2.5× headroom) |

Corpus for check 4: `node scripts/gen-corpus.mjs 1000` generates 1,000 components, 64 lines each (2.4 MB in total).
Each one has destructured props with defaults, three boxes, two `derived`, a `watch`, 1–3 keyed lists with
conditionals and handlers, an input and a conditional section.

**What the weft layer costs:** on the same corpus, upstream's own `@solidjs/compiler` 2.0.0-rc.19 binary takes
**185 ms** through napi without the weft pre-pass, against weft's 236 ms. The pre-pass, diagnostics and the second
`SemanticBuilder` pass add about **0.05 ms per file** **(derived)**. Most of the time is Solid's back end. Check-only
mode skips codegen and runs at about a tenth of the full cost, which is what `weft check` needs.

---

## 3. §3.7 budgets

| Budget | Measured | |
|---|---|---|
| Runtime ≤ 6 KB br (benchmark app) | 2.54 KB br with every runtime export kept alive (`bench/fixtures/runtime-all.ts`) | ok, but see caveat |
| Hello world ≤ 3 KB br | 0.96 KB br | ok |
| v3 shop app total JS ≤ 10 KB br | 3.51 KB br (3.91 KB gz; 4.2 KB gz from `run-app.mjs measure`, which builds through `index.html` and includes Vite's modulepreload polyfill) | ok |
| v3 price push ≤ 1 mutation, add one ≤ 3 | 1 and 1 (probe), and as tests in `packages/weft/test/v3-budget.test.tsx` | ok |
| Compiler ≤ 0.5 s / 1k files, single-threaded, diagnostics included | 193 ms native, 236 ms napi | ok |
| js-framework-benchmark ≤ 1.10× Solid | not measured | — |
| `weft check` 1k files ≤ 3 s cold / 0.5 s warm | weft's own pass: 20 ms (tsc not included) | weft's half ok |
| HMR, prod build, dev-name stripping | not built | — |

Caveat on runtime size: this runtime has no SSR string renderer, hydration, `<Boundary>`, `resource`, dev names or
HMR cache, and a minimal `context`. The final runtime will be larger. The budget still has 3.5 KB of room.

---

## 4. The v3 identity bug, on weft

Sonnet's v3 Solid session merged live prices with `products().map(p => ({ ...p, price }))`. In Solid, new identities
make `<For>` tear down and rebuild every row: 300 DOM mutations per price push. I wrote the same habit into a weft
variant of the app (`packages/weft/test/fixtures/v3-spread`: separate `prices` box, merged with a spread inside a
`derived`) and ran the probe's three interactions with `touches()` from `weft/test` **(measured)**:

| | price push | add one | type 3 chars |
|---|---|---|---|
| weft ref | 1 DOM · 10 re-runs | 1 DOM · 452 re-runs | 152 DOM · 18 re-runs |
| weft + `{ ...p }` spread | **1 DOM · 756 re-runs** | 1 DOM · 452 re-runs | 152 DOM · 18 re-runs |
| (Solid + spread, v3 findings) | 300 DOM | — | — |

What this shows:

- **Keying by key removes the DOM blowup.** §3.4's rule ("a new object under the same key updates the row in place")
  means the spread only swaps each row's `item`. Bindings compare values before writing, so only the changed price
  reaches the DOM.
- **The CPU cost remains, and a DOM-only budget can't see it.** Every row's bindings re-run on every push: 756 against
  10. So `toTouchAtMost` takes a second budget, `toTouchAtMost(n, { runs })`, which counts reactive computations
  re-run during the interaction.
- **W014 catches the spread at compile time.** Its severity depends on what the compiler can see:
  - **error** when the spread feeds a box that is rendered as a keyed list in the same file;
  - **warning** when the box leaves the file (as in v3, where `App` merges and `ProductList` renders). The Vite
    plugin printed it at the exact line in this run.

  It does not fire for the correct form, `p.id === id ? { ...p, price } : p`.
- **New finding: add-one costs 452 re-runs in the reference app.** Every row reads `cart[p.id]` from one `cart`
  object box, so one cart change re-runs a binding in all 150 rows. Solid's reference has the same shape. The DOM
  cost is 1 mutation, so only a `runs` budget sees it. Fixing it needs a keyed read, a box per key or a selector.
  That is a design question for `state`/`defineState` (see §6).

---

## 5. `.value` in JSX: what the spike says

What the compiler can know without types:

- **Local boxes are visible.** `const n = state(0)` / `derived(…)` / `state.linked(…)` / `resource(…)` declare a box
  the compiler can see (`analyze.rs`, `Boxes`).
- **Most boxes in a real app are not local:**
  - boxes imported from another module,
  - members of a `defineState` result (`cart.count`),
  - props typed `State<T>` (`value={coupon}`),
  - boxes returned from helpers.

  Telling these apart from plain objects needs the type checker. 08 §3 and PLAN §3.6 keep type-directed compilation
  off the compile and HMR path on purpose.
- **So auto-read would be a partial rule.** `{count}` would work when `count` is declared in the file and silently
  render `[object Object]` when it comes from `cart.count` or an import. That is "context-dependent magic", one of the
  Phase 0 root causes, and it breaks §2 rule 3 (one way).
- **Required `.value` costs little in practice.** The port has 17 box reads, 10 of them in JSX, in 189 lines. The
  Solid reference has 20 accessor calls in 196 lines. Solid's back end needs no special handling for `x.value`.
- **What auto-read was meant to prevent is now a compile error.** **W015** fires on a bare local box in a JSX child
  or on a native element's attribute, with a safe autofix that adds `.value`. A box passed to a component prop is
  allowed (write access, §3.2 rule 6).

**Recommendation:** close the question as "required everywhere" and keep W015, which needs no types. What the spike
can't measure is agents' error rate with required `.value`. That belongs to the Phase 1 agent eval (weft
column in v3), and W015 plus W008 (type-level, box/value at props) should catch the errors that eval turns up.

---

## 6. What Phase 1 proper should change

**Compiler**
1. **Depend on Solid's crate, don't fork it.**
   - Pin a git rev of `solidjs-compiler` (`default-features = false`, so neither the TSRX frontend nor its second Oxc
     copy is linked). Keep weft's code in its own crate.
   - Fork into `crates/` only when a back-end change is needed, and upstream it when possible.
   - The binary is 3.4 MB, against 7.0 MB for upstream's darwin-arm64 build, which includes TSRX.
2. **Lockstep with upstream's Oxc.** `compile_program` takes an Oxc AST, so weft must use exactly the Oxc version the
   pinned rev uses (0.144 today; Oxc is at 0.156).
   - Upgrades are "bump the Solid rev, then fix weft's pre-pass", not "bump Oxc".
   - Schedule it monthly, with the fixture suite and weft's tests as the gate.
3. **Keep a helper-contract conformance test.** The back end's import surface is unversioned and differs by mode:
   `dev: true` emits `setStatefulProperty`, which the first test run tripped on. Compile upstream's fixture corpus
   with `moduleName: "weft/dom"` and assert that every imported helper exists in `weft/dom` (and later `weft/ssr`).
   This is the one place a Solid bump can break weft silently.
4. **Finish §3.3:** `children` memoisation, and props with call-expression values.
   - `<App api={createFakeApi()} />` compiles to a getter that calls `createFakeApi()` on every read. This is Solid's
     semantics and harmless when a prop is read once, but an agent trap otherwise.
   - Either hoist non-reactive calls (no `.value` or prop read inside), or add a diagnostic.
5. **Build nodes directly.** Parsing snippets to build nodes was fast to write and is not the bottleneck (the pre-pass
   costs ~0.05 ms per file). Replace it with direct node construction once the pass list is stable, so key and default
   expressions keep their reference IDs: today a prop default that reads another destructured prop is not
   rewritten.
6. **Unfinished pieces:**
   - list rows whose root isn't a single element or component (fragments, conditional roots) are lowered, but their
     `key` isn't found;
   - W001's fix is a suggestion only, because `derived` changes the use sites to `.value`;
   - W014 is per-file. A cross-file version needs `weft check`'s project view.

**Runtime and tests**
7. **Make `toTouchAtMost(n, { runs })` the standard form.** DOM mutations alone missed the spread bug here, and the
   `runs` budget caught it. Every eval scenario should set both.
8. **Decide keyed reads of record boxes** (`cart[p.id]` re-running all 150 rows on add-one). Options:
   - box-per-key in `defineState`,
   - a `select(box, key)` primitive,
   - deep tracking in `.set(draft)`.

   The v3 app is the benchmark.
9. **Remaining Phase 1 runtime work:** SSR string renderer and hydration (weft/ssr), `<Boundary>`, `resource`, dev
   names via the back end's `sourceNames`, and js-framework-benchmark in the same run as Solid.

**Evals**
10. **Add a weft column to the v3 agent eval.** The adapter, the starter configs and `run-app.mjs reference` are in
    place; a weft starter `src/` and an AGENTS.md block are not. That eval settles the remaining half of the `.value`
    question (agent error rate) and is the Phase 1 exit check.

---

## 7. PLAN.md edits (applied in the commit after this doc)

- **§3.6 Compiler**, first sub-bullet. Replace "Fork Solid 2's native `solidjs-compiler` crate (MIT) at a pinned
  revision" with: "Build on Solid 2's native `solidjs-compiler` crate (MIT) at a pinned git revision, called through
  `compile_program` on weft's own Oxc AST. Fork into `crates/` only for a back-end change upstream won't take. Keep
  NOTICE and track upstream; weft's Oxc version follows the pinned rev."
- **§3.6**, "weft adds one crate": add "and a helper-contract conformance test (every helper the back end can import
  exists in `weft/dom`)".
- **§3.5 catalog:** add
  - **W014** "identity-breaking `.map(p => ({ ...p, … }))` feeding a keyed list (error in-file, warning across files)";
  - **W015** "box rendered without `.value` in JSX (autofix)".
- **§3.7 DOM work:** "every eval scenario has a `toTouchAtMost(n, { runs })`; v3 price-push ≤ 1 mutation and ≤ 10
  re-runs, add-one ≤ 3".
- **§7b `weft test`:** mention `touches()` and the `runs` budget next to `toTouchAtMost`.
- **§10b:** add the spike outcome: "weft keys rows by key, so the v3 spread habit costs 1 DOM write instead of 300;
  W014 and the `runs` budget catch the remaining per-row CPU cost."
- **§11:**
  - mark "Compiler spike outcome" settled (Rust/Oxc on Solid's crate as a dependency; see research 16);
  - change "`.value` in JSX" to "settled: required everywhere, W015 catches bare boxes; the agent eval only
    confirms the error rate";
  - add an open question: "keyed reads of record boxes (`cart[p.id]`) re-run every row".
- **§12 decision log:** "Compiler spike passed (2026-10-28): weft is a pre-pass on Solid 2's crate, unmodified; 193 ms
  per 1k components; v3 app 3.5 KB br, 1 DOM write per price push."

---

## 8. Reproduce

```bash
# compiler (Rust 1.95+; rust-toolchain.toml pins stable)
cd crates/weft-compiler && cargo test --release && cargo build --release --bin weftc
# runtime, binding, tests, size, bench
cd packages/weft && npm install && npm run build:native && npx vitest run
node scripts/size.mjs
node scripts/gen-corpus.mjs 1000 && ../../crates/weft-compiler/target/release/weftc --bench 9 bench/corpus
node scripts/bench.mjs bench/corpus 9 [--solid <path to @solidjs/compiler>]
# v3 hidden tests and probe, weft next to React and Solid
cd evals/frameworks/weft && npm install && cd ../..
node run-app.mjs reference --name v3-ref --frameworks react,solid,weft
node run-app.mjs grade --name v3-ref --frameworks react,solid,weft && node run-app.mjs measure --name v3-ref --frameworks react,solid,weft
node run-app.mjs summary --name v3-ref
```

The upstream fixture run: clone `solidjs/solid` at `02b52b5c29fb3a08b605f524b09d90455895ac67`, then `pnpm install`,
`pnpm --filter @solidjs/babel-plugin build`, and in `packages/compiler` run `napi build --release && vitest run`.
