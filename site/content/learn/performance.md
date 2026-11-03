# Performance and bundle size

:::learn
- Why a weft app does little work on each change, and what the compiler does to get there
- The few habits that keep lists fast: keys, stable items and one entry per row
- How islands, server-only code and lazy slots keep JavaScript off the page
- How to measure what you ship and what a change costs
- How weft compares with other stacks, with the numbers and their limits
:::

Most of weft's speed is something you get by writing ordinary components. There's no memo to remember and no dependency
list to keep right. But there are a few patterns that undo it, mostly around lists, and the compiler can only warn about
them. This page explains where the speed comes from, so those patterns make sense, then shows how to measure.

## Where the speed comes from

In React, a state change runs the component again, builds a new tree of elements, and compares it with the last one to
find what to change in the DOM. That's a lot of work to find out that one number moved, which is why React has
`memo`, `useMemo` and `useCallback`.

A weft component runs once. The compiler reads its JSX and wires each reactive read straight to the DOM node that shows
it. When a box changes, the bindings that read it run, and nothing else:

:::demo getting-started

Pressing the button writes `inCart.value`. One text node changes. `Product` doesn't run again, the `Card` doesn't run
again, and there's no tree to compare.

:::deepdive What the compiler turns JSX into
weft's compiler is written in Rust on top of the Oxc parser ([Rust, in depth](/learn/rust) covers it). For the browser,
each element tree becomes a template, parsed once by the browser and cloned for each use, plus one small binding for
each dynamic part. Roughly:

<!-- example: skip illustrative compiler output, not source you write -->
```ts
const _t1 = _$tpl('<p>Cart <span></span></p>')   // once per module
const p = _t1()                                    // a clone, per use
_$child(p.lastChild, () => inCart.value)           // the one binding
```

Static attributes and text are inside the template, so they cost nothing at run time. All the dynamic attributes of one
element share a single binding. Common events are delegated to one listener on the document. A keyed `.map` becomes a
`For` that keeps each row by its key.

The same compiler emits server code for server rendering, and partial hydration on top of that. You never write any of
this; it's here so the habits below make sense.
:::

### Writes are batched

Several writes in one handler update the page once, after the handler. You don't need to ask for that:

```tsx
import { state } from '@weft-js/core'

export function Checkout() {
  const step = state(1)
  const error = state('Pick a delivery slot')
  const next = () => {
    step.value++
    error.value = ''
  }
  return (
    <section>
      <p role="status">Step {step.value} of 3</p>
      {error.value && <p role="alert">{error.value}</p>}
      <button type="button" disabled={step.value === 3} onClick={next}>Next</button>
    </section>
  )
}
```

`batch(fn)` exists, but it only runs `fn`: writes are always batched, and `batch` says so at the call for a reader. The
opposite is `flush()`, which applies pending writes now, for the rare time you need the DOM to be current mid-handler,
such as focusing an element a write just showed.

## Lists: where speed is won or lost

A list is where one small mistake multiplies by the number of rows. Three habits keep lists fast, and the compiler
checks each of them.

### Give every row a key

`items.map(item => <Row key={item.id} … />)` is a keyed list: each key keeps its row, its DOM nodes and its state. Without
a key over objects, weft can't tell a moved row from a new one. That's W010, with an autofix to `key={item.id}` when items
have an `id`. Over strings and numbers, the value is the key.

### Change only what changed

When you update one item, keep the others as they were:

```tsx
import { state } from '@weft-js/core'

const START = [
  { id: 'beans', name: 'Beans', price: 12 },
  { id: 'grinder', name: 'Grinder', price: 40 },
  { id: 'filter', name: 'Filters', price: 4 },
]

export function PriceList() {
  const products = state(START)
  const discount = (id: string) => {
    products.value = products.value.map(p => (p.id === id ? { ...p, price: p.price * 0.9 } : p))
  }
  return (
    <ul>
      {products.value.map(p => (
        <li key={p.id}>
          {p.name}: {p.price.toFixed(2)}{' '}
          <button type="button" onClick={() => discount(p.id)}>Discount</button>
        </li>
      ))}
    </ul>
  )
}
```

The line that matters is the `map`: the product that changed gets a new object, and every other product is the same
object as before. weft's list sees that only one row's item changed and updates that row.

:::pitfall New objects for every item
`products.value = products.value.map(p => ({ ...p, price: p.price * 0.9 }))` gives every item a new identity, even if
you only meant to change one, so every row runs again. The DOM might change in one place while every row re-ran to find
that out. The compiler reports it as W014 inside one file, and `weft check` follows the box through props into other
files.
:::

### Read one entry per row

A row that needs a value from a shared object, such as a quantity from a cart, should read only its own entry. Try the
demo: each row says how many times its quantity has been worked out.

:::demo tool-rows

Add a few things. Only the row you pressed works its quantity out again. That's because each row reads
`cart.get(id)`, which subscribes to one entry and re-runs only when that entry changes (compared with `Object.is`).

Had each row read `cart.value[id]`, every row would depend on the whole cart, and adding one apple would make every row
work its quantity out again. On five rows nobody notices. On 500 it's the difference between one update and 500. The
compiler reports that as W017. When a row is its own component, pass it the box (`cart={cart}`, typed `State<…>`) and read
`cart.get(id)` inside, rather than passing `qty={cart.value[id]}`:

```tsx
import { state, type State } from '@weft-js/core'

function Row(props: { id: string; cart: State<Record<string, number>> }) {
  return <li>{props.id}: {props.cart.get(props.id) ?? 0}</li>
}

export function Basket() {
  const cart = state<Record<string, number>>({ apple: 1 })
  const ids = ['apple', 'pear', 'plum']
  return <ul>{ids.map(id => <Row key={id} id={id} cart={cart} />)}</ul>
}
```

## Computed values and untracked reads

Work out a value from state with `derived`. It runs when something reads it, caches the result, and only works it out
again after something it read has changed:

```tsx
import { derived, state } from '@weft-js/core'

export function Orders(props: { orders: { id: string; total: number; open: boolean }[] }) {
  const showAll = state(false)
  const shown = derived(() => (showAll.value ? props.orders : props.orders.filter(o => o.open)))
  const sum = derived(() => shown.value.reduce((n, o) => n + o.total, 0))
  return (
    <section>
      <label><input type="checkbox" checked={showAll.value} onChange={e => (showAll.value = e.currentTarget.checked)} /> All orders</label>
      <p>{shown.value.length} orders, {sum.value.toFixed(2)} in total</p>
    </section>
  )
}
```

Two readers of `sum` share one computation. In React you'd reach for `useMemo` here; in weft this is the normal way to
write it.

`untrack(() => …)` reads without subscribing: the value is read once and the result never updates. It's for the rare case
where you want a snapshot, such as the starting value of something you then own. Don't use it to "save work" in JSX: a
JSX read inside `untrack` freezes that part of the page, which the compiler reports as W018.

## Shipping less JavaScript

The fastest code is code the browser never downloads. With `@weft-js/start`, a few things keep it off the page without
you doing anything.

- **Islands.** Pages are rendered on the server. A component with nothing to do in the browser ships no JavaScript. One
  with handlers becomes an island, and an island whose only work is its handlers loads when someone first interacts with
  it. Events that arrive before its code are held and replayed. [SSR, islands and hydration](/learn/ssr-and-hydration)
  covers how.
- **Server code stays on the server.** Files under `src/server/` and `*.server.ts` never reach a client bundle. A query's
  body runs on the server, and the client gets a small stub that calls it.
- **Plugins load lazily.** A plugin's slot provider is imported on the side it runs on, when it's first used. An app that
  doesn't use a plugin carries none of its bytes.

The compiler tells you when an island has to load with the page for a reason the code could avoid, such as a box at
module level or work that reaches past the island. That's H010, an info diagnostic, and `.weft/hydration.json`, written by
`weft dev` and `weft build`, says when each island loads and why. When a component's work only matters once it's on
screen and the compiler can't prove it, put `/* @weft visible */` above it.

### Images and fonts

On most pages, the largest thing to arrive isn't JavaScript. Two parts of weft help:

- **`<Media>`** from `@weft-js/core/media` renders an image imported with `?media` with its width and height, a
  placeholder, `srcset` and `sizes`, so nothing shifts as it loads. Mark the one hero image `priority`. The M-codes catch
  the rest: an `<img>` with no size (M001), a file far wider than it's shown (M003), a lazy hero (M008), or more than two
  `priority` images competing for the first bytes (M009).
- **`@weft-js/text`** declares the app's fonts. The build subsets each face, preloads the ones the first paint needs,
  matches a fallback face to the font's metrics so the swap doesn't move the layout, and trims axes and characters the
  source never uses. [Fonts](/learn/fonts) has the details.

```tsx
// A sketch: `hero.jpg` sits next to the route.
<Media src={hero} alt="Two cups of coffee on a wooden table" priority width="1/2" />
```

## Measuring

Measure before you change anything for speed, and measure the thing a user feels.

**In a test,** `toTouchAtMost(mutations, { runs })` from `@weft-js/core/test` turns "this click stays cheap" into an
assertion that fails when someone breaks it. It counts the DOM mutations one interaction causes and the reactive re-runs,
so it catches the W014 kind of bug, where the DOM barely changes but every row ran. [Testing](/learn/testing) shows it on a
list.

**In the running app,** `weft browser snapshot` prints the reactive graph with real names (which box feeds which binding,
in which component and line), and your browser's own performance panel shows the rest. The [verify
reference](/reference/verify) has the commands.

**What ships:** `weft build` writes the production output to `.output/`, and the client files there are what a browser
downloads. Compress them the way your host does (brotli, usually) before you compare sizes. `.weft/hydration.json` says
which islands load when.

:::note Inside the weft repository
The framework holds itself to size budgets with `node packages/weft/scripts/size.mjs`, which builds a set of fixture apps
and reports their brotli sizes, and to speed with the benchmarks in `evals/`. These are for working on weft itself, not
commands for your app. `CONTRIBUTING.md` says when to run them.
:::

## How weft compares

The repository builds the same dashboard in six stacks: a shell with a sidebar and menus, and a 200-row table with
sorting, filtering, selection, paging and a live cell. Each uses the latest stable versions and a plain `vite build`.
These are the numbers from the run on 2 November 2026, as the home page shows them, which always has the latest:

| Stack | JS (brotli) | CSS (brotli) | First paint |
|---|---|---|---|
| weft, no warp | 6.6 KB | 1.4 KB | 88 ms |
| weft + warp | 23.1 KB | 19.3 KB | 156 ms |
| Solid + Kobalte | 47.4 KB | 1.4 KB | 124 ms |
| React + Radix | 98.3 KB | 1.4 KB | 200 ms |
| React + Zustand | 98.4 KB | 1.4 KB | 204 ms |
| React + MUI | 239.6 KB | (in JS) | 508 ms |

Read them with their limits:

- **Compare like with like.** "weft, no warp", Solid, and the two Radix rows share one hand-written stylesheet, so they're
  the fair framework comparison. warp and MUI each bring a design system, so compare those two as kits. warp ships more
  CSS than the rest because it's a whole design system, where the others share one small sheet (MUI keeps its styles in
  its JavaScript).
- **Smaller isn't always faster to paint.** weft + warp is a quarter of the JavaScript of React + Radix, but Solid +
  Kobalte paints its first frame sooner. The table has both columns for that reason.
- **Kits differ in what they do.** Radix and Kobalte add menu keyboard handling and focus traps that the no-warp weft page
  doesn't have, and warp keeps some closed menus mounted. `evals/compare/README.md` lists every difference.

The home page also has a speed table against Solid and React on the usual benchmark operations (create, update, swap and
remove rows). weft wins some rows and loses others, and rows where the rounds overlap are marked as too close to call.
Those losses are on the page on purpose.

## Recap

- A component runs once; each reactive read is its own binding, so a change does work in proportion to what it changes.
- Key every list, replace only the items that changed (W014), and read one entry per row with `.get` (W017).
- `derived` caches computed values. Writes are always batched; `batch` only says so, and `flush()` applies them now.
- Islands, server-only modules and lazy plugin slots keep JavaScript off the page. `.weft/hydration.json` and H010 say
  why an island loads when it does.
- Measure with `toTouchAtMost` in tests and the real output of `weft build`, and compare stacks only like with like.

## Try it

:::challenge Toggle without touching every row
This `toggle` marks one task done, but every row runs again on each click. Fix it.

<!-- example: skip a fragment from a component -->
```tsx
const toggle = (id: string) => {
  tasks.value = tasks.value.map(t => ({ ...t, done: t.id === id ? !t.done : t.done }))
}
```
:::solution
```tsx
const toggle = (id: string) => {
  tasks.value = tasks.value.map(t => (t.id === id ? { ...t, done: !t.done } : t))
}
```

Only the toggled task gets a new object; the others keep their identity, so their rows have nothing to do. The old
version made a new object for every task, which is W014.
:::

:::challenge Pass the box, not the value
Each `Seat` re-runs whenever any seat is booked. Change `Seat` and its call so only the booked seat updates.

<!-- example: skip a fragment showing the shape of the bug -->
```tsx
function Seat(props: { id: string; taken: boolean }) {
  return <li>{props.id}: {props.taken ? 'taken' : 'free'}</li>
}

// in the parent, where booked is state<Record<string, boolean>>
{seats.map(id => <Seat key={id} id={id} taken={booked.value[id] ?? false} />)}
```
:::solution
```tsx
function Seat(props: { id: string; booked: State<Record<string, boolean>> }) {
  return <li>{props.id}: {props.booked.get(props.id) ? 'taken' : 'free'}</li>
}

{seats.map(id => <Seat key={id} id={id} booked={booked} />)}
```

`booked.value[id]` in the parent reads the whole object, so every seat depends on every booking (W017). Passing the box
lets each seat read its own entry with `.get`, which re-runs only when that entry changes.
:::

:::challenge Put a number on it
Write a test that fails if booking one seat in the fixed version causes more than one DOM write or more than three
re-runs.
:::solution
```tsx
test('booking a seat touches one row', async () => {
  render(Plane)
  await expect(() => user.click(screen.getByRole('button', { name: 'Book 4C' }))).toTouchAtMost(1, { runs: 3 })
  expect(screen.getByText('4C: taken')).toBeTruthy()
})
```

The budget is a promise about cost, checked on every run. If someone brings back `booked.value[id]`, the DOM writes stay
at one but the re-runs jump to one per seat, and the test fails with the counts.
:::
