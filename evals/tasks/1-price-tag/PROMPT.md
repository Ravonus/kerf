Build a `PriceTag` component.

Props:

```ts
{ productId: string; unitPrice: number; taxRate: number; initialQty: number }
```

Behaviour:

- An `<input>` labelled **Quantity** (use `<label>` or `aria-label`) holds the quantity. It starts at `initialQty`.
- An element with `data-testid="subtotal"` shows `Subtotal: $X.XX`, where X.XX is `unitPrice × quantity` formatted with `toFixed(2)`.
- An element with `data-testid="total"` shows `Total: $X.XX`, where X.XX is `subtotal × (1 + taxRate)` formatted with `toFixed(2)`.
- Typing in the quantity input updates both lines immediately. An empty or non-numeric quantity counts as 0.
- If the parent changes `unitPrice` or `taxRate`, both lines update immediately and the quantity the user typed is kept.
- If the parent changes `productId`, the quantity resets to the current `initialQty`.
- If the parent changes only `initialQty` (same `productId`), the quantity the user typed is kept.
