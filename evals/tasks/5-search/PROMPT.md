Build a `SearchBox` component.

Props:

```ts
{ search: (query: string, signal: AbortSignal) => Promise<string[]> }
```

Behaviour:

- A text input labelled **Search** (use `<label>` or `aria-label`).
- 300 ms after the user's last keystroke, call `search(query, signal)` with the trimmed input text. If the trimmed text
  is empty, don't call `search`; show no results and no status.
- When a new search starts, abort the previous search's `signal`. Also abort any in-flight search on unmount.
- Results render as `<li>` items (one per string, in order) inside `<ul aria-label="Results">`.
- An element with `data-testid="status"` shows:
  - `Loading` while the latest search is pending,
  - `No results` when the latest search resolved with an empty array,
  - `Error` when the latest search rejected.
  Otherwise (results showing, or empty input), the status element is not rendered.
- Only the latest search may affect what is shown. A response or rejection from an older search must be ignored, even
  if it arrives later.
