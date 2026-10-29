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

The list has hundreds of rows, and quotes arrive many times a second. The formatters in `src/lib/format.ts` are
expensive (each call is counted), so every price, change and sparkline on screen must come from them, but only what
changed may call them. When a quote arrives for one stock, only that stock's row and the portfolio value may call
a formatter. Other rows must not format or render again, and the DOM work must stay proportional to what changed.
