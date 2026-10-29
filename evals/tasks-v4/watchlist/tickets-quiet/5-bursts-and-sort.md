# Ticket 5: bursts and sorting

The quote server now sends bursts: it may call `onQuote` dozens of times in a row, synchronously, for different
stocks (sometimes the same stock twice). Every quote still appends to its stock's sparkline.

- Add a `<select>` labelled **Sort** with options `Symbol` (value `symbol`, the default: list order) and `Change`
  (value `change`: biggest gain first, ties in list order). With `Change` selected, the order follows the quotes as
  they arrive.
- Sort combines with the search and **Favorites only**, and survives a reload like them.
