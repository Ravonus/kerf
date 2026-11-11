# Review of plan v0 (2026-10-28)

An independent review of PLAN v0, looking for over-complication and holes. Everything below is folded into v0.1.

## Core semantics
- Getter props contradicted v0's own rule 3 and research 01's recommendation. Keep them (agents will write `count={count.value}`), but record the decision and rewrite rule 3. → §2 rule 4, §12.
- `state(prop)` is React's `useState(prop)` bug → W005 with `state.linked`.
- W001 must fire on *any* bare prop reference outside a reactive scope (`makeChart(items)`, `client(userId)`, `.map` in setup), not only arithmetic.
- Define: `(props) =>`, `...rest`, defaults, nested destructuring (ban), props built outside JSX, `children` read-once. → §3.3.
- Box vs value must be a type error both ways. → W008.
- `.map` lowering: live index, per-key item update, filter/sort chains, fragments/null, nested maps, early return in callback. → §3.4.
- `&&` with 0 → W011. `derived(async)` and reads after `await` in `resource` → W012.

## React priors the plan didn't catch
Early `return` on state in a run-once body (most likely bug) → W040. `let` mutated in handlers → W041. `onChange` per-keystroke vs on blur → W042. `style={{}}`, `htmlFor`, custom `useX()` hooks. Verdict: the TSX bet holds only if diagnostics are hard errors with full coverage. Looking like React makes React bugs more likely. → §2 rule 2.

## Cuts
- 7 packages → 4 (runtime/compiler/CLI merged; surface+keel merged).
- Merge the agent layer into Phase 1; defer MCP `inspect`.
- Use `@tanstack/router-core` instead of writing a router. Drop ISR, `updateTag`, per-user scope from v0.
- Explicit cache tags first: auto-tagging via Drizzle instrumentation breaks on joins, raw SQL, transactions.
- Defer Zag; use native `<dialog>`/popover.
- Surfaces before Design: small, it's the user's own engine, and it directly tests setup-once.
- Drop `store`, since two containers breaks "one way".
- Eval: 6 tasks (one per root cause) vs React and Solid, 5 samples each. Svelte isn't TSX.
- No perf gate in Phase 1.

## Missing pieces
`flush()` (batched DOM vs `focus()` right after a write), `@kerf-js/core/test` (needed by the eval), HMR state preservation, hydration (keep dom-expressions keys), JSX typings, mapping TS2540 into the catalog, dev-only graph names, defining "server code" for W030 as reachable from the server entry, CSRF/GET-safety/nullable `ctx.user`, MIT NOTICEs + Keel license check, one schema for surface props.
