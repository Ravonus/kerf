# Updating objects and arrays

:::learn
- Why changing an object inside a box doesn't update the page
- How to update an object or array by giving the box a new one
- How `box.set(draft => …)` copies for you, and how far it copies
- How to add, remove, replace and sort items without mutating
- How to update nested objects and one item in a list
:::

A box can hold any value: a number, a string, an object, an array. Numbers and strings can't be changed in place, only
replaced, so a write is always a new value. Objects and arrays *can* be changed in place, and that's where it goes wrong:
a box only knows about writes to `.value`, and a change made inside the object it already holds never goes through
`.value`. This page shows how to update objects and arrays so the page follows, with Kerf's `set` to save the copying.

## What counts as a change

A box hears about a change in one way: something assigns to `.value`. Then it compares the new value with the old using
`Object.is`, and only if they differ does it tell its readers.

That works for this:

```tsx
position.value = { x: 5, y: 0 }     // a new object: readers update
```

and not for this:

```tsx
position.value.x = 5            // changes the held object silently
position.value = position.value  // same object: no change
```

The second line *reads* `position.value` and then changes the object it got back. The object did change, but the box
wasn't written, so nothing on the page that shows `x` updates. The third line writes, but writes the very same object, so
the box sees no change either.

So treat any object or array in a box as read-only. To change it, make a new one and write that.

:::deepdive Why Kerf doesn't watch inside objects
Some libraries wrap your objects in a proxy that notices `obj.x = 5`. Kerf doesn't, on purpose. A box compares with one
`Object.is`, which is as cheap as a check can be, and a whole set of features rests on "a new value means a change":

- A keyed list keeps a row when its item is the same object, and updates it when the item is a new one.
- `box.get(key)` re-runs a reader only when that entry is a new value.
- A `derived` that comes out the same object stops an update there.
- `defineState`'s undo history keeps old values. If they were mutated in place, undo would have nothing to go back to.

All of these work because old values are never changed. That's the same reason React asks you to treat state as
immutable, and the same techniques apply.
:::

## Copying objects with spread

To change one field, copy the object with the spread syntax and override that field:

```tsx
person.value = { ...person.value, first: 'Barbara' }
```

`{ ...person.value }` copies every field of the old object into a new one, and `first: 'Barbara'`, written after it, wins.
The box gets a new object, so everything that reads it updates.

:::demo interact-person

The first two fields use spread. The third uses `set`, covered next. Both give the box a new object.

### One handler for many fields

With several fields, a handler per field gets repetitive. A computed key, `[field]`, lets one handler update any of them:

```tsx
import { state } from '@kerf-js/core'
import { Input } from '@kerf-js/veneer'

type Person = { first: string; last: string; email: string }

export function Form() {
  const person = state<Person>({
    first: 'Barbara',
    last: 'Hepworth',
    email: 'bhepworth@sculpture.com',
  })
  const update = (field: keyof Person, value: string) =>
    (person.value = { ...person.value, [field]: value })
  return (
    <form>
      <Input
        label="First name"
        value={person.value.first}
        onInput={e => update('first', e.currentTarget.value)}
      />
      <Input
        label="Last name"
        value={person.value.last}
        onInput={e => update('last', e.currentTarget.value)}
      />
      <Input
        label="Email"
        value={person.value.email}
        onInput={e => update('email', e.currentTarget.value)}
      />
    </form>
  )
}
```

## `set`: change a copy

Spelling out the spread every time is noisy, and for arrays the spread forms can get long. Every box has a `set` method
that does the copy for you:

```tsx
person.set(draft => {
  draft.first = 'Barbara'
})
```

`set` makes a copy of the current value, hands it to your function as `draft`, and writes the copy back to the box when
your function returns. You change the draft as if mutating were allowed, because it's a fresh object nobody else holds.

It's exactly the same as writing the spread yourself:

```tsx
person.set(d => { d.first = 'Barbara' })               // these two
person.value = { ...person.value, first: 'Barbara' } // same thing
```

For an array, the draft is a copy of the array, so the array methods that mutate are fine on it:

```tsx
todos.set(d => { d.push({ id: 4, title: 'Wash up', done: false }) })
todos.set(d => { d.sort((a, b) => a.title.localeCompare(b.title)) })
```

:::pitfall `set` copies one level
`set` copies the value in the box: the object's own fields, or the array's own items. It doesn't copy what's inside them.
Changing a nested object or an item of an array through the draft changes the *original*, which the old value still
holds:

```tsx
todos.set(d => { d[0]!.done = true }) // same item; row misses it
todos.set(d => { d[0] = { ...d[0]!, done: true } }) // new item
```

The first line gives the box a new array, so anything reading the whole array updates. But the item is the same object,
now changed, so a keyed list row showing that item keeps it, a `.get(0)` reader sees no change, and undo has lost the old
value. Replace anything below the first level you change, as in the second line.
:::

React developers may know Immer, which tracks changes at any depth with a proxy. Kerf's `set` is deliberately smaller: a
one-level copy, with no proxy and nothing to install. For the deeper levels, copy what you change.

## Updating a nested object

Objects inside objects need a copy at each level you change. Here a piece of art holds an artist, and the city is inside
the artist:

:::demo interact-nested

```tsx
piece.value = {
  ...piece.value, // copy the piece
  // Copy the artist with a new city.
  artist: { ...piece.value.artist, city: 'Paris' },
}
```

Two spreads, because two objects change: the artist gets a new city, and the piece gets a new artist. The title isn't
copied in any meaningful sense: the new piece points at the same string, which is fine, since strings can't change.

With `set`, the top level is copied for you, and you replace the nested object yourself:

```tsx
piece.set(d => { d.artist = { ...d.artist, city: 'Paris' } })
```

:::note Objects aren't really nested
`artist` isn't inside `piece` in memory. `piece` holds a reference to an artist object, and another box or variable can
hold a reference to the same one. That's why mutating it is risky: you can't see from here who else is looking at it. A
new object for each change avoids the question.

When an object is deeply nested and you change deep parts of it often, consider flattening it: keeping items in a record
keyed by id, with ids pointing at each other. [Choosing the state structure](/learn/choosing-state-structure) covers that.
:::

## Updating arrays

Arrays work the same way: give the box a new array. JavaScript has methods for both styles, so pick the ones that return a
new array:

| | Changes the array (avoid on `.value`) | Returns a new array (prefer) |
|---|---|---|
| Adding | `push`, `unshift` | `[...arr, item]`, `[item, ...arr]` |
| Removing | `pop`, `shift`, `splice` | `filter`, `slice` |
| Replacing | `splice`, `arr[i] = …` | `map` |
| Sorting | `sort`, `reverse` | copy first: `[...arr].sort()` |

Inside a `set` draft, the left column is fine: the draft is already a copy. On `.value`, use the right column.

The next three steps build a todo list, one operation at a time.

### Adding an item

Spread the old array into a new one with the item at the end:

:::demo interact-todos-step-1

```tsx
todos.value = [
  ...todos.value,
  { id: nextId++, title: draft.value, done: false },
]
```

Put the new item first, `[item, ...todos.value]`, to add at the start. To insert in the middle, slice around the place:

```tsx
const at = 1
todos.value = [
  ...todos.value.slice(0, at),
  item,
  ...todos.value.slice(at),
]
```

### Removing an item

`filter` makes a new array of the items that pass a test. To remove one todo, keep every todo that isn't it:

:::demo interact-todos-step-2

```tsx
const remove = (id: number) =>
  (todos.value = todos.value.filter(t => t.id !== id))
```

### Changing an item

To change one item, `map` over the array and return a new object for the item you're changing and the *same* object for
every other:

:::demo interact-todos-step-3

```tsx
const toggle = (id: number) =>
  (todos.value = todos.value.map(t =>
    t.id === id ? { ...t, done: !t.done } : t,
  ))
```

Returning `t` unchanged for the other items matters. The list matches rows by `key`, and a row whose item is the same
object has nothing to do. Ticking one todo updates one row.

:::pitfall Don't copy every item
`todos.value.map(t => ({ ...t, done: true }))` is right for "mark all done", since every item changes. But copying every
item when only one changed, for example `map(t => ({ ...t, done: t.id === id ? !t.done : t.done }))`, gives every item a new
identity, so every row in the list updates. The compiler reports that pattern feeding a keyed list as **W014**.
:::

### Sorting and reversing

`sort` and `reverse` change the array they're called on. Copy first:

```tsx
const sorted = [...todos.value].sort((a, b) =>
  a.title.localeCompare(b.title),
)
todos.value = sorted
```

or let `set` copy:

```tsx
todos.set(d => { d.reverse() })
```

If you only need a sorted *view* and the original order should stay, don't write it back at all. Make it a `derived`:

```tsx
const byTitle = derived(() =>
  [...todos.value].sort((a, b) => a.title.localeCompare(b.title)),
)
```

## Reading one entry of a big object

When a box holds a record keyed by id, such as stock levels or cart lines, every reader of `box.value[id]` depends on the
whole record. Change one entry and every reader re-runs. `box.get(id)` reads one entry instead, and re-runs only when
that entry is a new value:

```tsx
{stock.get(fruit)}          // re-runs when stock[fruit] changes
{stock.value[fruit]}        // re-runs when anything in stock changes
```

The updates are the same as on this page: `stock.set(d => { d[fruit] = (d[fruit] ?? 0) + 1 })`. Each entry is compared
with `Object.is`, so this is another place where replacing beats mutating. [Keyed state and entries](/learn/entries)
covers `get` in full, with the **W017** warning that suggests it.

## Recap

- A box only hears writes to `.value`, and compares with `Object.is`. Changing an object it holds is invisible.
- Treat objects and arrays in boxes as read-only: make a new one and write it.
- `{ ...obj, field: value }` copies an object with one field changed. Copy each level you change.
- `box.set(draft => …)` copies one level for you and writes the copy. Replace nested objects you change inside it.
- For arrays: spread to add, `filter` to remove, `map` to change, copy before `sort` or `reverse`.
- When changing one item, return the same object for every other item, so only one row updates (**W014**).
- `box.get(key)` reads one entry of a record, and re-runs only when that entry changes.

## Try it

:::challenge Fix the score
This scoreboard doesn't update when you press the buttons. Find the two bugs and fix them.

<!-- example: skip deliberately broken: the challenge is to find the mutations -->
```tsx
import { state } from '@kerf-js/core'
import { Button } from '@kerf-js/veneer'

export function Scoreboard() {
  const player = state({ name: 'Taylor', score: 10 })
  const plusOne = () => {
    player.value.score++
  }
  const rename = () => {
    const p = player.value
    p.name = 'Ranjani'
    player.value = p
  }
  return (
    <section>
      <p>{player.value.name}: {player.value.score}</p>
      <Button onClick={plusOne}>+1</Button>
      <Button emphasis="outline" onClick={rename}>Rename</Button>
    </section>
  )
}
```
:::solution
`plusOne` changes the object without writing the box. `rename` writes the box, but with the same object it already held,
so `Object.is` sees no change. Both need a new object:

```tsx
import { state } from '@kerf-js/core'
import { Button } from '@kerf-js/veneer'

export function Scoreboard() {
  const player = state({ name: 'Taylor', score: 10 })
  const plusOne = () => {
    player.value = { ...player.value, score: player.value.score + 1 }
  }
  const rename = () => {
    player.set(d => { d.name = 'Ranjani' })
  }
  return (
    <section>
      <p>{player.value.name}: {player.value.score}</p>
      <Button onClick={plusOne}>+1</Button>
      <Button emphasis="outline" onClick={rename}>Rename</Button>
    </section>
  )
}
```
:::

:::challenge A shopping cart
Add three things to this cart: `+` raises a product's count, `−` lowers it, and a product whose count reaches zero is
removed from the cart. Don't mutate the array.

```tsx
import { state } from '@kerf-js/core'
import { Button } from '@kerf-js/veneer'

type Line = { id: number; name: string; count: number }

export function Cart() {
  const lines = state<Line[]>([
    { id: 0, name: 'Baklava', count: 1 },
    { id: 1, name: 'Cheese', count: 5 },
    { id: 2, name: 'Spaghetti', count: 2 },
  ])
  return (
    <ul>
      {lines.value.map(l => (
        <li key={l.id}>
          {l.name} ({l.count}){' '}
          <Button size="sm">+</Button>{' '}
          <Button size="sm" emphasis="outline">−</Button>
        </li>
      ))}
    </ul>
  )
}
```
:::solution
```tsx
import { state } from '@kerf-js/core'
import { Button } from '@kerf-js/veneer'

type Line = { id: number; name: string; count: number }

export function Cart() {
  const lines = state<Line[]>([
    { id: 0, name: 'Baklava', count: 1 },
    { id: 1, name: 'Cheese', count: 5 },
    { id: 2, name: 'Spaghetti', count: 2 },
  ])
  const change = (id: number, by: number) =>
    (lines.value = lines.value
      .map(l => (l.id === id ? { ...l, count: l.count + by } : l))
      .filter(l => l.count > 0))
  return (
    <ul>
      {lines.value.map(l => (
        <li key={l.id}>
          {l.name} ({l.count}){' '}
          <Button size="sm" onClick={() => change(l.id, 1)}>
            +
          </Button>{' '}
          <Button
            size="sm"
            emphasis="outline"
            onClick={() => change(l.id, -1)}
          >
            −
          </Button>
        </li>
      ))}
    </ul>
  )
}
```

`map` makes a new object only for the line that changed, and `filter` drops any line at zero. Both return new arrays, and
the lines you didn't touch keep their identity, so their rows don't update.
:::

:::challenge Fix a nested update with set
Pressing "Finish first" changes the count at the bottom to 1, but the first checkbox stays unticked. Why, and how do you
fix it?

```tsx
import { state } from '@kerf-js/core'
import { Button, Checkbox } from '@kerf-js/veneer'

type Task = { id: number; title: string; done: boolean }

export function Tasks() {
  const tasks = state<Task[]>([
    { id: 0, title: 'Sketch', done: false },
    { id: 1, title: 'Carve', done: false },
  ])
  const finishFirst = () => {
    tasks.set(d => { d[0]!.done = true })
  }
  return (
    <section>
      {tasks.value.map(t => (
        <Checkbox key={t.id} checked={t.done}>
          {t.title}
        </Checkbox>
      ))}
      <Button onClick={finishFirst}>Finish first</Button>
      <p>{tasks.value.filter(t => t.done).length} done</p>
    </section>
  )
}
```
:::solution
`set` copies the array, but not the tasks in it. `d[0]!.done = true` changes the first task object itself, so the new
array holds the *same* task. The count reads the whole array, which is new, so it updates. The row matched by `key` has
the same item object as before, so it has nothing to do. Replace the task instead:

```tsx
import { state } from '@kerf-js/core'
import { Button, Checkbox } from '@kerf-js/veneer'

type Task = { id: number; title: string; done: boolean }

export function Tasks() {
  const tasks = state<Task[]>([
    { id: 0, title: 'Sketch', done: false },
    { id: 1, title: 'Carve', done: false },
  ])
  const finishFirst = () => {
    tasks.set(d => { d[0] = { ...d[0]!, done: true } })
  }
  return (
    <section>
      {tasks.value.map(t => (
        <Checkbox key={t.id} checked={t.done}>
          {t.title}
        </Checkbox>
      ))}
      <Button onClick={finishFirst}>Finish first</Button>
      <p>{tasks.value.filter(t => t.done).length} done</p>
    </section>
  )
}
```
:::
