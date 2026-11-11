# Testing (`@kerf/core/test`, vitest)

A new app has no test runner. Add one:

```bash
npm install -D vitest jsdom @testing-library/dom \
  @testing-library/user-event
```

<!-- example: skip @kerf/core/vite has no type declarations yet (TS7016 under strict) -->
```ts
// vitest.config.ts
import kerf from '@kerf/core/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [kerf()],
  test: { environment: 'jsdom' },
})
```

Then `npx vitest run`. A test:

```tsx
import { state } from '@kerf/core'
import { render, screen, user } from '@kerf/core/test'
import { expect, test } from 'vitest'

function Cart() {
  const count = state(0)
  return (
    <button type="button" onClick={() => count.value++}>
      Cart ({count.value})
    </button>
  )
}

test('adding to the cart', async () => {
  render(Cart)
  await user.click(screen.getByRole('button', { name: 'Cart (0)' }))
  expect(screen.getByRole('button', { name: 'Cart (1)' }))
    .toBeTruthy()
  const click = () => user.click(screen.getByRole('button'))
  await expect(click).toTouchAtMost(1, { runs: 2 })
})
```

- `render(Component, props, options)` mounts into the document with a fresh app; unmounted after each test.
  `options.state` seeds `defineState` scopes, `options.storage` (`memoryStorage()`) is shared between renders to play
  two tabs or a reload, and `options.slots` binds plugin slots. `scope(handle)` runs one scope with no UI.
- `flush()` applies pending updates. Every `user` action and `clock.advance` already ends in one.
- `screen` has role, label and text queries only (`getByRole`, `getByLabelText`, `getByText`, with `getAll`/`query`/`find`).
- `user.click`, `dblClick`, `type`, `clear`, `keyboard`, `hover`, `unhover`, `tab`, `selectOptions`, `deselectOptions`,
  `upload` and `paste` (`@testing-library/user-event`) each end in `flush()`: never sleep or `waitFor`.
- `clock.install()` before the code schedules timers, then `await clock.advance(ms)` (or `clock.runAll()`): drives
  timers, rAF, `Date` and the resources that wait on them, and flushes. Uninstalled after each test.
- `touches(fn)` returns `{ mutations, runs, … }` for one interaction. `toTouchAtMost(n, { runs })` bounds both: DOM writes
  alone miss identity bugs that re-run every row but write the DOM once (W014).

## Junk tests: T001–T009

`kerf check` reports these on test files (`test.include` in the config). A test that finishes without an assertion
also fails at runtime (T001). T012 and T013 are about open listeners and real sockets: `kerf docs browser` and
`kerf docs start`; T010, T011 and T020 are the gate: `kerf docs verify`.

| Code | Catches | Instead |
|---|---|---|
| T001 | No assertion, or `expect(x)` with no matcher | Assert what the user sees |
| T002 | `expect(true).toBe(true)`, `expect(x).toBe(x)` | Assert on the code's output |
| T003 | `n.value = 5; expect(n.value).toBe(5)` | Act through the UI, assert what depends on it |
| T004 | `setTimeout` sleeps, real timers, `waitFor` | `flush()`, `clock.advance(ms)` |
| T005 | `container`, selectors, classes, `innerHTML`, test ids, app state in a component test (warning) | Role, label, text |
| T006 | `vi.mock('@kerf/core')`, mocking the component under test | Fake the edges (API, storage) |
| T007 | Snapshots | Behavior assertions |
| T008 | `expect` under `if`/`?:`/`&&`/`catch`, or only inside loops | Assert the condition, then assert unconditionally |
| T009 | `.only`, `.skip`, `fit`, `xit` | Remove it; `test.fails` for a test meant to fail |

A deliberate exception needs a reason: `// kerf-allow T007: the exported SVG is the product`. In the file's header
comments it covers the whole file; elsewhere, its own line and the next.

Plugins can use this clock too: `fakePay` from `@kerf/pay/test` plays a rail on it, through your real webhook and ledger. `kerf docs pay`.
