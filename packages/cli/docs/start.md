# Full stack: `@weft/start`

## Files

```
src/routes/**            file routes: _layout.tsx, index.tsx, [id].tsx, [...rest].tsx, 404.tsx, _error.tsx
src/server/**            server modules: queries and mutations (the client gets stubs)
src/db/schema.ts         Drizzle tables; safe to import anywhere
src/db/index.server.ts   the database client
src/auth.server.ts       Better Auth, mounted at /api/auth/*
src/context.server.ts    what `ctx` holds
```

## Routes

```tsx
import type { LoadArgs, Meta, RouteProps } from '@weft/start'

export const load = async ({ params, ctx }: LoadArgs<'/lists/[id]'>) => ({ list: await getList.fetch({ id: params.id }) })
export const meta: Meta<typeof load> = ({ data }) => ({ title: data.list.name })
export default function List(props: RouteProps<typeof load, '/lists/[id]'>) { return <h1>{props.data.list.name}</h1> }
```

`load` and `meta` never ship to the client. A layout's `load` runs before its children's, so it's where a guard goes.
Links are `<Link href>`; code navigates with `navigate(href)`.

## Server functions

```ts
// src/server/todos.ts
import { mutation, query } from '@weft/start'
import { schemasOf } from '@weft/start/db'
import { and, eq } from 'drizzle-orm'
import * as schema from '../db/schema'

const { todos } = schema
const schemas = schemasOf(schema, { todos: { title: s => s.trim().min(1) } })

export const listTodos = query({
  tags: ['todos'],                  // what invalidates it
  auth: 'user',                     // anyone else gets A002; ctx.user is non-null here
  run: ({ ctx }) => ctx.db.select().from(todos).where(eq(todos.userId, ctx.user.id)),
})

export const addTodo = mutation({
  input: schemas.todos.insert.pick({ title: true }),
  auth: 'user',
  invalidates: ['todos'],           // queries with this tag come back in the same response
  optimistic: ({ input }, cache) => cache.update(listTodos, undefined, l => void l.push({ id: `tmp:${input.title}`, title: input.title, done: false, userId: '' })),
  run: async ({ input, ctx }) => {
    const [row] = await ctx.db.insert(todos).values({ id: crypto.randomUUID(), userId: ctx.user.id, createdAt: Date.now(), ...input }).returning()
    return row
  },
})
```

- `q()` in a component or `defineState` setup: a `Resource`. `(q().value ?? []).map(…)`. `q(() => (id.value ? { id: id.value } : skip))` for a tracked input. Created inside a `<Boundary pending={…}>`, the server streams it; created outside one, the first byte waits for it.
- `await q.fetch(input)` in `load`, handlers and other server functions (Q001 otherwise).
- `m(input)` in handlers. `m.pending.value`, `m.error.value`. It rejects with an `FnError`: `.message`, `.code`, `.status`, `.issues`.
- Refuse with `throw new FnError({ message: 'Not yours' }, 403)`, a user-facing message and a status.
- `redirect('/x')` in `load` (307) or `run` (the client follows).
- `tags: ({ id }) => ['todos', `todo:${id}`]` and `invalidates: ({ id }) => […]` take the input.
- `cache: { life: 'minutes' }` shares a value across requests, so it can't read `ctx.user` (Q006); add `scope: 'user'` for one value per user.
- `output: schema` is checked in dev (C002) and goes in `.weft/contract.json`.

A table a function touches must be in its `tags`/`invalidates` (Q011): a tag named after the table, or `table:…`.

**`auth: 'user'` says who is calling, not what they may touch.** A `run` taking a row's id must check that row belongs
to `ctx.user`. `and(eq(todos.id, input.id), eq(todos.userId, ctx.user.id))` in the `where` is the usual way.

## Database

Drizzle, async on every driver: `await ctx.db.select()…`, `const [row] = await ….returning()`,
`await ctx.db.transaction(async tx => …)`. Change `src/db/schema.ts`, run `weft db generate` (Q015 until
you do), reload: migrations apply on the next request (Q014 names a missing table). Never edit `drizzle/` by hand.

Access beyond ownership goes in the `where`, so a stranger's id matches no row: `and(eq(todos.id, input.id),
or(eq(todos.userId, ctx.user.id), exists(ctx.db.select({ one: sql\`1\` }).from(shares).where(…))))`. A mutation touching
two queries' rows calls `cache.update` once for each in `optimistic`, and names both tags in `invalidates`. Tags are
tables' names: Q011 checks them at run time, in `weft dev`, not in `weft check`.

## Auth

`ctx.user` and `ctx.session` come from `session(auth, request)` in `src/context.server.ts`. Sign-in is a mutation:

```ts
export const signIn = mutation({
  input: z.object({ email: z.email(), password: z.string().min(8) }),
  run: async ({ input, ctx }) => {
    await forward(ctx, auth.api.signInEmail({ body: input, headers: ctx.request.headers, asResponse: true }))
    redirect('/todos')              // with a new session, a full load: nothing cached survives (A004 without one)
  },
})
```

A guard: `export const load = ({ ctx }: LoadArgs) => ctx.user ?? redirect('/login')` in the layout above the pages.

`BETTER_AUTH_URL` in `.env` must match where the app runs: on another port (`weft dev --port`), sign-in answers
`INVALID_ORIGIN`.

## Runtimes

`weft dev` runs on Node. `weft build` targets `runtime` in weft.config.ts (`node`, `bun`, `deno`; `--runtime` overrides)
and writes `.output/` and `.weft/contract.json`. Runtime-specific APIs (`Bun.*`, `Deno.*`, `better-sqlite3`) in server
code break the other targets; `node:` modules and web APIs work on all three.
