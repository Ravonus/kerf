# weft (Phase 1 compiler spike)

> **Early release (0.1.0).** weft is young: APIs will change between minor versions, and not every add-on is on npm yet.

The client runtime, compiler binding, Vite plugin and test utilities from the Phase 1 compiler spike. Results, numbers
and what Phase 1 proper should change: [docs/research/16-compiler-spike.md](../../docs/research/16-compiler-spike.md).

| Import | What |
|---|---|
| `weft` | `state` (with `.get(key)` keyed reads), `state.linked`, `derived`, `watch`, `onCleanup`, `onMount`, `untrack`, `flush`, `context`, `defineState`, `resource`, `<Boundary>` |
| `@weft-js/core/persist`, `@weft-js/core/history` | `defineState`'s `persist` and `history` options; the Vite plugin imports each where it's used |
| `@weft-js/core/dom` | `render`, `hydrate`, plus the helpers compiled templates call and the keyed `For` |
| `@weft-js/core/ssr` | `renderToString`, `renderToStringAsync` (resources awaited), plus the helpers SSR output calls |
| `@weft-js/core/test` | `render` (a fresh app per call: `{ state, storage }` seed scopes and share storage), `scope()`, `memoryStorage()`, `flush`, `touches()`, and `expect(fn).toTouchAtMost(n, { runs })` |
| `@weft-js/core/vite` | `weft({ hydratable })`: a filtered transform hook calling the native compiler (SSR output for Vite's SSR transforms; `?weft-ssr`/`?weft-hydrate` imports for tests), and one adding the `persist`/`history` imports. Production builds also drop CSS nothing can reach: a `data-scope`, `data-part`, `data-variant`, `data-tone` or `data-emphasis` value no built file mentions, then the tokens and keyframes left unused. It also splits `:where(A B)` into `:where(A) :where(B)`, which browsers can file by its last part instead of testing on every element. `weft({ purge: { keep: ['knob'] } })` keeps a name built at run time; `purge: false` turns it off. |
| `@weft-js/core/compiler` | `transform(source, options)` → `{ code, map, diagnostics }`, and `backend`: which build is running |

```bash
npm install
npm run build:native        # cargo build crates/weft-compiler, as an addon and as WASM → native/
npx vitest run              # runtime, DOM and v3 work-budget tests
node scripts/size.mjs       # brotli sizes against the §3.7 budgets
node scripts/gen-corpus.mjs 1000 && node scripts/bench.mjs
```

Only working on weft itself takes Rust. An install gets `native/weft-compiler.wasm`, built from the same crate, and the
`@weft-js/compiler-<platform>` addon that fits, from `optionalDependencies`; `compiler.cjs` loads the addon when it can and WASM
when it can't. `test/compiler-parity.test.ts` holds both to the same bytes and diagnostics. `scripts/build-platform.mjs` builds
those packages and publishes nothing; `.github/workflows/compiler-release.yml` runs it per platform.

The addon is worth having and WASM is fine without it. Addon then WASM, on an M3 Pro: `weft build` of Lemonstand 1.73 s and
1.84 s, of this repo's site 29.9 s and 30.0 s. On an M4 Max: cold start plus one small file 6 ms and 23 ms, 1000 generated
files 248 ms and 320 ms. Both builds of each app came out byte-identical. The WASM build is 2.3 MB in the package (0.6 MB gzipped), and
each addon adds 2.7 to 3.1 MB (about 1.1 MB gzipped). The stack is the one limit that differs: JSX nested past roughly 1,000
levels overflows WASM with a `RangeError`, where the addon takes about 5,000.

The compiler's back end is weft's own (PLAN §3.6, §12; [research 19](../../docs/research/19-own-back-end.md)). No other
framework's compiler is in the build. Hydration keys are source paths (` wk="0.1/0"`), and hole ranges are
`<!--[-->…<!--]-->`. `weftc --explain file.tsx:LINE` shows what a line compiles to. `resource` and `<Boundary>`:
[research 18](../../docs/research/18-ssr-and-boundaries.md).

`defineState` (Phase 1): [research 14 §11](../../docs/research/14-app-state.md) has what's built, the sizes and the
differences from the design.

Not yet: streaming SSR, compiler dev names on weft's back end, HMR, and the JSX type namespace.
