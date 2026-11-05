# Full-stack apps

:::learn
- How `@weft-js/start` turns a folder of components into an app with pages, data and users
- How routes, server functions, the database, auth and forms fit together
- Where realtime data, uploads, payments, metadata, rendering and deploying come in
:::

Everything so far ran in the browser. A real app also has a server: it stores data, knows who is signed in, and sends
each page with its data already in it. `@weft-js/start` is that half of weft. It gives you pages from files, functions
that run on the server and that components call like local ones, a database, sign-in, forms that work without
JavaScript, and live updates, all typed from end to end.

An app made with `create-weft` already has it. It runs on Node, Bun or Deno, and needs no Rust. Once weft is published,
`npm create @weft-js` makes one; until then, [Installation](/learn/installation) shows how to make one from a checkout.
With a database and sign-in chosen, a new app is a small working todo list, and the examples in this chapter build on
it.

This chapter has twelve pages. Here is a taste of each.

## Routing and layouts

Every file in `src/routes` is a page, and its path is its URL. `[id]` in a name is a parameter, and `_layout.tsx` wraps
every page below it:

```
src/routes/index.tsx         /
src/routes/todos/index.tsx   /todos
src/routes/todos/[id].tsx    /todos/42
src/routes/_layout.tsx       the nav every page shares
```

```tsx
import { Link, type RouteProps } from '@weft-js/start'

export default function Root(props: RouteProps) {
  return (
    <>
      <nav>
        <Link href="/">Home</Link>
        <Link href="/todos">Todos</Link>
      </nav>
      <main>{props.children}</main>
    </>
  )
}
```

A layout stays on screen when you move between the pages inside it, with its state intact.

Read **[Routing and layouts](/learn/routing-and-layouts)** to learn about parameters, nested layouts, links, 404 and
error pages, and redirects.

## Loading data

A route can export `load`, which runs on the server before the page is sent. What it returns is the page's `props.data`,
typed:

```tsx
import type { RouteProps } from '@weft-js/start'
import { listTodos } from '#/server/todos'

export const load = async () => ({ todos: await listTodos.fetch() })

export default function Todos(props: RouteProps<typeof load>) {
  const { data } = props
  return (
    <ul>
      {data.todos.map(t => (
        <li key={t.id}>{t.title}</li>
      ))}
    </ul>
  )
}
```

A slow field can be left unawaited, and it streams into the page after the rest. A component can also read a query
itself, and the page arrives with its value already in it.

Read **[Loading data](/learn/loading-data)** to learn about `load`, streaming, queries in components, and how tags keep
data fresh after a change.

## Server functions

A `query` reads and a `mutation` writes. You define them in `src/server/`, and the browser gets stubs that call the
server, so a component calls them like functions:

```ts
// src/server/notes.ts
import { mutation, query } from '@weft-js/start'
import { z } from 'zod'

const notes: string[] = []

export const listNotes = query({ tags: ['notes'], run: () => notes })

export const addNote = mutation({
  input: z.object({ text: z.string().trim().min(1) }),
  invalidates: ['notes'],
  run: ({ input }) => {
    notes.push(input.text)
    return notes.length
  },
})
```

```tsx
import { Button } from '@weft-js/warp'
import { addNote, listNotes } from '#/server/notes'

export function Notes() {
  const notes = listNotes()
  return (
    <div>
      <ul>
        {(notes.value ?? []).map(n => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      <Button onClick={() => void addNote({ text: 'Buy milk' })}>
        Add
      </Button>
    </div>
  )
}
```

The input is checked on the server against its schema. `invalidates: ['notes']` sends `listNotes` back fresh in the
same response as the mutation, so the list updates with no code of your own. (A list in memory stands in for a database
here.)

Read **[Server functions](/learn/server-functions)** to learn about schemas, `ctx`, errors and optimistic updates.

## Database

The database is Drizzle on SQLite, Postgres or MySQL. Tables are in `src/db/schema.ts`, and every server function has
the client as `ctx.db`:

```ts
import { query } from '@weft-js/start'
import { asc, eq } from 'drizzle-orm'
import { todos } from '#/db/schema'

export const myTodos = query({
  tags: ['todos'],
  auth: 'user',
  run: ({ ctx }) =>
    ctx.db
      .select()
      .from(todos)
      .where(eq(todos.userId, ctx.user.id))
      .orderBy(asc(todos.createdAt)),
})
```

To change a table, edit the schema and run `weft db generate`. The migration applies itself on the next request.

Read **[Database](/learn/database)** to learn about reading, writing, transactions, migrations and choosing a database.

## Auth

Sign-in is Better Auth on your own database. `ctx.user` is the signed-in user or `null`, `auth: 'user'` on a function
refuses anyone else, and a guard in a layout's `load` keeps visitors out of a section:

```tsx
import {
  redirect,
  type LoadArgs,
  type RouteProps,
} from '@weft-js/start'

export const load = ({ ctx }: LoadArgs) => {
  if (!ctx.user) redirect('/login')
}

export default function Private(props: RouteProps) {
  return <>{props.children}</>
}
```

Read **[Auth](/learn/auth)** to learn how sign-in, sessions and protection work, and how to use your own provider.

## Forms and validation

`<Form of={mutation}>` is a form for one mutation. Each error from the server's schema lands next to its field, and the
form works before the page's JavaScript has loaded. This demo simulates the experience in the browser:

:::demo stack-form

```tsx
import { Form, type FormApi } from '@weft-js/start'
import { Button, Input } from '@weft-js/warp'
import { addTodo } from '#/server/todos'

export function AddTodo() {
  return (
    <Form of={addTodo}>
      {(form: FormApi) => (
        <>
          <Input
            label="New todo"
            name="title"
            error={form.error('title')}
          />
          <Button type="submit" loading={form.pending.value}>
            Add
          </Button>
        </>
      )}
    </Form>
  )
}
```

Read **[Forms and validation](/learn/forms-and-validation)** to learn about field errors, `invalid()`, pending states and
what happens without JavaScript.

## Realtime and live data

Call a query with `.live()` instead of `()`, and it refetches whenever any mutation anywhere, in any tab or for any
user, invalidates one of its tags. There's no server code to write, and no socket to manage:

```tsx
import { listTodos } from '#/server/todos'

export function LiveList() {
  const todos = listTodos.live()
  return (
    <section>
      <p>{todos.live.value}</p>
      <ul>
        {(todos.value ?? []).map(t => (
          <li key={t.id}>{t.title}</li>
        ))}
      </ul>
    </section>
  )
}
```

`todos.live.value` says how connected it is: `'connecting'`, `'live'`, `'degraded'`, `'reconnecting'` or `'offline'`.
Streams and channels carry messages, for prices, chat and cursors.

Read **[Realtime and live data](/learn/live-data)** to learn about live queries, streams, channels and writes from
outside the app.

## Uploads and media

A file in a form arrives in a mutation like any other field. With the media plugin, `ctx.media.ingest` stores it and returns a
record with its dimensions, dominant colour, a placeholder and a `srcset` of sizes, ready for `<Media>`:

```ts
import { mutation } from '@weft-js/start'
import { z } from '@weft-js/start/media'

export const setAvatar = mutation({
  input: z.object({ file: z.file() }),
  auth: 'user',
  run: ({ input, ctx }) => ctx.media.ingest(input.file),
})
```

Read **[Uploads and media](/learn/uploads-and-media)** to learn how to accept files and serve images in the right size.

## Payments

`weft add pay` adds checkout and subscriptions through a plugin. Products are named in your code, and a server
function can require what a purchase grants:

<!-- example: skip needs what `weft add pay` writes: `requires` is an option the pay plugin adds -->
```ts
export const report = query({
  auth: 'user',
  requires: ['pro'],
  run: () => buildReport(),
})
```

Read **[Payments](/learn/payments)** to learn about products, checkout and entitlements.

## Metadata and share images

Each route says what it is with `meta`: a title and a sentence, from what's on the page. weft adds the rest of the head,
and draws a share card for link previews:

```tsx
import type { Meta } from '@weft-js/start'

export const meta: Meta = {
  title: 'Pricing',
  description:
    'Three plans, billed monthly, and what each one includes.',
}

export default function Pricing() {
  return <h1>Pricing</h1>
}
```

Read **[Metadata and share images](/learn/metadata-and-share-images)** to learn about titles, descriptions, structured
data and custom cards.

## SSR, islands and hydration

The server renders every page to HTML, and streams the slow parts in. In the browser, weft takes that HTML over without
building it again. A component with no handler, effect or state needs no JavaScript at all, and the compiler leaves it
out on its own, so a mostly static page ships little code.

Read **[SSR, islands and hydration](/learn/ssr-and-hydration)** to learn how a page is rendered, which parts become
islands, and when their code loads.

## Runtimes and deploying

`weft build` writes a server for Node, Bun or Deno to `.output/`, and `weft start` runs it. A preset targets a host
instead, such as Vercel or Cloudflare:

```bash
npx weft build --runtime bun
npx weft start
```

Read **[Runtimes and deploying](/learn/deploying)** to learn about runtimes, presets and what changes on each host.

## Recap

- Files in `src/routes` are pages; `_layout.tsx` wraps them.
- `load` and queries bring data to a page from the server; mutations change it, and tags keep every page fresh.
- `ctx.db` is the database and `ctx.user` the signed-in user, in every server function and `load`.
- `<Form>` sends a form to a mutation, with field errors, with or without JavaScript.
- `.live()`, uploads, payments, metadata, rendering and deploying each build on the same pieces.

## What's next

Head to [Routing and layouts](/learn/routing-and-layouts) to start with the first page of the chapter.
