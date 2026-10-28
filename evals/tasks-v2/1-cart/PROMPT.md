Our cart component only lists items. Shoppers need to change quantities.

- Each line gets buttons labelled `Increase {name}` and `Decrease {name}` (use `aria-label`) and shows its quantity in
  an element with `data-testid="qty"`. Quantities start at 1.
- Decreasing a line at quantity 1 removes that line from the cart.
- Each line's `data-testid="line"` element shows `$` + price × quantity (2 decimals), and the total sums the lines.

The parent re-fetches `items` from the server every few seconds (prices can change, products can be added, and the
order can change), so the cart always has to reflect the latest data.
