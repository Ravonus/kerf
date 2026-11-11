# Database

:::learn
- What a new app's database is made of: the schema, the client, and `ctx.db`
- How to change the schema, and how migrations reach the database by themselves
- How to read and write with Drizzle from server functions, including transactions
- How to choose SQLite, Postgres or MySQL, and what happens when the database is down
:::

[Server functions](/learn/server-functions) gave you a place to run code on the server. Most of what that code does is
read and write a database. An app made with `--db` has one wired up already: a schema you edit, a client on `ctx.db`,
and migrations that apply themselves.

The database layer is [Drizzle](https://orm.drizzle.team), with SQLite, Postgres or MySQL under it. You write queries in
TypeScript that read like SQL, and they're typed from your schema. This page covers what Kerf adds around it; for every
Drizzle query there is, its own docs are the reference.

## What a new app has

```
drizzle.config.ts           schema and migration paths for drizzle-kit
src/db/schema.ts            your tables
src/db/index.server.ts      the client: createDb({ schema, url })
src/context.server.ts       puts the client on ctx.db
drizzle/                    migrations, written by `kerf db generate`
.env                        DATABASE_URL
```

The client is one line, made from the schema and the URL in the environment:

```ts
// src/db/index.server.ts
import { createDb } from '@kerf/start/db/sqlite'
import { env } from '#/env.server'
import * as schema from '#/db/schema'

export const db = createDb({ schema, url: env.DATABASE_URL })
```

`src/context.server.ts` returns it as `db`, so every server function and every `load` has it as `ctx.db`. Use `ctx.db`
in your code rather than importing `db` directly: it's the same client, and a test can hand in another one.

`index.server.ts` ends in `.server.ts` for a reason. The database client must never reach the browser, and Kerf keeps it
out: importing `@kerf/start/db` from a file the browser loads is **Q012**. `src/db/schema.ts` is plain table
definitions, so it's safe to import anywhere, and its types are useful on both sides.

## The schema

Tables are declared in `src/db/schema.ts`. Here is the todo table a new app starts with, on SQLite:

<!-- example: skip an excerpt of the scaffold's schema.ts: Better Auth's tables, which `user` refers to, are left out -->
```ts
// src/db/schema.ts
import {
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

export const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  done: integer('done', { mode: 'boolean' })
    .notNull()
    .default(false),
  createdAt: integer('created_at').notNull(),
})
```

Each column has a TypeScript name (`userId`) and a database name (`user_id`). Queries use the TypeScript one. With
sign-in, the same file also has Better Auth's four tables, `user`, `session`, `account` and `verification`, which it reads
and writes through Drizzle. They're yours to look at; leave their columns as they are.

## Changing the schema

Say each todo should have a note. Add a column:

```ts
notes: text('notes'),
```

Then make a migration:

```bash
npx kerf db generate
```

That compares the schema with the last migration and writes the SQL for the difference to a new file in `drizzle/`,
here an `ALTER TABLE` that adds `notes`. Read it; it's short. Then reload the page. There's no separate "migrate" step:
the server applies any new migration in `drizzle/` before the first statement a request runs.

So the loop is: edit the schema, generate, reload. The same thing happens in production. `kerf build` puts the
migrations into the server bundle, and the first request after a deploy that uses the database applies what's new. A
second server starting at the same moment waits for the first (Postgres takes a lock), and each migration runs once:
the database keeps a table, `__kerf_migrations`, of the ones it has applied.

Kerf tells you when the two sides don't match:

- **Q015** (from `kerf check`): the schema changed since the last `kerf db generate`. Run it.
- **Q014** (at run time): a statement used a table or column the database doesn't have. Usually the same fix.

:::pitfall Don't edit `drizzle/` by hand
Migrations are a history. Once a migration has run anywhere (your machine, a teammate's, production), changing it
doesn't change what was already applied, and the databases drift apart. To undo a change, change the schema back and
generate a new migration. Commit `drizzle/` with the schema change that made it.
:::

:::deepdive How migrations apply themselves
The client `createDb` returns waits on a gate before each statement. The first request tells the gate which migrations
the app has; the gate applies the new ones once, and every statement after that goes straight through. Concurrent
requests share that one run.

A request that touches no table never opens the gate, so a page with no queries serves even when the database is
unreachable. If a migration fails, the request that needed it fails with **Q016** (status 503) and the server log has
the driver's error; the next request tries again, so a database that comes back needs no restart.

`createDb({ schema, url, migrate: false })` turns this off, for a deploy where something else applies migrations.
:::

## Reading

Queries run inside a server function's `run`, on `ctx.db`. Every driver is async, so you `await` the result:

```ts
// src/server/reports.ts
import { query } from '@kerf/start'
import { and, count, desc, eq } from 'drizzle-orm'
import { todos, user } from '#/db/schema'

/** The five newest open todos. */
export const latestOpen = query({
  tags: ['todos'],
  auth: 'user',
  run: ({ ctx }) =>
    ctx.db
      .select({ id: todos.id, title: todos.title })
      .from(todos)
      .where(
        and(
          eq(todos.userId, ctx.user.id),
          eq(todos.done, false),
        ),
      )
      .orderBy(desc(todos.createdAt))
      .limit(5),
})

/** How many todos are done. */
export const doneCount = query({
  tags: ['todos'],
  auth: 'user',
  run: async ({ ctx }) => {
    const [row] = await ctx.db.select({ n: count() }).from(todos)
      .where(
        and(eq(todos.userId, ctx.user.id), eq(todos.done, true)),
      )
    return row?.n ?? 0
  },
})

/** Each of my todos with its owner's name: a join. */
export const withOwner = query({
  tags: ['todos', 'user'],
  auth: 'user',
  run: ({ ctx }) =>
    ctx.db
      .select({ title: todos.title, owner: user.name })
      .from(todos)
      .innerJoin(user, eq(todos.userId, user.id))
      .where(eq(todos.userId, ctx.user.id)),
})
```

`select()` with no argument returns whole rows; `select({ … })` picks columns and names them. The result is typed:
`latestOpen` returns `{ id: string; title: string }[]`, and a component calling `latestOpen()` gets that type with no
annotation from you.

Notice the `tags`. A query's tags say which tables it reads, so a mutation that writes one of them refreshes it.
`withOwner` reads two tables and names both. In development Kerf watches the SQL each function runs, and warns with
**Q011** when it touches a table its tags don't name: a change to that table wouldn't refresh it.

:::pitfall Ownership goes in the `where`
Every query above has `eq(todos.userId, ctx.user.id)` in its `where`. `auth: 'user'` makes sure someone is signed in;
it doesn't decide which rows they see. Put the rule in the query itself, so another user's rows can't come back at all.
That holds for writes too, where it matters even more.
:::

## Writing

Writes are mutations. `insert`, `update` and `delete` take the same `where` conditions as `select`, and `.returning()`
gives back the rows they wrote:

```ts
// src/server/writes.ts
import { mutation } from '@kerf/start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { todos } from '#/db/schema'

export const addMany = mutation({
  input: z.object({
    titles: z.array(z.string().trim().min(1)).min(1).max(20),
  }),
  auth: 'user',
  invalidates: ['todos'],
  run: ({ input, ctx }) =>
    ctx.db
      .insert(todos)
      .values(
        input.titles.map((title) => ({
          id: crypto.randomUUID(),
          userId: ctx.user.id,
          title,
          createdAt: Date.now(),
        })),
      )
      .returning(),
})

export const reopen = mutation({
  input: z.object({ id: z.string() }),
  auth: 'user',
  invalidates: ['todos'],
  run: ({ input, ctx }) =>
    ctx.db
      .update(todos)
      .set({ done: false })
      .where(
        and(eq(todos.id, input.id), eq(todos.userId, ctx.user.id)),
      )
      .returning(),
})
```

MySQL has no `returning`. On MySQL, insert, then build the row you return from what you inserted, as a new MySQL app's
`addTodo` does.

### Transactions

When two writes must happen together or not at all, put them in a transaction. Everything inside uses `tx` instead of
`ctx.db`, and a throw anywhere inside rolls all of it back:

```ts
// src/server/split.ts
import { FnError, mutation } from '@kerf/start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { todos } from '#/db/schema'

/** Replace one todo with two smaller ones. */
export const splitTodo = mutation({
  input: z.object({
    id: z.string(),
    first: z.string().min(1),
    second: z.string().min(1),
  }),
  auth: 'user',
  invalidates: ['todos'],
  run: ({ input, ctx }) =>
    ctx.db.transaction(async (tx) => {
      const gone = await tx.delete(todos).where(
        and(
          eq(todos.id, input.id),
          eq(todos.userId, ctx.user.id),
        ),
      ).returning()
      if (!gone.length) {
        throw new FnError({
          message: 'That todo is gone, or it isn\'t yours.',
        }, 404)
      }
      const now = Date.now()
      return tx
        .insert(todos)
        .values([
          {
            id: crypto.randomUUID(),
            userId: ctx.user.id,
            title: input.first,
            createdAt: now,
          },
          {
            id: crypto.randomUUID(),
            userId: ctx.user.id,
            title: input.second,
            createdAt: now + 1,
          },
        ])
        .returning()
    }),
})
```

On SQLite, a transaction also holds back other statements until it ends, so a rollback can't take another request's
writes with it.

### Validating with the table

A table already knows its columns' types, so it can validate input. `schemasOf` from `@kerf/start/db` turns each
table into Zod schemas (`select`, `insert` and `update`), and you add rules per column:

```ts
import { schemasOf } from '@kerf/start/db'
import { z } from 'zod'
import * as schema from '#/db/schema'

export const schemas = schemasOf(schema, {
  todos: { title: (s: z.ZodString) => s.trim().min(1).max(200) },
})
export const newTodo = schemas.todos.insert.pick({ title: true })
```

`newTodo` is a schema for `{ title: string }` with your rules; a new app's `addTodo` uses exactly this as its `input`.
When a column changes in the schema, the validation changes with it.

## Choosing a database

The database is picked when the app is made, with `--db sqlite`, `--db postgres` or `--db mysql`, or added to an app
without one by `kerf add db [engine]`. The difference in your code is one import in `src/db/index.server.ts`:

| | Import | `DATABASE_URL` |
|---|---|---|
| SQLite | `@kerf/start/db/sqlite` | `file:.data/app.db` (the default), a path, or `:memory:` |
| Postgres | `@kerf/start/db/postgres` | `postgres://user:pass@host:5432/db` |
| MySQL | `@kerf/start/db/mysql` | `mysql://user:pass@host:3306/db` |

A URL the driver can't open, such as a `postgres://` URL given to the SQLite client, is **Q013**. Postgres and MySQL
pool their connections; `createDb({ …, max: 20 })` sets the pool size (10 by default).

SQLite is the easiest start: a file in `.data/`, no server to run, and no native module to install, because it uses the
runtime's own SQLite (`node:sqlite` on Node and Deno, `bun:sqlite` on Bun). It's a fine choice in production on one
server. Pick Postgres or MySQL when several servers share the data, or when your host provides one.

Drizzle is the default data layer. `kerf add db` also takes `--layer prisma` or `--layer native` (plain SQL through
`@kerf/db`), and `@kerf/db` has adapters for Kysely, MongoDB, DynamoDB and Firestore. The rest of `@kerf/start`
works the same over any of them: tags, `ctx.db`, migrations on the next request. This chapter sticks to Drizzle.

:::note When the database is down
A page whose loaders and components run no statement doesn't need the database, and keeps serving if it's gone. A
request that does use it answers 503 with **Q016**, and the server log has the driver's error. When the database comes
back, the next request works: no restart.
:::

## Recap

- `src/db/schema.ts` is your tables; `src/db/index.server.ts` makes the client; `ctx.db` is how server code reaches it.
- Change the schema, run `kerf db generate`, reload: new migrations apply before the next request's first statement, in
  development and in production. Q015 and Q014 tell you when you forgot.
- Never edit `drizzle/` by hand.
- Read with `ctx.db.select()…`, write with `insert`, `update` and `delete`, and `await` them. `ctx.db.transaction` keeps
  writes together.
- Tags name the tables a function touches (Q011). Ownership goes in the `where`.
- `schemasOf` makes your tables into validators.
- SQLite, Postgres and MySQL differ by one import and the URL.

The [Full stack reference](/reference/start#database) has the details. To push changes from the database itself to open
pages, including writes from outside the app, see [Realtime and live data](/learn/live-data).

## Try it

:::challenge Clear what's done
Write a mutation `clearDone` that deletes the signed-in user's finished todos and returns how many it removed. Make sure
the list on the page updates.
:::solution
Delete with both conditions in the `where`, return the count of rows deleted, and invalidate `todos`:

```ts
import { mutation } from '@kerf/start'
import { and, eq } from 'drizzle-orm'
import { todos } from '#/db/schema'

export const clearDone = mutation({
  auth: 'user',
  invalidates: ['todos'],
  run: async ({ ctx }) => {
    const gone = await ctx.db.delete(todos).where(
      and(eq(todos.userId, ctx.user.id), eq(todos.done, true)),
    ).returning({ id: todos.id })
    return { removed: gone.length }
  },
})
```

A mutation with no `input` is called with nothing: `await clearDone()`. Because it invalidates `todos`, `listTodos` comes
back fresh in the same response.
:::

:::challenge Send dates the browser can read
This query warns with Q005 in development, and the page shows something odd where the date should be. Why, and what's the
fix?

```ts
import { query } from '@kerf/start'
import { eq } from 'drizzle-orm'
import { user } from '#/db/schema'

export const profile = query({
  tags: ['user'],
  auth: 'user',
  run: async ({ ctx }) => {
    const [row] = await ctx.db.select({
      name: user.name,
      joined: user.createdAt,
    }).from(user).where(eq(user.id, ctx.user.id))
    return row ?? null
  },
})
```
:::solution
`user.createdAt` is a timestamp column, so Drizzle gives back a `Date`. A server function's result goes to the browser as
JSON, and JSON has no dates: the browser would get a string while the server rendered with a `Date`. Q005 points that
out. Send a string you choose:

```ts
import { query } from '@kerf/start'
import { eq } from 'drizzle-orm'
import { user } from '#/db/schema'

export const profile = query({
  tags: ['user'],
  auth: 'user',
  run: async ({ ctx }) => {
    const [row] = await ctx.db.select({
      name: user.name,
      joined: user.createdAt,
    }).from(user).where(eq(user.id, ctx.user.id))
    return row
      ? { name: row.name, joined: row.joined.toISOString() }
      : null
  },
})
```

The component formats `joined` for the reader with `new Date(joined).toLocaleDateString()`. The same goes for `Map`,
`Set`, class instances and `undefined` inside arrays: send plain objects, arrays, strings and numbers.
:::

:::challenge Add a priority
Give todos a priority from 1 to 3, defaulting to 2, and let `addTodo`'s callers set it. What do you change, and what do
you run?
:::solution
Three steps. First the column, in `src/db/schema.ts`:

```
priority: integer('priority').notNull().default(2),
```

Then the migration:

```bash
npx kerf db generate
```

Then the input. A new app's `addTodo` takes `schemas.todos.insert.pick({ title: true })`; pick the new column too:

```
input: schemas.todos.insert.pick({ title: true, priority: true }),
```

and add a rule for it in `schemasOf`'s second argument, next to `title`'s, to keep it between 1 and 3.

Reload, and the migration applies before the first statement. Existing rows get the default, 2. Because the input comes
from the table, `priority` is optional in it (the column has a default), which is what you want.
:::
