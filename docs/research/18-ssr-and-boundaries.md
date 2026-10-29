# 18 — Phase 1: weft/ssr, hydration, Boundary and resource

> **Partly superseded (2026-10-29).** §2 (the SSR helpers), §3 (hydration keys from the owner tree) and §5 (the
> helper contract with Solid's SSR output) describe the first version, built on Solid 2's back end. Since research 19
> step 3, SSR and hydratable output come from weft's own back end, with keys from source paths:
> [19 §5.3](19-own-back-end.md). `resource`, `<Boundary>`, the timing, the page data and the measurements in §6 are
> unchanged in behaviour.

Research date: 2026-10-29. Numbers marked **(measured)** were run for this doc on an M4 Max (1-minute load average
5–6, other agent sessions running) with Node 22.22.1, Vite 8.3.5, Vitest 5.0.5, jsdom 30.1.3 and Chrome 156 (headless).
Statements marked **(unverified)** were not checked.

**The task** (PLAN §3.6 "Runtime: … SSR string renderer, hydration (dom-expressions keys)" and "Async/errors in markup",
§3.1 `resource`, §6.2 skeleton timing, §3.7 js-framework-benchmark gate):

1. a `weft/ssr` string renderer and hydration, from Solid 2's SSR and hydratable back ends;
2. `<Boundary>` for pending and error states, with the §6.2 timing;
3. `resource`;
4. dev names through the back end's `sourceNames`;
5. the helper contract for `weft/ssr`;
6. js-framework-benchmark, weft and Solid in the same run.

**What was built** (branch `phase1-define-state`, on top of the uncommitted defineState work):

| Path | What |
|---|---|
| [`crates/weft-compiler/src/lib.rs`](../../crates/weft-compiler/src/lib.rs) | Option plumbing only: `generate` (`"dom"`/`"ssr"`), `hydratable`, `sourceNames`. SSR output imports from `weft/ssr`. No pass changed. |
| [`packages/weft/src/ssr.ts`](../../packages/weft/src/ssr.ts) | `weft/ssr`: `renderToString`, `renderToStringAsync`, and the 19 helpers SSR output imports. |
| [`packages/weft/src/hydrate.ts`](../../packages/weft/src/hydrate.ts) | `hydrate()` and the hydration walk helpers, re-exported from `weft/dom`. |
| [`packages/weft/src/async.ts`](../../packages/weft/src/async.ts) | `resource` and `<Boundary>`, exported from `weft`. |
| `packages/weft/src/index.ts`, `dom.ts` | The core's id hooks (`rt`, `childKey`, `runWith`), effect options (`scope`, `name`, `loc`), hydration claims in `insert`, dev names in `createComponent`. |
| [`packages/weft/vite.mjs`](../../packages/weft/vite.mjs) | SSR output for Vite's SSR transforms, `weft({ hydratable })`, and `?weft-ssr` / `?weft-hydrate` imports that load one source tree compiled either way in the same process. |
| `packages/weft/test/ssr.test.ts`, `async.test.tsx`, `ssr-contract.test.ts` | 15 tests: round trips of `evals/reference-v3/weft`, Boundary timing and errors, resource, both SSR paths, the helper contract. |

---

## TL;DR

1. **The v3 reference app hydrates with zero mismatches.** The reference App in its loading state, and the same
   components with data loaded (`test/fixtures/ssr/Shop.tsx`: Header, ProductList, CartView, 4 products, 2 cart
   lines), both pass. Each one renders to a string, hydrates with 0 key misses and 0 tag mismatches, keeps every
   server element (all 40+ elements stay connected), and makes **0 DOM mutations** during hydration **(measured,
   MutationObserver)**. Afterwards the handlers and bindings work: a click updates the hydrated row in place, and
   the select filter and Add both work.
2. **weft/ssr runs on weft's own reactive core.** Effects are off on the server. Hydration keys then come from the
   same owner tree on both sides, using Solid 2's id scheme: memos, roots and `scope()` holes take an id from their
   owner, and each element takes one. The server and client differ only in what the compiler emits; the rules are
   shared. That cost the core about 0.20 KB br.
3. **Boundary and resource follow §6.2.**
   - Nothing for 150 ms, then the fallback, held at least 400 ms, then the content swaps in whole.
   - Refetches never bring the fallback back. A superseded fetch is aborted and ignored.
   - `error(e, retry)` covers both failed resources and children that throw.
   - On the server, `renderToStringAsync` waits for resources. The page carries their values and each boundary's
     state. A hydrated resource starts with the server's value: its first run only tracks reads, and its fetch is
     aborted at once.
   - A fallback the server rendered is claimed, not replaced, and held 400 ms from hydration.
4. **The SSR helper contract holds.** Solid's whole SSR fixture corpus was compiled through weft at the pinned rev:
   dev and prod, hydratable or not. It imports 19 distinct helpers, and every one exists in `weft/ssr`. The
   hydratable DOM corpus needs five helpers `weft/dom` doesn't have yet (`applyRef`, `claimElement`, `getOwner`,
   `setAttributeNS`, `spread`). All five are on the compiler-hardening branch; the test allows exactly those five
   until it merges.
5. **js-framework-benchmark: 1.067× Solid's CPU geomean in the same run, inside the ≤ 1.10× gate.** weft wins
   select and bundle size and trails on create, swap and clear. Memory is 1.4–1.5× Solid's, the weak spot (§6).

---

## 1. Compiler: options only

The compiler-hardening session is editing the crate's passes, so this task added three `Options` fields and mapped
them straight onto `solidjs_compiler::CompileOptions`:

| weft option | back end | notes |
|---|---|---|
| `generate: "dom" \| "ssr"` | `Generate::Dom` / `Generate::Ssr` | SSR output's default module is `weft/ssr`; a caller-set `moduleName` still wins. |
| `hydratable` | `hydratable` | DOM output asks for elements by key (`getNextElement`); SSR output writes the keys (`ssrHydrationKey`). |
| `sourceNames` | `SourceNames::all(sourceNames && dev)` | Dev builds only: binding labels (`li.children`), source locations, component names. |

The Vite plugin uses SSR output for Vite's own SSR transforms (`options.ssr`), and `weft({ hydratable: true })` for
an app that hydrates. For tests, `import { App } from './App.tsx?weft-ssr'` (or `?weft-hydrate`) compiles a module
that way. The query follows relative `.tsx`/`.jsx` imports, while `.ts` modules (state, API clients) stay shared. So
one Vitest process can render on the "server" and hydrate on the "client" from the same sources. `sourceNames` is on
whenever the plugin is in dev.

## 2. weft/ssr

**Why weft's own core, not a port of Solid's server runtime.** Solid's `web/src/server.ts` is 7,300 lines. Most of it
is streaming, async retry slots, live holes, frames and link claims. The part weft needs is small, if both sides
build the same owner tree. So the server runs weft's real core with one switch (`rt.server`) that skips effects,
watchers and `onMount`. Memos, `derived`, `state` and the keyed list are the same code on both sides. `For` and
`createComponent` are re-exported from `weft/dom`; neither touches the DOM until it's called on the client.

**Holes.** `ssr(template, ...holes)` concatenates static parts and resolves holes:

- Strings and numbers are written as they are. The compiler already escaped them.
- `null` and booleans write nothing.
- Arrays are joined.
- Finished `{ t }` nodes are inlined.
- Functions are called until they stop returning functions.
- An `ssrGroup(fn, n)` hole is called once, and its array fills the next `n` positions.

`escape(x)` escapes text (`&`, `<`) or attributes (`&`, `"`, `<`). A function is wrapped so its *result* is escaped
when it resolves, which closes the `<Show>{s}</Show>` XSS class Solid's comment describes. Finished nodes pass
through.

**Other helpers.**

- `ssrAttribute`, `ssrClassName`, `ssrStyle`, `ssrStyleProperty(ies)` and `ssrElementAttribute` follow Solid's
  contracts. The key is a compile-time literal; the value arrives already escaped.
- `ssrElement` writes spread elements. It takes the hydration key before the props thunk runs.
- `ssrSelectValues()` is called once by any module that binds `<select value>`. The render then drops the `value`
  attribute and marks the matching `<option selected>`.
- `ssrLinkClaim` returns `''`: there's no router yet.
- `applyRef` is a no-op on the server.

**Renders.**

- `renderToString(code, { hydratable, app })` renders what it can now.
- `renderToStringAsync` renders, waits for the fetches that pass started (`rt.wait`), and renders again until none
  is pending (at most 10 passes). Each pass is synchronous, and results are cached by resource key.
- Each pass gets its own `defineState` app (`options.app` seeds it). Requests never share scope instances. This is a
  `useApp` swap rather than an owner, so it adds no ids.
- Hydratable output ends with `<script type="application/json" data-weft>`. It holds resolved resource values and
  boundary states by key, with `<` escaped as `<`.

## 3. Hydration keys

The keys are Solid 2's scheme (`formatChildId`): an owner's id plus its child counter in base 36, with a length
prefix letter after 35 children. Both sides follow the same rules:

| Takes the next id from its owner | Transparent (counts on its parent's counter) |
|---|---|
| `memo` / `derived` (at creation, so laziness doesn't matter) | attribute effects (`effect(…)` with no `scope`) |
| `createRoot` under an owner: keyed-list rows, `context.provide` | unscoped inserts |
| a `scope()` hole: server reserves at the call, client's insert effect takes it at creation | components (`createComponent` is `untrack`) |
| each element: `ssrHydrationKey()` / `getNextElement()` | `watch`, `onMount` (never run on the server) |
| `resource`; `<Boundary>` reserves two (content, fallback) | defineState setup roots (`parent: null`, no id) |

A computation that re-runs resets its counter, so ids stay stable across re-runs. Ids exist only while `rt.ids` is
on: during a hydratable server render, and during `hydrate()`. Afterwards nothing pays for them.

**Claiming.**

- `hydrate(code, container)` indexes the container's `[_hk]` elements, turns ids on and runs the app.
- `getNextElement` returns the server element for its key and checks the tag. On a miss, it counts the miss, warns
  in dev builds and renders that element fresh.
- `insert` starts from the server's nodes, so text updates in place and claimed elements stay where they are. Those
  nodes are either the ones between `<!--$-->` and `<!--/-->`, which `getNextMarker` collects, or the parent's only
  content.
- `setAttribute` skips writes the server already made. Without that, hydrating the Shop rewrote 10 attributes.

Two bugs found along the way:

- `getNextMarker` receives the node *after* `<!--$-->`, not the marker itself.
- `ssrSelectValues()` runs once at module load, so the render must not reset its flag.

## 4. Boundary and resource

```tsx
const user = resource(signal => api.user(props.id, signal)) // reads before the first await are tracked
<Boundary pending={<Skeleton />} error={(e, retry) => <Retry onClick={retry} />}>…</Boundary>
```

- **resource.** It returns `.value`, `.pending`, `.error` and `.refresh()`.
  - A tracked read changing, or `refresh()`, aborts the in-flight fetch and starts another.
  - A superseded result is ignored.
  - The value stays until the new one lands.
- **Boundary.** Resources register with the nearest Boundary through context when they're created.
  - The Boundary is *loading* while a registered resource has never resolved. It's *failed* when one has an error or
    its children threw while rendering.
  - Timing: show nothing for `timing.showAfter` (150 ms), then the fallback. When loading ends, keep the fallback
    until it has been up `timing.hold` (400 ms), then swap the content in.
  - A refetch never counts as loading, so it never flashes.
  - `retry` rebuilds children that threw and refreshes failed resources.
- **On the server,** the Boundary resolves its content to a string inside its own root, so resources created lazily
  while resolving still register.
  - It then records its state (`c`, `p` or `e`) under its content key, and renders the content, the fallback or the
    error view.
  - The client reads that state. For `c` it claims the content.
  - For `p` or `e`, it builds the content fresh, with ids off, so it doesn't look for keys the server never wrote. It
    claims the fallback or error view under the reserved fallback key. A server fallback is held 400 ms from
    hydration.

Not done in Phase 1:

- Errors thrown later, inside a reactive update, are not caught. Only errors during render and failed resources are.
- There's no streaming, so the server sends the fallback or waits.
- Events fired before hydration are dropped. `runHydrationEvents` is a no-op until there's a capture script.
- `weft/test` has no deterministic clock yet. The timing tests use Vitest's fake timers.

## 5. Helper contract

[`test/ssr-contract.test.ts`](../../packages/weft/test/ssr-contract.test.ts) finds the pinned checkout through `cargo
metadata`. It compiles every `__ssr*` fixture (generate `ssr`, hydratable off and on) and every `__dom_hydratable*`
fixture, in dev (with `sourceNames`) and prod. It then checks each helper the output imports against the module's
real exports **(measured)**:

- **SSR, 19 helpers:** `For applyRef createComponent escape memo mergeProps scope ssr ssrAttribute ssrClassName
  ssrElement ssrElementAttribute ssrGroup ssrHydrationKey ssrLinkClaim ssrSelectValues ssrStyle ssrStyleProperties
  ssrStyleProperty`. None is missing.
- **Hydratable DOM:** 5 are missing, all from the compiler-hardening branch (§TL;DR 4). New gaps fail the test.

It's a Vitest test rather than an extension of `crates/weft-compiler/tests/helper_contract.rs`, because that file is
on the compiler-hardening branch. After both land, the Rust test can absorb it, or the JS test can keep the SSR and
hydratable modes.

## 6. Measurements

### Tests (measured)

56 Vitest tests pass across 8 files: the 41 that existed before, plus 15 new. `tsc --strict` over `src` shows only
the 2 errors that were there before this work.

### Round trip (measured, `test/ssr.test.ts`)

| Case | Key misses | Server elements kept | DOM mutations while hydrating |
|---|---|---|---|
| Shop (v3 components, data loaded) | 0 | all | 0 |
| v3 App, loading state | 0 | all | 0 |
| Shop with one `_hk` removed | 1 (warned, rendered fresh) | — | — |
| `resource` awaited (`renderToStringAsync`) | 0 | all, no refetch | — |
| Boundary fallback from the server | 0 | the fallback, claimed | — |

### Bundle size (measured, `npm run size`, brotli)

| Bundle | Before | After |
|---|---|---|
| v3 shop app (defineState) | 4.38 KB | 4.58 KB (the core's id hooks, effect options, claims) |
| v3 shop app | — | 3.86 KB |
| v3 shop app, hydrating (`hydratable: true`) | — | 4.30 KB (+0.44 KB over rendering) |
| Boundary + resource demo (`bench/fixtures/async.tsx`) | — | 3.27 KB |
| runtime, every export | — | 5.22 KB, against a 6 KB budget |

The every-export row now includes Boundary, resource and hydration. It's the upper bound, not what an app ships:
tree-shaking drops whatever isn't used.

### js-framework-benchmark (measured)

Run in one session on 2026-10-29: `krausest/js-framework-benchmark` at `ca8715d`, Chrome 156 headless, default
iteration counts (15 per CPU benchmark, 25 for select). Solid is the official keyed entry, `solid-js` 1.9.3; weft's
entry is `frameworks/keyed/weft` (production build of this branch). Both passed the harness's keyed check. Ratio is
weft's mean ÷ Solid's mean; below 1 is weft faster.

| Benchmark | weft (ms) | Solid (ms) | ratio |
|---|---|---|---|
| 01 create 1k rows | 26.65 | 23.18 | 1.150 |
| 02 replace 1k | 29.74 | 27.47 | 1.083 |
| 03 update every 10th ×16 | 18.13 | 17.43 | 1.040 |
| 04 select row | 5.34 | 6.38 | 0.838 |
| 05 swap rows | 18.85 | 16.40 | 1.149 |
| 06 remove row | 13.63 | 13.35 | 1.021 |
| 07 create 10k rows | 262.67 | 240.69 | 1.091 |
| 08 append 1k to 1k ×2 | 30.48 | 27.17 | 1.122 |
| 09 clear 1k ×8 | 15.13 | 13.14 | 1.151 |
| **CPU geomean (01–09)** | | | **1.067** |
| ready memory (MB) | 0.62 | 0.59 | 1.044 |
| run memory, 1k rows (MB) | 3.99 | 2.68 | 1.491 |
| run + clear memory (MB) | 1.10 | 0.77 | 1.415 |
| bundle, uncompressed (KB) | 8.5 | 11.5 | 0.739 |
| bundle, compressed (KB) | 3.5 | 4.5 | 0.778 |
| first paint (ms) | 38.8 | 41.4 | 0.937 |

- **Gate (§3.7, ≤ 1.10× Solid's geomean in the same run): pass, 1.067×.** The geomean is my arithmetic over the nine
  CPU means, not the harness's weighted score.
- weft wins select (keyed reads re-run only the two rows that change) and size, and loses most on create, swap and
  clear (1.12–1.15×): row creation (a root, two boxes and an effect per row) and `place()`'s reconcile are the
  places to look.
- **Memory is the weak spot:** 1.4–1.5× Solid with rows on screen. Each row holds a `Box` per label, an `item` and
  `index` box, a root and per-binding computations with arrays for sources and observers; Solid uses linked nodes.
  Target for the next core pass (the research 01 recommendation to adopt alien-signals' linked-list graph).
- One run, on a shared machine (load 5–6). Treat differences under ~5% as noise.

## 7. PLAN edits (applied 2026-10-29, with the compiler decision)

- **§3.6 Runtime:** replace "SSR string renderer, hydration (dom-expressions keys)" with "SSR string renderer on the
  reactive core (effects off), hydration with Solid 2's owner-tree keys, `renderToStringAsync` (render, await,
  re-render), page data in `<script data-weft>`; streaming in Phase 3 [18]".
- **§3.1 `resource`:** add "Starts with the server's value when hydrated (no refetch); a superseded fetch is aborted
  and ignored; a refetch keeps the value."
- **§3.6 Async/errors:** add "Fallback after 150 ms, held ≥ 400 ms (`timing`); refetches never flash; errors during
  render and failed resources reach `error(e, retry)`; errors in later updates don't (Phase 2) [18]". The §9 Phase 2
  row lists "`<Boundary pending>` timing". That timing exists now, so the row should become "skeleton shapes for
  `pending`".
- **§3.7:** record "1.067× Solid's CPU geomean, Chrome 156, 2026-10-29 (pass); memory 1.4–1.5× (open)" against the ≤ 1.10× gate.
- **§4.5:** "one instance … per server request" is now true. weft/ssr makes one app per render pass, seeded with
  `renderToString(code, { app: { state } })`. Serializing scope state into the page for hydration is still open.
- **§7b Testing:** the deterministic `clock` becomes a dependency of Boundary tests. Until it exists, they use
  Vitest's fake timers.
- **§3.6 Compiler (decided 2026-10-29, after this doc's work):** weft owns its code generator. `solidjs-compiler`
  leaves the build; the helper set, template format, text markers and hydration keys get a weft design. Solid stays
  only as a benchmark comparison. This work's runtime (§2–4) carries over; its Solid-shaped surface (helper names,
  `<!--$-->` markers, the key format, `ssr-contract.test.ts`) is replaced.
- **§11 Open questions:** add three.
  - Event replay before hydration: a capture script like Solid's `_$HY`, or nothing?
  - Partial hydration (`<NoHydration>` / islands).
  - Should a hydrated resource re-validate in the background instead of trusting the server's value?

## 8. Reproduce

```sh
cd packages/weft
npm run build:native                         # after any crate change
npx vitest run test/ssr.test.ts test/async.test.tsx test/ssr-contract.test.ts
npm run size
```

js-framework-benchmark: sparse-clone `krausest/js-framework-benchmark` with `frameworks/keyed/solid`, add
`frameworks/keyed/weft` (`src/main.tsx`, a `vite.config.mjs` pointing at this checkout's `packages/weft`, a minimal
`package-lock.json`), `npm ci` in `server` and `webdriver-ts` (then `npm run compile`), start the server
(`npx tsx index.ts`), and run `node dist/benchmarkRunner.js --headless --framework keyed/weft keyed/solid` from
`webdriver-ts`.
