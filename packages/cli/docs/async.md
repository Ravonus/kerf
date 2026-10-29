# Async data, Boundary and SSR

```tsx
import { resource, Boundary } from 'weft'

export function Profile({ id }: { id: string }) {
  const user = resource(signal => api.user(id, signal))   // reads before the first `await` are tracked
  return (
    <Boundary pending={<p>Loading…</p>} error={(e, retry) => <button onClick={retry}>Retry</button>}>
      <h1>{user.value?.name}</h1>
    </Boundary>
  )
}
```

- **`resource(fetcher)`** is async `derived`: `.value`, `.pending`, `.error`, `.refresh()`. It re-fetches when what it
  read before the first `await` changes, and aborts the superseded fetch through `signal`. `derived(async …)` is
  **W012**.
- **`<Boundary pending error>`** covers every resource and thrown error below it. The fallback shows after 150 ms and
  stays at least 400 ms; refetches keep the current content (no flash). `error(e, retry)` gets failed resources and
  children that throw during render.
- **`weft/ssr`**: `renderToString(() => <App />)` renders what it can now; `await renderToStringAsync(() => <App />)`
  waits for resources first and puts their values in the page. Pass `{ hydratable: true }` when the client hydrates.
- **`hydrate(() => <App />, el)`** from `weft/dom` takes over server HTML without rewriting it. Use it instead of
  `render` when the HTML came from `weft/ssr`.
- Import only `renderToString`/`renderToStringAsync` from `weft/ssr`; its other exports are what compiled server code
  calls.
