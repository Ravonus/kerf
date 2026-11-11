# How an update reaches the DOM

:::learn
- What happens between writing `.value` and the page changing
- What the compiler turns your JSX into, and why nothing re-renders
- Why a read right after a write sees the new value
- When the DOM catches up, and how `flush()`, `batch()` and `untrack()` fit in
:::

In React, a state change asks React to render your component again: it calls your function, compares the new JSX with the
old, and commits the difference to the DOM. Most of React's chapter on interactivity is about the consequences: render and
commit, state as a snapshot, queueing updates. Kerf takes a different path, and this page follows it from one write to
the DOM. It's short, and once you've seen it most of Kerf's behaviour stops being surprising.

## Three steps from a write to the page

When a handler writes `count.value = 1`:

1. **The box changes, now.** It stores the new value at once. Then it marks everything that read it: `derived` values that
   used it are marked stale, and the bits of DOM that showed it are put in a queue.
2. **The queue runs once, soon.** On the next microtask, after your handler and anything else running with it has
   finished, Kerf runs the queued bindings in the order they were created. Each one reads its expression again and writes
   its own DOM node: one text, one attribute, one class.
3. **Derived values recompute when read.** A stale `derived` doesn't run on its own. It recomputes the next time
   something reads it, which is usually one of those bindings.

Nothing in that list calls your component. It ran once, when it was created, to build its DOM and set up the bindings.
After that, the bindings are what update.

You can watch this happen. Each line below is a `derived` that counts how many times it ran:

:::demo interact-runs

Adding an apple runs the apple line and nothing else. The pear line didn't read `apples`, so the write never reached it.
And setting apples to 5 a second time runs nothing at all: the write compared 5 with 5 using `Object.is`, found nothing
changed, and stopped there.

## What the compiler makes of your JSX

The pieces that update are made by the compiler. Take this component:

```tsx
import { state } from '@kerf-js/core'

export function Counter() {
  const count = state(0)
  return (
    <p class={count.value > 9 ? 'big' : 'small'}>
      Clicked {count.value} times
      <button type="button" onClick={() => count.value++}>+1</button>
    </p>
  )
}
```

Kerf's compiler turns it into something like this. The real output uses generated names, and its helpers are internal,
but the shape is the same:

```js
// Parsed once per module and cloned for each Counter.
const template = tpl(
  '<p>Clicked <!> times<button type="button">+1</button></p>',
)

export function Counter() {
  const count = state(0)
  const p = template()
  const marker = p.firstChild.nextSibling
  const button = p.lastChild
  // One binding per element's dynamic attributes.
  bind(
    () => (count.value > 9 ? 'big' : 'small'),
    (value, prev) => cls(p, value, prev),
  )
  // One binding per dynamic child: text before the marker.
  child(p, () => count.value, marker)
  // The handler is on the element; one listener serves clicks.
  button.$$click = () => count.value++
  return p
}
delegate(['click'])
```

Every `{…}` in your JSX became a small function, and each one is a reader of the boxes it touches. When `count` changes,
the `child` binding reads `count.value` again and replaces one text node's content. The `class` binding reads its
expression again, and writes the attribute only if the result changed. The `<p>`, the button and the words around the
number were made once, from the template, and are never touched again.

That is why Kerf has no virtual DOM and no diffing step for ordinary updates. Each binding already knows which node it
owns. (Lists are the one place that compares: a keyed list matches rows by `key`, so it can move, add and remove rows
rather than rebuild them. See [Rendering lists](/learn/rendering-lists).)

:::deepdive Push, then pull
Kerf's graph is *push-pull*. A write pushes a mark through everything downstream: direct readers are marked dirty, and
their readers are marked "check". Nothing is computed during the push. Then the flush pulls: each queued binding asks its
sources whether they really changed, and a `derived` marked "check" recomputes only if one of its own sources did.

This matters when a `derived` comes out the same. Say `isEven` is `derived(() => count.value % 2 === 0)`, and a label reads
`isEven.value`. Writing `count.value` from 2 to 4 marks both. During the flush, `isEven` recomputes, gets `true` again, and
since that's `Object.is` the old value, the label is never run. Work stops at the first value that didn't change.

The order is fixed too: queued work runs in creation order, so a parent's bindings run before its children's, and a
binding never sees a half-updated parent.
:::

## Reads after writes see the new value

Because the box changes at once, the next line of your handler already sees the new value. There is no snapshot:

:::demo interact-three

```tsx
score.value = score.value + 1   // 1
score.value = score.value + 1   // 2
score.value = score.value + 1   // 3
```

Each line reads what the line before it wrote, so pressing +3 adds three.

In React, the same three calls to `setScore(score + 1)` add one: `score` is that render's snapshot, fixed at the value it
had when the render ran, so all three calls ask for the same number. React's answer is an updater function,
`setScore(s => s + 1)`, which is queued and applied in order. Kerf needs neither: there is no snapshot to work around,
and no queue of updates to reason about. A box is a place, and `score.value` is what's in it now.

The same holds for `derived`. A derived value read after a write in the same handler recomputes on that read and gives
you the up-to-date answer, even though the DOM hasn't been updated yet:

```tsx
import { derived, state } from '@kerf-js/core'
import { Button } from '@kerf-js/veneer'

export function Basket() {
  const qty = state(1)
  const total = derived(() => qty.value * 12)
  const addTwo = () => {
    qty.value += 2
    // 36: computed on this read, from the new qty
    console.log(total.value)
  }
  return <Button onClick={addTwo}>Add two ({total.value})</Button>
}
```

:::note A handler sees values, not the page
A handler can see a box change from one line to the next, but it doesn't control when the *page* shows it. That's the
next section.
:::

## The page catches up after your handler

Writes are batched. However many boxes you write in a handler, and however many times, the DOM is updated once, after the
handler returns, in a single pass. That pass runs on the next microtask: before the browser paints, and before any timer.

Usually you never notice. But code that reads the DOM in the handler, right after a write, sees the page as it was:

:::demo interact-flush

`count.value` is the new number at once. The `<strong>` still shows the old one until `flush()`. `flush()` from
`@kerf-js/core` runs the queue now, so the DOM matches your boxes before the next line.

You need it when the DOM itself is what you want next: focusing or scrolling to an element that a write just showed, or
measuring one that a write just changed.

```tsx
import { flush, state } from '@kerf-js/core'
import { Button, Input } from '@kerf-js/veneer'

export function Rename() {
  const editing = state(false)
  let field: HTMLInputElement | undefined
  const start = () => {
    editing.value = true
    flush()            // the input exists now
    field?.focus()
  }
  return (
    <div>
      {editing.value
        ? <Input
          label="Name"
          ref={(el: HTMLInputElement) => (field = el)}
        />
        : <Button onClick={start}>Rename</Button>}
    </div>
  )
}
```

Without `flush()`, `field` would still be `undefined`: the input is only made when the queue runs.

:::pitfall Each await is its own batch
The batch ends when your handler stops running, and an `await` stops it. Writes before an `await` are flushed while you
wait; writes after it form a new batch. That's usually what you want, since a "Saving…" message should show while the
save is running.
:::

### `batch()`

`batch(fn)` runs `fn` and returns what it returned. It changes nothing: writes are always batched until the flush. It
exists so code ported from libraries where batching is opt-in can say so at the call, and so a reader of your code knows
the writes inside belong together:

```tsx
import { batch, type State } from '@kerf-js/core'

export function rename(
  name: { first: State<string>; last: State<string> },
  first: string,
  last: string,
) {
  batch(() => {
    name.first.value = first
    name.last.value = last
  })
}
```

If you want one change to be a single step in undo history, that's what an action in [`defineState`](/learn/app-wide-state)
is for: each action call is one transaction.

## Reading without subscribing: `untrack()`

Every `.value` read inside JSX, a `derived` or a `watch` source subscribes. Now and then you want the value without the
subscription: "use the unit as it is now, but don't recompute when it changes". Wrap that read in `untrack`:

```tsx
import { derived, state, untrack } from '@kerf-js/core'

export function makeReading() {
  const celsius = state(20)
  const label = state('Kitchen')
  // Recomputes on temperature changes; reads label untracked.
  const line = derived(() =>
    `${untrack(() => label.value)}: ${celsius.value} °C`,
  )
  return { celsius, label, line }
}
```

Use it sparingly. Something that should update when a box changes should read it normally. `untrack` in a component body
whose result only the JSX reads renders the value from setup time and never updates; the compiler warns about that with
**W018**. Handlers don't need `untrack`: they aren't readers, so nothing they read subscribes.

## Where your code runs, and how often

Putting it together, each piece of a component runs at its own time:

| Code | Runs |
|---|---|
| The component body | Once, when the component is created |
| A `{…}` in JSX, an attribute | Once to build, then again when a box it read changes |
| `derived(() => …)` | When read, if a box it read changed since its last run |
| `watch(() => source, act)` | Once now, then when `source` changes |
| A handler | When the event happens. Never because state changed |
| `onMount(fn)` | Once, after the component's DOM is in place |

This table is the reason for most of Kerf's rules. A value computed in the body is computed once and goes stale, so it
belongs in `derived` (**W001**). An early `return` that depends on state is checked once
(**W040**), so the branch belongs in JSX. A `let` counter changes but nothing re-reads it (**W041**). Each rule is the table, applied.

:::deepdive Counting runs in a test
`@kerf-js/core/test` can count the reactive work an interaction does. `touches(fn)` reports the DOM mutations and the runs
one interaction caused, and `toTouchAtMost(n, { runs })` turns that into an assertion, so a change that makes every row
of a list re-run fails a test instead of slowing the app down later:

```tsx
await expect(() => user.click(screen.getByRole('button')))
  .toTouchAtMost(1, { runs: 2 })
```

See [Testing](/reference/testing).
:::

## Recap

- A write stores the value at once, marks its readers and queues the DOM bindings that read it.
- The queue runs once, on the next microtask, in creation order. Each binding updates the one node it owns.
- The component body never runs again. There's no re-render and no diff, except matching rows by `key` in lists.
- A write that's `Object.is` the old value does nothing; a `derived` that comes out the same stops the update there.
- Reads after a write see the new value, `derived` included. There is no snapshot and no need for updater functions.
- The DOM catches up after the handler. `flush()` brings it up to date now, for focus, scroll or measuring.
- `batch()` only names a batch that was happening anyway. `untrack()` reads without subscribing.

## Try it

:::challenge Predict the output
What does this handler log, and what does the page show after the click?

```tsx
import { derived, state } from '@kerf-js/core'
import { Button } from '@kerf-js/veneer'

export function Quiz() {
  const n = state(0)
  const double = derived(() => n.value * 2)
  const go = () => {
    n.value = 5
    n.value = n.value + 1
    console.log(n.value, double.value)
  }
  return (
    <Button onClick={go}>
      {n.value} doubled is {double.value}
    </Button>
  )
}
```
:::solution
It logs `6 12`, and the button shows "6 doubled is 12".

The second line reads 5, the value the first line wrote, and writes 6. Reading `double.value` recomputes it from the new
`n`. The page goes from "0 doubled is 0" straight to "6 doubled is 12": the 5 was never drawn, because the DOM is updated
once, after the handler.
:::

:::challenge Focus the new item
This list adds an item and should then focus its field, but the focus goes nowhere. Fix it.

```tsx
import { state } from '@kerf-js/core'
import { Button, Input } from '@kerf-js/veneer'

export function Packing() {
  const items = state<{ id: number; name: string }[]>([])
  let last: HTMLInputElement | undefined
  const add = () => {
    items.value = [
      ...items.value, { id: items.value.length, name: '' },
    ]
    last?.focus()
  }
  return (
    <section>
      {items.value.map(item => (
        <Input
          key={item.id}
          label={`Item ${item.id + 1}`}
          ref={(el: HTMLInputElement) => (last = el)}
        />
      ))}
      <Button onClick={add}>Add an item</Button>
    </section>
  )
}
```
:::solution
The new row is only made when the queue runs, after `add` returns, so `last` still points at the previous field (or at
nothing). Call `flush()` before focusing:

```tsx
import { flush, state } from '@kerf-js/core'
import { Button, Input } from '@kerf-js/veneer'

export function Packing() {
  const items = state<{ id: number; name: string }[]>([])
  let last: HTMLInputElement | undefined
  const add = () => {
    items.value = [
      ...items.value, { id: items.value.length, name: '' },
    ]
    flush()
    last?.focus()
  }
  return (
    <section>
      {items.value.map(item => (
        <Input
          key={item.id}
          label={`Item ${item.id + 1}`}
          ref={(el: HTMLInputElement) => (last = el)}
        />
      ))}
      <Button onClick={add}>Add an item</Button>
    </section>
  )
}
```

`flush()` makes the new row, its `ref` runs and sets `last`, and the focus lands on the new field.
:::

:::challenge A counter that adds three
In React, this button adds one per click, not three. Write the Kerf version that adds three, and explain why the React
version doesn't.

```tsx
// React
const [count, setCount] = useState(0)
<button onClick={() => {
  setCount(count + 1)
  setCount(count + 1)
  setCount(count + 1)
}}>+3</button>
```
:::solution
```tsx
import { state } from '@kerf-js/core'
import { Button } from '@kerf-js/veneer'

export function Plus() {
  const count = state(0)
  const addThree = () => {
    count.value++
    count.value++
    count.value++
  }
  return <Button onClick={addThree}>{count.value} +3</Button>
}
```

In React, `count` is that render's snapshot, so each call asks for the same `count + 1`. In Kerf each `count.value++`
reads the box as the line before left it. The page still updates once, after the handler, and shows the total.
:::
