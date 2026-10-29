# Testing (`weft/test`, vitest)

```tsx
import { render, flush, touches } from 'weft/test'

render(App, { api })
await flush()
await expect(() => api.pushPrice('p1', 2)).toTouchAtMost(1, { runs: 10 })
```

- `render(Component, props)` mounts into the document; `flush()` applies pending DOM updates.
- Query by role, label or text (`@testing-library/dom`), act with `@testing-library/user-event`.
- `touches(fn)` returns `{ mutations, runs, … }` for one interaction. `toTouchAtMost(n, { runs })` bounds both: DOM writes
  alone miss identity bugs that re-run every row but write the DOM once (W014).
