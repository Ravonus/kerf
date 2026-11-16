```tsx
import { derived } from '@kerf-js/core'

export function Cart({ items, taxRate }: {
  items: { id: string; name: string; price: number }[]
  taxRate: number
}) {
  const subtotal = derived(() =>
    items.reduce((s, i) => s + i.price, 0),
  )
  const total = derived(() => subtotal.value * (1 + taxRate))
  return (
    <section>
      <ul>
        {items.map(item => <li key={item.id}>{item.name}</li>)}
      </ul>
      <p>{total.value.toFixed(2)}</p>
    </section>
  )
}
```

1. **State is a box. Read and write `.value`**, including in JSX (W015).
2. **Compute from other values with `derived`**, not `watch` or the component body (W001).
3. **JSX is live.** Each `{expr}` and attribute re-evaluates when its inputs change.
4. **Props are current.** Destructure one level (W006). Read in `derived`, `watch`, JSX or handlers.
   `const x = props.y` is a live read-only alias; `let x = props.y` and `props.y =` write locally; only `bind:y={box}`
   writes out.
5. **The body runs once.** No state-based early returns (W040) or `let` counters (W041). Branch in JSX.
6. **Pass a box only to give write access** (`value={coupon}`, child prop typed `State<string | null>`), or so list
   rows can read one entry: `cart.get(p.id)` re-runs one row, `cart[p.id]` or `cart.value[p.id]` re-runs them all
   (W017), in the list and in the row component alike.
7. **Lists and conditionals**: `.map` with `key` (W010), `&&`, ternaries. Keep items
   stable: replace only the changed item (`p.id === id ? { ...p, price } : p`), never `({ ...p })` every item
   (W014).
8. **Copy a prop into state with `state.linked(() => prop)`**, not `state(prop)` (W005). `untrack(() => …)` is a
   snapshot that never updates: never render it (W018).
9. **Side effects go in `watch(() => source, value => cleanup?)`**; DOM work in `onMount`. `flush()` applies pending
   DOM updates now.

## HTTP route declarations

- **H018** (error): a page and HTTP route handle the same GET/HEAD
  path, or two HTTP modules declare the same path (param names do
  not distinguish paths). Keep only non-GET/HEAD HTTP methods beside
  a page, combine duplicate modules, or move the route.
- **H019** (error): an HTTP module has no named method exports,
  malformed or repeated params, a catch-all before the end, or a
  reserved `/_kerf/` path. Export named web methods and use whole
  `[param]` segments with only a final `[...rest]` or `[[...rest]]`.

`src/routes/index.tsx` beside `index.http.ts` exporting `GET` triggers
H018; exporting only `POST` is valid. `[...rest]/extra.http.ts`
triggers H019; `extra/[...rest].http.ts` exporting `GET` is valid.
There is no safe automatic relocation. `kerf docs start` has examples.
Q010 does not protect these raw handlers; apps must implement CSRF
protection for cookie-authorized writes.
