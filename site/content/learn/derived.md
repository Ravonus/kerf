# Derived values

:::learn
- How to compute a value from state with `derived`
- When a derived value runs again, and when it doesn't
- How to chain derived values and derive from props
- Why you never sync one value into another with `watch`
:::

On [Choosing the state structure](/learn/choosing-state-structure) you kept state small: only what can't be worked out
from anything else. Everything that *can* be worked out is a derived value. You say how to compute it once, and Kerf keeps
it right.

:::demo rules

## One rule, never out of sync

```tsx
import { derived, state } from '@kerf/core'

export function Basket() {
  const price = 12
  const qty = state(1)
  const shipping = derived(() => (qty.value >= 3 ? 0 : 4))
  const total = derived(() => price * qty.value + shipping.value)
  return (
    <p>
      {qty.value} × ${price} + ${shipping.value} shipping = $
      {total.value}
      <button type="button" onClick={() => qty.value++}>
        Add one
      </button>
    </p>
  )
}
```

`derived(fn)` returns an object with a read-only `.value`. Reading it gives what `fn` returns. Read it in JSX, in another
`derived`, in a handler: anywhere you would read a box.

`derived` tracks what its function reads. `total` reads `qty` and `shipping`, so it follows both. You never list them:
there's no dependency array to keep up to date, and no way for it to go out of date.

A derived value is read-only. To change it, change what it reads. Assigning to `total.value` is a type error, and Kerf
reports it as **W007**.

:::note Coming from React
`derived` is what `useMemo` is for, without the dependency array, and also what you'd otherwise compute in the render
body. In React the body runs on every render, so `const total = price * qty` stays right. In Kerf the body runs once,
so the same line would be computed once and never again. That's why Kerf has a name for it.
:::

## Where to compute

There are three places a computed value can go, and one place it can't.

- **In `derived`**, when more than one place needs the value, or it's worth a name.
- **In JSX**, for a one-off: `{(qty.value * price).toFixed(2)}`. Every `{expression}` in JSX is live, so this updates too.
- **In a handler**, when the value is only needed at the moment of a click: `onClick={() => save(qty.value * price)}`.
- **Not in the body.** The body runs once, so `const total = price * qty.value` is computed once and never again. That's
  **W001**.

:::pitfall A value computed in the body is a snapshot
```tsx
const qty = state(1)
// W001: computed once, when the component was made.
const total = price * qty.value
```
This compiles in plain TypeScript and looks right, which is what makes it a trap. It renders `12` and stays `12`,
however many times you press the button. Wrap it: `const total = derived(() => price * qty.value)` and read
`total.value`. If you really do want the value as it was at the start, say so with `untrack(() => price * qty.value)`.
:::

## When a derived value runs

A derived value is **lazy** and **cached**:

- It computes the first time something reads `.value`, not when you create it. A `derived` that nothing reads never runs.
- After that it keeps its result. Reading it again costs nothing until something it read has changed.
- When something it read changes, it doesn't recompute at once. It's marked out of date, and recomputes the next time
  it's read.

When it does recompute and gets a result that is the same as before (`Object.is`), the things that read it don't run.
Try it in this demo: typing `T` into the code box makes `discount` run again, but it still returns `0`, so `total` and
the text that shows it are left alone.

:::demo manage-chain

That is what makes derived values cheap to chain. Each step stops the change when its own result didn't move.

### A derived value follows only what it read last time

A derived value tracks what it read *on its last run*, not every box its code mentions:

```tsx
import { derived, state } from '@kerf/core'

export function Greeting() {
  const formal = state(false)
  const first = state('Ana')
  const last = state('Silva')
  const greeting = derived(() =>
    formal.value ? `Dear Ms ${last.value}` : `Hi ${first.value}`,
  )
  return (
    <p>
      {greeting.value}
      <button
        type="button"
        onClick={() => (formal.value = !formal.value)}
      >
        Switch
      </button>
    </p>
  )
}
```

While `formal` is false, `greeting` read `formal` and `first`, so a change to `last` doesn't run it. Once `formal` turns
true, it reads `last` and stops following `first`. You get the smallest set of dependencies without thinking about it.

:::deepdive How Kerf keeps a chain consistent
A write to a box marks everything downstream: the readers that read it directly are *dirty*, and the readers of those are
*check*. Nothing runs yet. When something is read, Kerf first brings what it read up to date, in order, and only reruns a
step if one of its inputs actually changed.

So in `total = subtotal + discount`, a change to `qty` never shows a `total` computed from a new `subtotal` and an old
`discount`. You never see a half-updated state (React calls this tearing; reactive libraries call it a glitch), and a
derived value never runs twice for one change.

DOM updates and `watch` callbacks are batched: they run together on the next microtask, after all your writes in a
handler. See [How an update reaches the DOM](/learn/how-updates-reach-the-dom).
:::

## Chains of derived values

A derived value can read other derived values. Split a long computation into named steps, and each step reruns only when
its own inputs change:

```tsx
import { derived, state } from '@kerf/core'

type Item = {
  id: string
  name: string
  price: number
  tags: string[]
}

export function Catalogue(props: { items: Item[] }) {
  const { items } = props
  const query = state('')
  const sortBy = state<'name' | 'price'>('name')
  const matching = derived(() => {
    const q = query.value.toLowerCase()
    return items.filter((i) => i.name.toLowerCase().includes(q))
  })
  const sorted = derived(() =>
    [...matching.value].sort((a, b) =>
      sortBy.value === 'price'
        ? a.price - b.price
        : a.name.localeCompare(b.name),
    ),
  )
  const cheapest = derived(() =>
    Math.min(...matching.value.map((i) => i.price)),
  )
  return (
    <section>
      <input
        aria-label="Search"
        value={query.value}
        onInput={(e) => (query.value = e.currentTarget.value)}
      />
      <button
        type="button"
        onClick={() =>
          (sortBy.value = sortBy.value === 'name' ? 'price' : 'name')
        }
      >
        Sort by {sortBy.value === 'name' ? 'price' : 'name'}
      </button>
      {matching.value.length > 0 && <p>From ${cheapest.value}</p>}
      <ul>
        {sorted.value.map((i) => (
          <li key={i.id}>
            {i.name}: ${i.price}
          </li>
        ))}
      </ul>
    </section>
  )
}
```

Changing the sort runs `sorted` again, but not `matching` or `cheapest`, since neither of them read `sortBy`. Typing in
the search box runs all three, because they all depend on `matching`.

## Deriving from props

Props are live, so a derived value can read them like boxes. When the parent passes a new value, the derived value
follows:

```tsx
import { derived, state } from '@kerf/core'

export function PriceTag({
  price,
  currency,
}: {
  price: number
  currency: string
}) {
  const qty = state(1)
  const label = derived(() =>
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).format(price * qty.value),
  )
  return (
    <p>
      {label.value}
      <button type="button" onClick={() => qty.value++}>
        +
      </button>
    </p>
  )
}
```

`price` and `currency` are destructured, and destructuring one level stays live in Kerf. `derived` reads them each time it
runs. When the parent changes `price`, `label` recomputes.

This is the answer to "how do I keep a copy of a prop in sync?": don't keep a copy. Derive what you need from the prop.
If the user should be able to edit the copy, that's `state.linked`, on
[Choosing the state structure](/learn/choosing-state-structure#don-t-copy-props-into-state).

## Not with `watch`

`watch` runs a side effect when something changes: setting the document title, saving to a server, focusing an input. It
looks like it could also keep one value in step with another:

```tsx
const total = state(0)
watch(
  () => qty.value,
  (q) => {
    total.value = price * q
  },
) // W004: use derived
```

Don't. This version has three problems that `derived` doesn't:

- **It lags.** The `watch` runs on the next flush, after the write to `qty`. Code that reads `total` straight after the
  write, in the same handler, sees the old total.
- **It can loop.** A `watch` that writes something its own source reads runs again, and again.
  The catalog calls that **W003**.
- **It's more state.** `total` is now a box anyone can write to, and nothing stops it from disagreeing with `qty`.

The compiler reports a `watch` that only copies one value into another as **W004**, with `derived` as the fix, and
reports W003 too. Keep `watch` for the outside world; see
[Effects](/learn/effects) and [You might not need an effect](/learn/you-might-not-need-an-effect).

The same goes for writing to state *inside* a `derived`. A derived value computes; it doesn't change anything. A write in
one is **W002**.

## Data that arrives later

`derived` takes a plain, synchronous function. For a value that comes from a promise, such as a fetch, use `resource`,
which is the async form of `derived` (see [Async and loading states](/learn/async-and-loading)). `derived(async …)` is
**W012** in the catalog: it would give you a promise, not the data.

:::deepdive `memo`, and what the compiler does with your JSX
`@kerf/core` also exports `memo(fn)`. It's `derived` that returns a function instead of an object with `.value`:
`const total = memo(() => …)` and then `total()`. The compiler uses it for the expressions it lifts out of your JSX, and
you'll see it in compiled output and in the dev graph. In your own code, prefer `derived`: `.value` reads the same as a
box, so readers don't need to know which they have.
:::

## Recap

- `derived(() => …)` names a value computed from boxes, props and other derived values. Read it with `.value`.
- It tracks what it read on its last run, computes lazily when read, and caches until an input changes.
- If it recomputes to the same result, its readers don't run.
- Compute in `derived`, JSX or a handler, never in the body (W001).
- Never keep a copy in sync with `watch`, and never write state inside `derived`.

## Try it

:::challenge A free-shipping hint
In the basket at the top of this page, shipping is free from three items. Show how many more items get free shipping,
until they do.
:::solution
```tsx
import { derived, state } from '@kerf/core'

export function Basket() {
  const qty = state(1)
  const toFree = derived(() => Math.max(0, 3 - qty.value))
  return (
    <p>
      {qty.value} in the basket
      {toFree.value > 0 && (
        <small> {toFree.value} more for free shipping</small>
      )}
      <button type="button" onClick={() => qty.value++}>
        Add one
      </button>
    </p>
  )
}
```
`toFree` reads `qty`, so it follows it. Note `toFree.value > 0 &&`: a bare number on the left of `&&` would render `0`
once it reached zero (W011).
:::

:::challenge Fix the frozen total
This invoice never updates when you add a line. Find why and fix it.

```tsx
function Invoice() {
  const lines = state<number[]>([20, 35])
  const total = lines.value.reduce((a, b) => a + b, 0)
  return (
    <p>
      Total: {total}
      <button
        type="button"
        onClick={() => (lines.value = [...lines.value, 10])}
      >
        Add a line
      </button>
    </p>
  )
}
```
:::solution
The total is computed in the body, which runs once (W001). Make it derived and read `.value`:

```tsx
import { derived, state } from '@kerf/core'

export function Invoice() {
  const lines = state<number[]>([20, 35])
  const total = derived(() => lines.value.reduce((a, b) => a + b, 0))
  return (
    <p>
      Total: {total.value}
      <button
        type="button"
        onClick={() => (lines.value = [...lines.value, 10])}
      >
        Add a line
      </button>
    </p>
  )
}
```
For a one-off you could also write the `reduce` straight into the JSX, which is live too.
:::

:::challenge Replace the watch
This form keeps `valid` in step with `email` using a `watch`. Rewrite it without one.

```tsx
function Signup() {
  const email = state('')
  const valid = state(false)
  watch(
    () => email.value,
    (e) => {
      valid.value = e.includes('@')
    },
  )
  return (
    <form>
      <input
        aria-label="Email"
        value={email.value}
        onInput={(e) => (email.value = e.currentTarget.value)}
      />
      <button type="submit" disabled={!valid.value}>
        Sign up
      </button>
    </form>
  )
}
```
:::solution
```tsx
import { derived, state } from '@kerf/core'

export function Signup() {
  const email = state('')
  const valid = derived(() => email.value.includes('@'))
  return (
    <form>
      <input
        aria-label="Email"
        value={email.value}
        onInput={(e) => (email.value = e.currentTarget.value)}
      />
      <button type="submit" disabled={!valid.value}>
        Sign up
      </button>
    </form>
  )
}
```
`valid` is now a rule, not a second piece of state. It can't lag a step behind `email`, and nothing else can set it.
:::

:::challenge Only the cheap ones
Given a `products` prop of `{ id, name, price }`, add a checkbox "Under $20" that filters the list. Keep the count of
shown products in a heading.
:::solution
```tsx
import { derived, state } from '@kerf/core'

type Product = { id: string; name: string; price: number }

export function Shelf(props: { products: Product[] }) {
  const { products } = props
  const cheap = state(false)
  const shown = derived(() =>
    cheap.value
      ? products.filter((p) => p.price < 20)
      : products,
  )
  return (
    <section>
      <h2>{shown.value.length} products</h2>
      <label>
        <input
          type="checkbox"
          checked={cheap.value}
          onChange={(e) => (cheap.value = e.currentTarget.checked)}
        />
        Under $20
      </label>
      <ul>
        {shown.value.map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>
    </section>
  )
}
```
One box for the choice, one derived value for the list. The heading and the list both read `shown`, so they can't
disagree.
:::
