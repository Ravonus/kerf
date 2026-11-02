# 08 — Builder and compiler: Vite 8, Oxc, Rust, budgets

Research date: 2026-10-28. Versions come from `npm view` on that date unless a source is cited. Statements marked
**(unverified)** could not be confirmed from a primary source. Numbers marked **(derived)** are my arithmetic on a
cited figure, not a measurement.

**Question:** how should weft's builder be built so that cold start, HMR, production builds and output are all
fast and small? The user also wants optional Rust in the stack. Context: PLAN §3.6 says "fork Solid's
`babel-plugin-jsx-dom-expressions`, port to oxc only if build speed demands it", and the v3 findings
([v3](../../evals/results/v3-FINDINGS.md)) make performance, size and a verify loop the pitch.

---

## TL;DR

1. **The premise of PLAN §3.6 is out of date.** Solid 2 has already moved its compiler to Rust/Oxc:
   - `@solidjs/compiler` (2.0.0-rc.19, 2026-10-27) is "Solid's native Oxc JSX compiler". It is MIT, ships napi-rs
     binaries for 5 targets plus a WASI fallback, and is the **default** backend in `@solidjs/vite-plugin` 3.0
     (`compiler: "native"`).
   - The Babel plugin is now the documented "escape hatch", and the solid-refresh HMR transform is native too.
   - It already does three things weft planned to add itself: dev source names for the graph (`sourceNames`),
     server-function extraction (`transformDirectives`), and an HMR transform (`transformRefresh`).
   - It exposes `compile_program(allocator, program, source, opts)`, so **another Rust frontend can hand it an Oxc
     AST**. A weft pre-pass (props rewriting, list lowering, W-diagnostics) can share one parse and one codegen.
   - Measured against the Babel plugin on identical inputs: **23× faster** on an 88-file fixture corpus (440 → 19 ms),
     58× on a 129 KB module, and 355× on a 1 MB module.
2. **Recommendation: Rust/Oxc from day one.** Fork the `solidjs-compiler` crate at a pinned revision, not the Babel
   plugin. A 2-week spike with hard exit criteria decides it (decision rule in §9). There is one product compiler; no
   parallel JS implementation is maintained.
3. **Vite 8 is the right host everywhere.**
   - Rolldown and Oxc already do TS/JSX stripping, resolving, minifying and tree-shaking natively. Lightning CSS ships
     in the box.
   - weft adds **one** JS plugin with a Rust-side hook filter, so only `.tsx`/`.jsx` files cross into JS.
   - Rolldown has **no public third-party native plugin API**, so don't plan on one.
   - Bun and Deno matter as Nitro deploy targets, not as bundlers.
4. **Type checking: TypeScript 7 (Go) is stable** (`typescript@7.0.2`, 2026-07-08; 8–12× faster full builds).
   - Its programmatic API arrives in **7.1** (beta 2026-10-20, not stable).
   - `weft check` runs `tsc --noEmit` (TS 7) **in parallel** with weft's native diagnostic pass, then maps TS codes
     into W-codes.
   - A Go AST and a Rust AST cannot be shared, and they don't need to be: parsing costs milliseconds, type checking
     is the expensive part, and only tsgo does it.
5. **Gate on numbers from Phase 1, not after Phase 3.** The v3 result says performance is the differentiator. Budgets
   in §9.3 cover:
   - runtime and app size (brotli),
   - DOM work per interaction (the eval probe becomes `toTouchAtMost`),
   - compiler throughput, cold start, HMR latency and build time on a generated 1k-component app,
   - js-framework-benchmark CPU relative to Solid in the same run.

---

## 1. What Vite 8 / Rolldown / Oxc do natively now

| Piece | Status (2026-10-28) | Native? |
|---|---|---|
| Vite | 8.3.5. Stable since 2026-03-12. Rolldown is the single bundler, replacing esbuild for dev and Rollup for prod | — |
| Rolldown | 1.2.15. Oxc semantic analysis drives tree-shaking | Rust |
| Oxc | `oxc-transform` / `oxc-parser` / `oxc-minify` 0.156.0. It parses, resolves, transforms TS/JSX and minifies inside Vite 8 | Rust |
| Lightning CSS | 1.33.0. A normal dependency of Vite 8, used for CSS minification. Vite 8.1 adds `css.transformer: 'lightningcss'` and is considering it as the default next major | Rust |
| React plugin v6 | Oxc does the Refresh transform, with no Babel dependency. React Compiler is opt-in via `@rolldown/plugin-babel` or, since v6.1, the native `oxc-transform-react` | Rust |
| Bundled dev mode | Vite 8.1 (2026-06-23), `experimental.bundledDev` / `--experimental-bundle`. Formerly "Full Bundle Mode" | Rust |

**Measured build wins** (vendor-reported):
- Rolldown is 10–30× faster than Rollup.
- Linear went from 46 s to 6 s.
- Beehiiv cut build time by 64% and Ramp by 57%.

A 24-component test still showed 13× on the production build; the large ratios come from large graphs
(DEV Community). Vite 8 install is about 15 MB larger than Vite 7, with ~10 MB from Lightning CSS and ~5 MB from
Rolldown. It needs Node 20.19+ or 22.12+.

### The cost of JS plugins inside Rolldown

The Rust core processes modules in parallel, but **JS plugin hooks run serially on one thread**. Every unfiltered
hook call pauses the module, crosses into JS and crosses back. Rolldown's benchmark (apps/10000):

| JS plugins | no filter | with filter |
|---|---|---|
| 0 | 745.6 ms | 739.1 ms |
| 5 | 1.848 s | 741.5 ms |
| 10 | 2.792 s (3.74×) | 747.3 ms |

What this means for the weft plugin:

- Use the object-hook form `transform: { filter: { id: /\.[jt]sx$/ }, handler }`. Filters run in Rust at about 1 µs
  per module.
- `moduleType` is a `transform` filter in Rolldown/Vite 8 (Vite 7 ignores it). Returning a new `moduleType` from
  `transform` does **not** re-run earlier plugins, so the weft plugin must be early (`enforce: 'pre'`).
- The composable filter helpers in `@rolldown/pluginutils` (`and`/`or`/`not`) work only in Rolldown plugins, not
  yet in Vite or unplugin.

**What a weft `.tsx` file costs:** one string crossing Rust→JS→napi→Rust and back. That is a few memcpy of the
source plus the source map, not an AST. **(unverified: per-file overhead not measured; expect tens of µs.)**

### Can third parties ship Rust plugins into Rolldown?

**No, not today.** The Rust plugins Rolldown documents are built-in (`builtin:replace`, `builtin:bundle-analyzer`,
`builtin:esm-external-require`). Vite moved its own alias and resolve plugins to Rust internally. I found no
documented, stable third-party native plugin API **(unverified absence; checked rolldown.rs docs and search)**.

The React Compiler story confirms the stance:
- The Oxc team built the React Compiler port into `oxc-transform-react`, a **separate napi package**.
- Integrating it into Rolldown/Vite grew the Rolldown binary by ~17%, so it was pulled back out.
- The framework-specific part stays in `@vitejs/plugin-react` to keep the core "vendor-neutral".

weft follows the same pattern: its own napi binary, called from a filtered JS hook.

### Oxc JS plugins and raw transfer

- **What raw transfer is:** Rust writes the AST into a shared buffer, and a generated JS deserializer builds ESTree
  objects from it. That skips JSON serialization and `JSON.parse`.
- **Speed:** a reviewer's local runs showed 3–5× over the JSON path **(maintainers dispute the CodSpeed figures)**.
- **Limits:** it needs Node ≥ 22.18 on 64-bit little-endian, and reserves large virtual buffers per concurrent
  parse.
- **Oxlint JS plugins** (alpha 2026-03-11) use it: Node.js repo, 6,298 files, 1 min 43 s with ESLint vs 21 s with
  Oxlint (4.8×), with 75 JS plugin rules running.
- **What's missing:** there is **no Oxc transformer plugin API in JS** **(unverified absence)**. A JS transform built
  on raw transfer must emit edits itself (magic-string) and cannot reuse Oxc codegen.

---

## 2. Compiler options for weft

The compiler's jobs:
- JSX → template cloning plus fine-grained bindings (dom/ssr/hydratable),
- §3.3 props rewriting,
- §3.4 list and conditional lowering,
- §3.5 W-diagnostics with autofixes,
- dev graph names,
- server-function extraction,
- the HMR transform,
- one source map.

| Option | Speed (per 1k component files) | Maintenance | Source maps | Verdict |
|---|---|---|---|---|
| **A. Fork the Babel plugin** (`babel-plugin-jsx-dom-expressions` 0.40.11, or Solid 2's `@solidjs/babel-plugin`) on Vite 8 via a JS hook | **~5 s** (derived: 440 ms / 88 Solid fixtures ≈ 5 ms per file). Babel cost grows super-linearly with file size (545 ms for one 129 KB module) | Low entry cost: JS, and agents edit it well. But upstream has **moved to Rust**, so the fork tracks a fallback path, and Babel 8 (8.0.9) is a migration on its own | Good (Babel maps), but composed with Vite's Oxc TS pass, so two maps | Fallback only |
| **B. Rust on Oxc via napi, forking `solidjs-compiler`** | **~0.2 s** (derived: 19 ms / 88 fixtures). Throughput stays roughly flat as input grows (70 ms for a 1 MB module) | Medium: Rust, napi-rs cross-builds (5 targets plus wasm32-wasi), and Oxc is 0.x. Upstream pins `oxc 0.144` while Oxc is at 0.156, and the crate is `publish = false` with an unstable Rust API, so pin a git revision | **Best**: one parse, one `VisitMut`, one Oxc codegen, so one map. Upstream's TSRX path already composes maps through a projection | **Recommended** |
| C. SWC plugin (WASM) | Fast core; WASM plugin overhead on top **(unverified size)** | High. Vite 8 doesn't use SWC, so we'd add a second Rust toolchain. Plugins were ABI-coupled to `swc_core` until @swc/core 1.15 (2025-11) made them backward-compatible "to some extent"; host tables (Next, Rspack) still pin ranges | Good | **No** |
| D. TS transform in JS on the Oxc AST via raw transfer | Parse fast. Transform in JS is single-threaded, roughly Oxlint JS-plugin class (4.8× ESLint) **(unverified for transforms)** | Medium: JS, but we'd reimplement codegen as magic-string edits. Template extraction rewrites whole subtrees, so edits are coarse | Fine for small edits, coarse for large rewrites | Only for **editor/lint** surfaces later |

### What others did (the direction is unanimous)

- **Solid 2:** Rust/Oxc native by default, Babel as a parity oracle and fallback, "unsupported features are rejected
  rather than silently ignored".
- **Vue:** `vue-jsx-vapor` (3.2.29, vuejs org) has a Rust compiler on Oxc and claims 35× over Babel for VDOM output
  and 50× for Vapor output (self-reported).
- **React Compiler:**
  - Ported to Rust upstream (merged 2026-06-09).
  - As a Babel plugin it was only **~3× faster end to end**, because AST serialization between Babel and Rust ate
    the ~10× core gain.
  - Oxc vendored it onto the Oxc AST directly: about 2× the upstream port, and >10× Babel (100 ms → 10 ms per
    file). Output was byte-checked on 100k+ files.
  - **Lesson: never bridge ASTs across a language boundary. Pass text in, text and map out.**
- **Qwik:** the optimizer is Rust (SWC-based, WASM-capable). I found no evidence of a Qwik 2 move to Oxc
  **(unverified)**.
- **Svelte 5:** its compiler is still JS **(unverified that no Rust port is in progress)**. This is irrelevant to the
  choice because Svelte compiles its own file format.

### Why B beats "Babel first, port later"

1. **weft's new code is mostly analysis, not codegen.**
   - The diagnostics (W001–W042, plus the identity-breaking-spread code from v3) need scopes and symbols.
   - `oxc_semantic` gives both.
   - Written in Babel first, all of it gets rewritten at port time. The fork-then-port plan pays for the biggest part
     of the compiler twice.
2. **Single parse.**
   - The weft pre-pass and Solid's back end run on the same Oxc `Program` via `compile_program`.
   - Diagnostics are a by-product of the dev transform, so `weft check` and `weft dev` share one code path.
3. **Upstream gravity.** Fixes to template extraction, hydration keys and insert markers now land in the Rust crate
   first. Babel parity is maintained by them, not us.
4. **Agents and contributors are unaffected.** Users get prebuilt binaries and need no Rust toolchain; StackBlitz uses
   WASI. Only compiler contributors need `cargo`.

**Risks of B:**
- Oxc 0.x API churn. Each Oxc bump is a small migration; schedule monthly.
- napi-rs release engineering: CI matrix time.
- weft diverges from Solid in props semantics (§3.3 getter props), list lowering (§3.4 `.map` → keyed list instead of
  `<For>`) and the runtime module name. The fork is therefore **structural**, not a config overlay.
- Keep upstream-able pieces (template/hydration codegen) in separate modules from weft-only pieces (pre-pass,
  diagnostics), so upstream merges stay mechanical.

---

## 3. Type-checking cost: TypeScript 7

- **Status:**
  - `typescript@7.0.2` (stable 2026-07-08) is the Go compiler, shipped as per-platform binaries. `tsc` is native.
  - VS Code's codebase went from 125.7 s (TS 6.0) to 10.6 s, and memory fell 6–26% on large projects.
  - `7.1.0-beta` adds the **programmatic API** (snapshots, plus a content-mapper plugin point for Vue, Svelte and
    MDX). It isn't stable; the RC is expected about a month after the beta.
  - Tools that walk the TS AST (ts-morph, custom transformers) don't work on 7.0.
- **weft's needs:**
  - Most W-codes are syntactic or scope-based (W001–W006, W010–W013, W020–W042). The Rust pass covers them with no
    types.
  - W007 (TS2540) and W008 (box/value mismatch) come from the type checker. weft's `JSX` namespace and the `State<T>`
    / `Derived<T>` types are designed so that these mistakes produce **specific TS errors**, which `weft check` maps.
  - Keep **type-directed compilation out of the compile path**: it would put tsgo on the HMR hot path.
- **How `weft check` combines them, without a second full parse on our side:**
  1. Start `tsc -p . --noEmit --incremental --pretty false` (TS 7) as a child process.
  2. In parallel, run the weft native pass in `check` mode over the project: parse, semantic analysis and
     diagnostics, with codegen skipped.
     - The results are cached by content hash, so a file already compiled by `weft dev` is a cache hit (the dev
       transform writes the same records).
  3. Merge the results:
     - Map TS codes to W-codes (TS2540 → W007, the box/value assignability errors → W008).
     - Drop TS errors that a W-code already covers at the same span.
     - Emit one JSON stream with code, location, why and fix.
- **Later (on TS 7.1 stable):** a long-lived `weft check --watch` and the MCP server use the TS API with snapshots
  instead of re-spawning. The parse is still separate (Go vs Rust); that is fine because Oxc parses 1k files in well
  under the type checker's time **(derived from Oxc's ~0.14 ms per 100-line file)**.

---

## 4. HMR and dev server

- **What Solid does:**
  - `@solidjs/vite-plugin` 3 runs the refresh transform natively and drives `solid-js/refresh`. The standalone
    solid-refresh package is retired.
  - Semantics: editing a file **resets state in the edited component and everything below it; parents keep state**.
    The entry file forces a full reload.
  - Components are detected by PascalCase. A 2.0 RC fix added registration for call-shaped component bindings, which
    had been "silently left stale".
- **weft's plan is stronger: state preserved by compiler-assigned names.** Because components run once, this is
  feasible **(design proposal, unverified in practice)**:
  - The compiler names each `state(init)` call (`Cart.coupon`), which `sourceNames` already does for Solid primitives.
  - On hot re-mount, `state()` in dev looks up `{componentId, name}` in an HMR cache. It keeps the old value when the
    initializer's hash is unchanged, and resets otherwise.
  - `derived` values are recomputed, never carried over.
  - Ship it as Phase 1b behind a flag, with a W-style dev warning when a value was reset.
- **Cold start:**
  - Unbundled dev serves one request per module. That is fine at 100s of components and slow at 10k.
  - Vite 8.1 bundled dev mode: about **15× faster startup** and 10× faster full reloads in a 10,000-React-component
    app, with HMR "instant regardless of app size". Linear measured 3× faster cold render, 40% faster reloads and 10×
    fewer requests.
  - It is experimental, and "third-party plugins may not work".
  - The weft plugin uses only standard hooks, so it should work, but **test it in CI from Phase 1b**. Make it the
    default only after Vite marks it stable.
- **Tailwind v4 in dev:** a full build takes 100 ms (Catalyst; v3 took 378 ms). Incremental rebuilds take 5 ms with
  new CSS and **192 µs** with none. CSS never dominates HMR.

---

## 5. Output optimization

- **Runtime size, measured on the js-framework-benchmark app** ([01 §5](01-reactivity-landscape.md)):
  - Solid, Marko and ivi: ~4–5 KB gz
  - Svelte 5 and Ripple: ~10 KB
  - Vue Vapor: ~19 KB (it still ships the Vue runtime)
  - React: ~50 KB

  Secondary sources put Solid's floor at ~7 KB and Svelte's at 2–3 KB **(unverified; method unknown)**. v3 shop app:
  Solid 9.9 KB vs React 67.7 KB gz. The weft target stays at ≤ 6 KB gz for the benchmark app (§2 rule 7), now as a
  gate.
- **DOM creation:**
  - Keep dom-expressions' **template cloning**: `template()` parses HTML once and `cloneNode(true)` per instance,
    then walks to the dynamic holes.
  - `createElement` per node is slower for anything with static structure. The Solid and Marko numbers in 01 come
    from cloning.
  - Keep **event delegation** for common events, on by default.
- **Hydration:** dom-expressions hydration keys, which the forked compiler already emits (`hydratable: true`).
  - Islands and resumability stay out (§10).
  - Cheap "partial" wins inside v0: (1) fully static subtrees are adopted, not walked **(verify what Solid's
    `staticMarker` does; unverified)**; (2) a route whose components contain no reactive code ships **no route
    chunk** (Phase 3).
- **Tree-shaking the runtime:**
  - The compiler imports only the helpers it emits.
  - The runtime is split by subpath (`weft`, `@weft-js/core/dom`, `@weft-js/core/ssr`, `weft/hydrate`, `weft/dev`) and marked
    `sideEffects: false`.
  - Dev names, graph inspection and the HMR cache sit behind `import.meta.env.DEV`. Solid states production output is
    byte-identical with `sourceNames` on or off; keep that property and test it.
- **Code-splitting per route:** lazy route modules from the router and Vite's per-chunk CSS splitting (default).
  Vite 8.1's experimental **chunk import maps** stop hash cascades, so one changed chunk doesn't re-hash its
  importers. Adopt them once stable.
- **CSS:**
  - Tailwind v4 via `@tailwindcss/vite` 4.3.3 (Oxide).
  - @weft-js/core/ds tokens are static CSS variables in cascade layers, so there is no runtime CSS-in-JS.
  - Lightning CSS minifies.
- **Preload:**
  - Vite emits `<link rel="modulepreload">` for entry dependencies.
  - Set `build.modulePreload.polyfill: false`. Every evergreen engine supports modulepreload **(unverified: exact
    polyfill byte cost)**.
  - The server renderer adds route-chunk preloads for the matched route during SSR.
- **Compression:**
  - Precompress static assets at build time: brotli q11 plus gzip, and zstd where the host supports it.
  - zstd `Content-Encoding` is in Chrome 123, Firefox 126 and Safari 26.3 (macOS 26.3+ only). Negotiation falls back
    automatically.
  - Dictionary transport (RFC 9842) is Chrome-only, so skip it.
  - Nitro's `compressPublicAssets` covers gzip and brotli **(unverified: zstd support)**.
  - **Size budgets are measured as brotli.**

---

## 6. Server build: Nitro v3

- **Version and bundling:**
  - `nitro@3.0.260903-beta` (beta, pinned per PLAN §4).
  - Since v3 alpha.2 it **bundles dependencies with Rolldown by default**, where it used to copy and trace them; the
    maintainers call bundling faster and more predictable.
  - Native-binding dependencies are still traced (`traceDeps`).
- **Presets:** `node`, `bun` (`.output/server/index.mjs`), `deno_server`, and Workers/Vercel/Netlify/Lambda.
- **Cold start:** the v3 announcement says "every millisecond of startup matters" for cold starts, but I found **no
  published Nitro v3 cold-start numbers per runtime (unverified)**. weft must measure them itself: server bundle size,
  plus `node .output/server/index.mjs` to the first 200 response.
- **The weft server-function transform:**
  - weft's API is export-based (`export const x = query({...})` in `server/**`), not a directive. So the client build
    replaces each server module with stubs: id plus input schema for form preflight, which still ships the Zod
    schema, so watch the size.
  - Reuse Solid's proven rules from `transformDirectives`:
    - IDs are `<binding path>-<xxhash32(root-relative path)>`, stable under reordering.
    - Captures and non-extractable shapes are **compile errors**, never silent.
  - It runs in the same Rust pass, in the client environment only.

---

## 7. Bun and Deno

- `Bun.build` is fast (Zig). One March 2026 report says Bun "still builds faster" than the Rust tools, by a
  workload-dependent margin **(no head-to-head with Vite 8 found)**. Its plugin API, HMR model and the Vite
  Environment API integration (which Nitro, TanStack Start and SolidStart depend on) are different.
- Deno's preset is `deno_server`, which runs a Node-built bundle on Deno.
- **Verdict:** Vite 8 everywhere for dev and build.
  - Bun and Deno are **deploy runtimes** (Nitro presets), and Bun is optionally the package manager or script
    runner.
  - Supporting a second bundler doubles the plugin, HMR and SSR surfaces for no user-visible gain.

---

## 8. Measuring and gating

| Gate | Tool | How |
|---|---|---|
| Runtime and app size | Build plus brotli on `dist/assets` | Fixtures: hello, counter, the js-framework-benchmark app, v3 shop app. Budget per fixture and per runtime subpath. Fail on overage; ratchet down on wins |
| DOM work per interaction | `@weft-js/core/test` `expect(fn).toTouchAtMost(n)` | The eval probe (`evals/tasks-v3/shop/hidden/probe.test.tsx`: a MutationObserver over `body` plus `flush()`) promoted into the test API. Reference scenarios become required tests: v3 shop price-push ≤ 1 mutation, add-one ≤ 3 |
| Compiler throughput | `cargo bench` / napi bench on a generated corpus | `bench/gen --components 1000` (realistic TSX: props, lists, conditionals). Instruction-count CI (CodSpeed simulation mode, as Oxc uses) for low-noise regressions |
| Build time, cold start, HMR | Playwright plus `performance.now()` | Generated 1k- and 5k-component apps. Cold start = `weft dev` spawn → first `load`. HMR = file write → MutationObserver sees the edited text. Prod build = `weft build` wall time |
| Runtime CPU | js-framework-benchmark (keyed), weft entry | Run **in the same session as Solid** and report the ratio. Absolute timings on a shared machine are noise |
| Server | Nitro output | Server bundle bytes; cold start to first 200 on node/bun/deno presets |

**Noise rule:**
- Wall-clock gates (build, cold start, HMR, jfb) run on a quiet runner.
- Locally, skip or offload them when the machine is loaded (1-min load > ~40 on the shared Mac; see the user's
  machine notes).
- Gate on **ratios vs a same-run baseline** (Solid, or the previous weft commit) with a 5% tolerance, not on absolute
  ms.

---

## 9. Recommendation for weft

### 9.1 Compiler architecture and decision rule

**Go Rust/Oxc from day one by forking Solid 2's `solidjs-compiler` crate.** Do not fork the Babel plugin.

- **The `weft-compiler` Rust crate** has three modules:
  - `pre`: the weft pre-pass. Props → getters, `.map` → keyed list, `.filter().sort().map()` → `derived` + list, and
    the state/derived naming pass.
  - `diag`: W-codes with spans and autofix edits.
  - `solid` (forked back end): template extraction, bindings, SSR, hydration keys, refresh, server extraction.
- **Packaging:** exposed through napi-rs as `@weft-js/core/compiler` with prebuilt binaries for darwin-arm64/x64,
  linux-x64/arm64-gnu and win32-x64, plus wasm32-wasi.
- **Input and output:** text in; code, map and diagnostics as JSON out. ASTs never cross the boundary.

**Decision rule: a 2-week spike. Rust is the product path if all four hold:**
1. The fork passes upstream's fixture corpus unchanged, in dom, ssr and hydratable modes.
2. `pre` implements §3.3 props (all 6 forms) and §3.4 keyed `.map`, and `diag` implements W001, W006 and W010 with
   spans and autofix.
3. CI builds all 6 binary targets in ≤ 15 min.
4. A 1k-component generated app compiles in ≤ 0.5 s single-threaded on an M-series Mac.

If any of them fails, fall back to forking **`@solidjs/babel-plugin` 2.x** (not the 0.40 `dom-expressions` line) and
re-run the spike when Oxc reaches 1.0. **Never ship two compilers.** Upstream's Babel plugin stays a differential test
oracle for the shared back end only.

(PLAN §3.6 and §11 "fork first" should be updated to match. This doc doesn't edit them.)

### 9.2 Pipeline

```
                 ┌──────────────── weft.config.ts / vite.config (weft() plugin) ───────────────┐
 source .tsx ──▶ Rolldown (Rust) ──filter id:/\.[jt]sx$/──▶ weft plugin (JS, enforce:'pre')
                                                              │ napi: text in
                                                              ▼
                       weft-compiler (Rust, one Oxc parse per file)
                         parse+semantic ─▶ pre (props, lists, names) ─▶ diag (W-codes)
                                       ─▶ solid backend (templates, bindings, SSR/hydrate,
                                          refresh [dev], server-fn split [client env])
                                       ─▶ oxc codegen ─▶ { code(JS), map, diagnostics, serverFns }
                                                              │ moduleType:'js'
 other modules ─▶ Oxc TS strip / resolve (native) ◀───────────┘
                          │
        ┌─────────────────┼─────────────────────────────┐
     client env        ssr env                     server env (Nitro v3)
  Rolldown chunks    Rolldown SSR bundle        Rolldown, deps bundled, preset
  per route + CSS    (generate:'ssr')           node | bun | deno_server | workers
  Tailwind v4 Oxide                              │
  Lightning CSS min                              ▼
  Oxc minify                                .output/server + public/ (br+gz[+zstd])
        │
  size gate (brotli) · modulepreload · no polyfill

 weft check:  [tsc 7 --noEmit --incremental] ║ [weft-compiler check-mode, cached by hash]
              └──────────── merge + map TS→W ─────────────┘ ─▶ JSON
```

### 9.3 Budgets (gate values; reference machine = M-series Mac, quiet)

| Metric | Budget | Basis |
|---|---|---|
| Benchmark-app runtime | **≤ 6 KB brotli** (hello world ≤ 3 KB) | §2 rule 7; Solid and Marko at 4–5 KB |
| v3 shop app total JS | **≤ 10 KB brotli** | Solid reference 9.9 KB gz |
| Per subpath | `weft/hydrate` ≤ 1.5 KB, keyed list ≤ 1.5 KB, router ≤ 4 KB **(initial guesses; set from the first measurement, then ratchet)** | — |
| Prod output | Zero dev names in the bundle (grep test); prod output byte-identical with dev naming on or off | Solid's `sourceNames` property |
| DOM work | v3 price-push ≤ 1 mutation, add-one ≤ 3; every eval reference scenario has a `toTouchAtMost` | v3 probe |
| js-framework-benchmark CPU | **≤ 1.10× Solid's** geomean in the same run (absolute target ≤ 1.15× vs fastest) | 01 §5 |
| Compiler | ≤ 0.5 ms median per component file; **≤ 0.5 s per 1k files** single-threaded, diagnostics included | Solid native ≈ 0.22 ms per file (derived) |
| `weft check`, 1k files | ≤ 3 s cold, ≤ 0.5 s warm (W-pass); total bounded by tsc 7 | — |
| Dev cold start, 1k components | ≤ 1.5 s to first `load` unbundled; re-baseline with bundled dev | — |
| HMR, 1k components | **≤ 50 ms p95** from file write to DOM updated | Vite 8 reports sub-30 ms in practice (secondary source) |
| Prod build, 1k components (client + SSR) | ≤ 5 s | Linear 6 s at real-app scale |
| Server | Todo + auth bundle ≤ 1 MB; cold start to first 200 ≤ 200 ms (node preset) **(guesses; measure, then fix the value)** | No published Nitro v3 numbers |

### 9.4 What goes in which phase

| Phase | Builder and compiler work |
|---|---|
| **1** | 2-week spike (§9.1), then the Rust compiler: `pre`, `diag` (all §3.5 codes plus the identity-spread code), the forked back end in dom mode with dev names. Filtered Vite plugin. `weft check` = tsc 7 ∥ W-pass with TS→W mapping. Solid-level HMR (reset at the edited component). Gates live: **size, DOM work (`toTouchAtMost`), compiler throughput**. jfb tracked |
| **1b** | Name-keyed state-preserving HMR (flagged). Generated 1k/5k apps, plus cold-start, HMR and build-time gates. Bundled dev mode tested in CI. jfb ratio becomes a gate |
| **3** | SSR and hydratable codegen. Server-function split (export-based, Solid ID scheme). Nitro v3 build with presets. Per-route splitting and preloads. Precompression (br/gz/zstd). Server size and cold-start gates. Route-level zero-JS for static routes |
| **4** | Tailwind v4 adapter and ds tokens. CSS size budget per route |
| **Later** | TS 7.1 API for watch mode and MCP. Lightning CSS as the CSS transformer when Vite makes it the default. Chunk import maps when stable. An editor-time W-code surface (an Oxlint JS plugin or LSP over the same Rust crate) |

### 9.5 Explicitly don't

- **Don't** fork the Babel 0.40 `dom-expressions` line. Don't keep Babel anywhere in the default path.
- **Don't** pass ASTs between JS and Rust. The React Compiler's Babel bridge lost about two-thirds of its gain to
  serialization (~3× end to end vs ~10× core).
- **Don't** write an SWC plugin, our own bundler, our own minifier or our own CSS engine.
- **Don't** depend on a Rolldown native-plugin API. It isn't public.
- **Don't** support Bun.build or Deno's bundler as build paths. They are deploy runtimes only.
- **Don't** do type-directed compilation. Types stay in `weft check` (tsgo), never on the HMR path.
- **Don't** call tsgo's API before TS 7.1 is stable. Use the CLI.
- **Don't** do islands or resumability (§10). Don't use dictionary compression or the modulepreload polyfill.
- **Don't** gate on absolute wall-clock numbers from a loaded laptop. Gate on ratios on a quiet runner.
- **Don't** make bundled dev mode the default while Vite marks it experimental.

---

## Sources

- Solid native compiler:
  - README, including the performance table, `compile_program`, `sourceNames`, `transformDirectives` and
    `transformRefresh`: https://github.com/solidjs/solid/tree/next/packages/compiler (`packages/compiler/README.md`,
    `Cargo.toml`, branch `next`, read 2026-10-28)
  - `@solidjs/vite-plugin` 3.0.0-next.35 README (`compiler: "native"` default, native refresh):
    https://unpkg.com/@solidjs/vite-plugin@3.0.0-next.35/README.md
  - @solidjs/compiler rc.6 notes: https://newreleases.io/project/github/solidjs/solid/release/@solidjs%2Fcompiler@2.0.0-rc.6
  - Solid diagnostics package: `packages/diagnostics/README.md` (same repo/branch)
- Vite:
  - Vite 8: https://vite.dev/blog/announcing-vite8
  - Vite 8.1 (bundled dev, chunk import maps, Lightning CSS): https://vite.dev/blog/announcing-vite8-1
  - Build-speed critique: https://dev.to/curioustore_48788631d0e2e/vite-8s-rolldown-makes-builds-13x-faster-not-the-dev-server-2l3a
- Rolldown:
  - Hook filters: https://rolldown.rs/in-depth/why-plugin-hook-filter
  - Filter reference: https://rolldown.rs/plugins/hook-filters
  - Module types: https://rolldown.rs/in-depth/module-types
  - Built-in plugins: https://rolldown.rs/builtin-plugins
  - RC announcement: https://voidzero.dev/posts/announcing-rolldown-rc
- Oxc:
  - Transformer alpha benchmarks: https://oxc.rs/blog/2024-09-29-transformer-alpha
  - Benchmarks: https://oxc.rs/docs/guide/benchmarks
  - Transformer bench repo: https://github.com/oxc-project/bench-javascript-transformer-written-in-rust
  - Oxlint JS plugins alpha: https://oxc.rs/blog/2026-03-11-oxlint-js-plugins-alpha
  - Raw transfer PR discussion: https://github.com/oxc-project/oxc/pull/2457
  - Parser bench: https://github.com/oxc-project/bench-javascript-parser
- React Compiler in Rust:
  - Oxc integration: https://oxc.rs/blog/2026-08-18-react-compiler-support
  - Port write-up: https://www.youngju.dev/transcribe/2026-07-16-react-compiler-rust-port.en
  - LogRocket comparison: https://blog.logrocket.com/rust-react-compiler-vs-babel/
- Vue JSX Vapor: https://unpkg.com/vue-jsx-vapor@3.2.20/README.md
- Vue 3.6 RC: https://newreleases.io/project/github/vuejs/core/release/v3.6.0-rc.1
- Qwik optimizer: https://qwik.builder.io/docs/advanced/optimizer
- SWC plugin compatibility:
  - Wasm backward compatibility: https://blog.swc.rs/2025-11-4-wasm-backward-compatibility
  - Compatibility docs: https://swc.rs/docs/plugin/ecmascript/compatibility
  - Rspack plugin-version error: https://rspack.rs/errors/swc-plugin-version
- TypeScript 7:
  - Release coverage: https://infoq.com/news/2026/08/typescript-7-released/
  - InfoWorld: https://www.infoworld.com/article/4196378/go-based-typescript-7-0-arrives.html
  - 7.1 beta: https://www.digitalapplied.com/blog/typescript-7-1-beta-whats-new-what-to-test
  - Tooling breakage on 7.0: https://dev.to/dev_encyclopedia/why-your-typescript-7-upgrade-broke-eslint-ts-jest-and-ts-morph-385k
  - npm `typescript@7.0.2`, `7.1.0-beta`
- Nitro v3:
  - Beta announcement: https://nitro.build/blog/v3-beta
  - alpha.2 dependency bundling: https://newreleases.io/project/npm/nitro/release/3.0.1-alpha.2
  - Deno runtime: https://nitro.build/raw/deploy/runtimes/deno.md
- Tailwind v4 Oxide benchmarks: https://tailwind.nodejs.cn/blog/tailwindcss-v4 (mirror of the official v4.0 post)
- zstd in browsers: https://www.youngju.dev/blog/2026-07-17-content-encoding-zstd-dictionary-transport.en (secondary;
  check caniuse)
- Framework sizes (secondary): https://arc.dev/employer-blog/svelte-vs-vue-vs-solidjs/; primary sizes from
  [01 §5](01-reactivity-landscape.md) (js-framework-benchmark data 2026-10-25)
- Bun vs Vite: https://www.pkgpulse.com/guides/bun-vs-vite-2026 · https://dev.to/royce_fabbd83cb268312e928/bun-vs-vite-2026-build-speed-hmr-when-to-use-both-152g
- js-framework-benchmark: https://github.com/krausest/js-framework-benchmark
- Version numbers: `npm view <pkg> dist-tags` / `time`, run 2026-10-28 (vite 8.3.5, rolldown 1.2.15, oxc-* 0.156.0,
  @solidjs/compiler 2.0.0-rc.19, babel-plugin-jsx-dom-expressions 0.40.11, typescript 7.0.2 / 7.1.0-beta, nitro
  3.0.260903-beta, @tailwindcss/vite 4.3.3, @swc/core 1.16.20, lightningcss 1.33.0, @babel/core 8.0.9,
  vue-jsx-vapor 3.2.29).
