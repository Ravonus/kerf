# Sharing state

:::learn
- How two components share one piece of state
- When to pass state down and when to lift it out
- How `defineState` makes a named scope of shared state
:::

When two components need the same value, keep it in one place and let both read it.

## Pass it down

The simplest way is a parent that owns the state and passes it to both children: values as props, and a box with `bind:`
when a child changes it. Most sharing is this.

```tsx
import { state } from '@weft-js/core'

function Stepper(props: { value?: number }) {
  let { value = 1 } = props
  return <button type="button" onClick={() => value++}>{value}</button>
}

function Summary(props: { qty: number }) {
  return <p>{props.qty} in the basket</p>
}

export default function Checkout() {
  const qty = state(1)
  return (
    <>
      <Stepper bind:value={qty} />
      <Summary qty={qty.value} />
    </>
  )
}
```

`Stepper` and `Summary` never talk to each other. They share `qty` because `Checkout` owns it.

## Share a box

A box doesn't have to live in a component. Made in a module, any component that reads it follows it. Here both panes read
one list:

:::demo shared

## A named scope: `defineState`

For app-wide state, such as a basket, `defineState` groups boxes, derived values and actions under one name. Its setup runs
once per app, the first time something reads it. Any component imports it and reads what it needs:

:::demo scope

```tsx
import { defineState, derived, state } from '@weft-js/core'

export const basket = defineState('basket', () => {
  const items = state<string[]>([])
  const count = derived(() => items.value.length)
  return { items, count, add: (name: string) => (items.value = [...items.value, name]) }
})
```

A scope can do more than a loose box. A box made in its setup can persist through reloads and stay the same in every tab
(`state('', { persist: 'local', sync: 'tabs' })`; an object or array also needs a schema), and the scope can keep an undo history
(`defineState('basket', setup, { history: { limit: 100 } })`). Each test gets a fresh copy.

Server data is different: it lives in queries, not in client state. See [Routes and server functions](/learn/full-stack).

## Recap

- Pass values down as props. Pass a box, or `bind:`, when a child writes.
- A box in a module is shared by everyone who reads it.
- `defineState(name, setup)` is a named scope of shared state, with persistence, tab sync and history when you want them.

## Try it

:::challenge Empty the basket
Add a `clear` action to the scope and a button that calls it.
:::solution
```tsx
return { items, count, add: …, clear: () => (items.value = []) }
// …
<Button emphasis="ghost" onClick={() => basket.clear()}>Empty</Button>
```
:::
