# Loading data

:::learn
- How to load data with `resource`
- How `<Boundary>` shows what to display while it loads, or when it fails
- How weft renders loaded data on the server
:::

`resource` is `derived` for data that arrives later. Give it a function that returns a promise. It fetches again when what
the function read changes.

:::demo loading

## `resource`

```tsx
const weather = resource(signal => fetchWeather(day.value, signal))
weather.value     // the data, or undefined until it arrives
weather.pending   // true while a fetch is running
weather.error     // the error, if the last fetch failed
weather.refresh() // fetch again
```

Reads before the first `await` in the function are tracked. Here it reads `day.value`, so a new day fetches again. A fetch
that is no longer wanted is aborted through `signal`, so a slow old answer never replaces a newer one. Reads after an
`await` aren't tracked, which is **W012**.

## `<Boundary>`

```tsx
<Boundary pending={<p>Loading…</p>} error={(e, retry) => <button onClick={retry}>Retry</button>}>
  <p>{weather.value}</p>
</Boundary>
```

A `Boundary` covers every resource below it and every error thrown while rendering. The `pending` view shows after 150 ms
and stays at least 400 ms, so a fast answer never flashes. A refetch keeps the current content on screen.

## On the server

With `@weft-js/start`, the server renders pages and the browser takes over that HTML without rebuilding it. A query (next
page) created inside a `<Boundary pending>` is streamed: the page goes out at once, and the value follows when it's ready.
Created outside one, the first byte waits for it.

From a server, you usually load data with a query rather than your own `fetch`. That is the next page.

## Plain async handlers

Not every wait is a resource. A button that saves can be an `async` handler with a `saving` box:

:::demo async

## Recap

- `resource(fn)` loads data, refetches when what it read changes, and aborts stale fetches.
- `<Boundary pending error>` says what to show meanwhile and on failure.
- For one-off actions, an `async` handler with a bit of state is enough.
