# Testing

:::learn
- How to render a component under vitest and drive it the way a user would
- Why a weft test never sleeps, and how to move time and the network instead
- How to test shared state, server functions and live data without a server
- Which tests `weft check` calls junk, and why
- What `weft test --gate` adds before a change is done
:::

A test should fail when the code is wrong, and pass when it's right. That sounds obvious, but a lot of tests pass
whatever the code does: they assert on a value they set themselves, sleep and hope, or check a snapshot nobody reads.
weft's test helpers are built so that the natural way to write a test is the one that catches bugs, and `weft check`
reports the patterns that don't.

Everything on this page comes from `@weft-js/core/test`, which runs under [vitest](https://vitest.dev) in jsdom. Here is
the component the first examples test. Try it before you read its tests:

:::demo tool-coupon

## Setting up vitest

A new app has no test runner. Add one, with jsdom and Testing Library, which `@weft-js/core/test` builds on:

```bash
npm install -D vitest jsdom @testing-library/dom \
  @testing-library/user-event
```

Then give vitest the weft compiler, so a `.tsx` test compiles the same way your app does:

<!-- example: skip @weft-js/core/vite has no type declarations yet (TS7016 under strict) -->
```ts
// vitest.config.ts
import weft from '@weft-js/core/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [weft()],
  // `#/db/schema` and the app's other aliases live in tsconfig.json.
  resolve: { tsconfigPaths: true },
  test: { environment: 'jsdom' },
})
```

Run the suite with `npx vitest run`, or `npx vitest` to rerun on every save. There's no `weft` command that runs your
tests: vitest does that. `weft test` is something else, the gate at the end of this page.

## Rendering and querying

Here is the coupon form from the demo, as a component in your app:

```tsx
// src/testing/Coupon.tsx
import { derived, state } from '@weft-js/core'
import { Button, Card } from '@weft-js/warp'

const CODES: Record<string, number> = { SAVE10: 10, HALF: 50 }
const SUBTOTAL = 40

export function Coupon() {
  const code = state('')
  const applied = state('')
  const error = state('')
  const off = derived(() => CODES[applied.value] ?? 0)
  const total = derived(() => SUBTOTAL - (SUBTOTAL * off.value) / 100)

  const apply = () => {
    const typed = code.value.trim().toUpperCase()
    if (typed in CODES) {
      applied.value = typed
      error.value = ''
    } else {
      error.value = `${typed || 'An empty code'} isn't a code we know`
    }
  }

  return (
    <Card title="Your basket">
      <label>
        Coupon <input
          value={code.value}
          onInput={e => (code.value = e.currentTarget.value)}
        />
      </label>
      <Button onClick={apply}>Apply</Button>
      {error.value && <p role="alert">{error.value}</p>}
      <p role="status">Total: ${total.value.toFixed(2)}</p>
    </Card>
  )
}
```

And its first test. Put it next to the component, named `*.test.tsx`:

```tsx
// src/testing/Coupon.test.tsx
import { render, screen, user } from '@weft-js/core/test'
import { expect, test } from 'vitest'
import { Coupon } from './Coupon'

test('a known code takes 10% off', async () => {
  render(Coupon)
  await user.type(screen.getByLabelText('Coupon'), 'save10')
  await user.click(screen.getByRole('button', { name: 'Apply' }))
  expect(screen.getByRole('status').textContent).toBe('Total: $36.00')
})
```

Three pieces do the work:

- **`render(Component, props?, options?)`** mounts the component into the document, inside a fresh app. Every
  `defineState` scope starts from its setup again, so one test can't leak into the next. You never unmount by hand:
  everything `render` mounted is removed after each test.
- **`screen`** finds elements by what a person sees: `getByRole`, `getByLabelText` and `getByText`. Each comes in the
  usual Testing Library forms: `getBy` throws when nothing matches, `queryBy` returns `null`, `findBy` waits, and the
  `All` versions return every match.
- **`user`** acts like a person: `click`, `dblClick`, `type`, `clear`, `keyboard`, `hover`, `unhover`, `tab`,
  `selectOptions`, `deselectOptions`, `upload` and `paste`, from `@testing-library/user-event`.

`screen` has no `container`, CSS selector or test-id query, on purpose. A test that finds the total by `.total` passes
after someone breaks the label and fails after someone renames a class. A test that finds it by its role and text fails
exactly when a user would notice something wrong.

:::note Coming from React Testing Library
Most of this will look familiar. Two things are different. There's no `act()`, because every `user` action already waits
for the page to update. And there's no `rerender`, because a weft component runs once: to see it with new props, pass a
box or render the parent that owns the value.
:::

## Every action ends in a flush

In weft, writes are batched: a handler sets some boxes, and the DOM catches up together once the handler is done. In a
test, that means there's a moment after a click when the page hasn't changed yet.

You never see that moment, because every `user` action ends in `flush()`, which applies pending updates and lets what
they started settle. When the `await user.click(…)` line finishes, the DOM is up to date. So there's nothing to wait for:
no `waitFor`, no `setTimeout`, no retrying until the text appears.

If you change something outside `user`, for example by calling an action on a shared scope, call `flush()` yourself:

```tsx
// src/testing/flush.test.tsx
import { state } from '@weft-js/core'
import { flush, render, screen } from '@weft-js/core/test'
import { expect, test } from 'vitest'

const unread = state(3)

function Inbox() {
  return <p role="status">{unread.value} unread</p>
}

test('the badge follows a write from outside', async () => {
  render(Inbox)
  unread.value = 0
  await flush()
  expect(screen.getByRole('status').textContent).toBe('0 unread')
})
```

The assertion is on the paragraph, not on `unread.value`. Checking the box you wrote would only prove that
assignment works.

:::pitfall Sleeping in a test
`await new Promise(r => setTimeout(r, 100))` makes a test slow, and still flaky: on a busy machine 100 ms isn't always
enough. `waitFor` is the same thing with a loop. `weft check` reports both as T004. Use `await flush()` for updates, and
the fake clock below for anything that really does wait.
:::

## Testing the unhappy path

Most bugs live in the branch nobody clicked. Test the error as carefully as the success:

```tsx
// src/testing/Coupon-errors.test.tsx
import { render, screen, user } from '@weft-js/core/test'
import { expect, test } from 'vitest'
import { Coupon } from './Coupon'

test(
  'an unknown code says so, and leaves the total alone',
  async () => {
    render(Coupon)
    await user.type(screen.getByLabelText('Coupon'), 'free')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByRole('alert').textContent)
      .toBe("FREE isn't a code we know")
    expect(screen.getByRole('status').textContent)
      .toBe('Total: $40.00')
  },
)

test('a good code clears the earlier error', async () => {
  render(Coupon)
  await user.type(screen.getByLabelText('Coupon'), 'free')
  await user.click(screen.getByRole('button', { name: 'Apply' }))
  await user.clear(screen.getByLabelText('Coupon'))
  await user.type(screen.getByLabelText('Coupon'), 'half')
  await user.click(screen.getByRole('button', { name: 'Apply' }))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('status').textContent).toBe('Total: $20.00')
})
```

`queryByRole` returns `null` instead of throwing, which is what you want when the point is that something is gone.

## Time: the fake clock

Some code waits on purpose: a toast that hides after two seconds, a search that waits for you to stop typing, a retry
with backoff. Don't wait in the test as well. Install the fake clock and move it:

```tsx
// src/testing/SaveButton.tsx
import { state } from '@weft-js/core'

export function SaveButton() {
  const saved = state(false)
  const save = () => {
    saved.value = true
    setTimeout(() => (saved.value = false), 2000)
  }
  return (
    <button type="button" onClick={save}>
      {saved.value ? 'Saved' : 'Save'}
    </button>
  )
}
```

```tsx
// src/testing/SaveButton.test.tsx
import { clock, render, screen, user } from '@weft-js/core/test'
import { expect, test } from 'vitest'
import { SaveButton } from './SaveButton'

test('says Saved for two seconds', async () => {
  clock.install()
  render(SaveButton)
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByRole('button').textContent).toBe('Saved')
  await clock.advance(1999)
  expect(screen.getByRole('button').textContent).toBe('Saved')
  await clock.advance(1)
  expect(screen.getByRole('button').textContent).toBe('Save')
})
```

The test runs in a few milliseconds and checks the exact boundary, which a sleeping test never could.

- `clock.install(now?)` replaces timers, intervals, `requestAnimationFrame`, `Date` and `performance`. Call it **before**
  the code under test schedules anything, so usually before `render`.
- `await clock.advance(ms)` moves time forward, runs whatever came due, and flushes.
- `await clock.runAll()` runs every pending timer, and the ones they schedule, then flushes.
- The clock is uninstalled after each test. `user` actions know about it, so typing with a delay still works.

Calling `clock.advance` without `install` throws with the code T004 and says what to do.

## Shared state, with and without a UI

State made with `defineState` is app-wide: any component can import it. You can test it two ways.

To test the logic alone, `scope(handle)` makes a fresh instance with no UI:

```ts
// src/testing/cart.ts
import { defineState, derived, state } from '@weft-js/core'

export const cart = defineState('cart', () => {
  const lines = state<Record<string, number>>({})
  const count = derived(() =>
    Object.values(lines.value).reduce((a, b) => a + b, 0),
  )
  const add = (id: string) => lines.set(d => {
    d[id] = (d[id] ?? 0) + 1
  })
  const remove = (id: string) => lines.set(d => { delete d[id] })
  return { lines, count, add, remove }
})
```

```ts
// src/testing/cart.test.ts
import { scope } from '@weft-js/core/test'
import { expect, test } from 'vitest'
import { cart } from './cart'

test('count adds up every line', () => {
  const c = scope(cart)
  c.add('beans')
  c.add('beans')
  c.add('filter')
  expect(c.count.value).toBe(3)
})

test('removing a line takes its whole quantity', () => {
  const c = scope(cart)
  c.add('beans')
  c.add('beans')
  c.remove('beans')
  expect(c.count.value).toBe(0)
})
```

The test acts through the scope's own actions and asserts on `count`, a derived value. It doesn't set `lines` and read
it back: that would test the box, not your code (T003).

To start a component from a particular state, seed it with `render`'s `state` option, by scope name and key:

```tsx
// src/testing/CartBadge.test.tsx
import { render, screen } from '@weft-js/core/test'
import { expect, test } from 'vitest'
import { cart } from './cart'

function CartBadge() {
  return <p role="status">{cart.count.value} in your cart</p>
}

test('the badge counts a cart that already has things in it', () => {
  render(CartBadge, {}, {
    state: { cart: { lines: { beans: 2, filter: 1 } } },
  })
  expect(screen.getByRole('status').textContent)
    .toBe('3 in your cart')
})
```

Two more options cover persistence. `memoryStorage()` makes a store for boxes with `persist: 'memory'`; pass the same one
to two `render`s and the second sees what the first saved, which is how you test a reload or a second tab.

## Server functions, without a server

With `@weft-js/core/test` loaded, a query or mutation from `@weft-js/start` doesn't go over HTTP. It runs in the same
process through the real server executor: input validation, `auth`, tags, the cache and a JSON round trip all happen as
they would in production. What you control is the edge, through `net`:

| Call | What it does |
|---|---|
| `net.handle(fn, run)` | Replace `fn`'s body for this test, so no database is needed |
| `net.context(ctx)` | The `ctx` server functions get, such as `{ user }` |
| `net.fail(fn, error?)` | The next call of `fn` rejects. Call it again to queue more failures |
| `net.latency(ms)` | Every call waits first. Move it with the fake clock |
| `net.offline()` / `net.online()` | Calls reject with an `OfflineError`, and `online()` turns false |
| `net.calls()` | Every call so far, in order: `{ id, kind, input }` |
| `await net.settle()` | Wait until no call is in flight, then flush |

Here's a component that reads the scaffold's `listTodos` query (it has `auth: 'user'`), and its tests:

```tsx
// src/testing/OpenTodos.tsx
import { derived } from '@weft-js/core'
import { listTodos } from '../server/todos'

export function OpenTodos() {
  const todos = listTodos()
  const open = derived(() =>
    (todos.value ?? []).filter(t => !t.done).length,
  )
  return (
    todos.error
      ? <p role="alert">Sign in to see your todos.</p>
      : <p role="status">{open.value} open</p>
  )
}
```

```tsx
// src/testing/OpenTodos.test.tsx
import { net, render, screen } from '@weft-js/core/test'
import { expect, test } from 'vitest'
import { listTodos } from '../server/todos'
import { OpenTodos } from './OpenTodos'

const rows = [
  { id: '1', userId: 'u1', title: 'Milk', done: false, createdAt: 1 },
  { id: '2', userId: 'u1', title: 'Eggs', done: true, createdAt: 2 },
]

test('counts the todos that are still open', async () => {
  net.context({ user: { id: 'u1' } })
  net.handle(listTodos, () => rows)
  render(OpenTodos)
  await net.settle()
  expect(screen.getByRole('status').textContent).toBe('1 open')
})

test('a signed-out visitor is asked to sign in', async () => {
  net.context({ user: null })
  net.handle(listTodos, () => rows)
  render(OpenTodos)
  await net.settle()
  expect(screen.getByRole('alert').textContent)
    .toBe('Sign in to see your todos.')
})
```

The second test is worth a closer look. `net.handle` replaced the body, but not the guard in front of it: with no user,
the real `auth: 'user'` check refuses the call (A002), the query's `error` is set, and the component shows the message. A
mock of `listTodos` would have skipped exactly the part this test checks.

:::pitfall Mocking weft or the thing you're testing
`vi.mock('@weft-js/core')`, or mocking the component under test, makes a test check its own mock. `weft check` reports it
as T006. Fake the edges instead (the network with `net`, time with `clock`, storage with `memoryStorage`) and render the
real component.
:::

### Live data, rooms and other tabs

The same fake transport carries realtime. For a `.live()` query or a stream, render it, `await net.settle()`, then play
the server's side: `await net.push(stream, message)` delivers a message, `await net.poke('todos')` acts as if a
mutation elsewhere invalidated the tag, and `await net.drop()` cuts the connection so you can check the page reconnects.
For a room, `await net.publish(room, params, name, message)` is another user speaking, and `net.sent(room)` is what this
client sent. `tabs.post(name, message)` and `tabs.posted(name)` play another browser tab.

A real `WebSocket` or `EventSource` in a test is T013: it's slow, needs a server, and fails for reasons that have nothing
to do with your code. [Realtime and live data](/learn/live-data) covers what you'd test; the
[testing reference](/reference/testing) lists every call.

### The page around your component

`@weft-js/core/browser` gives you the page's changing values, such as `online()` and `visible()`. In a test, `page`
controls them: `page.hide()`, `page.show()`, `page.blur()`, `page.focus()`, `page.leave()`, `page.restore()` and
`page.media(query, matches)`. Each fires the real browser events, then flushes. Each test starts with the page visible,
focused and online.

After every test, `@weft-js/core/test` also checks that nothing from `@weft-js/core/browser` is still open: a listener,
an interval or a subscription that outlived its component. If one is, the test fails with T012 and says where it was
made.

## Counting work, not only results

A test that checks the right text appears can still miss a slow page. Suppose a price change in one row makes all 200
rows run again. The page looks right, so the test passes, but every keystroke now does 200 times the work.

`toTouchAtMost` catches that. It counts the DOM mutations one interaction causes, and optionally the reactive re-runs:

```tsx
// src/testing/Prices.test.tsx
import { state } from '@weft-js/core'
import { render, user, screen } from '@weft-js/core/test'
import { expect, test } from 'vitest'

const start = Array.from({ length: 50 }, (_, i) => ({
  id: i, name: `Item ${i}`, price: 10,
}))

function Prices() {
  const items = state(start)
  const cheaper = (id: number) => {
    items.value = items.value.map(p =>
      p.id === id ? { ...p, price: p.price - 1 } : p,
    )
  }
  return (
    <ul>
      {items.value.map(p => (
        <li key={p.id}>
          {p.name}: ${p.price}
          <button type="button" onClick={() => cheaper(p.id)}>
            Cheaper {p.name}
          </button>
        </li>
      ))}
    </ul>
  )
}

test('a price change touches one row', async () => {
  render(Prices)
  const button = screen.getByRole('button', {
    name: 'Cheaper Item 7',
  })
  await expect(() => user.click(button)).toTouchAtMost(1, { runs: 5 })
  expect(screen.getByText('Item 7: $9')).toBeTruthy()
})
```

If someone later writes `items.value.map(p => ({ ...p }))`, every item gets a new identity and every row re-runs. The
DOM writes stay at one, so only the `runs` budget notices. That's why the budget takes both. `touches(fn)` returns the
full count (`mutations`, `runs`, `added`, `removed`, `text`, `attributes`) if you want to look before you pick a budget.

:::deepdive Why count re-runs as well as DOM writes?
weft compiles each read of a box to its own binding. When a row's item object is replaced by an equal copy, the row's
bindings run again, compare, and find nothing to write. So the DOM barely changes, but the CPU did the work for every
row. That's the bug W014 describes: an array rebuilt with new item identities. The compiler catches it inside one file
and `weft check` follows the box into other files, but a test with a `runs` budget catches it wherever it comes from,
including from a library you don't control.
:::

## Junk tests: the T-codes

`weft check` reads your test files (by default every `*.test.*` and `*.spec.*`, or `test.include` in the config) and
reports tests that would pass whatever the code did:

| Code | What it catches | What to write instead |
|---|---|---|
| T001 | A test with no assertion, or `expect(x)` with no matcher | Assert what the user sees |
| T002 | `expect(true).toBe(true)`, or a value compared with itself | Assert on the code's output |
| T003 | `n.value = 5; expect(n.value).toBe(5)` | Act through the UI, assert what depends on it |
| T004 | Sleeps, real timers, `waitFor` | `flush()`, `clock.advance(ms)` |
| T005 | `container`, selectors, classes, `innerHTML`, test ids (a warning) | Role, label and text queries |
| T006 | Mocking `@weft-js/core` or the unit under test | Fake the edges |
| T007 | Snapshots | Assert the behaviour |
| T008 | `expect` under `if`, `?:`, `&&` or `catch`, or only inside a loop | Assert the condition, then assert unconditionally |
| T009 | `.only`, `.skip`, `fit`, `xit` left in | Remove it, or use `test.fails` for a test meant to fail |

T001 also fails at run time: a test that ends with no assertion throws, even if the assertion was hidden in a helper the
static check couldn't read.

Here's a test that collects three of them:

<!-- example: skip deliberately junk: it shows the T004, T005 and T008 that weft check reports -->
```tsx
test('coupon', async () => {
  const { container } = render(Coupon)
  await user.type(screen.getByLabelText('Coupon'), 'save10')
  await user.click(screen.getByRole('button'))
  await new Promise(r => setTimeout(r, 50))                   // T004
  const total = container.querySelector('[role=status]')       // T005
  if (total) expect(total.textContent).toContain('36')         // T008
})
```

Each one hides a way to pass while broken: the sleep may not be long enough, the selector survives a broken label, and if
the total isn't there at all the `if` skips the only assertion. The `a known code takes 10% off` test above is the same
test, written so it can fail.

When an exception is deliberate, say why on the line before:

<!-- example: skip a fragment showing the comment form -->
```tsx
// weft-allow T007: the exported SVG is the product, byte for byte
expect(exportChart()).toMatchSnapshot()
```

A `weft-allow` in the file's header comments covers the whole file; anywhere else it covers its own line and the next.

## The gate: `weft test --gate`

The T-codes judge a test by reading it. The gate judges it by running it, against your change:

```bash
weft test --gate
```

It works on the diff (your uncommitted change, or `--base <ref>`), in scratch copies, so your working tree is never
touched. Three checks:

- **T010, fail-before.** Each new or changed test has to fail on the code from before your change. A test that already
  passed before you changed anything doesn't test the change.
- **T011, mutants.** Each new test has to kill at least one mutant of the lines you changed: a flipped operator, a moved
  boundary, a changed literal, a removed call. If a test still passes when your `>=` becomes `>`, it isn't checking that
  line. Surviving mutants come back with what to assert.
- **T020, no weakening.** Deleting a test, skipping it, or loosening an assertion (`toBe(3)` to `toBeTruthy()`) needs
  `// weft-allow T020: <reason>` on it.

Mutation testing takes time, so it's sampled within a budget: `--budget <sec>` and `--max-mutants <n>`, or
`test.gate` in the config. When the mutants were sampled, T011 is a warning instead of an error. `--no-mutation` skips
it, and `--refactor` promises no behaviour change, so no test may change at all.

The gate is the last step before a change is done, for you and for an agent working in your app. Read
[Diagnostics and weft check](/learn/diagnostics) for the rest of `weft check`, and the
[verify reference](/reference/verify) for driving the running app with `weft browser`, which can also record what you do
as a test to start from.

## Testing a plugin's provider

If you write a plugin that fills a slot, such as a text measurer or a realtime bus, `@weft-js/core/test/plugins` has a
conformance suite for it: `textMeasureSuite`, `busSuite` and `listSuite`. Each returns one `{ name, ok, detail }` per
requirement of the slot, and a provider that fails one is P119. [Plugins](/learn/plugins) covers writing one.

## Recap

- `render`, `screen` and `user` from `@weft-js/core/test` mount a component and drive it by role, label and text.
- Every `user` action ends in `flush()`. Never sleep or poll: use `flush()`, and `clock.install()` with
  `clock.advance(ms)` for time.
- `scope(handle)` tests shared state with no UI; `render`'s `state` option starts a component from a given state.
- Server functions run in process through the real executor. `net.handle`, `net.context` and `net.fail` control the
  edge, so guards and validation still run.
- `toTouchAtMost(n, { runs })` turns "this stays fast" into an assertion.
- `weft check` reports junk tests (T001–T009); `weft test --gate` proves each new test fails before your change and
  catches a mutant of it.

## Try it

:::challenge Test the empty code
Pressing Apply with nothing typed should show "An empty code isn't a code we know". Write the test.
:::solution
```tsx
test('an empty code gets its own message', async () => {
  render(Coupon)
  await user.click(screen.getByRole('button', { name: 'Apply' }))
  expect(screen.getByRole('alert').textContent)
    .toBe("An empty code isn't a code we know")
})
```

It acts the way a person would (no typing, one click) and asserts the exact text, so a change to either branch of the
message fails it.
:::

:::challenge Rescue a junk test
This test passes, but `weft check` reports T003 and T005. Rewrite it so it tests the component.

<!-- example: skip the junk test the challenge asks you to fix -->
```tsx
test('save', async () => {
  const saved = state(false)
  const { container } = render(SaveButton)
  saved.value = true
  expect(saved.value).toBe(true)
  expect(container.querySelector('button')).toBeTruthy()
})
```
:::solution
```tsx
test('pressing Save says Saved', async () => {
  render(SaveButton)
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByRole('button').textContent).toBe('Saved')
})
```

The old test set its own box (not the component's) and read it back, then checked that a button exists. The new one
presses the button and checks what the user sees change.
:::

:::challenge Debounced search
This search waits 300 ms after the last keystroke before it filters. Write a test that types "os", checks the list
hasn't filtered yet after 299 ms, then has after 1 more.

<!-- example: skip the component the challenge tests; a module-level list and a timer -->
```tsx
const CITIES = ['Lisbon', 'Oslo', 'Osaka', 'Lima']

export function CitySearch() {
  const typed = state('')
  const query = state('')
  let timer: ReturnType<typeof setTimeout> | undefined
  const onInput = (text: string) => {
    typed.value = text
    clearTimeout(timer)
    timer = setTimeout(() => (query.value = text), 300)
  }
  const shown = derived(() => {
    const word = query.value.toLowerCase()
    return CITIES.filter(c => c.toLowerCase().includes(word))
  })
  return (
    <>
      <label>
        Search <input
          value={typed.value}
          onInput={e => onInput(e.currentTarget.value)}
        />
      </label>
      <ul>{shown.value.map(c => <li key={c}>{c}</li>)}</ul>
    </>
  )
}
```
:::solution
```tsx
test('filters 300 ms after the last keystroke', async () => {
  clock.install()
  render(CitySearch)
  await user.type(screen.getByLabelText('Search'), 'os')
  await clock.advance(299)
  expect(screen.getAllByRole('listitem').length).toBe(4)
  await clock.advance(1)
  const names = screen.getAllByRole('listitem')
    .map(li => li.textContent)
  expect(names).toEqual(['Oslo', 'Osaka'])
})
```

`clock.install()` comes first, before anything schedules a timer. Checking at 299 ms and again at 300 pins the delay
exactly: a test that only checks "eventually" would pass with a delay of zero.
:::

:::challenge A failed save
The scaffold's `addTodo` mutation can fail. Write a test that makes the next `addTodo` call fail and checks that the
mutation's `error` is set, without a database.
:::solution
```tsx
test('a failed add reports its error', async () => {
  net.context({ user: { id: 'u1' } })
  net.fail(addTodo, new Error('disk full'))
  await expect(addTodo({ title: 'Milk' }))
    .rejects.toThrow('disk full')
  await net.settle()
  expect((addTodo.error.value as Error).message).toBe('disk full')
})
```

`net.fail` queues one failure for the next call, so the real mutation (with its validation and guard) runs up to the
point where the body would, then rejects. A component that shows `addTodo.error.value` gets the same error.
:::
