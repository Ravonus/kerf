/** tests diagnostic entries in catalog order. */
export const tests = [
  {
    code: 'T001',
    severity: 'error',
    by: 'cli',
    catches:
      'A test with no assertion (or an `expect(x)` with no matcher): it passes as long as nothing throws. `@kerf-js/core/test` also fails such a test at runtime',
    fix: 'Assert what the user sees: `expect(screen.getByRole(…)).toHaveTextContent(…)`',
    example:
      "import { render } from '@kerf-js/core/test'\nimport { Cart } from './Cart'\ntest('renders', () => { render(Cart) })",
  },
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
      "import { state } from '@kerf-js/core'\ntest('count', () => { const n = state(0); n.value = 5; expect(n.value).toBe(5) })",
  },
  {
    code: 'T004',
    severity: 'error',
    by: 'cli',
    catches: 'Sleeps, real timers or `waitFor` polling in a test',
    fix: '`await flush()`; for time, `clock.install()` and `await clock.advance(ms)` from @kerf-js/core/test',
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
      "import { render } from '@kerf-js/core/test'\nimport { Cart } from './Cart'\ntest('total', () => { const { container } = render(Cart); expect(container.querySelector('.total')!.textContent).toBe('$0') })",
  },
  {
    code: 'T006',
    severity: 'error',
    by: 'cli',
    catches:
      "Mocking kerf (`vi.mock('@kerf-js/core')`) or the unit under test, so the test checks the mock",
    fix: 'Fake the edges (network, storage) and render the real component',
    example:
      "import { render } from '@kerf-js/core/test'\nimport { Cart } from './Cart'\nvi.mock('./Cart')\ntest('cart', () => { render(Cart); expect(document.body.textContent).toBe('') })",
  },
  {
    code: 'T007',
    severity: 'error',
    by: 'cli',
    catches: "Snapshot without approval: it records today's output and passes against it",
    fix: 'Assert the behavior with role/label/text queries, or approve it with `// kerf-allow T007: <reason>`',
    example:
      "import { render } from '@kerf-js/core/test'\nimport { Cart } from './Cart'\ntest('cart', () => { render(Cart); expect(document.body.innerHTML).toMatchSnapshot() })",
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
      'A test ends with @kerf-js/core/browser listeners, intervals or subscribed values still open (checked by @kerf-js/core/test after each test)',
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
    fix: 'Restore it, or keep the change with `// kerf-allow T020: <reason>` on that test',
  },
]
