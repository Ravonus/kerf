/** Diagnostic entries in their catalog order. */
export const part03 = [
  {
    code: 'T002',
    severity: 'error',
    by: 'cli',
    catches: 'Tautology: `expect` on a literal, or a value compared with itself',
    fix: 'Assert on the output of the code under test',
    example: "test('works', () => { expect(true).toBe(true) })",
  },
  {
    code: 'T003',
    severity: 'error',
    by: 'cli',
    catches:
      'Asserting a value the test just set (`n.value = 5; expect(n.value).toBe(5)`) without going through the UI or the graph',
    fix: 'Act through the UI (`await user.click(…)`) or assert on what depends on the value',
    example:
      "import { state } from '@weft-js/core'\ntest('count', () => { const n = state(0); n.value = 5; expect(n.value).toBe(5) })",
  },
  {
    code: 'T004',
    severity: 'error',
    by: 'cli',
    catches: 'Sleeps, real timers or `waitFor` polling in a test',
    fix: '`await flush()`; for time, `clock.install()` and `await clock.advance(ms)` from @weft-js/core/test',
    example:
      "test('later', async () => { await new Promise(r => setTimeout(r, 100)); expect(1 + 1).toBe(2) })",
  },
  {
    code: 'T005',
    severity: 'warning',
    by: 'cli',
    catches:
      'Implementation query: `container`, CSS selectors, classes, `innerHTML`, test ids, or app state read directly in a component test',
    fix: 'Query by role, label or text (`screen.getByRole`, `getByLabelText`, `getByText`)',
    example:
      "import { render } from '@weft-js/core/test'\nimport { Cart } from './Cart'\ntest('total', () => { const { container } = render(Cart); expect(container.querySelector('.total')!.textContent).toBe('$0') })",
  },
  {
    code: 'T006',
    severity: 'error',
    by: 'cli',
    catches:
      "Mocking weft (`vi.mock('@weft-js/core')`) or the unit under test, so the test checks the mock",
    fix: 'Fake the edges (network, storage) and render the real component',
    example:
      "import { render } from '@weft-js/core/test'\nimport { Cart } from './Cart'\nvi.mock('./Cart')\ntest('cart', () => { render(Cart); expect(document.body.textContent).toBe('') })",
  },
  {
    code: 'T007',
    severity: 'error',
    by: 'cli',
    catches: "Snapshot without approval: it records today's output and passes against it",
    fix: 'Assert the behavior with role/label/text queries, or approve it with `// weft-allow T007: <reason>`',
    example:
      "import { render } from '@weft-js/core/test'\nimport { Cart } from './Cart'\ntest('cart', () => { render(Cart); expect(document.body.innerHTML).toMatchSnapshot() })",
  },
  {
    code: 'T008',
    severity: 'error',
    by: 'cli',
    catches:
      'Conditional `expect` (`if`, `?:`, `&&`, `catch`), or a test whose only `expect`s are in a loop',
    fix: 'Make the condition its own assertion, then assert unconditionally; `expect(fn).toThrow()` for errors',
    example: "test('maybe', () => { const xs = [1, 2]; if (xs.length > 5) expect(xs[0]).toBe(1) })",
  },
  {
    code: 'T009',
    severity: 'error',
    by: 'cli',
    catches: '`.only` or `.skip` committed (also `fit`, `xit`, `xdescribe`)',
    fix: 'Remove `.only`; fix or delete a skipped test (`test.fails` for one meant to fail)',
    example: "test.only('focused', () => { expect(Math.max(1, 2)).toBe(2) })",
  },
  {
    code: 'T010',
    severity: 'error',
    by: 'gate',
    catches:
      'A new or changed test passes on the code before the change (fail-before), so it does not test the change',
    fix: 'Assert what the change makes different; a test for existing behavior goes in its own change with no source edits',
  },
  {
    code: 'T011',
    severity: 'error',
    by: 'gate',
    catches:
      'A new test kills none of the mutants of the changed lines: it would still pass if that code were wrong (a warning when the mutants were sampled)',
    fix: "Assert what the changed code computes; the gate's surviving mutants say what to check",
  },
  {
    code: 'T012',
    severity: 'error',
    by: 'test',
    catches:
      'A test ends with @weft-js/core/browser listeners, intervals or subscribed values still open (checked by @weft-js/core/test after each test)',
    fix: 'Unmount what the test created (dispose any `createRoot`), or fix the leak',
  },
  {
    code: 'T013',
    severity: 'error',
    by: 'cli',
    catches: 'A real `WebSocket` or `EventSource` in a fast test',
    fix: 'Use the fake transport: `net.push`, `net.poke`, `net.drop`',
    example:
      "test('feed', () => { const socket = new WebSocket('ws://localhost/feed'); expect(socket).toBeTruthy() })",
  },
  {
    code: 'T020',
    severity: 'error',
    by: 'gate',
    catches:
      'An existing test deleted, skipped, marked `.fails`, or with an assertion removed or loosened (`toBe(3)` → `toBeTruthy()`)',
    fix: 'Restore it, or keep the change with `// weft-allow T020: <reason>` on that test',
  },
  {
    code: 'P001',
    severity: 'warning',
    by: 'reserved',
    catches: 'Stray top-level script file outside a declared task',
    fix: 'Declare it in `tasks`, or delete it',
  },
  {
    code: 'P002',
    severity: 'warning',
    by: 'cli',
    catches: '`package.json` script that is not a `weft …` alias',
    fix: 'Move it to `tasks` in weft.config.ts and alias `weft run <name>`',
  },
  {
    code: 'P003',
    severity: 'error',
    by: 'cli',
    catches: 'Task duplicates a built-in command or another task (same name or same command)',
    fix: 'Rename it or remove the duplicate',
  },
  {
    code: 'P004',
    severity: 'error',
    by: 'cli',
    catches: 'Task without `description` or `sideEffects`',
    fix: 'Add both (`sideEffects: []` when it has none)',
  },
  {
    code: 'P005',
    severity: 'error',
    by: 'reserved',
    catches: 'Write outside `scope.write`',
    fix: 'Revert the write, or widen `scope.write` deliberately',
  },
  {
    code: 'P006',
    severity: 'warning',
    by: 'reserved',
    catches: 'Unreferenced one-off script',
    fix: 'Delete it, or declare it as a task',
  },
  {
    code: 'P007',
    severity: 'error',
    by: 'cli',
    proposed: true,
    catches: 'weft.config.ts fails to load or fails the schema (the Zod path is given)',
    fix: 'Fix the key at the path shown',
  },
  {
    code: 'P008',
    severity: 'error',
    by: 'cli',
    proposed: true,
    catches: '`slots` names a slot id weft does not define',
    fix: 'Use an id from `weft check --json` `slots`',
  },
  {
    code: 'P009',
    severity: 'error',
    by: 'cli',
    proposed: true,
    catches: '`slots` picks a winner that is not in `plugins` (or does not provide that slot)',
    fix: 'Add the plugin, or pick one that provides the slot',
  },
  // Metadata and share cards (research 20 §6; H for head, M is media). `start`: reported by @weft-js/start at request or
  // render time, and by `weft routes --meta` for every route.
  {
    code: 'H009',
    severity: 'error',
    by: 'runtime',
    catches:
      "A prop of an island is something JSON can't carry (a function, a Date, a class instance), found as the server renders",
    fix: 'Pass plain data, or put `/* @weft client */` on the component that renders it',
  },
  {
    code: 'H010',
    severity: 'info',
    by: 'cli',
    catches:
      "An island has to load with the page for a reason its code could avoid: work that reaches past it, a module that runs as it loads, a box at module level, code the compiler can't see into. `.weft/hydration.json` says why for every island",
    fix: '`/* @weft visible */` above the component when its work only matters on screen, `/* @weft interaction */` when it only matters to someone using it; otherwise the fix the diagnostic names',
  },
  {
    code: 'H017',
    severity: 'info',
    by: 'cli',
    catches:
      "A prop on a component holds a function over local names, which can't cross to an island, so the component around it hydrates whole",
    fix: 'Nothing, when that component is mostly controls; otherwise move each control and what its function reads into a small component of its own, which becomes the island and leaves the rest static',
  },
  {
    code: 'H001',
    severity: 'warning',
    by: 'cli',
    catches:
      "No `site.url`: a build has no absolute canonical, og:url or og:image, and a server takes them from the request's Host header",
    fix: 'Set `site.url`, or `WEFT_SITE_URL` in the deploy environment',
  },
  {
    code: 'H002',
    severity: 'error',
    by: 'cli',
    catches:
      'Param route with an `auto` image on a static-only preset and no `prerender` (`weft routes --meta --preset static`)',
    fix: 'Export `prerender`, or set `og.image`',
  },
  {
    code: 'H003',
    severity: 'warning',
    by: 'cli',
    catches:
      'No description after merging the config, layouts and route (`weft check`, per route and on `site`)',
    fix: "Set `site.description` (or the route's `meta.description`)",
  },
  {
    code: 'H004',
    severity: 'warning',
    by: 'cli',
    catches: 'Title over 60 characters or description over 160 (search results and cards cut them)',
    fix: 'Shorten it',
  },
  {
    code: 'H011',
    severity: 'warning',
    by: 'cli',
    catches:
      'A page sets no `meta`, or leaves out its title or description: they come from what it renders (its `h1`, its first paragraph) or the site default',
    fix: 'Add `meta` when you build the page, in words written for it; the diagnostic carries a starting point',
  },
  {
    code: 'H012',
    severity: 'warning',
    by: 'cli',
    catches: 'Two routes have the same title',
    fix: 'Give each page a title from what is on it',
  },
  {
    code: 'H013',
    severity: 'warning',
    by: 'cli',
    catches: 'Two routes have the same description, usually the site default',
    fix: 'Give each page a description from what is on it',
  },
  {
    code: 'H014',
    severity: 'warning',
    by: 'cli',
    catches:
      'A param route whose `meta` ignores `data` and `params`, or whose real pages all have the same title or description',
    fix: 'Build `meta` from `data` and `params`: `({ data }) => ({ title: data.name, description: data.summary })`',
  },
  {
    code: 'H015',
    severity: 'warning',
    by: 'cli',
    catches:
      'A written description that reads like code, a markdown fragment or a cut-off sentence',
    fix: 'Write one plain sentence. Never slice raw markdown or code into `description`',
  },
]
