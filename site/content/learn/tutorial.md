# Tutorial: a shop with a server

:::learn
- How to build a small app from components, props and state
- How to keep quantities in one keyed box and compute totals with `derived`
- How to filter a list and handle a form
- How to move the data into a server `query` and the checkout into a `mutation`
:::

In this tutorial you'll build a small coffee shop. You start with a list of products, then add a cart, quantities, a
total with shipping, a search box and a checkout. Then you move the products and the checkout to the server, and the
shop becomes a full-stack app.

You don't need to know anything beyond the [Quick start](/learn/quick-start), and you don't need to have read it
closely. Each step explains what it adds and why. The techniques you'll practise are the ones nearly every Weft app
uses, so working through this page is the quickest way to get a feel for the framework.

:::note What the steps look like
Each client step below is a live example with its full source beside it. The lines that are new since the step before
are marked, so you can read only what changed. The server steps at the end can't run on this page, which has no server,
so they are shown as complete files you can paste into an app of your own.
:::

## Before you start

There are two ways to follow along.

**Read and play here.** Every client step runs on this page. Press the buttons, read the code, and compare it with the
step before. That's enough to learn everything until the server part.

**Build it in your own app.** Weft isn't on npm yet, so you make an app from a checkout of the repository, as
[Installation](/learn/installation) explains:

```bash
git clone https://github.com/Ravonus/weft.git
node weft/packages/create/scripts/local.mjs new my-shop --yes
cd my-shop
npx weft dev
```

`--yes` takes the defaults: Warp for the UI and a SQLite database, which you won't need for this tutorial, though the
server part uses `zod`, which comes with it. Once Weft is published, `npm create @weft-js -- my-shop --yes` will do the
same in one step.

Then create `src/routes/shop.tsx`, paste each step's code into it, and open `/shop` in the browser. A file in
`src/routes` is a page, and its default export is what the page shows. When you save, `weft dev` swaps the new code in
and keeps what you'd typed and clicked where it can.

## Overview

Here is what you're building, from the outside in:

- **`Shop`** is the whole page. It owns the data: the cart, the search text, the email for the receipt.
- **`ProductRow`** shows one product with its price and a quantity you can change.
- Below the list sit the totals and a checkout form.

The data flows the way it does in most apps. `Shop` keeps the state, passes what each row needs down as props, and
works out the totals from the state it holds.

## Step 1: a list of products

Start with a list. There's no state yet: the shop shows what it sells.

:::demo start-tutorial-step-1

Let's read it from the top.

```tsx
const PRODUCTS = [
  { id: 'beans', name: 'House beans, 250 g', price: 12 },
  // …
]
```

`PRODUCTS` is ordinary data in an ordinary constant, outside any component. Nothing about it is special to Weft. Later
in the tutorial it moves to the server, and the code that uses it hardly changes.

```tsx
type Product = (typeof PRODUCTS)[number]
```

This line says "a `Product` is whatever one item of `PRODUCTS` is". TypeScript works out the shape from the data, so the
two never disagree. You could write the type out by hand instead: `{ id: string; name: string; price: number }`.

```tsx
function ProductRow({ product }: { product: Product }) {
```

`ProductRow` is a component, a function that returns TSX. Its argument is its **props**: the data its parent passes it.
Here there's one prop, `product`. Destructuring it in the parameter list, `({ product })`, is the same as writing
`(props)` and then `props.product` everywhere.

:::note Props stay live
In Weft a component runs once. You might expect a destructured prop to be a snapshot, frozen at that first run. It
isn't: the compiler turns each prop into a live read, so `product.name` in the markup always reads the prop as it is
now. That matters from Step 5, when the parent starts changing what it passes. Destructure one level only:
`({ product: { name } })` can't stay live, and the compiler reports it as **W006**.
:::

```tsx
{PRODUCTS.map(p => (
  <ProductRow key={p.id} product={p} />
))}
```

`Shop` turns each product into a `ProductRow` with `.map`, passing the product as the `product` prop. The `key` is how
Weft tells rows apart: when the list changes, a row with the same key is kept and moved, not rebuilt. Use something that
belongs to the item, such as its id. On a list of objects, a missing `key` is **W010**.

`Card` comes from Warp, Weft's UI toolkit. It draws a panel with a title.

## Step 2: add to cart

A shop needs a cart. The cart has to remember what's been added, so it is **state**.

:::demo start-tutorial-step-2

There are three new pieces. First, the cart's type and the state that holds it:

```tsx
type Cart = Record<string, number>
// …
const cart = state<Cart>({})
```

`state({})` makes a **box** that holds an object, starting empty. The object maps a product's id to how many of it are
in the cart: `{ beans: 2, mug: 1 }`. A box is read and written through `.value`, and anything that reads it follows it.

Second, `Shop` passes the box itself to each row:

```tsx
<ProductRow
  key={p.id}
  product={p}
  cart={cart}
/>
```

and `ProductRow` types that prop as `State<Cart>`. Usually you pass a value, `cart.value`, and the child only reads it.
Passing the box is how you give a child the right to change it, and, as you'll see in a moment, it lets each row read
only its own entry.

Third, the row reads and writes its entry:

```tsx
const add = () => cart.set(d => {
  d[product.id] = (d[product.id] ?? 0) + 1
})
// …
<Badge count>{cart.get(product.id) ?? 0}</Badge>
```

`cart.set(d => …)` hands you a copy of the object, `d`, to change. When the function returns, the copy becomes the new
value. You could write the same thing as an assignment,
`cart.value = { ...cart.value, [product.id]: (cart.value[product.id] ?? 0) + 1 }`, but `.set` says it more plainly.

`cart.get(product.id)` reads one entry. The badge then follows that one entry, not the whole cart. Press Add on the
grinder, and only the grinder's badge is touched; the others don't even check.

:::pitfall Read one entry with .get, not .value[id]
`cart.value[product.id]` gives the same number, but it reads the whole box, so every row would update whenever any
row's count changed. With four products you'd never notice; with four hundred you would. The compiler warns about it as
**W017** and offers the `.get` form. `.get` is for exactly this: list rows that each care about one key of a shared
object.
:::

:::deepdive Why not give each row its own state?
You could put `const count = state(0)` inside `ProductRow`, as each counter on the Quick start page did. The rows would
count fine. But the totals in Step 4 need every row's count, and the checkout needs the whole cart, and a parent can't
reach into its children to read their state.

So the state goes in the closest component that needs all of it: `Shop`. This is called *lifting state up*, and you'll
do it in every app. The rows get what they need through props. In React the same move means passing the value and a
callback to every row. In Weft you can pass the box, because a box carries both the reading and the writing, and
`.get` keeps each row's reading narrow.
:::

## Step 3: quantities

Adding is good; taking away is better. Replace the Add button and the badge with a small stepper: minus, the count,
plus.

:::demo start-tutorial-step-3

The row's count is now a **derived** value:

```tsx
const qty = derived(() => cart.get(product.id) ?? 0)
```

`derived` names a value worked out from other values. `qty` reads one entry of the cart, so it follows that entry. You
don't list what it depends on; Weft sees what it read. The row reads `qty.value` twice, in the count and in the minus
button's `disabled`, and naming it keeps the two the same.

Why not `const qty = cart.get(product.id) ?? 0`? Because the component body runs once. That line would read the entry
once, when the row first appeared, and never again. The compiler catches that as **W001** and offers `derived`. Inside
the markup, `{cart.get(product.id) ?? 0}` would be live, as every expression in braces is; it's only the body that runs
once.

The two buttons share one function:

```tsx
const change = (by: number) =>
  cart.set(d => {
    d[product.id] = Math.max(0, (d[product.id] ?? 0) + by)
  })
```

`Math.max(0, …)` keeps a count from going below zero, and `disabled={qty.value === 0}` turns the minus button off at
zero, so the person can see it won't go lower. `disabled` is an attribute like any other: it reads `qty`, so it follows
`qty`.

## Step 4: a total and shipping

Now the shop should say what the order costs. Shipping is $4, free from $40, and nothing at all for an empty cart.

:::demo start-tutorial-step-4

All four new values are `derived`, in `Shop`:

```tsx
const items = derived(() =>
  PRODUCTS.reduce((n, p) => n + (cart.get(p.id) ?? 0), 0),
)
const subtotal = derived(() =>
  PRODUCTS.reduce(
    (sum, p) => sum + (cart.get(p.id) ?? 0) * p.price, 0,
  ),
)
const shipping = derived(() =>
  subtotal.value === 0 || subtotal.value >= 40 ? 0 : 4,
)
const total = derived(() => subtotal.value + shipping.value)
```

Each one says what the value *is*, once. Nowhere does the code say "when the cart changes, update the subtotal, then the
shipping, then the total". Weft works that out: `total` reads `subtotal` and `shipping`, `shipping` reads `subtotal`,
and `subtotal` reads the cart. A change to the cart reaches every one of them, in the right order, and the page is
updated once.

This is the habit to build: **if a value can be worked out from other values, it is `derived`, not state.** Keeping a
`total` in state and updating it in every handler is how carts end up showing the wrong number. A derived value can't
fall out of step, because there is nothing to keep in step.

:::deepdive Isn't this a lot of work on every click?
No. A derived value is lazy and cached. It computes when something reads it, and again only after something it read has
changed. A click that changes the mug's count recomputes `items`, `subtotal`, `shipping` and `total` once each, and
writes the text nodes that show them. Nothing else runs: not `Shop`, not the other rows.

In React you might wrap these in `useMemo` to avoid recomputing them on every render. Weft has no renders to avoid, so
`derived` isn't an optimisation. It's how you name a value that follows other values.
:::

## Step 5: search

With more products, people want to search. Add a search box that filters the list as you type.

:::demo start-tutorial-step-5

The search text is state, and the input writes it:

```tsx
const search = state('')
// …
<Input
  label="Search"
  value={search.value}
  onInput={e => (search.value = e.currentTarget.value)}
/>
```

`Input` is Warp's text field. `value={search.value}` shows the state, and `onInput` writes it on every key press. The two
together make a *controlled* input: the state is the truth, and the field shows it.

The list to show is derived from the text:

```tsx
const shown = derived(() => {
  const word = search.value.trim().toLowerCase()
  return PRODUCTS.filter(p => p.name.toLowerCase().includes(word))
})
```

and the markup maps `shown.value` instead of `PRODUCTS`. The filter is a line of plain JavaScript. There's no effect to
run and no list to keep in sync: `shown` follows `search`, and the list follows `shown`.

Try the demo's suggestion: add a mug, search for "be" so the mug's row disappears, then clear the box. The mug comes back
with its count. When a row leaves the list, its `ProductRow` is removed, and a new one is made when it comes back. The
count survives because it was never in the row: it lives in `cart`, keyed by the product's id, and the new row reads the
same entry. That's the payoff of lifting the state up in Step 2.

Notice also that `items` and `subtotal` still add up `PRODUCTS`, not `shown`. Searching changes what you see, not what
you've bought.

:::pitfall Filter first, then map
You might try to skip non-matching rows inside the `.map` with an early `return null`. Don't: an early `return` inside
a `.map` callback in markup is **W013**. Filter the array first, as `shown` does, then map what's left.
:::

The last new line shows a message when nothing matches:

```tsx
{shown.value.length === 0 && <p>Nothing matches “{search.value}”.</p>}
```

`&&` shows the paragraph only while the left side is true. Note that the left side is a comparison, `length === 0`. A
bare number on the left, such as `shown.value.length && …`, would render a `0` when the list was empty, which is
**W011**.

## Step 6: checkout

Last on the client: a form that takes an email for the receipt and places the order.

:::demo start-tutorial-step-6

Two more boxes hold the email and, once an order is placed, the receipt:

```tsx
const email = state('')
const receipt = state<{ email: string; total: number } | null>(null)
```

`receipt` starts as `null`, meaning "no order yet". Its type says it can hold either.

The form's handler runs when it is submitted:

```tsx
const checkout = (e: SubmitEvent) => {
  e.preventDefault()
  receipt.value = { email: email.value, total: total.value }
  cart.value = {}
}
```

`e.preventDefault()` stops the browser's own form submission, which would load a new page. Then the handler records the
receipt and empties the cart by giving it a new, empty object. `cart.value = {}` reaches every row, the totals and the
button at once, and the page is updated once, after the handler returns: writes in a handler are batched.

The form uses the browser's own validation. `type="email"` and `required` on the input mean the browser won't submit the
form until the field holds an email address, so `checkout` never sees an empty one. The submit button is off while the
cart is empty: `disabled={items.value === 0}`.

The receipt shows when there is one:

```tsx
{receipt.value && (
  <p>
    Thanks! ${receipt.value.total} paid. The receipt goes to{' '}
    {receipt.value.email}.
  </p>
)}
```

`receipt.value && …` is safe here because the left side is an object or `null`, never a number.

That's the whole client. It's about sixty lines, and it has no effects, no memoisation and no list of dependencies
anywhere. Every value on the screen is either state, or derived from state, or a prop.

## Moving to the server

The shop works, but everything in it lives in the browser. That's fine for a demo and wrong for a real shop, for two
reasons:

- **The products belong on the server.** In a real shop they live in a database, change without a new release, and
  are shared by every customer.
- **The browser can't be trusted with prices.** Anyone can open the developer tools and change `total` to a cent. The
  server has to work out what an order costs from its own prices.

Weft's full-stack part, `@weft-js/start`, gives you two tools for this. A **query** reads data on the server, and a
component calls it like a function. A **mutation** changes something on the server: here, it places the order. Both
live in modules under `src/server/`. The browser never gets their code: it gets small stubs that call the server for
you.

This page has no server, so the next steps aren't live. If you're building in your own app, follow along there; if not,
read them as you'd read the code of an app you're joining.

### A rule both sides share

First, take the shipping rule out of the component, into a module of its own. Both the page and the server will use it,
so they can never disagree about what shipping costs:

```ts
// src/shipping.ts
/** Shipping is free from $40 and for an empty cart. */
export const shippingFor = (subtotal: number) =>
  subtotal === 0 || subtotal >= 40 ? 0 : 4
```

A plain module like this is safe to import anywhere. The ones that must stay on the server are under `src/server/`.

## Step 7: products from a query

Move `PRODUCTS` into a server module, and export a query that returns it:

```ts
// src/server/shop.ts
import { query } from '@weft-js/start'

export type Product = { id: string; name: string; price: number }

const PRODUCTS: Product[] = [
  { id: 'beans', name: 'House beans, 250 g', price: 12 },
  { id: 'filters', name: 'Paper filters', price: 5 },
  { id: 'grinder', name: 'Hand grinder', price: 40 },
  { id: 'mug', name: 'Enamel mug', price: 9 },
]

export const listProducts = query({
  run: () => PRODUCTS,
})
```

`query({ run })` declares a server function that reads. `run` is what happens on the server; here it returns the list.
In a real app it would read a table instead, `run: ({ ctx }) => ctx.db.select().from(products)`, and the rest of this
tutorial wouldn't change. [Database](/learn/database) shows how.

`PRODUCTS` isn't exported, so nothing outside the server can reach it. The `Product` type is exported: types vanish
when the code is compiled, so the page can share it without pulling in any server code.

## Step 8: the page reads the query

Now the page. Compared with Step 6 it gains a few imports and a `meta`, `PRODUCTS` becomes the query's result, and
shipping comes from `shippingFor`:

```tsx
// src/routes/shop.tsx
import { derived, state, type State } from '@weft-js/core'
import type { Meta } from '@weft-js/start'
import { Button, Card, Input } from '@weft-js/warp'
import { listProducts, type Product } from '#/server/shop'
import { shippingFor } from '#/shipping'

export const meta: Meta = {
  title: 'Shop',
  description: 'Coffee beans and the gear to brew them.',
}

type Cart = Record<string, number>

function ProductRow(
  { product, cart }: { product: Product; cart: State<Cart> },
) {
  const qty = derived(() => cart.get(product.id) ?? 0)
  const change = (by: number) =>
    cart.set(d => {
      d[product.id] = Math.max(0, (d[product.id] ?? 0) + by)
    })
  return (
    <p>
      {product.name} <strong>${product.price}</strong>
      <Button
        size="sm"
        emphasis="outline"
        disabled={qty.value === 0}
        onClick={() => change(-1)}
      >
        −
      </Button>
      <strong> {qty.value} </strong>
      <Button
        size="sm"
        emphasis="outline"
        onClick={() => change(1)}
      >
        +
      </Button>
    </p>
  )
}

export default function Shop() {
  const products = listProducts()
  const all = derived(() => products.value ?? [])
  const cart = state<Cart>({})
  const search = state('')
  const email = state('')
  const receipt = state<{ email: string; total: number } | null>(null)
  const shown = derived(() => {
    const word = search.value.trim().toLowerCase()
    return all.value.filter(p => p.name.toLowerCase().includes(word))
  })
  const items = derived(() =>
    all.value.reduce((n, p) => n + (cart.get(p.id) ?? 0), 0),
  )
  const subtotal = derived(() =>
    all.value.reduce(
      (sum, p) => sum + (cart.get(p.id) ?? 0) * p.price, 0,
    ),
  )
  const shipping = derived(() => shippingFor(subtotal.value))
  const total = derived(() => subtotal.value + shipping.value)
  const checkout = (e: SubmitEvent) => {
    e.preventDefault()
    receipt.value = { email: email.value, total: total.value }
    cart.value = {}
  }
  return (
    <Card title="The shop">
      <Input
        label="Search"
        value={search.value}
        onInput={e => (search.value = e.currentTarget.value)}
      />
      {shown.value.map(p => (
        <ProductRow
          key={p.id}
          product={p}
          cart={cart}
        />
      ))}
      <p>
        {items.value} items · subtotal ${subtotal.value}
        {' '}· shipping ${shipping.value}
      </p>
      <p><strong>Total ${total.value}</strong></p>
      <form onSubmit={checkout}>
        <Input
          label="Email for the receipt"
          type="email"
          required
          value={email.value}
          onInput={e => (email.value = e.currentTarget.value)}
        />
        <Button type="submit" disabled={items.value === 0}>
          Place order
        </Button>
      </form>
      {receipt.value && (
        <p>
          Thanks! ${receipt.value.total} paid.{' '}
          The receipt goes to{' '}
          {receipt.value.email}.
        </p>
      )}
    </Card>
  )
}
```

Here is what changed.

```tsx
const products = listProducts()
const all = derived(() => products.value ?? [])
```

Calling a query in a component gives you a **resource**: a value that arrives later. `products.value` is `undefined`
until the answer comes back, then holds the list. `all` names "the products, or none yet", so the rest of the component
reads `all.value` where it used to read `PRODUCTS`, and doesn't need to think about the moment before the data arrives.
`products.pending` says whether a fetch is under way, and `products.error` holds a failure.

On the first visit, the server runs the query while it renders the page and waits for the answer before it sends
anything, so the HTML arrives with the products already in it and the browser doesn't ask again. The `?? []` covers the
other cases, such as arriving at the shop from another page of the app, when the browser fetches the list itself.

:::note Showing a placeholder instead
For a slow query you'd rather not hold up the whole page. Create the query inside a `<Boundary pending={…}>` and the
server sends the rest of the page at once, shows the `pending` content where the data will go, and streams the data in
when it's ready. [Async and loading states](/learn/async-and-loading) shows how.
:::

```tsx
import type { Meta } from '@weft-js/start'

export const meta: Meta = {
  title: 'Shop',
  description: 'Coffee beans and the gear to brew them.',
}
```

`meta` sets the page's title and description. It's read on the server and never reaches the browser's code. Give every
page one: a title and a plain sentence about what's on it.

`#/server/shop` is the app's own `src/server/shop.ts`. The `#/` prefix points at `src/`, so imports don't need
`../../`.

:::pitfall Don't copy query results into state
It's tempting to write `const all = state(products.value ?? [])`. That takes the value once, before the answer has
even arrived, and never follows the query again. Read the query, or derive from it, as `all` does. `weft check` reports
server data copied into `state` as **S001**.
:::

:::deepdive Where the code runs
`src/server/shop.ts` is a server module. When the browser's bundle is built, Weft replaces each `query` and `mutation`
in it with a stub that sends a request, so `PRODUCTS` and every `run` stay on the server. That is also why a server
module can import a database client or read secrets from the environment.

`src/routes/shop.tsx` runs in both places. On the first visit the server renders it to HTML, with the query's result
included; then the browser takes over, and `Shop` runs once more there to wire up the page. From then on, clicks and
keystrokes are handled in the browser and never touch the server, until the order is placed.
:::

## Step 9: the order as a mutation

Now the checkout. Add a mutation to the server module. It takes the email and the cart, checks them, prices the order
from the server's own list, and returns a receipt:

```ts
// src/server/shop.ts
import { FnError, mutation, query } from '@weft-js/start'
import { z } from 'zod'
import { shippingFor } from '#/shipping'

export type Product = { id: string; name: string; price: number }

const PRODUCTS: Product[] = [
  { id: 'beans', name: 'House beans, 250 g', price: 12 },
  { id: 'filters', name: 'Paper filters', price: 5 },
  { id: 'grinder', name: 'Hand grinder', price: 40 },
  { id: 'mug', name: 'Enamel mug', price: 9 },
]

export const listProducts = query({
  run: () => PRODUCTS,
})

export const placeOrder = mutation({
  input: z.object({
    email: z.email(),
    lines: z.record(z.string(), z.number().int().min(0).max(20)),
  }),
  run: ({ input }) => {
    let subtotal = 0
    for (const [id, qty] of Object.entries(input.lines)) {
      const product = PRODUCTS.find(p => p.id === id)
      if (!product) {
        throw new FnError({ message: `We don't sell ${id}.` }, 400)
      }
      subtotal += product.price * qty
    }
    if (subtotal === 0) {
      throw new FnError({ message: 'Your cart is empty.' }, 400)
    }
    return {
      order: crypto.randomUUID().slice(0, 8),
      email: input.email,
      total: subtotal + shippingFor(subtotal),
    }
  },
})
```

`input` is a schema, here written with `zod`. The server checks every call against it before `run` sees anything, so in
`run`, `input.email` is a valid address and every quantity is a whole number from 0 to 20. A call that fails the check is
refused, with the problems listed, and `run` never runs. The schema also gives the mutation its type: the page can't
call it with the wrong shape.

`run` works out the total from the server's prices. The browser sends only *what* it wants: ids and quantities. It
never sends a price, so there's nothing to tamper with. `FnError` refuses a call with a message the person can read and
an HTTP status.

And the page: the handler calls the mutation, and two new lines show what's happening.

```tsx
// src/routes/shop.tsx
import { derived, state, type State } from '@weft-js/core'
import type { Meta } from '@weft-js/start'
import { Button, Card, Input } from '@weft-js/warp'
import {
  listProducts,
  placeOrder,
  type Product,
} from '#/server/shop'
import { shippingFor } from '#/shipping'

export const meta: Meta = {
  title: 'Shop',
  description: 'Coffee beans and the gear to brew them.',
}

type Cart = Record<string, number>
type Receipt = { order: string; email: string; total: number }

function ProductRow(
  { product, cart }: { product: Product; cart: State<Cart> },
) {
  const qty = derived(() => cart.get(product.id) ?? 0)
  const change = (by: number) =>
    cart.set(d => {
      d[product.id] = Math.max(0, (d[product.id] ?? 0) + by)
    })
  return (
    <p>
      {product.name} <strong>${product.price}</strong>
      <Button
        size="sm"
        emphasis="outline"
        disabled={qty.value === 0}
        onClick={() => change(-1)}
      >
        −
      </Button>
      <strong> {qty.value} </strong>
      <Button
        size="sm"
        emphasis="outline"
        onClick={() => change(1)}
      >
        +
      </Button>
    </p>
  )
}

export default function Shop() {
  const products = listProducts()
  const all = derived(() => products.value ?? [])
  const cart = state<Cart>({})
  const search = state('')
  const email = state('')
  const receipt = state<Receipt | null>(null)
  const problem = state('')
  const shown = derived(() => {
    const word = search.value.trim().toLowerCase()
    return all.value.filter(p => p.name.toLowerCase().includes(word))
  })
  const items = derived(() =>
    all.value.reduce((n, p) => n + (cart.get(p.id) ?? 0), 0),
  )
  const subtotal = derived(() =>
    all.value.reduce(
      (sum, p) => sum + (cart.get(p.id) ?? 0) * p.price, 0,
    ),
  )
  const shipping = derived(() => shippingFor(subtotal.value))
  const total = derived(() => subtotal.value + shipping.value)
  const checkout = async (e: SubmitEvent) => {
    e.preventDefault()
    problem.value = ''
    try {
      receipt.value = await placeOrder({
        email: email.value,
        lines: cart.value,
      })
      cart.value = {}
    } catch (err) {
      problem.value = err instanceof Error
        ? err.message
        : 'The order did not go through.'
    }
  }
  return (
    <Card title="The shop">
      <Input
        label="Search"
        value={search.value}
        onInput={e => (search.value = e.currentTarget.value)}
      />
      {shown.value.map(p => (
        <ProductRow
          key={p.id}
          product={p}
          cart={cart}
        />
      ))}
      <p>
        {items.value} items · subtotal ${subtotal.value}
        {' '}· shipping ${shipping.value}
      </p>
      <p><strong>Total ${total.value}</strong></p>
      <form onSubmit={checkout}>
        <Input
          label="Email for the receipt"
          type="email"
          required
          value={email.value}
          onInput={e => (email.value = e.currentTarget.value)}
        />
        <Button
          type="submit"
          loading={placeOrder.pending.value}
          disabled={items.value === 0}
        >
          Place order
        </Button>
      </form>
      {problem.value && <p role="alert">{problem.value}</p>}
      {receipt.value && (
        <p>
          Thanks! Order {receipt.value.order}: ${receipt.value.total}
          {' '}paid. The receipt goes to {receipt.value.email}.
        </p>
      )}
    </Card>
  )
}
```

Here is what changed.

```tsx
receipt.value = await placeOrder({
  email: email.value,
  lines: cart.value,
})
```

A mutation is called like an async function. It sends the input to the server, waits, and gives back what `run`
returned. The receipt now comes from the server, with an order number and the total the *server* worked out. The page's
own total is still there, for showing; the server's is the one that counts.

```tsx
} catch (err) {
  problem.value = err instanceof Error
    ? err.message
    : 'The order did not go through.'
}
```

When the server refuses, the call rejects with an `FnError`. For a refusal from `run`, its `message` is the one `run`
threw, such as "Your cart is empty.", written for the person to read. For input the schema refused, the error's `code` is
`Q002` and `err.issues` lists each problem with the field it belongs to, which is what you'd use to mark a field in a
bigger form ([Forms and validation](/learn/forms-and-validation) shows how). The `problem` box holds the message, and a
paragraph with `role="alert"` shows it, so a screen reader announces it too.

```tsx
<Button type="submit" loading={placeOrder.pending.value} …>
```

Every mutation has a `pending` value that's true while a call is in flight. Warp's `Button` takes it as `loading`: it
shows that work is under way and ignores presses, so an impatient double click doesn't place two orders. There's also
`placeOrder.error.value`, the last call's failure, if you'd rather read that than catch.

The cart is emptied only after the server says yes. If the call fails, everything the person chose is still there to try
again.

:::note Live updates and stock
This shop's product list never changes while you look at it. When it does, say because stock runs out, give the query
`tags: ['products']` and the mutation `invalidates: ['products']`. Then the response to `placeOrder` brings the fresh
product list with it, and every page reading `listProducts()` updates, with no extra code. The third challenge below
does exactly that. [Server functions](/learn/server-functions) and [Realtime and live data](/learn/live-data) go further.
:::

## Wrapping up

You've built a shop that:

- lists products from a server query, already in the first HTML,
- keeps a cart of quantities in one keyed box, where each row reads only its own entry,
- works out the item count, subtotal, shipping and total with `derived`, so they're never out of step,
- filters the list as you type, without losing what's in the cart,
- takes an order through a form, and has the server check it, price it and answer.

Look back at the code and notice what isn't there: no effects, no memoisation, no dependency arrays, no re-renders to
think about, and no code that keeps one value in step with another. Every component ran once. After that, each click
wrote a box, and Weft updated the few places on the page that read it.

### What to build next

If you want to keep going with this shop, here are ideas, roughly from small to large:

- Show a line per product in the cart, with its own subtotal, above the total.
- Keep the cart through a reload. Move it into `defineState` with `persist: 'local'`:
  [App-wide state with defineState](/learn/app-wide-state) shows how.
- Put the products in a real table with Drizzle: [Database](/learn/database).
- Ask people to sign in before they order, and keep their past orders: [Auth](/learn/auth).
- Take payment at checkout: [Payments](/learn/payments).
- Give each product its own page at `src/routes/products/[id].tsx`: [Routing and layouts](/learn/routing-and-layouts).

To understand how to plan an app like this from scratch, read [Thinking in Weft](/learn/thinking-in-weft) next.

## Recap

- A component is a function that returns TSX. It runs once, and its props stay live.
- State is a box: `state(initial)`, read and written through `.value`. `.set(d => …)` edits a copy, and `.get(key)`
  reads one entry so a list row follows only its own.
- Put state in the closest component that needs all of it, and pass it down: the value to read, or the box to write.
- Anything that can be worked out from other values is `derived`. Never keep it in step by hand.
- A `query` in `src/server/` reads on the server; a component calls it and gets a resource. A `mutation` changes things
  on the server, checks its input with a schema, and is called like an async function.
- Never trust the browser with what the server can work out for itself, such as a price.

## Try it

:::challenge Empty the cart
Add a button under the totals that empties the cart in one press. It should be off when the cart is already empty.
Start from the Step 6 demo.
:::solution
```tsx
<Button
  emphasis="ghost"
  tone="neutral"
  disabled={items.value === 0}
  onClick={() => (cart.value = {})}
>
  Empty the cart
</Button>
```
Replacing the whole object writes the box once. Every row's `cart.get(…)` sees its entry go, and `items`, `subtotal`,
`shipping` and `total` follow, all in one update.
:::

:::challenge How far to free shipping?
Under the totals, show "Add $N more for free shipping." while the cart has something in it but is under $40. Hide the
line once shipping is free.
:::solution
```tsx
const toFree = derived(() => Math.max(0, 40 - subtotal.value))
// …in the markup:
{subtotal.value > 0 && toFree.value > 0 && (
  <p>Add ${toFree.value} more for free shipping.</p>
)}
```
`toFree` is one more derived value, so it can't disagree with `shipping`. Both sides of each `&&` are comparisons, so a
zero never shows up on the page.
:::

:::challenge Stock on the server
Give each product a stock count on the server. `placeOrder` should refuse an order for more than is in stock, take the
stock down when it succeeds, and the page's product list should update to show the new stock without a reload.
:::solution
Keep the counts in the server module, return them with each product, and connect the two functions with a tag:

```ts
// src/server/shop.ts
import { FnError, mutation, query } from '@weft-js/start'
import { z } from 'zod'
import { shippingFor } from '#/shipping'

export type Product = {
  id: string
  name: string
  price: number
  stock: number
}

// A real shop keeps these in a table. In memory, they last
// until the server restarts.
const PRODUCTS: Product[] = [
  { id: 'beans', name: 'House beans, 250 g', price: 12, stock: 20 },
  { id: 'filters', name: 'Paper filters', price: 5, stock: 50 },
  { id: 'grinder', name: 'Hand grinder', price: 40, stock: 3 },
  { id: 'mug', name: 'Enamel mug', price: 9, stock: 8 },
]

export const listProducts = query({
  tags: ['products'],
  run: () => PRODUCTS.map(p => ({ ...p })),
})

export const placeOrder = mutation({
  input: z.object({
    email: z.email(),
    lines: z.record(z.string(), z.number().int().min(0).max(20)),
  }),
  invalidates: ['products'],
  run: ({ input }) => {
    const lines = Object.entries(input.lines)
      .filter(([, qty]) => qty > 0)
    let subtotal = 0
    for (const [id, qty] of lines) {
      const product = PRODUCTS.find(p => p.id === id)
      if (!product) {
        throw new FnError({ message: `We don't sell ${id}.` }, 400)
      }
      if (qty > product.stock) {
        throw new FnError({
          message: `Only ${product.stock} of ${product.name} left.`,
        }, 409)
      }
      subtotal += product.price * qty
    }
    if (subtotal === 0) {
      throw new FnError({ message: 'Your cart is empty.' }, 400)
    }
    for (const [id, qty] of lines) {
      const product = PRODUCTS.find(p => p.id === id)
      if (product) product.stock -= qty
    }
    return {
      order: crypto.randomUUID().slice(0, 8),
      email: input.email,
      total: subtotal + shippingFor(subtotal),
    }
  },
})
```

Every check runs before any stock changes, so a refused order changes nothing. `invalidates: ['products']` makes the
response to a successful order carry `listProducts` fresh, so the page updates with no code of its own. To show the
stock, add `{product.stock} left` to `ProductRow`, and stop the plus button at it:
`disabled={qty.value >= product.stock}`.
:::
