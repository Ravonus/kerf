# State

:::learn
- How to give a component memory with `state`
- Why you read and write `.value`
- Why there are no re-renders
:::

A component that should remember something keeps it in `state`. `state(0)` makes a box holding `0`. Read and write the box
through `.value`.

:::demo getting-started

## A box, not a variable

```tsx
const inCart = state(0)
inCart.value++            // write
<Badge>{inCart.value}</Badge>  // read
```

`.value` is how weft knows who reads what. When JSX reads `inCart.value`, that spot in the page follows the box. When a
handler writes it, only those spots are updated. `Product` doesn't run again.

Write `.value` everywhere, JSX included. Rendering the box itself, `{inCart}`, is **W015**.

## Why not a `let`?

A plain `let` that a handler changes never updates the page, because the body that read it ran once. The compiler reports
that as **W041** and tells you to make it `state`. (A `let` that names a prop is different: see
[Passing props](/learn/passing-props).)

## Objects and arrays

Assign a new value to change it. To edit a copy in place, use `.set`, which hands you a shallow copy to change:

```tsx
const todos = state([{ id: 1, text: 'Pack', done: false }])
todos.value = [...todos.value, { id: 2, text: 'Go', done: false }]
todos.set(d => { d[0]!.done = true })
```

Writes are batched: the DOM updates once, after your handler. If you need it now, for example to focus an element that
just appeared, call `flush()` from `@weft-js/core`.

## Recap

- `state(initial)` makes a box. Read and write `.value`.
- Only what reads the box updates. The component body doesn't run again.
- Replace objects and arrays, or edit a copy with `.set`.

## Try it

:::challenge Remove from the cart
Add a second button that takes one away, but never below zero.
:::solution
```tsx
<Button emphasis="ghost" disabled={inCart.value === 0} onClick={() => inCart.value--}>
  Remove
</Button>
```
:::
