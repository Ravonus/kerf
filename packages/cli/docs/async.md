# Async data, Boundary and SSR

```tsx
import { resource, Boundary } from '@weft-js/core'

type User = { name: string }

export function Profile({ id }: { id: string }) {
  // `id` is read before the first `await`, so a new id fetches again and aborts the old request.
  const user = resource(signal => fetch(`/api/users/${id}`, { signal }).then(r => r.json() as Promise<User>))
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
- **`@weft-js/core/ssr`**: `renderToString(() => <App />)` renders what it can now; `await renderToStringAsync(() => <App />)`
  waits for resources first and puts their values in the page. Pass `{ hydratable: true }` when the client hydrates.
  `renderToStream(() => <App />, { hydratable: true })` sends `shell` at once, then one chunk per `<Boundary>` as its
  resources resolve (`chunks`, an async iterable), and `data()` for `hydrate` when they're done. `@weft-js/start`
  streams this way for you.
- **`hydrate(() => <App />, el)`** from `@weft-js/core/dom` takes over server HTML without rewriting it. Use it instead of
  `render` when the HTML came from `@weft-js/core/ssr`.
- Import only `renderToString`, `renderToStringAsync` and `renderToStream` from `@weft-js/core/ssr`; its other exports are
  what compiled server code calls.
