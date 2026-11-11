# Server functions

:::learn
- How `query` and `mutation` put code on the server that components call like functions
- How input schemas check what arrives, and what `ctx` holds
- How to fail on purpose: `FnError`, `invalid` and `raise`, and what the browser sees
- How optimistic updates make a change show before the server answers
:::

A page needs to read data and change it. In most stacks that means designing an API: routes, methods, request and
response shapes, a client to call them, and code to keep the two sides in step. With `@kerf/start` you write a
function on the server and import it in a component. The call crosses the network, but your code doesn't have to know.

The last page, [Loading data](/learn/loading-data), read queries from `load` and from components. This one is about
writing them, and their other half, mutations.

## A function on the server

Server functions live in server modules: any file under `src/server/`, or any file named `*.server.ts`. A **query**
reads; a **mutation** writes. Each is an export, made with `query()` or `mutation()`, and the code that runs on the
server is its `run`:

```ts
// src/server/count.ts
import { query } from '@kerf/start'
import { eq } from 'drizzle-orm'
import { todos } from '#/db/schema'

export const countTodos = query({
  tags: ['todos'],
  auth: 'user',
  run: async ({ ctx }) => {
    const rows = await ctx.db.select({ id: todos.id })
      .from(todos)
      .where(eq(todos.userId, ctx.user.id))
    return rows.length
  },
})
```

A component imports it and calls it:

```tsx
import { countTodos } from '#/server/count'

export function Counter() {
  const count = countTodos()
  return <p>{count.value ?? '…'} todos</p>
}
```

That's the whole API. There is no route to name, no `fetch` to write, and the types go straight through: `count.value`
is a `number | undefined` because `run` returns a number.

What makes this safe is the build. The `kerf:start` plugin gives every export in a server module an id, and in the
browser's copy of the file it replaces each one with a small stub that calls `/_kerf/fn/<id>`. `run`, the database
import and everything else in the file never reach the browser. That is also why a `query` or `mutation` written
anywhere else is an error, **Q003**: its `run` and imports would ship to the client, so the build refuses.

:::note A server module is the boundary
Think of `src/server/` as the line between the two sides. Anything imported only from there stays on the server.
Importing `@kerf/start/db` or `@kerf/start/auth` from a file the browser loads is **Q012**. Shared types and
plain helpers can sit anywhere, such as `src/lib/`, and both sides can import them.
:::

## Queries

A query is a read. You've seen how to call one ([Loading data](/learn/loading-data)): `q(input)` in a component gives a
resource, and `await q.fetch(input)` gives the value once, in `load`, handlers and other server functions. What a query
declares:

| Option | What it does |
|---|---|
| `run` | The body: `({ input, ctx }) => value`. Sync or async. |
| `input` | A schema for the argument. With none, the query takes no input. |
| `tags` | What invalidates it, usually the tables it reads. A function of the input for per-record tags. |
| `auth` | `'user'` refuses a call with no signed-in user. |
| `cache` | `{ life }` keeps the value across requests; `scope: 'user'` keeps one per user. |
| `output` | A schema for the result, checked in development (C002). |

Queries are called with GET, may run more than once, and should change nothing. The cache relies on it: a query's
answer may be reused, or fetched again whenever a tag is invalidated.

## Mutations

A mutation is a write. It's declared the same way, with `invalidates` in place of `tags`:

```ts
// src/server/rename.ts
import { FnError, mutation } from '@kerf/start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { todos } from '#/db/schema'

export const renameTodo = mutation({
  input: z.object({
    id: z.string(),
    title: z.string().trim().min(1, 'Give it a title.').max(200),
  }),
  auth: 'user',
  invalidates: ['todos'],
  run: async ({ input, ctx }) => {
    const [row] = await ctx.db
      .update(todos)
      .set({ title: input.title })
      .where(and(
        eq(todos.id, input.id),
        eq(todos.userId, ctx.user.id),
      ))
      .returning()
    if (!row) {
      throw new FnError({
        message: 'That todo is gone, or it isn\'t yours.',
      }, 404)
    }
    return row
  },
})
```

Calling a mutation runs it, and returns a promise of what `run` returned. A handler is where that usually happens:

```tsx
import { Button } from '@kerf/veneer'
import { renameTodo } from '#/server/rename'

export function MakeUrgent(props: { id: string; title: string }) {
  const rename = async () => {
    const { id, title } = props
    await renameTodo({ id, title: `Urgent: ${title}` })
  }
  return (
    <Button
      size="sm"
      loading={renameTodo.pending.value}
      onClick={() => void rename()}
    >
      Mark urgent
    </Button>
  )
}
```

A mutation also carries two boxes: `renameTodo.pending.value` is true while a call is in flight, and
`renameTodo.error.value` holds the last call's failure until the next one succeeds. They're shared by every caller of that
mutation. A form that needs its own pending state uses [`<Form>`](/learn/forms-and-validation), which keeps one per form.

`invalidates: ['todos']` is what keeps the rest of the page right. Every query on the page tagged `todos` runs again on
the server, and comes back in the same response as `renameTodo`'s result. `listTodos` and `countTodos` both update,
without a line of code in the component. [Loading data](/learn/loading-data#keeping-data-fresh) shows how tags work.

:::pitfall Mutations only from handlers
A mutation changes something, so it runs only when someone acts: from an event handler, a form, or another mutation.
Calling one while the server handles a GET (in `load`, while a page renders, or inside a query) is **Q004**. A page view
must never write. If loading a page should record something, such as a view count, that's a mutation the page calls from
the browser after it loads.
:::

## Input schemas

Anything can call a server function's URL with anything, so a function that takes input says what it accepts with a
schema. The input is checked on the server before `run` sees it, and `run` gets the parsed value, typed by the schema:

```ts
import { mutation } from '@kerf/start'
import { z } from 'zod'

export const planTrip = mutation({
  input: z.object({
    city: z.string().trim().min(2),
    nights: z.int().min(1).max(30),
    when: z.iso.date(),
  }),
  run: ({ input }) => ({
    summary: `${input.nights} nights in ${input.city} from ` +
      `${input.when}`,
  }),
})
```

Input that doesn't fit is refused with **Q002** (status 400). `run` never sees it, and the error carries each problem
with the path to its field, which is what [`<Form>`](/learn/forms-and-validation) shows next to the inputs.

Any [Standard Schema](https://standardschema.dev) library works: Zod, Valibot, ArkType, and the schemas Drizzle derives
from your tables. That last one means a table can be its own validator. `schemasOf` from `@kerf/start/db` makes a
`select`, `insert` and `update` schema for every table, and lets you tighten a column:

```ts
import { mutation } from '@kerf/start'
import { schemasOf } from '@kerf/start/db'
import { z } from 'zod'
import * as schema from '#/db/schema'

const schemas = schemasOf(schema, {
  todos: { title: (s: z.ZodString) => s.trim().min(1).max(200) },
})

export const draftTodo = mutation({
  input: schemas.todos.insert.pick({ title: true }),
  run: ({ input }) => ({ preview: input.title }),
})
```

This is how a new app's `addTodo` is written: the column's type, nullability and your extra rule in one place.

:::note Validation happens on the server
The browser's stub has no schema: it sends the input and the server judges it. That keeps the rules in one place and
the browser bundle small. For feedback as someone types, use the form's own constraints (`required`, `minlength`) or
import the same Zod schema into the component from a shared file. [Forms and validation](/learn/forms-and-validation)
has both.
:::

## `ctx`

`run` gets `ctx` next to `input`. It is what the server knows about this call:

| Field | What it is |
|---|---|
| `ctx.db` | The database client ([Database](/learn/database)). |
| `ctx.user`, `ctx.session` | The signed-in user and session, or `null` ([Auth](/learn/auth)). |
| `ctx.request` | The incoming `Request`: headers, cookies, URL. |
| `ctx.response.headers` | Headers to add to the response, such as a cookie. |
| `ctx.media` | Stores uploads ([Uploads and media](/learn/uploads-and-media)). |

`request`, `response` and `media` are always there. The rest come from your app's `src/context.server.ts`, which a new
app already has. Its default export runs once per request, and what it returns is spread onto `ctx`. The
`declare module` at the bottom tells TypeScript, so `ctx.db` and `ctx.user` are typed everywhere:

```ts
// src/context.server.ts
import { session } from '@kerf/start/auth'
import auth from '#/auth.server'
import { db } from '#/db/index.server'

export default async ({ request }: { request: Request }) => ({
  db, ...(await session(auth, request)),
})

type Session = Awaited<ReturnType<typeof auth.session>>

declare module '@kerf/start' {
  interface Context {
    db: typeof db
    user: Session['user']
    session: Session['session']
  }
}
```

To put something else on `ctx` (a feature-flag client, a tenant looked up from the host name) return it here and add it
to the interface. `load` gets the same `ctx`.

### Who is calling

`auth: 'user'` refuses any call with no signed-in user: the caller gets **A002** (status 401) and `run` never starts.
Inside `run`, TypeScript then knows `ctx.user` isn't `null`, so `ctx.user.id` needs no check.

It says *who* is calling, not what they may touch. A mutation that takes an id must still check that the row belongs to
`ctx.user`, which is why `renameTodo` above has `eq(todos.userId, ctx.user.id)` in its `where`: someone else's id
matches no row. [Auth](/learn/auth) goes further.

## Failing on purpose

Things go wrong in ordinary ways: the row is gone, the name is taken, the user may not do that. A server function says
so by throwing, and how you throw decides what the browser sees.

**`FnError`** is a failure with a message meant for the person using the app, and an HTTP status:

```ts
import { FnError } from '@kerf/start'

export function mustOwn(owner: string, userId: string) {
  if (owner !== userId) {
    throw new FnError({
      message: 'You can only change your own todos.',
    }, 403)
  }
}
```

**`invalid()`** refuses a value that the schema couldn't judge, field by field. It has the same shape as a schema
issue, so `<Form>` shows it next to the field (status 422):

```ts
import { invalid, mutation } from '@kerf/start'
import { z } from 'zod'

const TAKEN = new Set(['admin', 'root'])

export const pickUsername = mutation({
  input: z.object({ username: z.string().min(3) }),
  run: ({ input }) => {
    if (TAKEN.has(input.username)) {
      invalid({ username: 'That name is taken.' })
    }
    return { username: input.username }
  },
})
```

**`raise(code, data)`** is a failure the function declares in `errors`, with data the caller can act on. The browser
reads `code` and `data`, so it can branch on the kind of failure instead of parsing a message:

```ts
// src/server/booking.ts
import { mutation, raise } from '@kerf/start'
import { z } from 'zod'

export const bookTable = mutation({
  input: z.object({ time: z.string() }),
  errors: { full: z.object({ next: z.string() }) },
  run: ({ input }) => {
    if (input.time === '19:00') raise('full', { next: '20:30' })
    return { booked: input.time }
  },
})
```

Anything else you throw, or a bug, is an unexpected failure. The browser gets status 500 and, in production, only the
words "Server function failed.", while the full error goes to the server's log. In development you see the real message,
so you can fix it. Nothing about your server leaks to a visitor by accident.

On the browser's side, every failure arrives as an `FnError`, with `message`, `status`, `code`, `issues` (field by
field, for Q002 and `invalid`) and `data` (for `raise`). The call's promise rejects with it:

```tsx
import { state } from '@kerf/core'
import { FnError } from '@kerf/start'
import { Alert, Button } from '@kerf/veneer'
import { bookTable } from '#/server/booking'

export function Book() {
  const note = state('')
  const book = async (time: string) => {
    try {
      const r = await bookTable({ time })
      note.value = `Booked for ${r.booked}.`
    } catch (e) {
      if (e instanceof FnError && e.code === 'full') {
        const { next } = e.data as { next: string }
        note.value = `Full then. ${next} is free.`
      } else note.value = e instanceof Error ? e.message : String(e)
    }
  }
  return (
    <div>
      <Button onClick={() => void book('19:00')}>Book 19:00</Button>
      {note.value && <Alert>{note.value}</Alert>}
    </div>
  )
}
```

The diagnostics Kerf itself throws (Q002, A002 and the rest) are `StartError`s on the server. They reach the browser as
`FnError`s too, with the code in `code`.

### Redirecting

A mutation can finish by sending the browser somewhere: `redirect('/todos')` in `run` makes the router go there when
the call returns. It throws, so nothing after it runs:

```ts
import { mutation, redirect } from '@kerf/start'
import { z } from 'zod'

export const finishSetup = mutation({
  input: z.object({ name: z.string().min(1) }),
  run: () => {
    redirect('/todos')
  },
})
```

That keeps the decision of where to go next on the server, with the code that knows. Sign-in uses it: after a session
changes, the redirect is a full page load, so nothing the last user cached survives in the tab ([Auth](/learn/auth)).

## Optimistic updates

A round trip takes time, a few hundred milliseconds on a good day. For an action whose outcome you can predict (ticking
a box, adding a row), waiting for the server makes the app feel slow. An **optimistic update** shows the predicted
result at once, then settles to the server's answer.

Try it below. Adding a todo shows it at once, marked as saving. A title with "fail" in it is refused by the pretend
server, and the row goes away again:

:::demo stack-optimistic

That demo does the bookkeeping by hand to show the idea. With a mutation, you only write the prediction. `optimistic`
gets the input and the cache, and changes a query's cached value with a draft you can mutate:

```ts
// src/server/rename-fast.ts
import { mutation } from '@kerf/start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { todos } from '#/db/schema'
import { listTodos } from './todos'

export const renameFast = mutation({
  input: z.object({
    id: z.string(), title: z.string().trim().min(1),
  }),
  auth: 'user',
  invalidates: ['todos'],
  optimistic: ({ input }, cache) =>
    cache.update(listTodos, undefined, list => {
      const t = list.find(x => x.id === input.id)
      if (t) t.title = input.title
    }),
  run: ({ input, ctx }) =>
    ctx.db.update(todos)
      .set({ title: input.title })
      .where(and(
        eq(todos.id, input.id), eq(todos.userId, ctx.user.id),
      ))
      .returning(),
})
```

`cache.update(query, input, recipe)` names the query and the input of the entry to change (`undefined` for a query
with none). The recipe edits a copy-on-write draft: only the row it touches is copied, so every other row keeps its
identity and its place on the page.

What Kerf does with it:

1. The call starts. `optimistic` runs in the browser, and its change is applied as a **layer** on top of the cached
   value. Every component reading `listTodos` shows it at once.
2. The server runs the mutation, then the queries it invalidated, and answers with all of it.
3. The fresh `listTodos` value replaces the cached one, and the layer is dropped. If the prediction was right, nothing
   on the page moves.
4. If the call fails, the layer is dropped and the cache is what the server last said. The row goes back, and the
   promise rejects with the `FnError`, for you to show.

While a call is in flight its layer is re-applied on top of any new value that arrives, so two quick changes don't undo
each other. `cache.isOptimistic(row)` tells you a row came from a layer, for a "saving" style like the demo's badge. A
mutation that changes the rows of two queries calls `cache.update` once for each.

`optimistic` is the one part of a mutation that runs in the browser. The build keeps it in the stub and strips
everything else.

:::deepdive One round trip
A change in most apps costs two trips: the write, then a refetch of everything that might have changed. Kerf does it in
one. The browser sends the mutation with the list of queries the page is showing. The server runs the mutation, works out
which of those queries share a tag with `invalidates`, runs them, and sends their values back with the result. This is
sometimes called single-flight.

It also means the order is always right. The new list is read after the write commits, on the server, so it can't
show the state from before the change.
:::

## Diagnostics you'll meet

| Code | What it means |
|---|---|
| Q001 | `q()` called outside a component or scope. Use `await q.fetch()` there. |
| Q002 | The input failed its schema (400), or `invalid()` refused a field (422). |
| Q003 | `query` or `mutation` defined outside a server module. Move it to `src/server/` or a `*.server.ts` file. |
| Q004 | A mutation called while the server handles a GET. |
| Q005 | A result that doesn't survive JSON (`Date`, `Map`, a class). Send plain data such as ISO strings. |
| Q006 | A cached query reads `ctx.user` or the request. |
| Q008 | A mutation invalidates a tag no query declares. |
| Q010 | A mutation called without its stub's proof that it came from your page (403). |
| Q011 | A function read or wrote a table its tags don't name. |
| A002 | `auth: 'user'` and no one is signed in (401). |
| C002 | A result failed its `output` schema (development and tests). |

Each has a page with the fix, such as [Q004](/reference/codes/Q004).

## A body in Rust

For a function that does heavy CPU work, such as search, parsing or images, the body can be Rust instead of TypeScript.
The declaration stays: the same import, call, cache, tags and errors, with `impl` in place of `run` and an `output`
schema as the contract. Nothing changes for the component that calls it. Rust is never needed for Kerf; it's there for
the functions where it pays. [Rust, in depth](/learn/rust) walks through it.

## Recap

- `query` reads and `mutation` writes. Both live in server modules (`src/server/**`, `*.server.ts`), and the browser
  gets a stub that calls them (Q003 otherwise).
- In a component, `q(input)` is a resource and `m(input)` returns a promise. Everywhere else, `await q.fetch(input)`.
- `input` takes any Standard Schema: Zod, Valibot, or `schemasOf` from your tables. It's checked on the server (Q002).
- `ctx` holds the database, the user and the request; `src/context.server.ts` says what's on it.
- `auth: 'user'` says who is calling. Ownership goes in the `where`.
- `FnError` is a message for the user, `invalid()` a field error, `raise()` a declared failure with data. Anything else
  is "Server function failed." in production.
- `invalidates` refreshes tagged queries in the same response, and `optimistic` shows the result before it arrives.

The [Full stack reference](/reference/start#server-functions) has every option.

## Try it

:::challenge Delete only your own
This mutation works, but anyone signed in can delete anyone's todo by sending its id. Fix it.

```ts
import { mutation } from '@kerf/start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { todos } from '#/db/schema'

export const removeTodo = mutation({
  input: z.object({ id: z.string() }),
  auth: 'user',
  invalidates: ['todos'],
  run: ({ input, ctx }) => ctx.db.delete(todos)
    .where(eq(todos.id, input.id))
    .returning(),
})
```
:::solution
Put the owner in the `where`, so a stranger's id matches no row:

```ts
import { mutation } from '@kerf/start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { todos } from '#/db/schema'

export const removeTodo = mutation({
  input: z.object({ id: z.string() }),
  auth: 'user',
  invalidates: ['todos'],
  run: ({ input, ctx }) => ctx.db.delete(todos)
    .where(and(
      eq(todos.id, input.id), eq(todos.userId, ctx.user.id),
    ))
    .returning(),
})
```

`auth: 'user'` only proves someone is signed in. Checking in the same statement is safer than reading the row first
and comparing, because nothing can change between the check and the write.
:::

:::challenge Make it instant
Ticking a todo waits for the server before the box changes. Add an `optimistic` to this mutation so it flips at once.

```ts
import { mutation } from '@kerf/start'
import { and, eq, not } from 'drizzle-orm'
import { z } from 'zod'
import { todos } from '#/db/schema'

export const flipTodo = mutation({
  input: z.object({ id: z.string() }),
  auth: 'user',
  invalidates: ['todos'],
  run: ({ input, ctx }) => ctx.db.update(todos)
    .set({ done: not(todos.done) })
    .where(and(
      eq(todos.id, input.id), eq(todos.userId, ctx.user.id),
    ))
    .returning(),
})
```
:::solution
Predict the change on the cached list:

```ts
import { mutation } from '@kerf/start'
import { and, eq, not } from 'drizzle-orm'
import { z } from 'zod'
import { todos } from '#/db/schema'
import { listTodos } from '#/server/todos'

export const flipTodo = mutation({
  input: z.object({ id: z.string() }),
  auth: 'user',
  invalidates: ['todos'],
  optimistic: ({ input }, cache) =>
    cache.update(listTodos, undefined, list => {
      const t = list.find(x => x.id === input.id)
      if (t) t.done = !t.done
    }),
  run: ({ input, ctx }) => ctx.db.update(todos)
    .set({ done: not(todos.done) })
    .where(and(
      eq(todos.id, input.id), eq(todos.userId, ctx.user.id),
    ))
    .returning(),
})
```

The box flips as soon as it's clicked. When the answer arrives, the server's list replaces the prediction; if the call
fails, the layer is dropped and the box flips back.
:::

:::challenge Tell the user what went wrong
Signing up with a name that's taken shows "Server function failed." in production. Make the person see "That name is
taken." next to the field instead.

```ts
import { mutation } from '@kerf/start'
import { z } from 'zod'

const names = new Set(['ada'])

export const register = mutation({
  input: z.object({ name: z.string().min(2) }),
  run: ({ input }) => {
    if (names.has(input.name)) throw new Error('duplicate name')
    names.add(input.name)
    return { name: input.name }
  },
})
```
:::solution
A plain `Error` is an unexpected failure, so its message is hidden. A field that's wrong is `invalid()`:

```ts
import { invalid, mutation } from '@kerf/start'
import { z } from 'zod'

const names = new Set(['ada'])

export const register = mutation({
  input: z.object({ name: z.string().min(2) }),
  run: ({ input }) => {
    if (names.has(input.name)) {
      invalid({ name: 'That name is taken.' })
    }
    names.add(input.name)
    return { name: input.name }
  },
})
```

The caller gets an `FnError` with `issues` naming the `name` field, and a `<Form>` shows the message next to that
input. For a message that isn't about one field, `throw new FnError({ message }, status)` is the way.
:::
