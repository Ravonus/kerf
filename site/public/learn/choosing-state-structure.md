# Choosing the state structure

:::learn
- When to use one box, several boxes, or one object box
- How to avoid state that contradicts itself or repeats itself
- Why you store ids instead of copies of items
- Why you never copy a prop into state, and what to do instead
- How to flatten nested data so each row reads only its own entry
:::

Well-structured state is the difference between a component that's pleasant to change and one that keeps growing bugs.
The rules on this page are mostly the same as React's, because they're about data, not rendering. A few are weft's own:
how many boxes to use, and how to shape an object so a list reads it one entry at a time.

## Principles for structuring state

When a component holds some state, you choose how many boxes to make and what shape their values have. Any structure can
be made to work, but some make bugs easy to write. These principles help:

1. **Group related state.** If two values always change together, keep them in one box.
2. **Avoid contradictions.** If two boxes can disagree in a way that means nothing, merge them.
3. **Avoid redundant state.** If you can compute it from props or other state, it's a [derived value](/learn/derived).
4. **Avoid duplication.** If the same data is in two places, they will drift apart. Store an id.
5. **Avoid deep nesting.** Deep trees are awkward to update. Flatten them into an object keyed by id.

The goal is state you can update without making mistakes. As a database designer would put it: normalize, so each fact is
stored once.

## Group related state

A pointer position has two numbers, and they always change together. You could keep them in two boxes:

```ts
const x = state(0)
const y = state(0)
```

or in one:

```tsx
import { state } from '@weft-js/core'

export function Pointer() {
  const pos = state({ x: 0, y: 0 })
  return (
    <div style="block-size: 12rem" onPointerMove={e => (pos.value = { x: e.offsetX, y: e.offsetY })}>
      {pos.value.x}, {pos.value.y}
    </div>
  )
}
```

Both work. The second is closer to how you think about it, and one write can't update `x` and forget `y`.

### One box, many boxes, or one object box

This choice matters a little more in weft than in React, because each box is its own source of updates. Whatever reads a
box re-runs when that box gets a new value, and nothing else does. That gives you three shapes to choose from:

| Shape | A write re-runs | Good for |
|---|---|---|
| Several boxes: `state(0)`, `state('')` | only what reads that box | values that change on their own: a query, a sort order, a page number |
| One box holding an object: `state({ x, y })` | everything that reads `.value` | values that always change together |
| One object box read with `.get(key)` | only what reads that key | collections keyed by id, read one entry per row |

The third is weft's answer to a list of a thousand rows where one changes: each row reads `box.get(id)`, and a write
re-runs only the rows whose entry changed. It's the subject of [Keyed state and entries](/learn/entries).

When you're unsure, start with separate boxes. Merge them when you notice you always write them together.

:::pitfall Writing one field of an object box
Changing a field in place doesn't count as a write:

```ts
pos.value.x = 5 // nothing updates: the box still holds the same object
```

A box only notices when `.value` gets a different value (`Object.is`). Give it a new object, or use `.set`, which copies
the object one level and writes the copy for you:

```ts
pos.value = { ...pos.value, x: 5 }
pos.set(p => { p.x = 5 })
```

[Updating objects and arrays](/learn/updating-objects-and-arrays) covers this in detail.
:::

## Avoid contradictions

Here is a feedback form with two booleans:

```ts
const isSending = state(false)
const isSent = state(false)
```

Nothing stops both from being true. Every handler has to remember to set one and clear the other, and the day someone
forgets, the form shows "Sending…" and "Thanks!" at once.

Since both can't be true, replace them with one box whose type lists what can happen:

```ts
const status = state<'typing' | 'sending' | 'sent'>('typing')
```

You can still have readable names by deriving them: `const isSending = derived(() => status.value === 'sending')`. They
can't contradict each other, because they're computed from one value. [Reacting to input with
state](/learn/reacting-to-input) builds a whole form this way.

## Avoid redundant state

If you can compute a value from props or other state while the page runs, don't store it:

```ts
const first = state('')
const last = state('')
const full = state('') // redundant: every write to first or last must also write this
```

Make it a derived value instead:

```tsx
import { derived, state } from '@weft-js/core'

export function Name() {
  const first = state('')
  const last = state('')
  const full = derived(() => `${first.value} ${last.value}`.trim())
  return (
    <form>
      <input aria-label="First name" value={first.value} onInput={e => (first.value = e.currentTarget.value)} />
      <input aria-label="Last name" value={last.value} onInput={e => (last.value = e.currentTarget.value)} />
      <p>Your ticket will be issued to <b>{full.value}</b></p>
    </form>
  )
}
```

`full` can never be stale, and nothing can write it. In React you'd compute it in the body; in weft the body runs once,
so it has to be `derived` (or written inline in the JSX).

## Don't copy props into state

The most common redundant state is a prop copied into a box:

```tsx
function Message(props: { color: string }) {
  const color = state(props.color) // W005
  return <p style={`color: ${color.value}`}>Hi</p>
}
```

The box is made once, with whatever `color` was then. When the parent passes a new colour, the box doesn't follow, and
the message keeps the old one. This is the same bug as React's `useState(prop)`, and weft reports it as **W005**.

What to do depends on what you meant:

- **You only want to read it.** Read the prop. `props.color` is always current, and so is `const color = props.color`,
  which in weft is a live alias, not a copy.
- **The component should be able to change it locally**, and take the parent's value again when that changes:
  `state.linked(() => props.color)`. It follows the prop until you write to it, and resets when the prop changes.
  `let { color } = props` does the same with less ceremony; see [Passing props](/learn/passing-props).
- **You really want the first value only**, and to ignore later ones: say so with `untrack`, and name the prop so a reader
  knows it's only a starting point.

```tsx
import { state, untrack } from '@weft-js/core'

export function Counter(props: { initialCount: number }) {
  // Only the first value matters: later changes to `initialCount` are ignored, on purpose.
  const count = state(untrack(() => props.initialCount))
  return <button type="button" onClick={() => count.value++}>{count.value}</button>
}
```

:::note Server data is a prop too
The same rule holds for data from the server. Copying a query's result into `state` is **S001**: the copy goes stale on
the next refetch, and its rows lose their identity. Read the query, derive from it, and store only what's yours, such as
which row is selected. See [Loading data](/learn/loading-data).
:::

## Avoid duplication

Here a menu lets you pick a snack. The obvious way to remember the choice is to keep the chosen item:

```ts
const snacks = state<Snack[]>([...])
const chosen = state(snacks.value[0]) // a second copy of one item
```

Now the same snack is in two places. Rename it in the list, and `chosen` still holds the old object with the old name.

Store its id instead, and derive the item:

:::demo manage-selected

```ts
const chosenId = state(1)
const chosen = derived(() => snacks.value.find(s => s.id === chosenId.value))
```

The snack lives in one place, the list. The choice is a number. Renaming updates the list, and `chosen` reads the renamed
item because it looks it up each time either box changes.

## Avoid deep nesting

Imagine a travel plan as a tree: planets, then continents, then countries. Nesting each place inside its parent looks
natural, but changing one country means copying every level above it. Removing a place means finding it first.

Flatten it instead. Keep every place in one object keyed by id, and give each one the ids of its children:

```tsx
// src/lib/plan.ts
export type Place = { id: number; title: string; childIds: number[] }

export const initialPlan: Record<number, Place> = {
  0: { id: 0, title: '(root)', childIds: [1, 5] },
  1: { id: 1, title: 'Europe', childIds: [2, 3, 4] },
  2: { id: 2, title: 'Portugal', childIds: [] },
  3: { id: 3, title: 'Norway', childIds: [] },
  4: { id: 4, title: 'Greece', childIds: [] },
  5: { id: 5, title: 'Americas', childIds: [6, 7] },
  6: { id: 6, title: 'Peru', childIds: [] },
  7: { id: 7, title: 'Canada', childIds: [] },
}
```

Now each place is one entry. The tree component reads its own entry with `.get(id)`, so ticking off Greece re-runs
Greece's row and its parent's list, nothing else:

```tsx
import { derived, state, type State } from '@weft-js/core'
import { initialPlan, type Place } from '../lib/plan'

function PlaceTree(props: { id: number; plan: State<Record<number, Place>>; onDone: (parent: number, id: number) => void; parent: number }) {
  const place = derived(() => props.plan.get(props.id))
  return (
    <li>
      {place.value.title}
      <button type="button" onClick={() => props.onDone(props.parent, props.id)}>Done</button>
      <ol>
        {place.value.childIds.map(child => (
          <PlaceTree key={child} id={child} parent={props.id} plan={props.plan} onDone={props.onDone} />
        ))}
      </ol>
    </li>
  )
}

export function TravelPlan() {
  const plan = state(initialPlan)
  const done = (parent: number, id: number) =>
    plan.set(d => {
      const p = d[parent]
      if (p) d[parent] = { ...p, childIds: p.childIds.filter(c => c !== id) }
    })
  const root = derived(() => plan.get(0))
  return (
    <ol>
      {root.value.childIds.map(id => <PlaceTree key={id} id={id} parent={0} plan={plan} onDone={done} />)}
    </ol>
  )
}
```

`plan.set` copies the outer object one level, so you replace only the parent you changed. Every other place keeps its
object, and `.get` compares entries with `Object.is`, so their rows don't re-run. The removed place stays in the object,
unreachable; delete it too if memory matters.

:::deepdive How deep should an update go?
A box only sees its own `.value`. It doesn't watch the inside of objects, so there's no proxy, no deep tracking and no
cost for large values you don't change. The flip side is that you replace what changed yourself: the entry, and each
object on the way down to it.

Flat data keeps that path short: one level for `.set`, one more for the entry. If you find yourself writing
`{ ...a, b: { ...a.b, c: { ...a.b.c, d } } }`, that's the sign to flatten.
:::

## Recap

- Group values that change together. Separate the ones that don't.
- One box re-runs its readers on every write; `.get(key)` re-runs only the readers of that key.
- Replace booleans that can contradict each other with one status.
- Derive what can be computed. Don't store it.
- Don't copy a prop into `state` (W005). Read it, `state.linked` it, or `untrack` it on purpose.
- Store ids, not copies of items. Flatten nested data into an object keyed by id.

## Try it

:::challenge Fix the colour that doesn't change
The parent changes `color`, but the clock keeps the first colour. Fix it.

```tsx
function Clock(props: { color: string; time: string }) {
  const color = state(props.color)
  return <h1 style={`color: ${color.value}`}>{props.time}</h1>
}
```
:::solution
```tsx
export function Clock(props: { color: string; time: string }) {
  return <h1 style={`color: ${props.color}`}>{props.time}</h1>
}
```
The component never changes the colour, so it needs no state at all. Reading the prop keeps it current.
:::

:::challenge A packing list that counts itself
This list stores the totals in boxes and keeps them up to date by hand, and they drift. Remove the redundant state.

```ts
const items = state<{ id: number; title: string; packed: boolean }[]>([])
const total = state(0)
const packed = state(0)
```
:::solution
```tsx
import { derived, state } from '@weft-js/core'

type Item = { id: number; title: string; packed: boolean }

export function Packing() {
  const items = state<Item[]>([
    { id: 1, title: 'Passport', packed: true },
    { id: 2, title: 'Charger', packed: false },
  ])
  const packed = derived(() => items.value.filter(i => i.packed).length)
  const toggle = (id: number) =>
    (items.value = items.value.map(i => (i.id === id ? { ...i, packed: !i.packed } : i)))
  return (
    <section>
      <ul>
        {items.value.map(i => (
          <li key={i.id}>
            <label>
              <input type="checkbox" checked={i.packed} onChange={() => toggle(i.id)} /> {i.title}
            </label>
          </li>
        ))}
      </ul>
      <p>{packed.value} of {items.value.length} packed</p>
    </section>
  )
}
```
The total is `items.value.length`, and the packed count is derived. Neither can drift.
:::

:::challenge Choose many
Change the snack menu so you can choose several snacks. Store the choice so a row re-runs only when its own tick changes.
:::solution
```tsx
import { derived, state } from '@weft-js/core'

type Snack = { id: number; title: string }

export function Snacks(props: { snacks: Snack[] }) {
  // One entry per chosen id. Rows read their own entry with `.get`.
  const chosen = state<Record<number, boolean>>({})
  const count = derived(() => Object.values(chosen.value).filter(Boolean).length)
  return (
    <section>
      {props.snacks.map(s => (
        <label key={s.id}>
          <input
            type="checkbox"
            checked={chosen.get(s.id) ?? false}
            onChange={() => chosen.set(d => { d[s.id] = !d[s.id] })}
          />
          {s.title}
        </label>
      ))}
      <p>{count.value} chosen</p>
    </section>
  )
}
```
An object keyed by id holds ids, not copies of snacks, and `chosen.get(s.id)` lets each row follow only its own tick. A
`Set` would hold the ids too, but a box can't read one entry of a `Set`.
:::
