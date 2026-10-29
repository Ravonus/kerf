# Ticket 3: favorites

Stocks already arrive with a `favorite` flag. Add this method to the `Api` interface and to `createFakeApi`:

```ts
setFavorite(id: string, favorite: boolean): Promise<void> // rejects if the server refused
```

- Each row gets a button labelled `Favorite <SYMBOL>` (e.g. `Favorite ACME`) with `aria-pressed` showing whether the
  stock is a favorite.
- Clicking it changes the star at once, then saves it. If saving fails, put that star back to what it was before
  that click, unless the user clicked that same star again since. Show `Couldn't update <SYMBOL>` in an element
  with `role="alert"`. Other stars, including ones whose saves are still pending, must not change.
- Add a checkbox labelled **Favorites only** that shows only favorites. It combines with the search.
- The search text and the **Favorites only** setting survive a page reload (keep them in `localStorage`). After a
  reload, the restored search runs again.

The work budget still applies. Toggling one star may call formatters only for that row and the portfolio
value, and must touch only that row's DOM.
