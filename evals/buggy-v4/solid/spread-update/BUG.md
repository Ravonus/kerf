Live price merged into the stock list with list.map(s => ({ ...s, price: … })): every stock is a new item on every quote, so <For> rebuilds all rows.
