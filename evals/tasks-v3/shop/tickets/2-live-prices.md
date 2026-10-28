# Ticket 2: live prices

The backend can now push price changes. Add this method to the `Api` interface (and to `createFakeApi`, which can
push a random change every few seconds):

```ts
subscribePrices(onUpdate: (update: { id: string; price: number }) => void): () => void // returns unsubscribe
```

Prices change while people shop. Everything the shopper sees (product list, cart lines, cart total) must always use
the current price.

In the cart, each line whose current price differs from the price when the product was put in the cart shows
`Price up` or `Price down` in an element with `data-testid="price-change"`. If the price goes back to what it was,
the indicator disappears. Removing a product from the cart and adding it again starts fresh.
