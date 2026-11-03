# Async and loading states

:::learn
- How to load data with `resource`, and how it follows what it read
- How a stale request is cancelled, so an old answer never replaces a newer one
- How `<Boundary>` shows what to display while data loads, and when it fails
- How refetches keep what's on screen, and how to show that something is updating
- How loaded data is rendered on the server and picked up by the browser
:::

Everything so far has been synchronous: a box changes, and what reads it follows at once. Data from a server doesn't
work like that. You ask, you wait, and the answer comes later, or fails, or arrives after you've asked a different
question. `resource` is weft's tool for that wait. It's `derived` for values that arrive later: give it a function
that returns a promise, and it gives you a value that fills in when the promise does.

:::demo loading

The demo shows the two kinds of wait a page has. The first press has no forecast to keep, so `<Boundary>` shows its
fallback, a spinner and "Loading…", until the answer arrives. After that, each press keeps the last forecast on screen,
dimmed, with a spinner beside it: `weather.pending` is `true` while the next request is in flight, and the old
`weather.value` is still there to show. Press Next day several times quickly and the count goes up: each press aborts
the request before it, through the `signal` the fetcher was given. Both parts are below.

## `resource`

```tsx
import { resource, state } from '@weft-js/core'

type User = { name: string }

export function Profile() {
  const id = state('ada')
  const user = resource(signal => fetch(`/api/users/${id.value}`, { signal }).then(r => r.json() as Promise<User>))
  return <p>{user.value?.name ?? '…'}</p>
}
```

A resource has four parts:

| | |
|---|---|
| `user.value` | The data, or `undefined` until the first answer arrives |
| `user.pending` | `true` while a fetch is in flight: the first one, or a later one |
| `user.error` | What the last fetch failed with, or `undefined` |
| `user.refresh()` | Fetch again. The current value stays until the new one lands |

The function runs straight away in the browser, and again whenever a box it read changes. Here it reads `id.value`, so
setting `id.value = 'grace'` fetches Grace. You don't list what it depends on; weft watches what it reads, as it does for
`derived`.

`resource(fetcher, { initial })` gives the value something to be before the first answer, when `undefined` is awkward.

### What it follows: reads before the first `await`

weft can only see reads that happen while the function is running. In an `async` function, that's the part before the
first `await`. Everything after it runs later, from the microtask queue, when weft is no longer watching:

```tsx
import { resource, state } from '@weft-js/core'

export function Orders() {
  const page = state(1)
  const sort = state('date')
  const orders = resource(async signal => {
    const res = await fetch(`/api/orders?page=${page.value}`, { signal }) // page is read before the await: followed
    const all = (await res.json()) as { id: string; date: string; total: number }[]
    return sort.value === 'date' ? all : [...all].sort((a, b) => a.total - b.total) // read after it: not followed
  })
  return <p>{orders.value?.length ?? 0} orders</p>
}
```

Changing `page` fetches again; changing `sort` does nothing. Read every input at the top, before anything waits:

```tsx
import { resource, state } from '@weft-js/core'

export function Orders() {
  const page = state(1)
  const sort = state('date')
  const orders = resource(async signal => {
    const query = `/api/orders?page=${page.value}&sort=${sort.value}` // both read before the await
    const res = await fetch(query, { signal })
    return (await res.json()) as { id: string; total: number }[]
  })
  return <p>{orders.value?.length ?? 0} orders</p>
}
```

The diagnostics catalog names reads after an `await` in a `resource`, and `derived(async …)`, as **W012**. A `derived`
with an `async` function holds a promise, not the data: use `resource`.

### Stale answers never win

Requests don't come back in the order you sent them. Type "a", then "ab", and the answer for "a" can arrive second. A
hand-written `watch` that fetches would then show results for the wrong query.

A resource can't get that wrong. Each run gets its own `AbortSignal`. When a box it read changes, weft aborts the
previous run's signal before starting the next one, and an answer from an aborted run is ignored even if it arrives.
Pass `signal` to `fetch` and the old request is cancelled on the network too:

:::demo escape-refresh

Pick a city, then another before the first answers. The first request is cancelled, and its answer, if it came, would
be thrown away. The signal is also aborted when the component goes, so leaving a page cancels what it was loading.

### Updating, not loading

Look at the demo again: after the first answer, picking a city keeps the old temperature on screen while the new one
loads. That's on purpose. A resource keeps its value until the next one lands, so a refetch never empties the page.

To show that something is updating, test `pending` *together with* a value:

```tsx
import { resource, state } from '@weft-js/core'
import { Badge } from '@weft-js/warp'

export function Rates() {
  const base = state('EUR')
  const rates = resource(signal => fetch(`/api/rates/${base.value}`, { signal }).then(r => r.json() as Promise<Record<string, number>>))
  return (
    <p>
      USD {rates.value?.USD ?? '…'} {rates.pending && rates.value !== undefined && <Badge tone="info">updating</Badge>}
    </p>
  )
}
```

:::pitfall Don't put a skeleton behind `pending` alone
`{x.pending && <Skeleton />}` shows the skeleton on every refetch, replacing data the user was reading with grey bars
for a moment. weft warns about it (**X033**). Let `<Boundary>` handle the first load, below, and show at most a small
"updating" hint while `pending` is true and there's a value.
:::

## `<Boundary>`: what to show meanwhile

Checking `value === undefined` in every component that loads something gets old fast, and it leaves each piece of the
page deciding on its own when to show a spinner. A `<Boundary>` makes that decision once for a whole region:

```tsx
import { Boundary, resource } from '@weft-js/core'
import { Button } from '@weft-js/warp'

type User = { name: string }

function Name(props: { id: string }) {
  const user = resource(signal => fetch(`/api/users/${props.id}`, { signal }).then(r => r.json() as Promise<User>))
  return <h1>{user.value?.name}</h1>
}

export function Profile(props: { id: string }) {
  return (
    <Boundary
      pending={<p>Loading…</p>}
      error={(e, retry) => <Button onClick={retry}>Couldn't load the profile. Retry</Button>}
    >
      <Name id={props.id} />
    </Boundary>
  )
}
```

:::pitfall Make the resource inside the Boundary
A Boundary waits for the resources created *while its children are built*. A resource made in the same component as the
`<Boundary>`, above its JSX, is created before the Boundary exists, so the Boundary never sees it: no fallback shows,
and the content appears with `undefined` in it. Move the `resource` call into a small component rendered inside the
Boundary, as `Name` is here.
:::

A `Boundary` watches every resource created inside it, however deep, in any component below it:

- **While any of them has no first value**, it shows `pending` instead of its children. Its children are still made,
  out of sight, so their resources start fetching at once.
- **When they all have one**, it swaps the children in, whole. Nothing appears piece by piece.
- **When one fails, or a child throws while rendering**, it shows `error(e, retry)`. `retry` fetches the failed
  resources again and rebuilds children that threw.

The fallback doesn't appear at once. If the data arrives within 150 ms, the user never sees `pending` at all; if it
appears, it stays at least 400 ms, so it doesn't flash. And because only a resource's *first* value counts, a refetch
never brings the fallback back.

:::demo escape-retry

The demo's server fails every other time. The first answer is an error, so the Boundary shows its error view; Try again
calls `retry`, and the content appears. Ask again calls `refresh()` on the resource, which keeps the answer on screen
while it loads, and shows the error view only if that fetch fails.

Without an `error` prop, a Boundary that catches a failure renders nothing in its place (and development builds log
the error). Give important regions an `error` view.

### Where to put Boundaries

Each Boundary is one region that loads as a unit. Put one around each part of the page that can usefully appear on its
own: the sidebar, the main list, a chart. A resource reports to the *nearest* Boundary above it, so nesting works the way
you'd expect: an inner Boundary takes its own resources, and the outer one only waits for the rest.

A resource outside any Boundary simply has `value === undefined` until it loads. That's fine for something small
(`{user.value?.name ?? 'Guest'}`), and you can still read `pending` and `error` yourself.

:::deepdive Boundary and React's Suspense
A weft `Boundary` is React's `<Suspense>` and an error boundary in one element. The mechanics differ: React suspends by
throwing a promise from render and retrying the render when it settles, and its transitions keep old UI on screen. A
weft component never re-renders, so nothing is thrown or retried. Each resource registers with the nearest Boundary as
it's created, and the Boundary watches their `first value` flags. A refetch keeps old content by default, which is what
`startTransition` buys you in React.
:::

### Sizing the fallback

When `pending` is smaller or larger than the content that replaces it, everything below jumps at the swap. In
development weft measures both and warns when they differ by more than a pixel (**X031**). Two fixes:

- warp's `<Shape>` draws a skeleton of a given kind and count: `<Boundary pending={<Shape kind="list" rows={5} />}>`.
- `<Boundary pending="shape">` asks the compiler to make the skeleton from the children's own markup. See
  [Text, media and shapes](/learn/text-media-and-shapes).

## One-off actions: async handlers

Not every wait is a resource. A resource is a value the page *shows*. Saving a form, deleting a row or sending a
message is an *action*: the user asks once, and you report how it went. For that, an `async` handler with a box or two
is enough:

:::demo async

```tsx
import { state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

export function Save() {
  const saving = state(false)
  const failed = state(false)
  const save = async () => {
    saving.value = true
    failed.value = false
    try {
      const res = await fetch('/api/profile', { method: 'POST' })
      if (!res.ok) failed.value = true
    } catch {
      failed.value = true
    } finally {
      saving.value = false
    }
  }
  return (
    <p>
      <Button disabled={saving.value} onClick={() => void save()}>{saving.value ? 'Saving…' : 'Save'}</Button>
      {failed.value && ' Saving failed. Try again.'}
    </p>
  )
}
```

Writes after an `await` are fine: a box is a box, whenever you write it. What you can't do after an `await` is create
things that need an owner, such as `watch` or `on` (see [Cleanup and ownership](/learn/cleanup-and-ownership)).

With `@weft-js/start`, actions that change server data are mutations, which also update the queries they affect: see
[Server functions](/learn/server-functions).

## On the server

When a page is rendered on the server, resources run there too. The server calls each fetcher, waits for what the page
needs, and puts the values into the HTML. It also writes them into the page's data, so when the browser takes the page
over, each resource starts with the server's value instead of fetching it again.

Whether the server waits depends on where the resource is:

- **Inside a `<Boundary pending>`**, the page doesn't wait. The server sends the HTML with the fallback in place, then
  streams each Boundary's content as its data arrives, and the browser swaps it in.
- **Outside any Boundary**, there's nowhere to stream to, so the first byte waits for it.

`@weft-js/start` does all of this for you. Without it, `@weft-js/core/ssr` has the pieces: `renderToStringAsync` waits
for resources before returning HTML, and `renderToStream` sends a shell at once and one chunk per Boundary. On the
client, `hydrate` from `@weft-js/core/dom` takes over that HTML without rebuilding it. [Reference: async](/reference/async)
has the exact calls.

In a `@weft-js/start` app you'll rarely write a `fetch` in a resource. You call a query from a server module, which
returns a resource with the same `.value`, `.pending`, `.error` and `.refresh()`, cached and shared across components.
Route loaders, and the deferred fields they stream, are the server side of the same story:
[Loading data](/learn/loading-data) covers both.

## Recap

- `resource(signal => promise)` is a value that arrives later: `.value`, `.pending`, `.error`, `.refresh()`.
- It refetches when what it read before the first `await` changes. Reads after an `await` aren't followed (W012).
- Each run's `signal` is aborted when the next starts or the component goes; a stale answer is ignored.
- A refetch keeps the old value on screen. Show `pending` as a hint only when there's a value (X033).
- `<Boundary pending error>` shows one fallback for every resource below it until they all have a first value, after
  150 ms and for at least 400 ms, and `error(e, retry)` when one fails or a child throws.
- One-off actions are `async` handlers with a `saving` box.
- On the server, resources inside a Boundary stream; outside one, the page waits. The browser reuses the server's
  values.

## Try it

:::challenge Load a user by id
Write `UserCard(props: { id: number })` that loads `https://jsonplaceholder.typicode.com/users/<id>` and shows the
user's name and email. While it loads, show "Loading…"; if it fails, show the message and a Retry button. A new `id`
should load the new user and cancel the old request.
:::solution
The fetcher reads `props.id` before anything waits, so a new id refetches, and it passes `signal` to `fetch`, so the old
request is cancelled. The resource is made in `Details`, inside the Boundary, so the Boundary covers both the loading
and the error view.

```tsx
import { Boundary, resource } from '@weft-js/core'
import { Button } from '@weft-js/warp'

type User = { name: string; email: string }

function Details(props: { id: number }) {
  const user = resource(async signal => {
    const res = await fetch(`https://jsonplaceholder.typicode.com/users/${props.id}`, { signal })
    if (!res.ok) throw new Error(`No user ${props.id} (${res.status})`)
    return (await res.json()) as User
  })
  return <p>{user.value?.name}, {user.value?.email}</p>
}

export function UserCard(props: { id: number }) {
  return (
    <Boundary
      pending={<p>Loading…</p>}
      error={(e, retry) => (
        <p>
          {e instanceof Error ? e.message : 'Failed'} <Button onClick={retry}>Retry</Button>
        </p>
      )}
    >
      <Details id={props.id} />
    </Boundary>
  )
}
```

Throwing on a bad status matters: `fetch` only rejects when the network fails, so a 404 would otherwise "succeed" with
an error body.
:::

:::challenge Stop the flash
Every time the user picks another month, this report blanks out and shows "Loading…" until the new numbers arrive.
Make it keep the old numbers on screen, with a quiet hint while it updates.

```tsx
import { resource, state } from '@weft-js/core'
import { Select } from '@weft-js/warp'

export function Report() {
  const month = state<string | null>('2026-10')
  const report = resource(signal => fetch(`/api/report/${month.value}`, { signal }).then(r => r.json() as Promise<{ total: number }>))
  return (
    <div>
      <Select label="Month" value={month} options={[{ value: '2026-10', label: 'October' }, { value: '2026-11', label: 'November' }]} />
      {report.pending ? <p>Loading…</p> : <p>Total: {report.value?.total}</p>}
    </div>
  )
}
```
:::solution
The ternary hides the content whenever `pending` is true, including on refetches. Let a Boundary handle the first
load, which it does only once, and show a hint beside the content while a refetch runs. The resource moves into `Total`,
inside the Boundary, so the Boundary can see it:

```tsx
import { Boundary, resource, state } from '@weft-js/core'
import { Select } from '@weft-js/warp'

function Total(props: { month: string | null }) {
  const report = resource(signal => fetch(`/api/report/${props.month}`, { signal }).then(r => r.json() as Promise<{ total: number }>))
  return <p>Total: {report.value?.total} {report.pending && report.value !== undefined && <small>updating…</small>}</p>
}

export function Report() {
  const month = state<string | null>('2026-10')
  return (
    <div>
      <Select label="Month" value={month} options={[{ value: '2026-10', label: 'October' }, { value: '2026-11', label: 'November' }]} />
      <Boundary pending={<p>Loading…</p>}>
        <Total month={month.value} />
      </Boundary>
    </div>
  )
}
```
:::

:::challenge Two regions, two Boundaries
A dashboard loads a fast list of alerts and a slow chart of sales. Right now one Boundary covers both, so the alerts wait
for the chart. Make each appear as soon as its own data is ready.

```tsx
import { Boundary, resource } from '@weft-js/core'

const wait = <T,>(ms: number, value: T) => new Promise<T>(done => { setTimeout(() => done(value), ms) })

function Alerts() {
  const alerts = resource(() => wait(200, ['Disk at 80%']))
  return <ul>{(alerts.value ?? []).map(a => <li key={a}>{a}</li>)}</ul>
}

function Sales() {
  const sales = resource(() => wait(2000, 1234))
  return <p>Sales: {sales.value}</p>
}

export function Dashboard() {
  return (
    <Boundary pending={<p>Loading the dashboard…</p>}>
      <Alerts />
      <Sales />
    </Boundary>
  )
}
```
:::solution
A resource reports to the nearest Boundary above it, so give each region its own:

```tsx
import { Boundary, resource } from '@weft-js/core'

const wait = <T,>(ms: number, value: T) => new Promise<T>(done => { setTimeout(() => done(value), ms) })

function Alerts() {
  const alerts = resource(() => wait(200, ['Disk at 80%']))
  return <ul>{(alerts.value ?? []).map(a => <li key={a}>{a}</li>)}</ul>
}

function Sales() {
  const sales = resource(() => wait(2000, 1234))
  return <p>Sales: {sales.value}</p>
}

export function Dashboard() {
  return (
    <div>
      <Boundary pending={<p>Loading alerts…</p>}>
        <Alerts />
      </Boundary>
      <Boundary pending={<p>Loading sales…</p>}>
        <Sales />
      </Boundary>
    </div>
  )
}
```

Server-rendered, the two now stream separately too: the alerts arrive in the page while the chart is still loading.
:::
