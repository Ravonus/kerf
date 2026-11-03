# Loading data

:::learn
- How a route's `load` gets a page's data on the server, before the first byte
- How to leave a slow field unawaited so it streams in after the page
- How to read a query from a component, with a tracked input and `skip`
- How the caches and tags keep what you loaded fresh after a change
:::

You have pages now ([Routing and layouts](/learn/routing-and-layouts)). Most of them show something stored on the
server: a list, a record, the signed-in user. This page is about getting that data onto the page.

In a client-only app you'd fetch it from the browser after the page shows, with a spinner meanwhile. That is still
possible (it's what [`resource`](/learn/async-and-loading) is for), but with `@weft-js/start` the server renders the
page, so it can load the data first and send the page with the data already in it. There are two ways to ask for it: a
route's `load`, and a query read from a component. Both go through the same server functions and the same cache.

## A route's `load`

A route module can export `load`, an async function that runs on the server for every request to that page. What it
returns becomes the page's `props.data`:

```ts
// src/server/summary.ts
import { query } from '@weft-js/start'
import { and, count, eq } from 'drizzle-orm'
import { z } from 'zod'
import { todos } from '#/db/schema'

export const countOpen = query({
  tags: ['todos'],
  auth: 'user',
  run: async ({ ctx }) => {
    const [row] = await ctx.db.select({ n: count() }).from(todos).where(and(eq(todos.userId, ctx.user.id), eq(todos.done, false)))
    return row?.n ?? 0
  },
})

export const findTodo = query({
  input: z.object({ id: z.string() }),
  auth: 'user',
  tags: ({ id }) => ['todos', `todos:${id}`],
  run: async ({ input, ctx }) => {
    const [row] = await ctx.db.select().from(todos).where(and(eq(todos.id, input.id), eq(todos.userId, ctx.user.id)))
    return row ?? null
  },
})
```

`countOpen` counts what's left; `findTodo` reads one todo by id, and comes up again below.

```tsx
// src/routes/todos/summary.tsx
import type { Meta, RouteProps } from '@weft-js/start'
import { me } from '#/server/session'
import { countOpen } from '#/server/summary'

export const load = async () => {
  const [user, open] = await Promise.all([me.fetch(), countOpen.fetch()])
  return { name: user?.name ?? 'there', open }
}

export const meta: Meta<typeof load> = ({ data }) => ({ title: `${data.open} open`, description: 'What is left to do.' })

export default function Summary(props: RouteProps<typeof load>) {
  return (
    <main>
      <h1>Hello, {props.data.name}</h1>
      <p>You have {props.data.open} things left to do.</p>
    </main>
  )
}
```

A few things are true of every `load`:

- **It runs on the server only.** The build strips it from the browser's copy of the route, so it can use secrets, the
  database and server modules freely. Only what it returns is sent.
- **It runs before the first byte.** The server awaits every `load` in the chain (layouts first, then the page), then
  `meta`, and only then starts sending HTML. That's what lets a `load` answer 404, redirect, or fail with a real status.
- **Its result is typed.** `RouteProps<typeof load>` gives `props.data` the type of what `load` returns, and
  `Meta<typeof load>` gives `meta` the same.
- **It reads server functions with `.fetch()`.** `await countOpen.fetch()` calls the query on the server directly, with
  no HTTP in between. Calls you don't depend on each other go in a `Promise.all`, so they run side by side.

`load` gets one argument, `LoadArgs`, with four things on it:

| Field | What it is |
|---|---|
| `params` | The route's parameters, typed by the path you pass: `LoadArgs<'/todos/[id]'>` has `params.id`. |
| `ctx` | What server functions get: the database, the signed-in user, the request. [Server functions](/learn/server-functions#ctx). |
| `request` | The incoming `Request`, with its headers and cookies. |
| `signal` | An `AbortSignal` that fires if the visitor goes away. |

A layout's `load` runs before the `load` of anything below it, and its data goes to the layout, not the page. That's why
guards live there ([Routing and layouts](/learn/routing-and-layouts#layouts-with-data)).

:::pitfall Compute from `props.data` where you use it
`props.data` is live: when you navigate between two todos, the same page component stays and gets the new data in place.
Naming it is fine (`const { data } = props` stays live), but computing from it in the component body is not:
`const heading = props.data.title.toUpperCase()` runs once and keeps the first todo's title forever. Compute in JSX
(`{props.data.title.toUpperCase()}`) or in a `derived`, and it stays current. weft check reports the first as W001.
:::

## Streaming a slow field

Everything `load` awaits holds up the whole page. Usually that's what you want: the page arrives complete, in one go,
with nothing jumping around. But sometimes one piece is slow and not the point of the page, such as reviews under a
product, or recommendations under an article. Waiting for it delays everything else.

So don't await it. A field of `load`'s result that is still a promise is **deferred**: the server sends the page as soon
as the rest is ready, and streams that field in the same response when it settles.

```tsx
// src/routes/todos/overview.tsx
import { Boundary, resource } from '@weft-js/core'
import type { RouteProps } from '@weft-js/start'
import { countOpen } from '#/server/summary'
import { listTodos } from '#/server/todos'

export const load = async () => ({
  open: await countOpen.fetch(),
  // Not awaited: the page goes out without it, and the list streams in when it's ready.
  list: listTodos.fetch(),
})

function List(props: { todos: Promise<{ id: string; title: string }[]> }) {
  const todos = resource(() => props.todos)
  return <ul>{(todos.value ?? []).map(t => <li key={t.id}>{t.title}</li>)}</ul>
}

export default function Overview(props: RouteProps<typeof load>) {
  return (
    <main>
      <h1>{props.data.open} open</h1>
      <Boundary pending={<p>Loading the list…</p>}>
        <List todos={props.data.list} />
      </Boundary>
    </main>
  )
}
```

The page reads the deferred field with [`resource`](/learn/async-and-loading), inside a `<Boundary pending>`. The
Boundary is what makes streaming possible: the server sends its `pending` view in the first part of the page, then the
real content when the promise settles, and the browser puts it in place. The demo below runs the same shape of code in the
browser, with a timer standing in for the server:

:::demo stack-deferred

A few rules follow from how this works:

- Only a **top-level** field can be deferred: `{ list: promise }`, not `{ page: { list: promise } }`.
- `meta` runs before the first byte, so it can't read a deferred field: it sees the data with those fields left out,
  and reading one is H007. If the title needs it, await it.
- A deferred field that fails shows in its Boundary's `error` view, not as an error page. The status is already sent.
- On a client navigation, deferred fields are awaited before the new page shows: there's no streaming on navigation yet.
  The Boundary's `pending` view still covers the first page load.

:::deepdive What the browser receives
A streamed page is one HTTP response in parts. The first part has the head, the shell and every Boundary's `pending`
view, so it paints at once. Each deferred value follows as a small chunk with the HTML that replaces its `pending` view,
in whatever order they finish. The page's data, including the settled values, comes last, so when the code starts it
finds everything it needs and fetches nothing.

Compare that with fetching in the browser after the page loads: the browser has to download the code, run it, send the
request, and wait for the answer, before it can show anything. Streaming starts the slow work as soon as the request
arrives, on the server, close to the database.
:::

## Reading a query from a component

`load` is one way in. The other is to call a query from a component, as you'd call a function. Calling a query with
no `.fetch` gives you a [resource](/learn/async-and-loading): `.value` (undefined until the first answer), `.pending`,
`.error` and `.refresh()`:

```tsx
import { Boundary } from '@weft-js/core'
import { listTodos } from '#/server/todos'

function OpenList() {
  const todos = listTodos()
  return <ul>{(todos.value ?? []).filter(t => !t.done).map(t => <li key={t.id}>{t.title}</li>)}</ul>
}

export function Sidebar() {
  return (
    <aside>
      <h2>Still to do</h2>
      <Boundary pending={<p>Loading…</p>}>
        <OpenList />
      </Boundary>
    </aside>
  )
}
```

This works on the server too. While the page renders, `listTodos()` runs the query there, so the HTML has the list in
it. The value travels to the browser with the page, and the browser's cache starts with it, so the component reads it
straight away and makes no request.

Where you create the query decides when the page goes out. A query created inside a `<Boundary pending>` streams, like a
deferred field. One created outside any Boundary holds the first byte until it has its answer, like an awaited field in
`load`. Notice that `OpenList` creates the query and the Boundary is above it, in `Sidebar`: a Boundary covers what is
created *inside* it, not the component that renders it.

### `load` or a query?

They reach the same functions and the same cache, so it's a choice about where the data belongs:

| Use `load` when… | Use a query in a component when… |
|---|---|
| The page can't show without it, or its status depends on it (404, redirect). | It belongs to one part of the page, like a sidebar or a widget. |
| `meta` needs it for the title or description. | The input changes while you're on the page (a filter, a selected row). |
| It's per page: the record a `[id]` route shows. | The same component appears on many pages and brings its own data. |

They mix. A page can `load` its main record and let a component below read a list with a query. And if both ask for
the same query with the same input in one request, it runs once.

### An input that changes

A query that takes input gets it as an argument: `findTodo({ id: '42' })`. When the input depends on state, pass a
function instead. weft tracks what the function reads, and asks again when it changes, like any [derived
value](/learn/derived):

```tsx
import { Boundary, state } from '@weft-js/core'
import { skip } from '@weft-js/start'
import { Button } from '@weft-js/warp'
import { findTodo } from '#/server/summary'
import { listTodos } from '#/server/todos'

function Detail(props: { id: string | null }) {
  const todo = findTodo(() => (props.id ? { id: props.id } : skip))
  return <p>{todo.value ? todo.value.title : 'Pick a todo.'}</p>
}

export function Picker() {
  const todos = listTodos()
  const picked = state<string | null>(null)
  return (
    <div>
      {(todos.value ?? []).map(t => (
        <Button key={t.id} size="sm" emphasis="ghost" onClick={() => (picked.value = t.id)}>{t.title}</Button>
      ))}
      <Boundary pending={<p>Loading…</p>}>
        <Detail id={picked.value} />
      </Boundary>
    </div>
  )
}
```

`skip` means "no query yet": until something is picked, nothing is fetched and `todo.value` stays undefined. Each
input is cached separately, so going back to a todo you already looked at shows it at once.

:::pitfall `query()` only in components; `.fetch()` everywhere else
`listTodos()` makes a resource that lives as long as the component that made it. Outside a component (in `load`, a
click handler, a timer, another server function, module scope) there's nothing for it to belong to, and weft stops
with **Q001**. There, use `await listTodos.fetch()`, which gives you the value once.

And don't copy a query's value into `state` to "keep" it. The query already keeps it, and keeps it fresh after every
change. A copy goes stale the first time something changes.
:::

## Keeping data fresh

Loading data is half of it. The other half is what happens after a change: you add a todo, and the list, the open count
and the summary page all need to know. In weft you don't refetch by hand. You **tag** queries, and changes say which
tags they affect.

A query lists its tags, usually the tables it reads:

```ts
import { query } from '@weft-js/start'

export const listTags = query({
  tags: ['todos'],
  run: () => ['home', 'work'],
})
```

And a mutation lists what it `invalidates`:

```ts
import { mutation } from '@weft-js/start'
import { z } from 'zod'

export const tagTodo = mutation({
  input: z.object({ id: z.string(), tag: z.string() }),
  invalidates: ['todos'],
  run: ({ input }) => input,
})
```

When the mutation finishes, the server runs every query on the page that shares one of its tags, and sends the new
values back **in the same response** as the mutation's result. There's no second round trip, and no moment where the
page shows the old list after the save. Route data counts too: if a page's `load` read a query tagged `todos`, that page's
data comes back fresh as well.

The demo shows the rule with three queries and three mutations. Only queries that share a tag with the mutation are
fetched again:

:::demo stack-tags

Tags can depend on the input, for queries that read one record: `tags: ({ id }) => ['todos', `todos:${id}`]`. A
mutation that changes one todo can then invalidate `todos:${id}` and leave the others alone. weft checks the names in
development: a mutation that invalidates a tag no query declares gets **Q008**, and a function that reads or writes a
table its tags don't name gets **Q011**.

You can also invalidate by hand with `invalidate(...tags)`. In the browser it marks those tags stale, and every query
on the page that has one fetches again:

```tsx
import { invalidate } from '@weft-js/start'
import { Button } from '@weft-js/warp'

export function RefreshButton() {
  return <Button emphasis="ghost" onClick={() => void invalidate('todos')}>Refresh</Button>
}
```

To refresh one resource, call its `.refresh()`. For data that changes when *someone else* acts (another tab, another
user, a cron job), call `listTodos.live()` instead of `listTodos()`: it refetches whenever any mutation anywhere
invalidates its tags. That's [Realtime and live data](/learn/live-data).

### The three caches

There are three places a query's value can be kept. You turn on only the last:

1. **The request cache.** On the server, a query runs at most once per request for each input. `load`, a layout's `load`
   and every component that reads `listTodos()` during one page render share one call.
2. **The browser cache.** Each query and input has one entry in the tab, shared by every component that reads it. A
   mutation's fresh values land there, and every reader updates in place. Unchanged rows keep their identity, so a list
   only redraws the rows that changed.
3. **The shared server cache.** `cache: { life }` keeps a value across requests and users, until it expires or a mutation
   invalidates one of its tags:

```ts
import { query } from '@weft-js/start'

export const exchangeRates = query({
  tags: ['rates'],
  cache: { life: 'hours' },
  run: async () => ({ usd: 1, eur: 0.92 }),
})
```

`life` is `'seconds'`, `'minutes'`, `'hours'`, `'days'`, `'max'`, or a number of seconds. A shared value is shared by
everyone, so a cached query can't read `ctx.user`, `ctx.session` or the request (**Q006**): it would hand one user's
answer to the next. For a value per user, add `scope: 'user'`, which keeps one value for each signed-in user and lets
`run` read `ctx.user`.

:::note When the server is newer than the tab
After you deploy, a tab that was already open is running the old build. `stale` from `@weft-js/start` is a box that
turns `true` when the server says it runs a newer one, so you can offer a reload:
`{stale.value && <Button onClick={() => location.reload()}>A new version is out: reload</Button>}`. It is known
through the realtime connection, so it updates on pages with a live query, a stream or a channel.
:::

## Recap

- A route's `load` runs on the server before the first byte. It reads queries with `await q.fetch()`, and what it
  returns is `props.data`, typed by `RouteProps<typeof load>`.
- A top-level field of `load`'s result left as a promise is deferred: it streams in after the page, into a
  `<Boundary pending>`, and `meta` can't read it (H007).
- `q()` in a component is a resource. Inside a Boundary it streams; outside, the first byte waits for it. Its value
  arrives with the page, so the browser doesn't fetch it again.
- A function as input is tracked; `skip` means no query yet.
- Queries have `tags`, and mutations `invalidates`: the queries that share a tag come back in the same response.
  `invalidate()` and `.refresh()` refetch by hand; `.live()` follows changes from anywhere.
- `cache: { life }` shares a value across requests; it can't read `ctx.user` (Q006) unless it has `scope: 'user'`.

The [Full stack reference](/reference/start#server-functions) has every option. For loading data that isn't on your
server, from a third-party API in the browser, use [`resource`](/learn/async-and-loading).

## Try it

:::challenge Don't let the slow part hold the page
This page waits for both the user's name and a slow list of suggestions. Make the name show at once, and the suggestions
stream in.

```tsx
import type { RouteProps } from '@weft-js/start'
import { me } from '#/server/session'
import { listTodos } from '#/server/todos'

export const load = async () => ({
  user: await me.fetch(),
  suggestions: await listTodos.fetch(),
})

export default function Home(props: RouteProps<typeof load>) {
  return (
    <main>
      <h1>Hello, {props.data.user?.name ?? 'there'}</h1>
      <ul>{props.data.suggestions.map(t => <li key={t.id}>{t.title}</li>)}</ul>
    </main>
  )
}
```
:::solution
Leave `suggestions` unawaited, and read it with `resource` in a component inside a `<Boundary pending>`:

```tsx
import { Boundary, resource } from '@weft-js/core'
import type { RouteProps } from '@weft-js/start'
import { me } from '#/server/session'
import { listTodos } from '#/server/todos'

export const load = async () => ({
  user: await me.fetch(),
  suggestions: listTodos.fetch(),
})

function Suggestions(props: { list: Promise<{ id: string; title: string }[]> }) {
  const list = resource(() => props.list)
  return <ul>{(list.value ?? []).map(t => <li key={t.id}>{t.title}</li>)}</ul>
}

export default function Home(props: RouteProps<typeof load>) {
  return (
    <main>
      <h1>Hello, {props.data.user?.name ?? 'there'}</h1>
      <Boundary pending={<p>Finding suggestions…</p>}>
        <Suggestions list={props.data.suggestions} />
      </Boundary>
    </main>
  )
}
```

The heading is in the first part of the response; the list follows when the query settles.
:::

:::challenge Fix the crash in the handler
Pressing this button fails with Q001. Why, and what's the fix?

```tsx
import { Button } from '@weft-js/warp'
import { listTodos } from '#/server/todos'

export function Export() {
  const download = () => {
    const todos = listTodos()
    console.log(todos.value)
  }
  return <Button onClick={download}>Export</Button>
}
```
:::solution
`listTodos()` makes a resource, which needs a component to belong to. A click handler runs later, outside the
component's setup, so there's none. In a handler, ask for the value once with `.fetch()`:

```tsx
import { Button } from '@weft-js/warp'
import { listTodos } from '#/server/todos'

export function Export() {
  const download = async () => {
    const todos = await listTodos.fetch()
    console.log(todos.map(t => t.title).join('\n'))
  }
  return <Button onClick={() => void download()}>Export</Button>
}
```

If the component already shows the list, creating `const todos = listTodos()` in the component body and reading
`todos.value` in the handler works too, and costs no request.
:::

:::challenge A cache that is safe to share
This query is called on every page, so it should be cached for a few minutes. Adding `cache` makes it fail with Q006.
Make it cached and correct.

```ts
import { query } from '@weft-js/start'

export const greeting = query({
  run: ({ ctx }) => `Welcome back, ${ctx.user?.name ?? 'friend'}`,
})
```
:::solution
A shared cache would give the first visitor's name to everyone, which is what Q006 stops. Either keep one value per user:

```ts
import { query } from '@weft-js/start'

export const greeting = query({
  cache: { life: 'minutes', scope: 'user' },
  run: ({ ctx }) => `Welcome back, ${ctx.user?.name ?? 'friend'}`,
})
```

or cache only the part that's the same for everyone, and add the name where you show it. `scope: 'user'` is the one-line
fix; the second is the better one when the expensive part doesn't depend on the user.
:::
