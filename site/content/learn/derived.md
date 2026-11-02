# Derived values

:::learn
- How to compute a value from state with `derived`
- Why derived values can't go stale
- Where computing is and isn't allowed
:::

Anything you can work out from other values is `derived`. You say how to compute it once, and weft keeps it right.

:::demo rules

## One rule, never out of sync

```tsx
const qty = state(1)
const shipping = derived(() => (qty.value >= 3 ? 0 : 4))
const total = derived(() => price * qty.value + shipping.value)
```

`derived` tracks what its function reads. `total` reads `qty` and `shipping`, so it follows both. You never list them.

A derived value is lazy and cached: it computes when something reads it, and again only after what it read has changed.
It's read-only. To change it, change what it reads.

## Where to compute

- **In `derived`**, when more than one place needs the value, or it is worth a name.
- **In JSX**, for a one-off: `{(qty.value * price).toFixed(2)}`.
- **Not in the body.** The body runs once, so `const total = price * qty.value` is computed once and never again. That's
  **W001**.
- **Not in a `watch`.** Effects are for the outside world (see [Effects and refs](/learn/effects)). A value set from a
  `watch` lags a step behind and can loop.

`derived` takes a plain function. For data that arrives later, use `resource` (see [Loading data](/learn/loading-data)).
`derived(async …)` is **W012**.

## Recap

- `derived(() => …)` names a value computed from boxes and other derived values.
- It follows what it reads, computes lazily and caches.
- Compute in `derived` or JSX, never in the body or a `watch`.

## Try it

:::challenge A free-shipping hint
Show how many more items get free shipping, until they do.
:::solution
```tsx
const toFree = derived(() => Math.max(0, 3 - qty.value))
// …
{toFree.value > 0 && <p>{toFree.value} more for free shipping</p>}
```
:::
