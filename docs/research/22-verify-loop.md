# 22 — The verify loop: agents drive the running app, and the test gate

Date: 2026-10-29. Phase 1b (PLAN §9): `weft browser` with the graph overlay, recorder and network/time control, and
the test gate (fail-before, diff-scoped mutation, T020). Research [05](05-testing-browser-cli.md) proposed a
Playwright daemon and StrykerJS; this note records what was built instead, and why.

## 1. Driving the app: the page is the control surface

**Decision: no browser automation library.** Every coding agent already has a browser: Claude's browser pane,
Claude in Chrome, Codex's browser, Playwright MCP. A weft-owned Playwright daemon would be a second browser beside
the one the agent (and the person) is already looking at, with its own install, its own downloads and its own
session state. What none of those browsers can see is weft's reactive graph, and what none of them gives a test is
weft's clock and network fakes. So weft puts exactly that into the page and lets any browser reach it.

```
 agent's own browser ──JS──▶ window.__weft__.agent ◀──Vite socket── dev server ◀──HTTP── weft browser / weft mcp
                             (@weft-js/core/agent, dev only)                (vite.mjs relay)
```

- **`@weft-js/core/agent`** (packages/weft/src/agent.ts) is loaded into every page by the weft() Vite plugin when serving
  (a virtual entry, so Vite transforms it like app code). It is built on the same Testing Library queries and
  user-event as `@weft-js/core/test`, so a role/name an agent uses in the page is the role/name a test uses, character for
  character, and the recorder's output needs no translation.
- **Two ways in, one implementation.** An agent whose browser runs JS calls `await __weft__.agent.run('snapshot')`
  directly. The CLI (`weft browser …`) and the MCP tools (`browser_*`) POST to the dev server's `/__weft/agent`,
  which relays the command to the open tab over Vite's own HMR socket and returns the tab's answer. Tabs announce
  themselves (`weft:hello`); a command goes to the focused tab, else the latest, or `--tab <id>`. The endpoint needs
  an `x-weft-agent` header, so a web page can't drive it cross-site without a preflight it never gets.
- **No browser at all** (CI, a sandbox): `weft browser launch` starts a plain headless Chrome on the app. It is only
  a host page; control still goes through the bridge. `screenshot` reads that Chrome over the DevTools protocol
  (20 lines over Node's built-in WebSocket); in their own browser, agents use its screenshot tool.

**Commands** (CLI words; JS and MCP take the same params): `snapshot` (roles, names, states, values and refs, one
line each, plus the graph; `--interactive`, `--delta`, `--scope`, big payloads spill to `.weft/browser/` files),
`act` (click, fill, type, press, select, check, …; returns the change it caused as a line delta), `assert`
(visible, absent, text, exactText, value, checked, disabled, enabled, focused, count; retries on real time for up to
1.5 s), `graph`/`set` (read the graph, write a box by name), `time`, `net`, `record`, `logs`, `overlay`, `tabs`,
`open`, `launch`, `screenshot`, `close`.

### 1.1 The graph with real names

The compiler's dev pass (crates/weft-compiler/src/hmr.rs `names`) wraps body-level `const x = state(…)`,
`derived(…)` and `state.linked(…)` in a component as `_$name(…, "Cart.x")`, and top-level ones as
`"<file stem>.x"`. `name()` in the runtime tags the node and adds it to a dev-only registry that its owner's cleanup
empties. `defineState` scopes register their boxes and returned derived values under the scope names they already
had (`cart.items`). Two live instances of a component show as `Cart#1.total`, `Cart#2.total` (a dev instance id
from `createComponent`).

```
App.cart = {"banana":{"qty":2,"addedPrice":0.25}} → App.count, CartView.lines, CartView.total, 4 bindings in an effect
ProductList.shown = [...] ← App.filters, App.products → 1 derived in <ProductList> (src/App.tsx:43), 1 binding in <ProductList> (src/App.tsx:43)
```

`reads` come from the node's sources, `feeds` from its observers: named derived values by name, unnamed ones and
DOM bindings counted per component with the component's source location. A derived value whose sources changed and
that nobody has read since is marked `(stale)` rather than recomputed, so looking never changes what runs.
Production builds don't emit `_$name` and fold `DEV` away: the v3 app's bundle is unchanged (4.66 KB gz), "every
export" grows 0.02 KB gz for `name`.

The **overlay** (Alt+Shift+G, or `weft browser overlay`) is the same `format(graph())` text in a fixed panel with a
name filter, repainted every 250 ms while open. People and agents read the same lines.

### 1.2 Clock and network, in the page

- **Clock** (`time pause|advance|resume`): replaces `setTimeout`/`setInterval`/rAF, `Date` and `performance.now`;
  `advance(ms)` runs due timers in order and settles weft's queue after each. `resume` hands pending timers back to
  real time with what was left of their delay. Timers made before `pause` stay real, so `pause --reload` sets a
  session flag and reloads: the bridge loads before the app, so startup timers (the shop's 300 ms load, its 3 s price
  ticker) are faked too. The bridge keeps its own real timers.
- **Network** (`net offline|online|latency|drop|reset`): `navigator.onLine`, the `offline`/`online` events, `fetch`
  (fails offline, delayed under latency), and WebSocket/EventSource (new ones fail offline; `drop` closes the open
  ones with code 4000, a server restart without going offline). Vite's own socket is created before the patch and is
  never touched. The same words as @weft-js/core/test's `net`, so a reconnect scenario explored in the page records as a test.

### 1.3 The recorder

`record start` logs steps from three sources: the bridge's `act`/`assert`, clock and network commands, and real
`click`/`input`/`change`/`keydown` events in the page, so clicks and typing from any agent's browser tool (or a
person) are captured too; typing coalesces into one `fill`. Each element is described the way a test would find it:
role + accessible name when that is unique on the page, else its label, else its text, else a ref with a comment
asking for an accessible name. `record code` prints a `@weft-js/core/test` test: `render(App, props)`, the first query as
`findBy*` (the app loads), `user.*` actions, real assertions, `clock`/`net` calls where they happened. A recording
without an assertion gets a T001 comment. The output passes `weft check`'s T-codes, and then has to pass the gate
like any other test.

## 2. The test gate (`weft test --gate`)

Runs on a diff: `git diff <base>` plus untracked files (default base `HEAD`, the uncommitted change), or a list of
`{ rel, before, after }` (the eval harness). Files are tests (`*.test.*`), test support (imported only by tests and
outside `src/`) or source. Every run happens in a scratch copy under `.weft/gate/` with `node_modules` symlinked; the
working tree is never written.

1. **Static:** T001–T009 on the changed test files, with **T005 escalated to an error** for new tests (implementation
   queries are a warning in `weft check`, a block in the gate). **T020** compares each changed test file with its old
   version: a test deleted (unless the same body lives on under a new name), skipped, marked `.fails`, `expect.
   assertions(n)` lowered, an assertion loosened (`toBe` → `toBeTruthy`/`toEqual`/…, `toEqual` → `toMatchObject`,
   `toHaveBeenCalledWith` → `toHaveBeenCalled`, `toThrow(x)` → `toThrow()`, …) or removed. A changed expected value
   (`toBe(3)` → `toBe(4)`) is not weakening: fixes often must.
2. **After:** the new or changed tests (by vitest name, `suite > test`; `.each` tests by file) run on the change and
   must pass.
3. **Fail-before (T010):** source files go back to their old versions (new ones deleted), tests and their helpers
   stay new. Every changed test must fail. A file that can't load counts as failing (a test of a module that didn't
   exist yet). With no source change, there is nothing to fail on: fail-before is skipped (a note says so).
4. **Mutation (T011):** mutants on the changed lines (an LCS line diff) of source files the changed tests can reach
   through runtime imports (`import type` doesn't count; unreached files are named in a note). Operators: equality
   and boundary swaps, `&&`/`||`/`??`, arithmetic, `!x` → `x`, booleans, numbers +1, strings blanked, `if`/`?:`
   conditions forced true and false, call statements removed, function results replaced with `undefined`, JSX text
   blanked. Sampled round-robin over lines up to `maxMutants` (40) within `mutationBudgetSec` (60); 4 copies run in
   parallel, each re-running only the changed test files per mutant. A mutant whose run fails to compile (W-code,
   syntax) is `invalid`, a timeout counts as killed. Each changed test must kill one; when the sample was cut, T011 is
   a warning. Surviving mutants come back with a one-line hint of what to assert.
5. **Verdict:** each test gets `accepted` (green after, red before, no error inside its span) and the codes inside it;
   the gate passes when every changed test is accepted and there are no errors. `// weft-allow T010|T011|T020: <why>`
   on a test keeps it, and the result lists what was allowed. `--refactor` promises no behaviour change: then any
   changed test is an error.

**Why not StrykerJS.** Stryker instruments by transforming code with its own Babel pipeline before the runner sees
it, which would have to understand weft's TSX and run in front of the weft compiler; its incremental mode keys on
whole files. Source-text mutants go through the weft compiler like any edit (so W-codes still apply to them), need
no instrumentation, and scope to changed lines trivially. The cost is speed: no per-test coverage analysis, so each
mutant re-runs every changed test file. Sampling and parallel copies keep it inside the budget (below).

## 3. Results

**Exit check** (`node evals/gate.mjs --starter <dir>`, v3 shop in weft, the only eval with a weft reference; v1/v2
have React and Solid references only):

| Scenario | Diff | Reference tests accepted | Mutants (killed/run, sampled from) |
|---|---|---|---|
| fresh | the whole app + baseline, t1–t3 | 23/23 | 33/40 of 147 (28 s) |
| tickets | weft starter → reference + t1–t3 | 19/19 | 32/40 of 109 (17 s) |
| junk | tickets + planted junk + a weakened baseline test | 19/19 next to the junk | 34/40 of 109 (24 s) |

Planted junk, all caught:

| Junk | Caught by |
|---|---|
| `expect(true).toBe(true)` after `start()` | T002, T010 |
| a role-query test of baseline behaviour (passes on the starter) | T010 |
| `document.querySelector('li:nth-child(3) span:nth-child(3)')` text check (fails before, kills mutants) | T005 |
| `expect(rowText('Yogurt').length).toBeGreaterThan(0)` | T010 |
| baseline `toBe('2')` → `toBeTruthy()` | T020 (and T010: the edited test passes on the old code) |

The implementation-detail test is the one only the static check catches: it fails on the old code and kills five
mutants, so fail-before and mutation both accept it. That is why T005 blocks in the gate.

**What the survivors said about the eval's own tests.** Mutants that survive every hidden test are real gaps in
them: no test checks the `Loading…` state (`products.value` → `true` in App.tsx survives), the empty-cart text, the
default option values of the filters (`"all"`, `"name"` blanked), or which tab button is marked current (Header's
`===` → `!==`); and the guards in `setQty` (`!product`, `qty > product.stock` forced false) survive because the UI
already disables the buttons that would reach them. Before reachability filtering, the fake API's random price
ticker (`api.ts`) also "survived"; tests never run it (they pass their own fake), so it is now left out with a note.

**Speed.** The gate on the TS fixture (3 tests, 16 mutants) takes ~2 s. On the v3 app each vitest run with the weft
compiler and jsdom takes ~3–4 s; 40 mutants on 4 copies take 17–28 s per scenario, and the whole exit check 70 s (the Mac at a load of ~20). Unit tests: packages/cli
`gate.test.mjs` (12), `browser.test.mjs` (7, live Chrome; ~3 s), packages/weft `agent.test.tsx` (8).

## 4. Gaps

- **Recording to e2e files:** the recorder writes `@weft-js/core/test` (component) tests only. The `--e2e` lane (Playwright
  Test against `weft dev`) isn't built, and with this design may not need Playwright either.
- **Source-mapped stacks:** `logs` gives the binding or component an error came from (`@weft-js/core` on the error) and the
  first stack lines, not mapped positions.
- **Network depth:** latency covers `fetch`, not XHR or WebSocket messages; there's no request log (`network`).
- **Local `state.linked`** values aren't named (they're plain objects); DOM leaves in the graph are counted per
  component, not pointed at.
- **Mutation coverage:** no per-test coverage, so every mutant runs every changed test file; equivalent mutants
  aren't detected (they show up as survivors).
- **Fail-before granularity:** test support is detected by imports (tests only, outside `src/`); a helper under
  `src/` that only tests import is treated as source and reverted.
- **v1/v2 evals** have no weft references yet, so the exit check covers v3 only.
- `weft dev` isn't a CLI command yet; the bridge works under plain `vite` with the weft() plugin.
