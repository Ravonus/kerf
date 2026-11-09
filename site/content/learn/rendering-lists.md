# Rendering lists

:::learn
- How to render a list of components from an array with `.map`
- How to show only some items with `.filter`
- Why each row needs a `key`, where keys come from, and what goes wrong without them
- What moves and what is rebuilt when a list changes
- How rows that read one entry of shared state stay fast
:::

You'll often show several similar components from a collection of data: products in a shop, messages in a thread,
scientists in a gallery. You write this as you would in React, with JavaScript's array methods inside the markup. Weft
then turns a `.map` in your markup into a keyed list, which keeps each row alive as the list changes and moves rows
rather than rebuilding them.

:::demo describe-people

## Rendering data from arrays

Say you have a list of content:

```tsx
export function Scientists() {
  return (
    <ul>
      <li>Creola Katherine Johnson: mathematician</li>
      <li>Mario José Molina-Pasquel Henríquez: chemist</li>
      <li>Mohammad Abdus Salam: physicist</li>
    </ul>
  )
}
```

The rows differ only in their text. Data like this usually comes from somewhere (a database, an API, a file), so keep
it as data and let the markup be written once:

1. **Move** the data into an array.
2. **Map** each item to a piece of markup.
3. **Put** the mapped array in your component's markup.

```tsx
const people = [
  'Creola Katherine Johnson: mathematician',
  'Mario José Molina-Pasquel Henríquez: chemist',
  'Mohammad Abdus Salam: physicist',
]

export function Scientists() {
  return (
    <ul>
      {people.map(person => (
        <li key={person}>{person}</li>
      ))}
    </ul>
  )
}
```

An array in braces renders each of its items in order. `.map` turns each string into an `<li>`, and `key={person}`
tells Weft which row is which; more on that below. For a list of strings or numbers you can leave `key` out, and the
value itself is the key.

## Filtering arrays of items

Real data has more structure. Give each person an `id`, a `name` and a `profession`:

```ts
// src/data/people.ts
export const people = [
  {
    id: 0, name: 'Creola Katherine Johnson',
    profession: 'mathematician',
  },
  {
    id: 1, name: 'Mario José Molina-Pasquel Henríquez',
    profession: 'chemist',
  },
  { id: 2, name: 'Mohammad Abdus Salam', profession: 'physicist' },
  { id: 3, name: 'Percy Lavon Julian', profession: 'chemist' },
  {
    id: 4, name: 'Subrahmanyan Chandrasekhar',
    profession: 'astrophysicist',
  },
]
```

To show only the chemists, filter first and then map:

```tsx
import { people } from '#/data/people'

export function Chemists() {
  return (
    <ul>
      {people
        .filter(p => p.profession === 'chemist')
        .map(p => (
          <li key={p.id}>
            <b>{p.name}</b>: {p.profession}
          </li>
        ))}
    </ul>
  )
}
```

Chains like `xs.filter(…).sort(…).map(…)` work in markup. When the filter depends on state, as in the demo at the top
of the page, put the filtered list in a `derived`. Then other code (a count, an empty-state message) can read the same
list without repeating the filter:

```tsx
import { derived, state } from '@weft-js/core'
import { people } from '#/data/people'

export function ByProfession() {
  const only = state('chemist')
  const shown = derived(() =>
    people.filter(p => p.profession === only.value),
  )
  return (
    <>
      <ul>
        {shown.value.map(p => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>
      <p>
        {shown.value.length === 0
          ? 'Nobody matches.'
          : `${shown.value.length} found.`}
      </p>
    </>
  )
}
```

Here's the pattern again with a search box:

:::demo search

:::pitfall Filter first; don't return early from the row
Inside the `.map` callback, return one row for every item. An early `return null` to skip some items is **W013**: a
row can't appear or disappear from inside itself, because the list decides what rows exist before any row runs. Filter
the array before mapping it.
:::

:::pitfall Write the `.map` in the markup
The compiler turns a `.map` that you write inside the markup into a keyed list. Building the rows earlier, in the body
(`const rows = shown.value.map(…)`), reads the state once, which is **W001**, and the rows would never follow the data.
Keep `.map` inside the braces, or in a `derived` that returns the array and is read in the braces.
:::

## Keeping list items in order with `key`

Each row needs a key: a string or number that identifies its item among its siblings.

```tsx
import { people } from '#/data/people'

export function Names() {
  return (
    <ul>
      {people.map(p => (
        <li key={p.id}>{p.name}</li>
      ))}
    </ul>
  )
}
```

Over an array of objects, a `.map` without `key` is **W010**. When the items have an `id`, the compiler's fix adds
`key={p.id}` for you.

### Why Weft needs keys

Imagine files on your desktop without names. You'd refer to them by position: the first file, the second. That works
until a file is deleted, and then "the second file" means a different file. A key is a row's name: it lets Weft tell,
after the array changes, which row each item belongs to.

For each change to the array, Weft compares the new keys with the old ones:

- **A key that stays** keeps its row: the same DOM nodes, the same component, the same state inside it. If the item is
  at a new position, the row's nodes are moved there. If the item is a new object under the same key, the row is
  updated in place: the row reads its item through a live accessor, so only the bindings that read a field that changed
  run again. The row's component doesn't run again.
- **A new key** gets a new row, built once.
- **A key that's gone** has its row removed and cleaned up, with everything it owned.

That's why the order of the array is free to change. Sorting a thousand rows moves nodes; it doesn't rebuild them.

:::demo describe-keys

Type something next to each name in both columns, then reverse the list. On the left, rows are keyed by `g.id`, so each
row, with its input and what you typed, moves with its guest. On the right, rows are keyed by their position. Position 0
keeps its row and its input, but the row's item is now a different guest, so the names change and the words stay where
they were. Your notes now belong to the wrong people.

### Where keys come from

- **Data from a database**: use its ids. They're unique and they don't change.
- **Data made in the browser**: give each item an id when you create it, with a counter or `crypto.randomUUID()`, and
  store it in the item.
- **Strings or numbers that are unique**: the value is the key, and you may leave `key` out.

### Rules of keys

- **Keys are unique among siblings.** Two lists can use the same keys; within one list they can't repeat. If two items
  share a key, Weft keeps the row for the first and builds the repeat afresh on every change, which is slow and loses
  that row's state.
- **Keys don't change.** Don't make them while rendering. `key={Math.random()}` gives every row a new key every time the
  list changes, so every row is rebuilt, and on a page rendered on the server the keys differ between server and browser
  as well. `weft check` warns about a key from `Math.random()`, `Date.now()`, `crypto.randomUUID()` or `performance.now()`
  as **W044**.
- **A row has one key.** When a row's root is a fragment (`<>`), or a conditional with two branches, put the same key on
  each of its top-level elements. Different keys on one row are W010.

:::pitfall Don't use the index as a key
`.map((item, index) => <li key={index}>…)` compiles, and it's fine for a list that never reorders, never has an item
inserted, and never has one removed. For anything else it brings back the problem keys solve: position 3 is always row
3, whatever item is there now, so state inside rows (a typed value, an open panel, a checkbox's focus) stays at the
position while the data moves past it. The demo above shows exactly this.
:::

:::deepdive Rows and their components run once too
A row's component runs once, when its key first appears, like any component. If the item under that key changes, the
row isn't run again: the row's `item` is a live accessor, and its bindings read through it. So the same rules apply
inside a row as in a component body: read item fields in the markup, not in the row's body. Writing
`const label = p.name.toUpperCase()` at the top of a row callback that has a body is computed once;
`{p.name.toUpperCase()}` in the markup follows the item.

You can destructure the item in the callback, `({ id, name }) => <li key={id}>{name}</li>`, and the names stay live. A
rest pattern on the item, `({ id, ...more }) =>`, isn't supported and is **W019**: read from one item parameter
instead.
:::

## Lists that stay fast

Two habits keep large lists cheap. The compiler checks both.

### Replace only the item that changed

When you update one item, build the new array so that every other item is the same object as before:

```tsx
import { state } from '@weft-js/core'

type Product = { id: string; name: string; price: number }

export function Prices() {
  const products = state<Product[]>([
    { id: 'a', name: 'Espresso', price: 3 },
    { id: 'b', name: 'Flat white', price: 4 },
  ])
  const raise = (id: string) => {
    products.value = products.value.map(p =>
      p.id === id ? { ...p, price: p.price + 1 } : p,
    )
  }
  return (
    <ul>
      {products.value.map(p => (
        <li key={p.id}>
          {p.name} ${p.price}{' '}
          <button type="button" onClick={() => raise(p.id)}>
            +$1
          </button>
        </li>
      ))}
    </ul>
  )
}
```

`p.id === id ? { ...p, price } : p` makes a new object for one item and keeps the rest. The tempting
`products.value.map(p => ({ ...p, price }))` gives every item a new identity, so every row runs its bindings on every
change: one DOM write, hundreds of re-runs. The compiler reports that as **W014**, in one file, and `weft check` follows
the box through props into other files.

### Read one entry per row with `.get`

A common shape is a list of products and a separate object of counts: `cart = state({ espresso: 2 })`. A row that reads
`cart.value[p.id]` depends on the whole `cart`, so adding one item re-runs every row. Read the entry from the box
instead: `cart.get(p.id)` subscribes the row to that one key, and only the row whose entry changed runs again.

```tsx
import { state } from '@weft-js/core'

const products = [
  { id: 'espresso', name: 'Espresso' },
  { id: 'tea', name: 'Tea' },
]

export function Shelf() {
  const cart = state<Record<string, number>>({})
  const add = (id: string) => cart.set(c => {
    c[id] = (c[id] ?? 0) + 1
  })
  return (
    <ul>
      {products.map(p => (
        <li key={p.id}>
          {p.name}: {cart.get(p.id) ?? 0}{' '}
          <button type="button" onClick={() => add(p.id)}>
            Add
          </button>
        </li>
      ))}
    </ul>
  )
}
```

`cart.set(fn)` hands you a copy to change and writes it back, and only the keys that changed wake their readers. The
compiler warns about a whole-object read in a row as **W017**. When the row is a component of its own, pass it the box
(`cart={cart}`, typed `State<Record<string, number>>`) and read `cart.get(id)` there; passing `count={cart.value[p.id]}`
reads the whole object in the parent's list and re-runs every row the same way.

:::note Where `.get` and `.set` come from
`box.get(key)`, `box.set(fn)` and `state.linked` live in `@weft-js/core/keyed`. You don't import it yourself: the
`@weft-js/core` entry includes it, and under Weft's Vite plugin a module that mentions `.get`, `.set` or `.linked` pulls
it in, so a page that uses none of them doesn't pay for it. Only code that reaches them by a name known at run time,
such as `box[method]`, needs `import '@weft-js/core/keyed'`.
:::

[Keyed state and entries](/learn/entries) goes further into entries, and the Reference page on
[lists](/reference/lists) has every rule in one place.

## Recap

- Render a list with `.map` inside the markup; filter first, then map. Put a shared filter in `derived`.
- Every row over objects needs a `key` (W010): a stable, unique id from the data, not the index and not
  `Math.random()` (W044).
- A key that stays keeps its row, which moves rather than being rebuilt. A new object under the same key updates the row
  in place.
- Don't return early inside the row callback (W013).
- Replace only the item that changed (W014), and read one entry per row with `box.get(key)` (W017).

## Try it

:::challenge Split a list in two
Show the chemists in one list and everybody else in another.

```tsx
import { people } from '#/data/people'

export function Lists() {
  return (
    <ul>
      {people.map(p => (
        <li key={p.id}>{p.name}</li>
      ))}
    </ul>
  )
}
```
:::solution
```tsx
import { people } from '#/data/people'

export function Lists() {
  return (
    <>
      <h2>Chemists</h2>
      <ul>
        {people
          .filter(p => p.profession === 'chemist')
          .map(p => (
            <li key={p.id}>{p.name}</li>
          ))}
      </ul>
      <h2>Everyone else</h2>
      <ul>
        {people
          .filter(p => p.profession !== 'chemist')
          .map(p => (
            <li key={p.id}>{p.name}</li>
          ))}
      </ul>
    </>
  )
}
```
Each list keeps its own keys, so the same id may appear in both lists without a clash.
:::

:::challenge Nested lists
Render each recipe's name, then its ingredients as a nested list. Pick the keys.

<!-- example: skip the starting point for the solution below -->
```tsx
const recipes = [
  {
    id: 'greek-salad', name: 'Greek Salad',
    ingredients: ['tomatoes', 'cucumber', 'onion', 'olives', 'feta'],
  },
  {
    id: 'hawaiian-pizza', name: 'Hawaiian Pizza',
    ingredients: [
      'pizza crust', 'pizza sauce', 'mozzarella', 'ham', 'pineapple',
    ],
  },
]

export function RecipeList() {
  return <h1>Recipes</h1>
}
```
:::solution
```tsx
const recipes = [
  {
    id: 'greek-salad', name: 'Greek Salad',
    ingredients: ['tomatoes', 'cucumber', 'onion', 'olives', 'feta'],
  },
  {
    id: 'hawaiian-pizza', name: 'Hawaiian Pizza',
    ingredients: [
      'pizza crust', 'pizza sauce', 'mozzarella', 'ham', 'pineapple',
    ],
  },
]

export function RecipeList() {
  return (
    <div>
      <h1>Recipes</h1>
      {recipes.map(r => (
        <section key={r.id}>
          <h2>{r.name}</h2>
          <ul>
            {r.ingredients.map(i => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
```
Recipes have ids, so those are their keys. Ingredient names are unique within a recipe, so each name is its own key.
:::

:::challenge Fix the slow update
Each click on "Sale" should take $1 off one product, but the compiler reports W014 and every row re-runs on every click.
Fix the update.

<!-- example: skip the starting point, which reports W014 -->
```tsx
import { state } from '@weft-js/core'

export function Sale() {
  const products = state([
    { id: 'a', name: 'Espresso', price: 3 },
    { id: 'b', name: 'Flat white', price: 4 },
  ])
  const sale = (id: string) => {
    products.value = products.value.map(p => ({
      ...p, price: p.id === id ? p.price - 1 : p.price,
    }))
  }
  return (
    <ul>
      {products.value.map(p => (
        <li key={p.id}>
          {p.name} ${p.price}{' '}
          <button type="button" onClick={() => sale(p.id)}>
            Sale
          </button>
        </li>
      ))}
    </ul>
  )
}
```
:::solution
Copy only the item that changes, and keep every other item as the same object:

```tsx
import { state } from '@weft-js/core'

export function Sale() {
  const products = state([
    { id: 'a', name: 'Espresso', price: 3 },
    { id: 'b', name: 'Flat white', price: 4 },
  ])
  const sale = (id: string) => {
    products.value = products.value.map(p =>
      p.id === id ? { ...p, price: p.price - 1 } : p,
    )
  }
  return (
    <ul>
      {products.value.map(p => (
        <li key={p.id}>
          {p.name} ${p.price}{' '}
          <button type="button" onClick={() => sale(p.id)}>
            Sale
          </button>
        </li>
      ))}
    </ul>
  )
}
```
Now one row has a new item, and the others are untouched.
:::
