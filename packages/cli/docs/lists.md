# Lists and conditionals

- `xs.map(x => <Row key={x.id} … />)` in JSX is a keyed list. Each key keeps its row; a new object under the same
  key updates the row in place.
- Over objects, a missing `key` is **W010** (autofix to `key={x.id}` when items have `id`). Over primitives, the
  value is the key.
- `xs.filter(…).sort(…).map(…)` works; put the chain in a `derived` when other code needs it too.
- No early `return` inside the `.map` callback (**W013**). Filter first.
- `cond && <X/>` with a number on the left renders `0` (**W011**). Write `n > 0 &&`.
- **Stable items (W014).** `xs.value = xs.value.map(p => ({ ...p, price }))` gives every item a new identity, so
  every row re-runs on every change (1 DOM write, hundreds of re-runs). Replace only what changed:

  ```ts
  products.value = products.value.map(p => (p.id === id ? { ...p, price } : p))
  ```

  The compiler sees this inside one file; `weft check` follows the box through props into other files.
- **One entry per row (W017).** A row that reads `cart[p.id]` (a prop) or `cart.value[p.id]` depends on the whole
  `cart`, so adding one item re-runs all 150 rows. Read the entry from the box: `cart.get(p.id)` re-runs only the row
  whose entry changed (`Object.is`). For a prop, pass the box (`cart={cart}`, typed `State<Cart>`); the box form
  has an autofix. The same holds one step further: passing `live={live.value[s.id]}` to a row component, or a row
  component reading `live.value[stock.id]` (in JSX or `derived`), re-runs every row. Pass the box and read
  `live.get(stock.id)` in the row.
