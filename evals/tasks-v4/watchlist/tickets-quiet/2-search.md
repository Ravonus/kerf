# Ticket 2: search

Add server-side search. Add this method to the `Api` interface and to `createFakeApi`:

```ts
search(query: string, signal: AbortSignal): Promise<string[]> // ids of the matching stocks, in list order
```

- Add a text input labelled **Search**. As the text changes, send a request for the trimmed text (no debounce), and
  show only the stocks it returns. When the text is empty, show every stock and send no request.
- Responses arrive in any order, and only the latest query's results may ever be shown. Abort a request (through
  its `signal`) as soon as a newer query replaces it.
- While the latest request is pending, show `Searching…` in an element with `role="status"`. If the latest request
  fails, show `Search failed` in an element with `role="alert"` and keep showing the previous results. The next
  successful search removes the alert.
- The `count` in the header shows how many stocks are shown, as `N stocks` (or `1 stock`).
- Quotes keep updating the rows that are shown.
