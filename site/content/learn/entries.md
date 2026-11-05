# Keyed state and entries

:::learn
- How a row reads only its own entry with `box.get(key)`
- How `box.set(…)` writes one entry
- How to pass an object box to row components
- Why replacing only the item that changed keeps a long list fast
- Where a row's own state lives, and how long it lasts
:::

On [Choosing the state structure](/learn/choosing-state-structure) you flattened data into an object keyed by id. That
shape has a second benefit in weft: a row can read *one entry* of the object, and then only a change to that entry
re-runs it. A list of a thousand products where you add one to the basket does one row's worth of work, not a thousand.

:::demo entries

## Reading one entry with `get`

Here's the stock list above in code:

```tsx
import { state } from '@weft-js/core'

const FRUIT = ['apple', 'pear', 'plum']

export function Stock() {
  const stock = state<Record<string, number>>({
    apple: 3,
    pear: 0,
    plum: 7,
  })
  const restock = (fruit: string) =>
    stock.set((d) => {
      d[fruit] = (d[fruit] ?? 0) + 1
    })
  return (
    <ul>
      {FRUIT.map((f) => (
        <li key={f}>
          {f}: {stock.get(f)}
          <button type="button" onClick={() => restock(f)}>
            +1
          </button>
        </li>
      ))}
    </ul>
  )
}
```

There are two ways a row could read its count:

```tsx
{stock.get(f)}     // re-runs when stock[f] changes
{stock.value[f]}   // re-runs when anything in stock changes
```

Both show the same number. The difference is what they *follow*. `stock.value` reads the whole box, so every row depends
on the whole object, and one write re-runs all of them. `stock.get(f)` reads one entry, so the row depends on that entry
alone, compared with `Object.is`. Adding a pear re-runs the pear row and nothing else.

In a list of three, you'd never notice. In a table of five hundred live prices, it's the difference between one DOM write
and five hundred re-runs that each find nothing to change. The compiler warns when a list row reads one entry of a whole
object (`stock.value[f]`, or `cart[p.id]` from a prop) as **W017**, and has an autofix to `.get`.

:::note Where `get` and `set` come from
`.get` and `.set` live in `@weft-js/core/keyed`. You don't import it: the weft Vite plugin adds it to any module that
calls them, so an app that never uses them doesn't ship them. If you build the method name at run time
(`box[name]`), the plugin can't see it, and you import `@weft-js/core/keyed` yourself.
:::

## Writing one entry with `set`

`box.set(update)` copies the value one level, hands the copy to `update` to change, and writes it back as a new value:

```ts
stock.set((d) => {
  d.pear = 5
}) // one entry
stock.set((d) => {
  d.kiwi = 1
}) // a new entry
stock.set((d) => {
  d.apple = (d.apple ?? 0) - 1
}) // from its old value
```

It's the same as writing `stock.value = { ...stock.value, pear: 5 }`, in a form that's harder to get wrong. After the
write, weft compares the entries that `get` readers are following. Only those whose value changed re-run.

`set` works on arrays too: `list.set(d => { d.push(item) })` copies the array, pushes, and writes the copy.

:::pitfall `set` copies one level only
`set` copies the outer object, not the objects inside it. Changing a field of an entry in place changes the old entry
too, and its `get` readers see the same object as before, so they don't re-run:

```ts
cart.set((d) => {
  d.p1!.qty++
}) // wrong: the entry is the same object
cart.set((d) => {
  d.p1 = { ...d.p1!, qty: d.p1!.qty + 1 }
}) // right: a new entry
```

Replace the entry you change. Keep entries small and flat, a number or a small object, and this stays short.
:::

## Passing the box to a row

Rows are usually components. To let a row read its own entry, pass it the box, typed `State<…>`, and read `.get(id)` in
the row:

:::demo manage-rows

```tsx
import { derived, state, type State } from '@weft-js/core'

type Product = { id: string; name: string }

function Line(props: {
  product: Product
  cart: State<Record<string, number>>
}) {
  const { product, cart } = props
  const qty = derived(() => cart.get(product.id) ?? 0)
  const add = () =>
    cart.set((d) => {
      d[product.id] = qty.value + 1
    })
  return (
    <li>
      {product.name}: {qty.value}
      <button type="button" onClick={add}>
        +1
      </button>
    </li>
  )
}

export function Cart(props: { products: Product[] }) {
  const { products } = props
  const cart = state<Record<string, number>>({})
  const count = derived(() =>
    Object.values(cart.value).reduce((a, b) => a + b, 0),
  )
  return (
    <section>
      <h2>{count.value} items</h2>
      <ul>
        {products.map((p) => (
          <Line
            key={p.id}
            product={p}
            cart={cart}
          />
        ))}
      </ul>
    </section>
  )
}
```

If you passed `qty={cart.value[p.id]}` instead, the parent's list would read the whole cart for every row, and a change
to one product would re-run them all (W017 again). Passing the box is how the row gets the box's per-entry reads. This is
one of the two reasons to pass a box down rather than a value: the other is to let the child write it.

The heading reads `cart.value`, the whole object, because a total depends on every entry. That's right: it re-runs on
every change, once, and the rows don't.

## Keep list items stable

The other half of a fast list is item identity. A keyed list keeps one row per key, and when the item under a key is a
new object, it updates that row in place. So for an array of objects, replace only the item that changed:

```ts
products.value = products.value.map((p) =>
  p.id === id ? { ...p, price } : p,
)
```

Copying every item, `products.value.map(p => ({ ...p, price }))`, gives each one a new identity, so every row re-runs,
even the ones whose price didn't change. That's **W014**. The compiler catches it inside one file, and `weft check`
follows the box through props into other files to find it there.

## State lives with the row

Each row in a keyed list is a component instance made once for its key. State the row makes for itself lives with that
instance:

:::demo manage-keep

```tsx
import { state } from '@weft-js/core'

type Guest = { id: number; name: string }

function GuestRow(props: { guest: Guest }) {
  const { guest } = props
  const note = state('')
  return (
    <label>
      {guest.name}
      <input
        value={note.value}
        onInput={(e) => (note.value = e.currentTarget.value)}
      />
    </label>
  )
}

export function Guests() {
  const guests = state<Guest[]>([
    { id: 1, name: 'Ana' },
    { id: 2, name: 'Ben' },
  ])
  return (
    <section>
      {guests.value.map((g) => (
        <GuestRow key={g.id} guest={g} />
      ))}
      <button
        type="button"
        onClick={() => (guests.value = [...guests.value].reverse())}
      >
        Reverse
      </button>
    </section>
  )
}
```

The rules are short:

- **A key keeps its row.** Reorder the list, and each row moves, with its state and its DOM, focus and typed text
  included. Nothing is rebuilt.
- **A new item under the same key updates the row.** Rename Ana (a new object with `id: 1`), and her row's
  `guest.name` changes in place. Her note stays.
- **A key that leaves takes its row with it.** Remove Ana, and her row is disposed of, with its note. Add her back, and
  she gets a new row with an empty note.

That's weft's version of React's "preserving and resetting state" for lists, and the reason `key` matters: it says which
row is which. A missing key on a list of objects is **W010**. Over plain strings or numbers, the value is the key.

:::deepdive Row state, or an object box in the parent?
The note above is the row's own state, which is right for something only the row cares about: whether its menu is open,
what's typed in it before saving.

When anything outside the row needs the value, such as a total, a save button, or keeping it when the row is removed,
lift it into the parent as an object keyed by id: `state<Record<number, string>>({})`. Each row reads
`notes.get(g.id)` and writes `notes.set(d => { d[g.id] = text })`. The row is as cheap as before, and the data now
outlives it.
:::

## `state.linked`: an entry you can edit

Sometimes a row should start from server data and let the user edit a copy. `state.linked(source)` is a box that follows
`source` until you write to it:

```tsx
import { state } from '@weft-js/core'

type Product = { id: string; name: string; price: number }

export function PriceEditor(props: { product: Product }) {
  const { product } = props
  const price = state.linked(() => product.price, {
    key: () => product.id,
  })
  return (
    <label>
      {product.name}
      <input
        type="number"
        value={price.value}
        onInput={(e) => (price.value = e.currentTarget.valueAsNumber)}
      />
      {price.conflict.value && (
        <small>
          Changed to {price.conflict.value.theirs} while you were
          editing
        </small>
      )}
    </label>
  )
}
```

With `key`, an edit holds while the key stays the same, so a refetch of the product doesn't wipe what someone is typing.
`price.conflict.value` tells you when the source moved underneath the edit. A `state.linked` over a query value without
`key` is **S012**. The [State reference](/reference/state) has the details.

## Recap

- `box.get(key)` reads one entry of an object box; only changes to that entry re-run the reader.
- `box.value[key]` in a row follows the whole object, so every row re-runs (W017).
- `box.set(d => { d[key] = … })` writes one entry. It copies one level: replace the entry you change.
- Pass the box (`State<T>`) to a row component, and read `.get(id)` there.
- Replace only the item that changed in an array (W014).
- A row's own state lives as long as its key stays in the list, through reorders.

## Try it

:::challenge Sell one
Add a −1 button to each row of the stock list. It should never go below zero, and should be off at zero.
:::solution
```tsx
import { state } from '@weft-js/core'

const FRUIT = ['apple', 'pear', 'plum']

export function Stock() {
  const stock = state<Record<string, number>>({
    apple: 3,
    pear: 0,
    plum: 7,
  })
  const sell = (f: string) =>
    stock.set((d) => {
      d[f] = Math.max(0, (d[f] ?? 0) - 1)
    })
  return (
    <ul>
      {FRUIT.map((f) => (
        <li key={f}>
          {f}: {stock.get(f)}
          <button
            type="button"
            disabled={!stock.get(f)}
            onClick={() => sell(f)}
          >
            −1
          </button>
        </li>
      ))}
    </ul>
  )
}
```
Both the text and `disabled` read `stock.get(f)`, so selling a plum touches only the plum row.
:::

:::challenge Fix the slow price list
A price feed calls `update` many times a second. Every row re-runs on every update. Fix it.

```tsx
function update(id: string, price: number) {
  prices.value = prices.value.map((p) => ({
    ...p,
    price: p.id === id ? price : p.price,
  }))
}
```
:::solution
```tsx
import { state } from '@weft-js/core'

type Price = { id: string; name: string; price: number }

export function Prices() {
  const prices = state<Price[]>([
    { id: 'a', name: 'Oats', price: 2 },
    { id: 'b', name: 'Rye', price: 3 },
  ])
  const update = (id: string, price: number) => {
    prices.value = prices.value.map((p) =>
      p.id === id ? { ...p, price } : p,
    )
  }
  return (
    <ul>
      {prices.value.map((p) => (
        <li key={p.id}>
          {p.name}: {p.price}
          <button
            type="button"
            onClick={() => update(p.id, p.price + 1)}
          >
            Up
          </button>
        </li>
      ))}
    </ul>
  )
}
```
Only the changed item is a new object, so only its row re-runs (W014). Every other item is the same object as before.
:::

:::challenge A row component that reads its entry
The parent passes `count={counts.value[t.id]}` to each `Topic` row, so every vote re-runs every row. Change it so a vote
re-runs only its own row.
:::solution
```tsx
import { state, type State } from '@weft-js/core'

type Topic = { id: string; title: string }

function TopicRow(props: {
  topic: Topic
  votes: State<Record<string, number>>
}) {
  const { topic, votes } = props
  const vote = () =>
    votes.set((d) => {
      d[topic.id] = (d[topic.id] ?? 0) + 1
    })
  return (
    <li>
      {topic.title}: {votes.get(topic.id) ?? 0}
      <button type="button" onClick={vote}>
        Vote
      </button>
    </li>
  )
}

export function Topics(props: { topics: Topic[] }) {
  const { topics } = props
  const votes = state<Record<string, number>>({})
  return (
    <ul>
      {topics.map((t) => (
        <TopicRow
          key={t.id}
          topic={t}
          votes={votes}
        />
      ))}
    </ul>
  )
}
```
The row gets the box and reads its own entry with `.get`, so it follows only that entry.
:::
