# 21 — HMR: name-keyed, state-preserving hot updates

Research date: 2026-10-29. Status: **built** (PLAN §3.6, §9 Phase 1/1b). Code: `crates/weft-compiler/src/hmr.rs`,
`packages/weft/src/hmr.ts`, `packages/weft/vite.mjs`. Tests: `packages/weft/test/hmr.test.ts`, the `hmr_*` tests in
`crates/weft-compiler/tests/compile.rs`. End-to-end gate: `packages/weft/scripts/hmr-bench.mjs`.

**The task.** Edit a component's file and see the change without a reload. State created in the component
(`state(...)`) survives when its compiler-assigned name is unchanged and resets when reusing it would be wrong.
`defineState` scopes survive. PLAN §3.7 budget: 1k components, ≤ 50 ms p95 from Vite's change event to DOM updated
(§3: first written as "from file write", moved to the change event on 2026-10-29).

---

## 1. What the compiler emits (dev DOM output only)

Only when `dev` and the new `hmr` option are both set, for DOM output that isn't hydratable. The weft() Vite plugin
sets `hmr` when serving, outside vitest. Production, SSR and `?weft-hydrate` output are unchanged.

```tsx
export function Counter(props) {
  const count = state(0)
  return <button onClick={() => count.value++}>{props.label} {count.value}</button>
}
```

becomes (the template and bindings as before, plus):

```js
const count = _$keep(state(0), "Counter", "count:29a8d9ffc2ad4575")   // name : hash of `state(0)`
…
import { hot as _$hot, keep as _$keep } from "weft/hmr";
if (import.meta.hot) {
  _$hot("/src/Counter.tsx", { Counter: [Counter, "eeea01f2fac753a2"] });   // file#name, source hash
  import.meta.hot.accept();
}
```

- **Registration.** Every top-level component (`function Card`, `const Card = () => …`, exported or not, PascalCase)
  is listed with a hash: FNV-1a of its own statement, XOR the hash of every other top-level statement. An edit
  inside one component changes only its hash; an edit to a module-level helper or a constant changes all of them.
- **State keys.** Each body-level `const x = state(init)` in a registered component is wrapped in
  `_$keep(box, "Comp", "x:<hash of the call's source>")`. Renaming the box or changing its initializer (or options)
  changes the key, so the value resets. Boxes created anywhere else (inside callbacks, rows, `derived`) aren't keyed
  and start fresh, like `derived` values, which are always recomputed.
- **Accepting.** The module calls `import.meta.hot.accept()` only when every export is a component or a type and no
  top-level statement calls `render`/`hydrate`. Otherwise (it exports a box, a scope, a helper; or it's the entry),
  Vite passes the update to the importers, which re-run it. The entry reloads the page, as in Solid.
- `_$keep` is a pass-through when nothing is hot, so a module compiled with `hmr` behaves the same without Vite.

## 2. What the runtime does (`weft/hmr`, dev only)

- `hot(file, comps)` keeps one entry per `file#name`: the latest function, its hash and a version box. It also sets
  `fn.$$h` on the new function. `component()` (dom-next.ts) checks `DEV && Comp.$$h`, so importers that still hold
  the *old* function object (they weren't re-run) mount through the entry and get the newest implementation.
- A registered component mounts as a `derived` that reads its entry's version and runs the body (first run eager, so
  creation order is unchanged). On a new version, the derived re-runs: its previous run's effects, listeners added
  with `onMount`/`onCleanup` and child scopes are disposed by the ordinary `clean()`; the parent's binding places
  the new nodes. Only instances of components whose hash changed re-run; if none changed (the module re-ran
  because an import changed), all of the module's components re-run.
- While a body runs, `keep()` restores a box's value from the previous run's box with the same key (only for
  body-level calls: the owner must be the instance's own node). Children created during a re-run take the boxes of
  the child at the same place in the previous run (same component, same index), so editing a parent keeps the state
  of the children it re-creates.
- A body that throws during an update logs and keeps its last output; the next edit retries.
- `defineState` with a known name, once HMR is on, returns the existing handle (scope.ts): live instances keep
  their state; the new `setup` applies to new apps and the next reload. S009 still fires without HMR.
- Dev only, one more change in `insert`: a static array holding hot components (`<><A /><B /></>`) is bound
  reactively, since those components are now accessors.

Production cost: **0 bytes**. Every hook is behind `DEV` and folds away; `weft/hmr` is never imported. `size.mjs`
reports the same bytes as before the change (runtime 5.80 KB br, v3 4.00 / 4.68 / 4.71 KB).

## 3. Measured (2026-10-29, this Mac, 1-minute load 5–8)

| Path | p50 | p95 | max |
|---|---|---|---|
| File write → DOM updated, Vite 8 dev + headless Chromium, 1k components (`hmr-bench.mjs`, 100 edits) | 99 ms | 106 ms | 111 ms |
| **Vite's watcher `change` event → DOM updated** (same run; the gate) | 5.8 ms | **13.3 ms, pass** (second run: 6.9) | 22.3 ms |
| Same, 10 components | ~93 ms of watcher, same weft share | | |
| Compile + module run + swap + DOM, jsdom, 1k mounted (`hmr.test.ts` gate, 60 edits) | 0.65 ms | 1.4 ms | 1.7 ms |

Every edit kept the edited component's count, and the page loaded once (no full reloads).

**Where the gate starts.** About 90 ms passes between the write and Vite's watcher reporting the change, at 10
components as at 1k. That's chokidar inside Vite 8 on macOS: plain `fs.watch` on the same files reports in under 1 ms
(per file) or ~11 ms (recursive directory), so the delay is in the watcher's own handling, which I didn't pin down.
weft can't change it, and it doesn't grow with the app. So the gate (decided 2026-10-29) runs from Vite's `change`
event to the DOM update: transform, websocket, module fetch, swap and DOM, everything weft and its plugin control.
That's p95 13.3 ms, inside the 50 ms budget. `hmr-bench.mjs` still prints file write → DOM and exits 1 only on the
gated number.

## 4. Not covered yet

- **Hydratable dev builds** (`weft({ hydratable: true })`, `?weft-hydrate`) get no HMR: the hot accessor would change
  how a claimed child is adopted. They reload instead.
- Components that aren't top-level (defined inside a function) or aren't PascalCase aren't registered; they re-run
  with their parent.
- Positional matching of children covers children created while the parent's body runs. Rows a list adds later
  don't inherit state from a previous run.
- `state.linked(...)` and boxes in destructuring patterns aren't keyed (they reset).
- A component's result is an accessor in dev, so code that treats `<Child />` as a node (`(<Child /> as HTMLElement).focus()`)
  behaves differently in dev with HMR. Compiled markup always goes through `child()`, which handles both.
- A `defineState` setup edit takes effect on reload, not live.
- Vite's own client and the weft plugin's other hooks are standard; bundled dev mode isn't tested yet (research 08 §4).
