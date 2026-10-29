# weft (Phase 1 compiler spike)

The client runtime, compiler binding, Vite plugin and test utilities from the Phase 1 compiler spike. Results, numbers
and what Phase 1 proper should change: [docs/research/16-compiler-spike.md](../../docs/research/16-compiler-spike.md).

| Import | What |
|---|---|
| `weft` | `state`, `state.linked`, `derived`, `watch`, `onCleanup`, `onMount`, `untrack`, `flush`, `context` |
| `weft/dom` | `render`, plus the helpers compiled templates call (Solid 2's DOM back-end surface) and the keyed `For` |
| `weft/test` | `render`, `flush`, `touches()`, and `expect(fn).toTouchAtMost(n, { runs })` |
| `weft/vite` | `weft()`: one filtered transform hook calling the native compiler |
| `weft/compiler` | `transform(source, options)` → `{ code, map, diagnostics }` |

```bash
npm install
npm run build:native        # cargo build crates/weft-compiler (Rust ≥ 1.95) → native/
npx vitest run              # runtime, DOM and v3 work-budget tests
node scripts/size.mjs       # brotli sizes against the §3.7 budgets
node scripts/gen-corpus.mjs 1000 && node scripts/bench.mjs
```

Not in the spike: SSR and hydration, `<Boundary>`, `resource`, dev names, HMR, `defineState`, and the JSX type namespace.
