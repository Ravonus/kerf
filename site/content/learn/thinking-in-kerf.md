# Thinking in Kerf

:::learn
- How to break a design into a tree of components
- Why you build a static version first
- How to find the smallest set of state, and where it should live
- How data flows back up from a child, with `bind:` or a box
- Where this way of thinking differs from React's
:::

Kerf changes how you think about the screens you build. You take a design, break it into components, describe each
state it can be in, and connect the components so data flows through them. On this page you'll go through that process
once, building a searchable table of products for a coffee shop.

If you know React's "Thinking in React", the steps will be familiar, and most of the reasoning carries over. The
differences are in what you *don't* do: components run once, so there's no rendering to plan around, values you can
compute are `derived` rather than recomputed in a render, and a child can write a value back to its parent with `bind:`
instead of only through a callback.

## Start with the mockup

Imagine you already have a JSON API and a mockup from a designer. The API returns a list of products:

```json
[
  {
    "category": "Beans",
    "price": "$12",
    "stocked": true,
    "name": "House blend"
  },
  {
    "category": "Beans",
    "price": "$16",
    "stocked": false,
    "name": "Ethiopia natural"
  },
  {
    "category": "Beans",
    "price": "$14",
    "stocked": true,
    "name": "Decaf"
  },
  {
    "category": "Gear",
    "price": "$40",
    "stocked": true,
    "name": "Hand grinder"
  },
  {
    "category": "Gear",
    "price": "$5",
    "stocked": false,
    "name": "Paper filters"
  },
  {
    "category": "Gear",
    "price": "$35",
    "stocked": true,
    "name": "Kettle"
  }
]
```

and the mockup looks like this:

```text
┌──────────────────────────────────────┐
│ Shop stock                           │
│ ┌──────────────────────────────────┐ │
│ │ Search                           │ │
│ └──────────────────────────────────┘ │
│ ☐ Only show products in stock        │
│                                      │
│ Name                  Price          │
│ Beans                                │
│ House blend           $12            │
│ Ethiopia natural      $16   (red)    │
│ Decaf                 $14            │
│ Gear                                 │
│ Hand grinder          $40            │
│ Paper filters         $5    (red)    │
│ Kettle                $35            │
└──────────────────────────────────────┘
```

Out-of-stock products are shown in red. Typing in the search box narrows the list by name, and ticking the box hides
what's out of stock.

To build any UI in Kerf, you usually go through the same five steps.

## Step 1: Break the UI into a component hierarchy

Start by drawing boxes around every part of the mockup and naming them. Ask yourself how you'd split it if you were
writing functions or objects: a component should ideally do one thing. If it grows to do several, split it.

If your JSON is well shaped, the UI often splits along the same lines as the data: each component matches one piece of
the data model. Here there are five:

1. **`FilterableProductTable`** (the whole card) holds everything.
2. **`SearchBar`** takes what the person types and ticks.
3. **`ProductTable`** shows and filters the list.
4. **`ProductCategoryRow`** shows a heading for each category.
5. **`ProductRow`** shows one product.

You might wonder whether the table's header, "Name" and "Price", should be a component of its own. That's your call.
It's small and never changes, so here it stays inside `ProductTable`. If it grew sorting controls, it would earn its
own component.

Components that appear inside another in the mockup are its children in the hierarchy:

```text
FilterableProductTable
├── SearchBar
└── ProductTable
    ├── ProductCategoryRow
    └── ProductRow
```

## Step 2: Build a static version

Now build a version that shows the data and doesn't respond to anything yet. It's usually easiest to build the static
version first and add interactivity after: a static version is a lot of typing and little thinking, and adding
interactivity is a lot of thinking and little typing.

To build a static version, write components that take data through **props** and show it. Don't use state at all yet.
State is for data that changes over time, and the static version has none.

:::demo start-thinking-step-1

Read it from the bottom up. `FilterableProductTable` passes the whole list to `ProductTable` as a prop. `ProductTable`
works out the categories, and for each one shows a `ProductCategoryRow` and then a `ProductRow` per product in it.
`ProductRow` turns its name red when the product is out of stock, using a Veneer colour token so it follows the theme.

You can build top-down, starting from `FilterableProductTable`, or bottom-up, starting from `ProductRow`. On a small
screen like this one top-down is usually easier; on a big project, bottom-up lets you finish and test pieces as you go.

One expression here is already different from the React version:

```tsx
const categories = derived(() =>
  [...new Set(products.map(p => p.category))],
)
```

In React you'd compute this in the render, as a plain `const`, and it would be recomputed each time the component
rendered. In Kerf the component body runs once. A plain `const categories = …` would be worked out once, from the
props as they were at the start, and never again. The compiler reports that as **W001**. So even in the static version,
anything you compute from props goes in `derived`, or straight into the markup, where every expression stays live.

That's a good habit to start with: write it as `derived` from the beginning, and when the props start changing in
Step 4, everything that depends on them already follows.

The data flows one way: from the top-level component down through props to the ones at the bottom. At the end of this
step you have a library of reusable components that show your data. The top one takes the data as props; nothing yet
reacts to input.

## Step 3: Find the minimal but complete representation of UI state

To make the UI interactive, people need to be able to change the data underneath it. You do that with **state**.

Think of state as the smallest set of changing data your app needs to remember. The key principle is
*don't repeat yourself*. Work out the absolute minimum the app needs, and compute everything else from it. If you're
building a shopping list, keep the items in state; don't also keep the count in state, because it's the length of the
list.

Now list every piece of data in this example:

1. The original list of products.
2. The search text the person has typed.
3. Whether the checkbox is ticked.
4. The filtered list of products.

Which are state? For each one, ask three questions:

- **Does it stay the same over time?** Then it isn't state.
- **Is it passed in from a parent through props?** Then it isn't state here.
- **Can you compute it from existing state or props?** Then it *definitely* isn't state. It's `derived`.

The original list is passed in as a prop, so it isn't state. The search text and the checkbox change over time and
can't be computed from anything, so they are state. The filtered list can be computed from the original list, the
search text and the checkbox, so it isn't state: it's a derived value.

So the state is:

- the search text,
- whether the checkbox is ticked.

:::deepdive Props, state and derived values
There are three kinds of data in a Kerf component, and keeping them apart is most of the work of designing one.

- **Props** are like a function's arguments. A parent passes them, and they stay current: when the parent's value
  changes, the child sees it, though the child never runs again.
- **State** is a component's memory: a box made with `state(initial)`, read and written through `.value`. It's for
  what the person or the outside world changes.
- **Derived values** are worked out from props, state and other derived values with `derived(() => …)`. They are
  read-only, and they can't go out of date.

React has the first two, and computes the third in the render, sometimes wrapped in `useMemo`. Kerf gives the third a
name of its own because the body doesn't re-run: `derived` is how a computed value follows what it reads. It's lazy and
cached, so `shown` below is recomputed only when the text, the checkbox or the list has changed, and only if something
reads it.

A common mistake is to copy a prop into state: `state(props.products)`. That takes the prop once and never follows
it, which is **W005**. If you need a local copy you can edit, `state.linked(() => props.products)` follows the prop
until you write it.
:::

## Step 4: Identify where your state should live

After finding the minimal state, you need to decide which component owns it. Often this is the hard part. Go through
these steps for each piece of state:

1. Find **every** component that uses it to show something.
2. Find their closest common parent: the component above all of them in the hierarchy.
3. Decide where the state lives:
   - Often you can put it in that common parent.
   - You can also put it in a component above the common parent.
   - If no component makes sense to own it, make a new one just to hold it, and put it above the common parent.

Here:

1. `ProductTable` needs to filter the list by the search text and the checkbox.
2. `SearchBar` needs to show the search text and the checkbox.
3. Their closest common parent is `FilterableProductTable`.

So the two boxes live in `FilterableProductTable`, which passes their values down as props:

:::demo start-thinking-step-2

`FilterableProductTable` creates the two boxes, and passes `filterText.value` and `inStockOnly.value` to both children.
`ProductTable` now filters in a `derived`:

```tsx
const shown = derived(() => {
  const word = filterText.toLowerCase()
  return products.filter(p =>
    p.name.toLowerCase().includes(word) &&
    (p.stocked || !inStockOnly),
  )
})
```

`filterText` and `inStockOnly` are destructured props, and destructured props stay live. So `shown` reads them, and
follows them. When the parent's box changes, the parent passes a new value, `shown` is recomputed, and the list is
brought up to date, without `ProductTable` running again.

The out-of-stock products are hidden, because `inStockOnly` starts as `true`. Try changing the starting values in your
head: `state('kettle')` would show only the kettle; `state(false)` would bring back the red rows. That's a good way to check
that the data flows down as you meant before you wire up any input.

Now type in the search box. The text appears in the field, but the table doesn't change. The field shows what you type
because the browser's input does that by itself, but nothing writes the state yet: `SearchBar` gets the values, and has
no way to send anything back. That's the last step.

:::note What happens on a keystroke
When the search text does change, here is all the work Kerf does: `shown` is recomputed, then `categories`, and the
keyed lists inside the table compare their new keys with their old ones. A row whose product is still there is kept
as it is. A row that's gone is removed, and a new one is made for a product that came back. No component above the rows
runs again, and nothing is compared that didn't read the search text.
:::

## Step 5: Add data flowing back up

At the moment the data only flows down. To change the state as the person types, `SearchBar` needs to write to boxes
that live in `FilterableProductTable`.

In React, the parent would pass its setter functions down, and the child would call `onFilterTextChange(e.target.value)`.
In Kerf the parent passes its boxes with `bind:`, and the child writes to its own props:

:::demo start-thinking-step-3

Two things changed. In the parent, the call site now says `bind:`:

```tsx
<SearchBar
  bind:filterText={filterText}
  bind:inStockOnly={inStockOnly}
/>
```

And in `SearchBar`, the props become writable locals:

```tsx
let { filterText = '', inStockOnly = false } = props
// …
<Input
  label="Search"
  value={filterText}
  onInput={e => (filterText = e.currentTarget.value)}
/>
```

`let` makes a local name for each prop that the component can assign to. On its own, an assignment like
`filterText = …` changes the child only, and holds until the parent's value next changes. With `bind:` at the call
site, the assignment goes into the parent's box instead. So typing writes `filterText` in `SearchBar`, which writes the
parent's `filterText` box, which `ProductTable`'s `shown` reads, and the table follows.

Only `bind:` at the call site lets a write leave a component. Read `FilterableProductTable` and you know exactly what
can change its state: the two boxes it hands to `SearchBar` with `bind:`, and nothing else. `ProductTable` gets plain
values, so whatever it did with them, it couldn't change the parent.

The props are optional in `SearchBar` (`filterText?: string`) with defaults. That lets it work on its own, with no
parent box, and it's also because plain `tsc` doesn't connect `bind:filterText` to `filterText`. `kerf tsc` and the
editor do: under them a required prop is satisfied by `bind:`, and a wrong type is an error.
[Writing to a parent with bind:](/learn/bind) has the details.

### Other ways to send data up

`bind:` is the shortest way for a child to edit a value its parent owns. There are two others, and each has its place.

**Pass the box.** A prop typed `State<T>` hands the child the box itself. The child reads and writes `.value`:

```tsx
import type { State } from '@kerf/core'
import { Checkbox, Input } from '@kerf/veneer'

export function SearchBar(
  { filterText, inStockOnly }: {
    filterText: State<string>; inStockOnly: State<boolean>
  },
) {
  return (
    <form>
      <Input
        label="Search"
        value={filterText.value}
        onInput={e => (filterText.value = e.currentTarget.value)}
      />
      <Checkbox
        checked={inStockOnly.value}
        onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
          (inStockOnly.value = e.currentTarget.checked)}
      >
        Only show products in stock
      </Checkbox>
    </form>
  )
}
```

The parent writes `<SearchBar filterText={filterText} inStockOnly={inStockOnly} />`. Use this when the child needs the
box for more than one value, for example to read single entries of an object box with `.get`, as the rows of the
[tutorial](/learn/tutorial)'s shop do. The cost is that the child can no longer be used without a box.

**Pass a callback.** A prop such as `onSearch: (text: string) => void` works exactly as in React. Use it for events
that aren't "set this value": "the person asked to check out", "a row was dragged". The parent decides what to do.

For a child that edits a value, prefer `bind:`. The child stays a plain component that takes values, and the parent's
call site says, in one word, that the child may write it.

## How this differs from React

You followed the same five steps React teaches, and most of the reasoning was the same. Here is where Kerf differed:

| | React | Kerf |
|---|---|---|
| A component runs | On every render | Once, when it first appears |
| A value computed from props or state | A `const` in the render, maybe in `useMemo` | `derived(() => …)`, or an expression in the markup |
| State | `const [x, setX] = useState(…)` | `const x = state(…)`, read and written as `x.value` |
| Data flowing up | A callback prop | `bind:` at the call site, a box, or a callback |
| What a change updates | The component and its children re-render, then the DOM is diffed | The text, attributes and keyed rows that read the change |

The habit to unlearn is "the function runs again". In Kerf it doesn't, so you never ask "will this be recomputed on the
next render?" You ask "does this read what it depends on?" A `derived`, a handler, an expression in the markup and a
prop all read live. A plain `const` computed in the body doesn't, and the compiler tells you when you've written one.

## Recap

- Break the mockup into components that each do one thing, usually along the lines of the data.
- Build a static version first, with props and no state. Compute from props in `derived` or the markup, never in the
  body (**W001**).
- Find the minimal state: not what's passed in, not what stays the same, and not what you can compute. What you can
  compute is `derived`.
- Put each piece of state in the closest common parent of everything that uses it.
- Data flows down through props, which stay live. A child writes back up through `bind:` at the call site, a box typed
  `State<T>`, or a callback.

## Try it

:::challenge Say when nothing matches
When the search finds nothing, `ProductTable` shows only its header. Make it say "No products match." instead.
:::solution
In `ProductTable`, after the `.map`:

```tsx
{shown.value.length === 0 && (
  <tbody>
    <tr><td colspan="2">No products match.</td></tr>
  </tbody>
)}
```

`shown` is already derived, so the message follows it. The left side of `&&` is a comparison, so an empty list doesn't
print a `0` (**W011**).
:::

:::challenge Cheapest first
Add a second checkbox, "Cheapest first", that sorts the products in each category by price. Decide where the new state
lives before you write it.
:::solution
`SearchBar` shows the checkbox and `ProductTable` sorts by it, so, like the other two, it lives in their common parent,
`FilterableProductTable`:

```tsx
const cheapestFirst = state(false)
// …
<SearchBar
  bind:filterText={filterText}
  bind:inStockOnly={inStockOnly}
  bind:cheapestFirst={cheapestFirst}
/>
<ProductTable
  products={PRODUCTS}
  filterText={filterText.value}
  inStockOnly={inStockOnly.value}
  cheapestFirst={cheapestFirst.value}
/>
```

`SearchBar` gets one more optional prop and checkbox, the same as `inStockOnly`. `ProductTable` sorts inside `shown`:

```tsx
const shown = derived(() => {
  const word = filterText.toLowerCase()
  const found = products.filter(p =>
    p.name.toLowerCase().includes(word) &&
    (p.stocked || !inStockOnly),
  )
  return cheapestFirst
    ? found.toSorted((a, b) =>
        Number(a.price.slice(1)) - Number(b.price.slice(1)),
      )
    : found
})
```

Sorting is part of what the table shows, so it goes in the same `derived`, not in state of its own. `toSorted` returns
a new array and leaves `products` alone. The rows are keyed by name, so when the order changes they move instead of
being rebuilt.
:::

:::challenge Pass the boxes instead
Rewrite Step 5 so that `SearchBar` takes the two boxes as props typed `State<string>` and `State<boolean>`, with no
`bind:`. What changes in the parent, and what changes in the child?
:::solution
The child reads and writes `.value` on its props:

```tsx
import { state, type State } from '@kerf/core'
import { Checkbox, Input } from '@kerf/veneer'

function SearchBar(
  { filterText, inStockOnly }: {
    filterText: State<string>; inStockOnly: State<boolean>
  },
) {
  return (
    <form>
      <Input
        label="Search"
        value={filterText.value}
        onInput={e => (filterText.value = e.currentTarget.value)}
      />
      <Checkbox
        checked={inStockOnly.value}
        onChange={(e: Event & { currentTarget: HTMLInputElement }) =>
          (inStockOnly.value = e.currentTarget.checked)}
      >
        Only show products in stock
      </Checkbox>
    </form>
  )
}

export function Filters() {
  const filterText = state('')
  const inStockOnly = state(true)
  return (
    <>
      <SearchBar filterText={filterText} inStockOnly={inStockOnly} />
      <p>
        Searching for “{filterText.value}”
        {inStockOnly.value ? ', in stock only' : ''}.
      </p>
    </>
  )
}
```

The parent passes `filterText={filterText}`, the box, where Step 5 passed `bind:filterText={filterText}`. Both let the
child write. The difference is in the child: with `bind:`, `SearchBar` works with plain values and doesn't know whether
anyone is listening; with boxes, it needs a box to work at all. That's why `bind:` is the usual choice for "a child that
edits a value", and a box for a child that needs the box itself.
:::
