# weft (Phase 1 compiler spike)

The client runtime, compiler binding, Vite plugin and test utilities from the Phase 1 compiler spike. Results, numbers
and what Phase 1 proper should change: [docs/research/16-compiler-spike.md](../../docs/research/16-compiler-spike.md).

| Import | What |
|---|---|
| `weft` | `state` (with `.get(key)` keyed reads), `state.linked`, `derived`, `watch`, `onCleanup`, `onMount`, `untrack`, `flush`, `context`, `defineState`, `resource`, `<Boundary>` |
| `weft/persist`, `weft/history` | `defineState`'s `persist` and `history` options; the Vite plugin imports each where it's used |
| `weft/dom` | `render`, `hydrate`, plus the helpers compiled templates call and the keyed `For` |
| `weft/ssr` | `renderToString`, `renderToStringAsync` (resources awaited), plus the helpers SSR output calls |
| `weft/test` | `render` (a fresh app per call: `{ state, storage }` seed scopes and share storage), `scope()`, `memoryStorage()`, `flush`, `touches()`, and `expect(fn).toTouchAtMost(n, { runs })` |
| `weft/vite` | `weft({ hydratable })`: a filtered transform hook calling the native compiler (SSR output for Vite's SSR transforms; `?weft-ssr`/`?weft-hydrate` imports for tests), and one adding the `persist`/`history` imports. Production builds also drop CSS nothing can reach: a `data-scope`, `data-part`, `data-variant`, `data-tone` or `data-emphasis` value no built file mentions, then the tokens and keyframes left unused. `weft({ purge: { keep: ['knob'] } })` keeps a name built at run time; `purge: false` turns it off. |
| `weft/compiler` | `transform(source, options)` → `{ code, map, diagnostics }` |

```bash
npm install
npm run build:native        # cargo build crates/weft-compiler (Rust ≥ 1.95) → native/
npx vitest run              # runtime, DOM and v3 work-budget tests
node scripts/size.mjs       # brotli sizes against the §3.7 budgets
node scripts/gen-corpus.mjs 1000 && node scripts/bench.mjs
```

The compiler's back end is weft's own (PLAN §3.6, §12; [research 19](../../docs/research/19-own-back-end.md)). No other
framework's compiler is in the build. Hydration keys are source paths (` wk="0.1/0"`), and hole ranges are
`<!--[-->…<!--]-->`. `weftc --explain file.tsx:LINE` shows what a line compiles to. `resource` and `<Boundary>`:
[research 18](../../docs/research/18-ssr-and-boundaries.md).

`defineState` (Phase 1): [research 14 §11](../../docs/research/14-app-state.md) has what's built, the sizes and the
differences from the design.

Not yet: streaming SSR, compiler dev names on weft's back end, HMR, and the JSX type namespace.
