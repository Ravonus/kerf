# State (`@kerf-js/core`)

Every reactive function in one place. The rules for using them are `kerf docs rules`; props are `kerf docs props`.

```tsx
import {
  derived,
  flush,
  onCleanup,
  onMount,
  state,
  watch,
} from '@kerf-js/core'

export function Counter() {
  const count = state(0)
  const label = derived(() => `Clicked ${count.value} times`)
  let input: HTMLInputElement | undefined

  watch(() => label.value, text => {
    document.title = text
    return () => (document.title = 'App')
  })
  onMount(() => input?.focus())
  onCleanup(() => console.log('Counter removed'))

  const reset = () => {
    count.value = 0
    flush()           // the DOM shows 0 now, before the focus below
    input?.select()
  }
  return (
    <p>
      <button type="button" onClick={() => count.value++}>
        {label.value}
      </button>
      <input
        ref={(n: HTMLInputElement) => (input = n)}
        aria-label="Note"
      />
      <button type="button" onClick={reset}>Reset</button>
    </p>
  )
}
```

## Boxes and derived values

| Call | Gives |
|---|---|
| `state(init, options?)` | A box: read and write `.value`. A write that is `Object.is` the old value does nothing |
| `box.set(d => { d.x = 1 })` | Updates a copy: arrays and objects are copied one level, then written as a new value |
| `box.get(key)` | One entry of an object box. The reader re-runs only when that entry changes (W017) |
| `state.linked(() => source, { key? })` | A box that follows `source` until written. With `key`, an edit holds while the key stays, and `.conflict.value` says when the source moved under it |
| `derived(() => …)` | A read-only value, computed when read and cached until what it read changes |

`get`, `set` and `state.linked` come from `@kerf-js/core/keyed`. The main entry and the kerf() Vite plugin bring it in
when a module uses them, so you only import it yourself when the name is built at run time (`box[name]`).

Writes are batched: effects and DOM updates run together on the next microtask. `flush()` runs them now, for example
before `focus()` on an element a write just showed. `batch(fn)` runs `fn` and exists only to say this at the call.

## Effects and owners

- `watch(() => source, (value, prev) => cleanup?)`: runs `act` now and whenever `source` changes. Only `source` is
  tracked. A returned function runs before the next run and when the owner goes.
- `onMount(fn)`: runs once the component's DOM is in place and refs are set. Never on the server.
- `onCleanup(fn)`: runs when the owner (a component, a `createRoot`, a list row) is disposed.
- `untrack(() => …)`: reads without subscribing. The result never updates (W018 if only JSX reads it).
- `createRoot(dispose => …)`: an owner that outlives its caller, ended by `dispose()`.
- `context(fallback)`: `ctx.provide(value, () => …)` sets a value for everything created inside; `ctx.use` reads the
  nearest one.

## Shared state: `defineState`

A named scope of state that any component can import. Its setup runs once per app, the first time it's used, and
returns boxes, derived values and actions. Each action call is one transaction and one undo step.

```ts
import { defineState, derived, state } from '@kerf-js/core'
import { z } from 'zod'

export const cart = defineState('cart', () => {
  const lines = state<Record<string, number>>({}, {
    persist: {
      in: 'local',
      schema: z.record(z.string(), z.number()),
      version: 1,
    },
    sync: 'tabs',
  })
  const count = derived(() =>
    Object.values(lines.value).reduce((a, b) => a + b, 0),
  )
  const add = (id: string) => lines.set(d => {
    d[id] = (d[id] ?? 0) + 1
  })
  return { lines, count, add }
}, { history: { limit: 100 } })
```

Read it as `cart.count.value` and call `cart.add('p1')`. The handle also has `$name`, `$reset()` (every box back to
its initial value), `$snapshot()` (a plain copy) and, with `history`, `$history`: `undo()`, `redo()`, `clear()`,
`canUndo`, `canRedo` and `entries`.

`state` options inside a setup:

| Option | Does |
|---|---|
| `persist: 'local' \| 'session' \| 'cookie' \| 'memory'` | Keeps the box through reloads. The short form takes a primitive `init` only |
| `persist: { in, schema, version, migrate, maxAge }` | Objects and arrays need a Standard Schema (Zod, Valibot, ArkType). `migrate` maps old versions; `maxAge` is for cookies, in seconds |
| `sync: 'tabs'` | The same value in every tab. Needs `persist`, and not `'session'` |
| `history: false` | Leaves the box out of undo |
| `name` | The box's name in its scope. A persisted box the setup doesn't return needs one |

Misuse throws a `StateError` in dev with a code and a fix: S008 (persistence or sync set up wrongly), S009 (two
scopes with one name, a reserved `$` key, or `$history` without `history`). `kerf check` reports S001 (server data
copied into `state`) and S012 (`state.linked` over a query with no `key`). On the server, a scope is per request:
reaching one outside a render is S002, and reading a `local` or `session` box there shows `init` (S013).

In tests, `scope(cart)` from `@kerf-js/core/test` makes a fresh instance with no UI, and `render(App, props, { state,
storage })` seeds scopes and shares storage between renders: `kerf docs testing`.
