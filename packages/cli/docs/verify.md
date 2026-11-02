# Verify your work

Two checks before a change is done: see it work in the running app, and get its tests through the gate.

## The running app: `weft browser` or `__weft__.agent`

Run the app in dev: `weft dev`, or `vite` for an app without `@weft-js/start`. In dev, every page loads
`@weft-js/core/agent`, as long as `@testing-library/dom` and `@testing-library/user-event` are installed (they are what
`weft docs testing` adds; without them a page gets only the devtools graph). Drive it whichever way you can reach it:

- **Your own browser** (a browser tool that runs JS, any agent): open the app's URL, then
  `await __weft__.agent.run('snapshot')`, `await __weft__.agent.act({ role: 'button', name: 'Add' }, 'click')`, …
- **The CLI or MCP**: `weft browser <command>` (tools `browser_*` in `weft mcp`). The dev server relays each command to
  the open tab. Nothing open? Open the URL in your browser, or `weft browser launch` (a headless Chrome).

Commands (CLI form; the JS and MCP forms take the same params):

- `snapshot [--interactive] [--delta]`: roles, names and refs (`- button "Add Banana" [ref=e15]`), plus the reactive
  graph with real names: `Cart.total = 4.5 ← Cart.lines → 1 binding in <Cart> (Cart.tsx:12)`. Big ones go to a file.
- `act button "Add Banana" click`, `act label Coupon fill SAVE10`, `act @e15 click`: user-event, like `user` in
  @weft-js/core/test. Returns what changed on the page.
- `assert status - text "Total: $4.50"`; expectations: visible, absent, text, exactText, value, checked, unchecked,
  disabled, enabled, focused, count. Retries briefly for async loads.
- `graph Cart` and `set Cart.coupon '"SAVE10"'`: read the graph, write a box by name to reach a state fast.
- `time pause [--reload]`, `time advance 3000`, `time resume`: the page's clock (timers, intervals, rAF, Date).
  `--reload` pauses from page load, so startup timers are faked too.
- `net offline|online|latency 300|drop|reset`: `navigator.onLine`, the events, `fetch`, open WebSockets and
  EventSources. `drop` is a server restart; check the app reconnects.
- `record start` … `record code --component App --from ./App --out src/App.test.tsx`: what you did (acts, asserts,
  clicks and typing from any browser tool) as a `@weft-js/core/test` test. It then has to pass the gate.
- `logs`: console errors and uncaught errors, with the binding they came from.

## The test gate: `weft test --gate`

Runs on the diff (`--base <ref>`, default the uncommitted change), in scratch copies; your working tree is never
touched.

- **T010, fail-before:** each new or changed test must fail on the code before the change. A test that passes on the
  old code doesn't test the change.
- **T011, mutants:** each new test must kill at least one mutant of the changed lines (operators, boundaries,
  literals, conditions, removed calls, JSX text). Surviving mutants come back with what to assert. Sampled within
  `test.gate.mutationBudgetSec` (default 60) and `maxMutants` (40); when sampled, T011 is a warning.
- **T020, no weakening:** deleting, skipping or loosening an existing test (`toBe(3)` → `toBeTruthy()`) needs
  `// weft-allow T020: <reason>` on it.
- The static T-codes run on the changed tests; T005 (implementation queries) blocks here.

Tests added for code that didn't change have nothing to fail on: fail-before is skipped, and the mutants come from
the source files the tests import. `--refactor` promises no behavior change: then no test may change.
