This is an existing shop app. Extend it.

- Prices now change while the app runs. `src/live-prices` (or the file of that name in this project) already exports `subscribePrices(callback)`, which calls `callback({ id, price })` and returns an unsubscribe function. Show live prices on product rows, on cart lines, and in the total.
- A price that changed in the last second has `data-flash="true"` on its row.
- Add a button `Favourite <name>` on each row, with `aria-pressed`, and a checkbox `Favourites only` beside `Category`. Favourites survive a reload.
- A cart line whose price went up since it was added shows `Price went up`.

Everything that already works must keep working.
