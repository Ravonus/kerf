```tsx
import { state, derived } from '@weft-js/core'

export function Cart({ items, taxRate }: { items: Item[]; taxRate: number }) {
  const coupon = state<string | null>(null)
  const subtotal = derived(() => items.reduce((s, i) => s + i.price, 0))
  const total = derived(() => subtotal.value * (1 + taxRate))
  return (
    <section>
      <ul>{items.map(item => <Row key={item.id} item={item} />)}</ul>
      {coupon.value && <b>{coupon.value}</b>}
      <p>{format(total.value)}</p>
      <CouponInput value={coupon} />
    </section>
  )
}
```

1. **State is a box. Read and write `.value`.** Everywhere, JSX included (W015).
2. **Anything computed from other values is `derived`.** Never in a `watch`, never in the component body (W001). Only naming a prop is fine: `const x = props.y` stays live.
3. **JSX is always live.** Every `{expr}` and attribute re-evaluates when what it reads changes.
4. **Props are always current.** Destructure them (one level, W006). Read them in `derived`, `watch`, JSX or handlers.
5. **The component body runs once.** No early returns on state, no `let` counters. Branch in JSX.
6. **Pass a box only to give write access** (`value={coupon}`, child prop typed `State<string | null>`), or so list
   rows can read one entry: `cart.get(p.id)` re-runs one row, `cart[p.id]` or `cart.value[p.id]` re-runs them all
   (W017), in the list and in the row component alike.
7. **Lists and conditionals the way you know them**: `.map` with `key` (W010), `&&`, ternaries. Keep list items
   stable: replace only the item that changed (`p.id === id ? { ...p, price } : p`), never `({ ...p })` every item
   (W014).
8. **Copy a prop into state with `state.linked(() => prop)`**, not `state(prop)` (W005). `untrack(() => …)` is a
   snapshot that never updates: not for anything you render (W018).
9. **Side effects go in `watch(() => source, value => cleanup?)`**; DOM work in `onMount`. `flush()` applies pending
   DOM updates now.
