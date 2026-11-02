# Routes and server functions

:::learn
- How `@weft-js/start` maps files to pages
- How `load` and `meta` run on the server
- How queries and mutations call the server from a component
:::

`@weft-js/start` is weft's full-stack part: routes from files, server functions, a database, auth and realtime. An app
from `npm create @weft-js` already has it. It runs on Node, Bun or Deno, with no Rust.

## Routes are files

```
src/routes/index.tsx        /
src/routes/about.tsx        /about
src/routes/lists/[id].tsx   /lists/:id
src/routes/_layout.tsx      wraps every page below it
```

A page is the file's default export. `load` fetches its data on the server, and `meta` sets its title and description:

```tsx
import type { LoadArgs, Meta, RouteProps } from '@weft-js/start'
import { getList } from '#/server/lists'

export const load = async ({ params }: LoadArgs<'/lists/[id]'>) => ({ list: await getList.fetch({ id: params.id }) })
export const meta: Meta<typeof load> = ({ data }) => ({ title: data.list.name })

export default function List(props: RouteProps<typeof load, '/lists/[id]'>) {
  return <h1>{props.data.list.name}</h1>
}
```

`load` and `meta` never reach the browser. Link between pages with `<Link href>`, and navigate from code with `navigate(href)`.

## Server functions

Put queries and mutations in `src/server/`. The browser gets small stubs that call the server, so you call them like local
functions:

```ts
// src/server/todos.ts
import { mutation, query } from '@weft-js/start'
import { z } from 'zod'
import { todos } from '../db/schema'

export const listTodos = query({
  tags: ['todos'],
  run: ({ ctx }) => ctx.db.select().from(todos),
})

export const addTodo = mutation({
  input: z.object({ title: z.string().min(1) }),
  invalidates: ['todos'],
  run: async ({ input, ctx }) => {
    const [row] = await ctx.db.insert(todos).values({ id: crypto.randomUUID(), ...input }).returning()
    return row
  },
})
```

In a component, a query is a resource, and a mutation is an async function:

```tsx
const todos = listTodos()
// …
<ul>{(todos.value ?? []).map(t => <li key={t.id}>{t.title}</li>)}</ul>
<Button onClick={() => addTodo({ title: 'Pack' })}>Add</Button>
```

`invalidates: ['todos']` sends `listTodos` back fresh in the same response, so the list updates with no extra code. Don't
copy query results into `state`: read the query.

In `load`, handlers and other server functions, call `await listTodos.fetch()` instead (**Q001** otherwise).

## Database and auth

The database is Drizzle, with SQLite, Postgres or MySQL. Change `src/db/schema.ts`, run `weft db generate`, and migrations
apply on the next request. `ctx.user` is the signed-in user or `null`, and `auth: 'user'` on a query or mutation refuses
anyone else.

The [Full stack reference](/reference/start) has every option: caching, optimistic updates, guards, errors and runtimes.

## Recap

- Files in `src/routes` are pages. `load` and `meta` run on the server.
- `query` and `mutation` in `src/server` are called from components like functions.
- Tags connect them: a mutation's `invalidates` refreshes the queries with that tag.
