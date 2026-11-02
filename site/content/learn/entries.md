# Reading one entry

:::learn
- How a row reads only its own entry with `box.get(key)`
- Why that keeps a long list fast
- How to keep list items stable
:::

When a box holds an object keyed by id, each row usually needs one entry. Read it with `.get(key)`:

:::demo entries

## `get` re-runs one row

```tsx
{stock.get(f)}          // re-runs when stock[f] changes
{stock.value[f]}        // re-runs when anything in stock changes
```

`stock.get(f)` makes that row depend on its own entry only, compared with `Object.is`. Adding one to the apple row re-runs
the apple row and nothing else. With `stock.value[f]`, every row depends on the whole object, so one change re-runs all of
them. The compiler warns about that with **W017**, and has an autofix.

The same holds across components: pass the box (`stock={stock}`, typed `State<Record<string, number>>`) and read
`props.stock.get(id)` in the row.

`.get` and `.set` come from `@weft-js/core/keyed`. You don't import it: the Vite plugin adds it to a module that uses them.

## Keep items stable

For an array of objects, replace only the item that changed:

```tsx
products.value = products.value.map(p => (p.id === id ? { ...p, price } : p))
```

Copying every item, `products.value.map(p => ({ ...p, price }))`, gives each one a new identity, so every row re-runs.
That's **W014**, and `weft check` follows the box into other files to find it.

## Recap

- `box.get(key)` reads one entry, and only that entry's changes re-run the reader.
- `box.set(d => { d[key] = … })` writes one entry.
- Replace only the item that changed in an array.

## Try it

:::challenge Sell one
Add a −1 button per row that never goes below zero.
:::solution
```tsx
<Button size="sm" emphasis="ghost" disabled={!stock.get(f)} onClick={() => stock.set(d => { d[f] = Math.max(0, (d[f] ?? 0) - 1) })}>
  −1
</Button>
```
:::
