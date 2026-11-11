# App-wide state with defineState

:::learn
- How to define a named scope of state with `defineState`, and use it from any component
- How to keep all the update logic for some state in one place, without a reducer hook
- How to add undo and redo with `history`
- How to persist state through reloads, and keep it the same in every tab
- How scopes behave on the server, and what the S-codes catch
:::

Some state belongs to the whole app: the basket that the header counts and the checkout lists, the signed-in user's
preferences, the document an editor has open. Passing it down from the root would thread it through every layer, and a
[context](/learn/passing-data-deeply) is built for values that differ by subtree, not one value for everyone.
`defineState` is Kerf's tool for this: a named scope of boxes, derived values and actions that any component imports.

:::demo scope

## Defining a scope

```tsx
// src/state/basket.ts
import { defineState, derived, state } from '@kerf-js/core'

export const basket = defineState('basket', () => {
  const items = state<string[]>([])
  const count = derived(() => items.value.length)
  const add = (name: string) => (items.value = [...items.value, name])
  const clear = () => (items.value = [])
  return { items, count, add, clear }
})
```

`defineState(name, setup)` takes:

- **A name**, unique in the app. It names the scope in the dev tools, in stored data and in errors. Two scopes with one
  name throw **S009** in development.
- **A setup function** that makes ordinary boxes and derived values, and returns them along with functions that change
  them: the scope's *actions*.

The setup doesn't run when the module loads. It runs once per app, the first time something reads the scope. A scope no
page uses costs nothing.

## Using it from components

Import the scope and read it like local state:

```tsx
import { basket } from '../state/basket'

export function Header() {
  return <p>Basket ({basket.count.value})</p>
}

export function Shelf() {
  return (
    <>
      <button type="button" onClick={() => basket.add('Tea')}>
        Add tea
      </button>
      <button type="button" onClick={() => basket.add('Cake')}>
        Add cake
      </button>
    </>
  )
}
```

`basket.count.value` is a read like any other: the text in `Header` updates when `count` changes, and nothing else in
`Header` runs. There are no selectors, no `connect`, no provider at the root of the app. A component that reads one value
of a big scope follows only that value.

The handle also has a few `$` members of its own, which is why returned names can't start with `$` (S009):

| Member | Does |
|---|---|
| `basket.$name` | the scope's name |
| `basket.$reset()` | every box back to its initial value; persisted copies rewritten; history cleared |
| `basket.$snapshot()` | a frozen plain copy of the returned boxes and derived values, for logs and bug reports |
| `basket.$history` | undo and redo, when the scope has `history` (below) |

:::note A scope per feature
Make one scope per feature, in its own file: `basket`, `prefs`, `editor`. A scope that grows past about a dozen writable
boxes or fifteen actions gets a development warning, **S004**, suggesting you split it. A setup can read another scope;
two setups that read each other are a cycle, and throw S009.
:::

## Keeping the update logic in one place

React has `useReducer` for moving update logic out of event handlers into one function. Kerf has no reducer hook, and
doesn't need one. A scope's actions *are* that place: every way the state can change is a named function next to the
state, and components only call them.

:::demo manage-undo

```tsx
// src/state/board.ts
import { defineState, derived, state } from '@kerf-js/core'

export const board = defineState(
  'board',
  () => {
    const pins = state<string[]>([])
    const count = derived(() => pins.value.length)
    const pin = (city: string) => {
      if (!pins.value.includes(city))
        pins.value = [...pins.value, city]
    }
    const unpin = (city: string) =>
      (pins.value = pins.value.filter((c) => c !== city))
    const clear = () => (pins.value = [])
    return { pins, count, pin, unpin, clear }
  },
  { history: { limit: 50 } },
)
```

Read the setup and you know everything that can happen to `pins`. A component says *what happened*
(`board.pin('Oslo')`), not how the array changes. That's the benefit React's reducers give you, with ordinary functions:
TypeScript checks each action's arguments, and there's no action-type string to misspell.

### If you like reducers

Nothing stops you from writing one. A reducer is a plain function from state and an action to the next state, and it
works with any box:

```ts
// src/state/tasks.ts
export type Task = { id: number; text: string; done: boolean }
export type TaskAction =
  | { type: 'added'; id: number; text: string }
  | { type: 'changed'; task: Task }
  | { type: 'deleted'; id: number }

export function tasksReducer(
  tasks: Task[],
  action: TaskAction,
): Task[] {
  switch (action.type) {
    case 'added':
      return [
        ...tasks,
        { id: action.id, text: action.text, done: false },
      ]
    case 'changed':
      return tasks.map((t) =>
        t.id === action.task.id ? action.task : t,
      )
    case 'deleted':
      return tasks.filter((t) => t.id !== action.id)
  }
}
```

```tsx
import { state } from '@kerf-js/core'
import {
  tasksReducer,
  type Task,
  type TaskAction,
} from '../state/tasks'

export function TaskApp() {
  const tasks = state<Task[]>([])
  const dispatch = (action: TaskAction) =>
    (tasks.value = tasksReducer(tasks.value, action))
  let nextId = 0
  return (
    <section>
      <button
        type="button"
        onClick={() =>
          dispatch({ type: 'added', id: nextId++, text: 'New task' })
        }
      >
        Add
      </button>
      <ul>
        {tasks.value.map((t) => (
          <li key={t.id}>
            <label>
              <input
                type="checkbox"
                checked={t.done}
                onChange={() =>
                  dispatch({
                    type: 'changed',
                    task: { ...t, done: !t.done },
                  })
                }
              />
              {t.text}
            </label>
            <button
              type="button"
              onClick={() => dispatch({ type: 'deleted', id: t.id })}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

`dispatch` is one line. The reducer is easy to unit test, since it's pure. Use this shape if your team already thinks in
actions, or for state with many kinds of change that you want to log or replay. For most state, named actions in a scope
are shorter and say the same thing.

:::deepdive Compared with Redux, Zustand and Context with a reducer
- **Redux** keeps app state in one store, changed by dispatching actions to reducers, and read with selectors. A Kerf
  app usually has several small scopes instead of one store. Actions are functions on the scope. Selectors aren't
  needed: reads are already fine-grained, so a component that reads `basket.count.value` follows `count` and nothing
  else. Undo, which Redux apps add with a library, is the `history` option.
- **Zustand** is the closest in spirit: a `create` call that returns state and functions, imported where it's used.
  `defineState` is that, with boxes instead of a `set` function, and with persistence, tab sync and undo as options
  rather than middleware.
- **Context with `useReducer`** is React's built-in answer, and it re-renders every consumer when the value changes.
  Kerf splits the two jobs: [`context`](/learn/passing-data-deeply) for values that depend on where in the tree you are,
  and `defineState` for one shared value, with no re-rendering either way.
:::

## Undo and redo

Give the scope `{ history: { limit } }`, and it keeps a log of changes:

```tsx
import { board } from '../state/board'

export function UndoBar() {
  const history = board.$history
  return (
    <p>
      <button
        type="button"
        disabled={!history.canUndo.value}
        onClick={() => history.undo()}
      >
        Undo
      </button>
      <button
        type="button"
        disabled={!history.canRedo.value}
        onClick={() => history.redo()}
      >
        Redo
      </button>
      <small>{history.entries.value.length} steps</small>
    </p>
  )
}
```

How changes become steps:

- **Each action call is one step**, however many boxes it writes. `board.clear()` is one undo, not one per pin.
- **An action that calls another joins it.** The outer call is the step.
- **Writes outside any action** are grouped per microtask into one step named `<scope>.write`.
- **An `async` action's step is its synchronous part.** Writes after an `await` are a separate `<scope>.write` step.
- **A box with `history: false`** is left out: `state('', { history: false })` for a search query you don't want to
  undo.

`$history.entries.value` lists the steps, each with the action's name (`board.pin`) and a time. `canUndo` and `canRedo`
are derived values, so buttons can read them directly. Reading `$history` on a scope without `history` throws S009.

## Persisting through reloads

A box made inside a scope's setup can be kept in the browser:

```ts
// src/state/prefs.ts
import { defineState, state } from '@kerf-js/core'

export const prefs = defineState('prefs', () => ({
  theme: state<'light' | 'dark'>('light', { persist: 'cookie' }),
  sidebar: state(true, { persist: 'local' }),
  lastTab: state('overview', { persist: 'session' }),
}))
```

| Backend | Kept | Read by the server |
|---|---|---|
| `'local'` | in `localStorage`, until cleared | no |
| `'session'` | in `sessionStorage`, for this tab | no |
| `'cookie'` | in a cookie, a year by default (`maxAge` in seconds) | yes |
| `'memory'` | for the life of the app; tests use it | no |

The short form, `persist: 'local'`, is for strings, numbers and booleans. An object or array needs a schema, because what
comes back from storage was written by an older version of your app, or edited by hand:

```ts
// src/state/cart.ts
import { defineState, derived, state } from '@kerf-js/core'
import { z } from 'zod'

const Lines = z.record(z.string(), z.number())

export const cart = defineState(
  'cart',
  () => {
    const lines = state<Record<string, number>>(
      {},
      {
        persist: { in: 'local', schema: Lines, version: 1 },
        sync: 'tabs',
      },
    )
    const count = derived(() =>
      Object.values(lines.value).reduce((a, b) => a + b, 0),
    )
    const add = (id: string) =>
      lines.set((d) => {
        d[id] = (d[id] ?? 0) + 1
      })
    return { lines, count, add }
  },
  { history: { limit: 100 } },
)
```

Any [Standard Schema](https://standardschema.dev) library works: Zod, Valibot, ArkType. A stored value that fails the
schema is set aside, and the box starts from its initial value, so a bad entry in storage can't break the page.

### Changing the shape later

When the shape changes, bump `version` and say how to turn the old shape into the new one with `migrate`:

```ts
// src/state/reading.ts
import { defineState, state } from '@kerf-js/core'
import { z } from 'zod'

const Reading = z.object({
  theme: z.enum(['light', 'dark']),
  fontSize: z.number(),
})
type Reading = z.infer<typeof Reading>

export const reading = defineState('reading', () => ({
  options: state<Reading>(
    { theme: 'light', fontSize: 16 },
    {
      persist: {
        in: 'local',
        schema: Reading,
        version: 2,
        // Version 1 stored only `{ dark: boolean }`.
        migrate: {
          1: (old: { dark: boolean }) => ({
            theme: old.dark ? 'dark' : 'light',
            fontSize: 16,
          }),
        },
      },
    },
  ),
}))
```

`migrate[1]` turns version 1 into version 2. A value stored at version 1 runs through each step up to the current one,
then the schema.

:::pitfall `persist` only works inside a scope
`persist` and `sync` are options of a box made inside a `defineState` setup. On a box in a component or a module, they
do nothing. The scope gives the stored value its key, `kerf:<app>:<scope>.<box>`, which is why a persisted box must be
returned from the setup or given a `name: '…'`. Persisting an object without a schema, or a box with neither a returned
key nor a `name`, throws **S008** in development.
:::

## The same in every tab

Add `sync: 'tabs'` to a persisted box, as the cart above does, and every tab of the browser sees the same value. Add a
tea in one tab, and the other tab's basket counts it.

- It needs `persist`, because a tab opened later starts from what was stored, and it can't be `'session'`, which is per
  tab (S008).
- For a plain object, each tab sends only the keys it changed, and the newest write wins key by key. Two tabs adding
  different products to the cart both keep their product.
- A write from another tab must pass the box's schema, because that tab may be running an older deploy. One that doesn't
  is dropped.
- A write that arrives from another tab doesn't go into this tab's undo history.

[Hover, focus and shared UI state](/learn/ui-state#other-ui-state-the-same-in-every-tab) uses the same option for
lasting UI state, like a collapsed sidebar.

## SSR and cookies

On the server, every request gets its own copy of every scope, made fresh for that render. One visitor's basket can
never appear on another's page.

- **Reach a scope during a render**: in a component, a handler or a `derived`. Reaching one outside a render on the
  server, such as at module level, in a route's `load`, in a server function or a timer, would share it between every
  request, so it throws **S002**. Pass values into server code as arguments instead.
- **What the server changed travels with the page.** Boxes the server render left different from their initial value
  are sent with the HTML, so the browser starts from the same state. Keep them plain data: ids, numbers, strings. A
  `Date`, a `Map` or a class instance can't make the trip, and is reported in development as S010.
- **`cookie` boxes render right the first time.** `@kerf-js/start` hands the request's cookies to the render, so a theme
  persisted to a cookie is in the server's HTML.
- **`local` and `session` boxes render their initial value on the server**, which can't see the browser's storage. After
  hydration the stored value arrives, and the page may flash. Reading one in a server render is **S013**. Use a cookie
  for small values the first paint depends on, or show that part on the client only.

## Testing a scope

`scope(handle)` from `@kerf-js/core/test` makes a fresh instance of a scope with no UI, so tests don't share state:

```ts
import { scope } from '@kerf-js/core/test'
import { expect, test } from 'vitest'
import { cart } from '../state/cart'

test('adding counts up, and undo takes it back', () => {
  const c = scope(cart)
  c.add('tea')
  c.add('tea')
  expect(c.count.value).toBe(2)
  c.$history.undo()
  expect(c.count.value).toBe(1)
})
```

For a component test, `render(App, props, { state })` seeds scopes with starting values, and `storage` shares a
`memoryStorage()` between renders to test a reload. See [Testing](/learn/testing).

## Where server data goes

A scope holds *client* state: what the user has chosen, typed, or arranged. Data that lives on a server, such as the
product list or the user's orders, belongs in a query, which caches, refetches and stays in step with the server.
Copying a query's rows into a scope's box is **S001**: the copy goes stale. Keep ids in the scope and look the rows up in
the query. See [Loading data](/learn/loading-data).

## Recap

- `defineState(name, setup, options?)` makes a named scope. The setup runs once per app, on first use.
- Components import the scope, read `.value`, and call its actions. Reads are fine-grained: no selectors.
- Actions keep update logic in one place. Kerf has no `useReducer`; a reducer is an ordinary function if you want one.
- `{ history: { limit } }` gives `$history` with undo and redo, one step per action.
- `persist` keeps a box through reloads (`local`, `session`, `cookie`, `memory`); objects need a schema, and shape
  changes need `version` and `migrate`.
- `sync: 'tabs'` keeps a persisted box the same in every tab.
- On the server, scopes are per request (S002 outside a render); cookies render right, `local` doesn't (S013).

## Try it

:::challenge Empty the basket from the header
Add a `clear` action to a basket scope, and a button in a header component that calls it. The button should be off when
the basket is empty.
:::solution
```tsx
import { defineState, derived, state } from '@kerf-js/core'

const shop = defineState('shop', () => {
  const items = state<string[]>([])
  const count = derived(() => items.value.length)
  const add = (name: string) => (items.value = [...items.value, name])
  const clear = () => (items.value = [])
  return { items, count, add, clear }
})

export function Header() {
  return (
    <header>
      Basket ({shop.count.value})
      <button
        type="button"
        disabled={shop.count.value === 0}
        onClick={() => shop.clear()}
      >
        Empty
      </button>
    </header>
  )
}
```
The header doesn't know how the basket is stored. It calls an action, and reads a derived value.
:::

:::challenge A theme the server renders
Keep a light or dark theme that survives reloads, and that the server can put in the page's HTML so it never flashes.
Add a component that toggles it.
:::solution
```tsx
import { defineState, state } from '@kerf-js/core'

const look = defineState('look', () => ({
  theme: state<'light' | 'dark'>('light', { persist: 'cookie' }),
}))

export function ThemeToggle() {
  const flip = () =>
    (look.theme.value =
      look.theme.value === 'light' ? 'dark' : 'light')
  return (
    <div data-theme={look.theme.value}>
      <button type="button" onClick={flip}>
        {look.theme.value === 'light' ? 'Dark' : 'Light'} mode
      </button>
    </div>
  )
}
```
A cookie goes to the server with every request, so the server renders the right theme. `local` would render `light`
first and switch after hydration (S013).
:::

:::challenge One undo step for a whole move
A board scope with history has `remove(city)` and `insert(city, at)`. Moving a pin calls both, and takes two undos to
reverse. Make a move one step.
:::solution
```tsx
import { defineState, state } from '@kerf-js/core'

export const route = defineState(
  'route',
  () => {
    const stops = state<string[]>(['Lisbon', 'Porto', 'Faro'])
    const remove = (city: string) =>
      (stops.value = stops.value.filter((c) => c !== city))
    const insert = (city: string, at: number) =>
      (stops.value = [
        ...stops.value.slice(0, at),
        city,
        ...stops.value.slice(at),
      ])
    const move = (city: string, at: number) => {
      remove(city)
      insert(city, at)
    }
    return { stops, remove, insert, move }
  },
  { history: { limit: 50 } },
)
```
Each call from outside the scope is one step, and actions called inside another join it. `route.move('Faro', 0)` is one
undo.
:::

:::challenge Test the cart
Write a test for a cart scope: adding two different products gives a count of two, and `$reset()` empties it.
:::solution
```ts
import { scope } from '@kerf-js/core/test'
import { expect, test } from 'vitest'
import { cart } from '../state/cart'

test('count and reset', () => {
  const c = scope(cart)
  c.add('tea')
  c.add('cake')
  expect(c.count.value).toBe(2)
  c.$reset()
  expect(c.count.value).toBe(0)
})
```
`scope` gives each test its own instance, so tests don't see each other's cart.
:::
