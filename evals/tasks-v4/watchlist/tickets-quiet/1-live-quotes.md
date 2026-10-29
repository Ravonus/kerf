# Ticket 1: live quotes

The backend now pushes quotes. Add this method to the `Api` interface (and to `createFakeApi`, which can push a few
random quotes per second):

```ts
subscribeQuotes(onQuote: (quote: { id: string; price: number }) => void): () => void // returns unsubscribe
```

- Each row shows the stock's current price and its change versus `prevClose`.
- Each row also shows a sparkline of that stock's last 20 prices, oldest first, starting with the price the list
  loaded with. Every quote appends one price. Render it as
  `<svg data-testid="spark" width="60" height="16"><path d={sparkline(history)} /></svg>`.
- The header's portfolio value must always use current prices.
- Open one subscription for the app, and close it when the app unmounts.

Every price, change and sparkline on screen must come from the formatters in `src/lib/format.ts`. The list has
hundreds of rows, quotes arrive many times a second, and the formatters are expensive, so the app has to stay fast
as it grows.
