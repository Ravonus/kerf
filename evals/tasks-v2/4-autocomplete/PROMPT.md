Build a `CityPicker` autocomplete.

```ts
props: {
  search: (query: string, signal: AbortSignal) => Promise<string[]>
  onPick: (city: string) => void
}
```

- A text input labelled **City**.
- When the person pauses typing for 250 ms, look up suggestions with `search` (not for blank text).
- Show suggestions as `role="option"` elements inside a `role="listbox"` element.
- **ArrowDown** / **ArrowUp** move a highlight through the options (none is highlighted at first; the highlighted one has
  `aria-selected="true"`). **Enter** picks the highlighted city: it goes into the input, the suggestions close, and
  `onPick` is called. **Escape** closes the suggestions.

The search backend is slow and responses can arrive out of order. The tests use fake timers.
