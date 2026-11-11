<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">@kerf/db</h1>

<p align="center">
  <strong>Prisma, plain SQL and six list sources for <code>@kerf/start</code>, behind one <code>ctx.db</code>.</strong><br>
  Every driver is an optional peer, and each subpath loads only its own.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@kerf/db"><img src="https://img.shields.io/npm/v/@kerf/db?color=145c3c&label=npm" alt="npm version"></a>
  <a href="https://github.com/Ravonus/kerf/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <a href="https://github.com/Ravonus/kerf/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ravonus/kerf/quality.yml?branch=main&label=checks" alt="checks"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="https://github.com/Ravonus/kerf/tree/main/docs">Docs</a> ·
  <a href="https://github.com/Ravonus/kerf/tree/main/examples">Examples</a> ·
  <a href="https://github.com/Ravonus/kerf/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/Ravonus/kerf">GitHub</a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** APIs can change between minor versions. Pin the version and read the
> [changelog](https://github.com/Ravonus/kerf/blob/main/CHANGELOG.md) before you upgrade.

[`@kerf/start`](https://www.npmjs.com/package/@kerf/start) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/start)</sup> comes with Drizzle on SQLite, Postgres
and MySQL. This package holds everything else a Start app might keep its data in: a Prisma layer, a no-ORM layer that is
just a `sql` tag over the driver, and list sources that page, sort, filter and search a table or collection safely. All
of them plug into the same machinery Start's own clients use, so migrations apply on the next request, `kerf db
generate` knows where they live, and Q011 still checks your tags.

## Highlights

- **Two data layers beside Drizzle.** `plugin-native` gives `ctx.db.sql` with no ORM; `plugin-prisma` hands you your own
  Prisma client with migrations and tag checks added.
- **Values are always bound.** The Native `sql` tag turns every `${value}` into a driver parameter (`$1` on Postgres,
  `?` elsewhere). There is no way to splice a value into the text.
- **Migrations without a deploy step.** Native's `migrations/*.sql` and Prisma's `prisma/migrations` apply before the
  first statement a request runs, once per file, under a lock on Postgres and MySQL.
- **List sources with an allowlist.** `sqlSource`, `kyselySource`, `prismaSource`, `mongoSource`, `dynamoSource` and
  `firestoreSource` read only the `columns` you name, and refuse any sort, filter or identifier outside them (Q002).
- **Only the driver you use loads.** `@kerf/db/plugin-native/sqlite` never touches `postgres`, Prisma or MongoDB. A
  test walks every entry's imports to keep it that way.
- **A clear error for a missing driver.** Import `@kerf/db/kysely` without `kysely` installed and it says
  `Run: npm install kysely`, instead of a module-resolution stack.
- **Outside writes for live queries.** `mongoChanges` and `watchMongo` turn a MongoDB change stream into tag pokes, and
  `postgresTrigger` writes a NOTIFY trigger for any Postgres table.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Choosing a layer](#choosing-a-layer)
- [The Native layer](#the-native-layer)
- [The Prisma layer](#the-prisma-layer)
- [Drizzle (built into Start)](#drizzle-built-into-start)
- [Migrations and `kerf db`](#migrations-and-kerf-db)
- [Auth on these layers](#auth-on-these-layers)
- [List sources](#list-sources)
- [Changes from MongoDB and Postgres](#changes-from-mongodb-and-postgres)
- [Registering in `kerf.config.ts`](#registering-in-kerfconfigts)
- [API reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Related packages](#related-packages)
- [Contributing](#contributing)
- [License](#license)

## Install

You rarely install this by hand. `npm create kerf` and `kerf add db` pick the layer, install the right drivers and
write the files:

```bash
# a new app
npm create kerf my-app -- --db postgres --layer native
pnpm create kerf my-app --db sqlite --layer prisma
bun create kerf my-app --db mysql --layer native

# an existing app with no database yet
npx kerf add db sqlite --layer prisma
npx kerf add db postgres --layer native
```

`--db` takes `sqlite`, `postgres`, `mysql` or `none`. `--layer` takes `drizzle` (the default, which needs nothing from
this package), `prisma` or `native`. `kerf add db` refuses an app that already has a database, since changing engine
or layer changes your queries.

By hand, install the package next to `@kerf/start` and the driver for what you use:

```bash
npm install @kerf/db @kerf/start @kerf/core
npm install postgres          # plugin-native/postgres
npm install mysql2            # plugin-native/mysql
npm install kysely            # kysely list source, plugin-native/auth
# Dynamodb
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

SQLite needs no driver: it uses `node:sqlite` on Node and Deno and `bun:sqlite` on Bun. The package requires Node 24 or
later (the `engines` field).

## Quick start

A todo list on Postgres with no ORM. The client:

```ts
// src/db/index.server.ts
import { createDb } from '@kerf/db/plugin-native/postgres'
import { env } from '../env.server'

export const db = createDb({ url: env.DATABASE_URL })
```

Put it on `ctx`:

```ts
// src/context.server.ts
import { db } from '#/db/index.server'

export default () => ({ db })

declare module '@kerf/start' {
  interface Context {
    db: typeof db
  }
}
```

Start a migration with `npx kerf db generate todos`, which creates `migrations/0000_todos.sql`, and write the SQL:

```sql
-- migrations/0000_todos.sql
create table todos (
  id varchar(36) primary key,
  title varchar(200) not null,
  done boolean not null default false,
  created_at bigint not null
);
```

Use it from server functions. The migration applies before the first statement runs:

```ts
// src/server/todos.ts
import { mutation, query } from '@kerf/start'
import { z } from 'zod'

interface Todo {
  id: string
  title: string
  done: boolean
}

export const listTodos = query({
  tags: ['todos'],
  run: async ({ ctx }) => {
    const rows = await ctx.db.sql`
      select id, title, done from todos order by created_at`
    return rows as unknown as Todo[]
  },
})

export const addTodo = mutation({
  input: z.object({ title: z.string().trim().min(1).max(200) }),
  invalidates: ['todos'],
  run: async ({ input, ctx }) => {
    const id = crypto.randomUUID()
    await ctx.db.sql`
      insert into todos (id, title, done, created_at)
      values (${id}, ${input.title}, ${false}, ${Date.now()})`
  },
})
```

Finally register the layer, so the CLI knows where migrations live:

```ts
// kerf.config.ts
import { defineConfig } from '@kerf/core/config'
import { native } from '@kerf/db/plugin-native/plugin'

export default defineConfig({ plugins: [native()] })
```

## Choosing a layer

| Layer      | `ctx.db` is                                | Schema lives in                   | Migrations                         | Comes from                    |
| ---------- | ------------------------------------------ | --------------------------------- | ---------------------------------- | ----------------------------- |
| `drizzle`  | a Drizzle client                           | `src/db/schema.ts`                | `drizzle/`, generated by drizzle-kit | `@kerf/start/db/*`       |
| `native`   | `{ sql, query, transaction, driver }`      | your SQL                          | `migrations/NNNN_name.sql`, written by you | `@kerf/db/plugin-native` |
| `prisma`   | your Prisma client, unchanged              | `prisma/schema.prisma`            | `prisma/migrations/`, generated by Prisma | `@kerf/db/plugin-prisma` |

All three run on SQLite, Postgres and MySQL, connect on the first statement (so `kerf build` and a page with no
queries need no database), and answer a request with 503 and Q016 when the database is down, then recover by
themselves.

## The Native layer

No ORM, no schema file, no codegen. `createDb` returns a client with four members:

| Member                      | What it does                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| `` sql`…${v}…` ``           | Runs one statement. Every `${v}` is a bound parameter. Resolves to rows as plain objects.          |
| `query(text, params)`       | One statement you built, with its values bound. For tools that write SQL; in app code use `sql`.  |
| `transaction(fn)`           | Runs `fn({ sql })` on one connection, committed when it resolves and rolled back if it throws.    |
| `driver`                    | The real driver: the postgres.js `Sql`, the mysql2 pool, or SQLite's connection opener.           |

```ts
await ctx.db.transaction(async (tx) => {
  await tx.sql`update accounts
    set balance = balance - ${amount} where id = ${from}`
  await tx.sql`update accounts
    set balance = balance + ${amount} where id = ${to}`
})
```

### Engines

| Import                                  | Driver                                    | Options                                                   |
| --------------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| `@kerf/db/plugin-native/sqlite`      | `node:sqlite` (Node, Deno) or `bun:sqlite` | `url` (default `file:.data/app.db`, or `:memory:`), `migrate` |
| `@kerf/db/plugin-native/postgres`    | `postgres` (postgres.js)                  | `url`, `migrate`, `max` (pool size, default 10)           |
| `@kerf/db/plugin-native/mysql`       | `mysql2`                                  | `url`, `migrate`, `max` (pool size, default 10)           |

`migrate` defaults to `true`. Set it to `false` for a client that should never apply migrations, such as a script.

SQLite opens one connection with WAL journaling, `foreign_keys = on` and a 5 s busy timeout. A transaction holds a gate,
so statements from other requests wait for it instead of landing inside it. On Deno, booleans are passed as `0` and `1`,
since `node:sqlite` there refuses them.

> [!NOTE]
> Rows come back as the driver returns them. SQLite and MySQL return booleans as `0`/`1`, so coerce where it matters:
> `rows.map((t) => ({ ...t, done: Boolean(t.done) }))`. MySQL has no `returning`.

### Your own driver

`createNative(driver, { migrate })` from `@kerf/db/plugin-native` wraps anything that implements `Driver`:
`dialect`, `raw`, `query(text, params)`, `exec(text)`, `transaction(fn)` and `locked(fn)` (hold off other instances
while migrations run).

## The Prisma layer

`withKerf(client, dialect)` returns the same Prisma client, with what Kerf needs: a migration runner and statement
tracking for Q011. Everything else is Prisma's own API, so Prisma's docs apply.

```ts
// src/db/index.server.ts
import { PrismaPg } from '@prisma/adapter-pg'
import { withKerf } from '@kerf/db/plugin-prisma'
import { PrismaClient } from '../generated/prisma/client'
import { env } from '../env.server'

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })
export const db = withKerf(
  new PrismaClient({
    adapter,
    log: [{ emit: 'event', level: 'query' }],
  }),
  'postgresql',
)
```

```ts
// src/server/todos.ts
export const listTodos = query({
  tags: ['todos'],
  run: ({ ctx }) =>
    ctx.db.todo.findMany({ orderBy: { createdAt: 'asc' } }),
})
```

- `dialect` is `'sqlite'`, `'postgresql'` or `'mysql'`. A scaffold uses `@prisma/adapter-libsql`, `@prisma/adapter-pg`
  or `@prisma/adapter-mariadb` for them.
- `log: [{ emit: 'event', level: 'query' }]` lets Kerf see each statement, which is how Q011 knows which tables a
  function touched.
- Migrations in `prisma/migrations` apply inside an interactive transaction, under an advisory lock on Postgres and a
  named lock on MySQL, because `prisma migrate deploy` isn't in a production bundle.
- `withKerf(client, dialect, { migrate: false })` turns that off.

## Drizzle (built into Start)

Drizzle needs nothing from this package: `createDb` comes from `@kerf/start/db/sqlite`, `/postgres` or `/mysql`,
with `drizzle.config.ts` and `src/db/schema.ts`. The
[`@kerf/start` README](https://github.com/Ravonus/kerf/tree/main/packages/start#database) covers it. This package
still adds list sources and change feeds you can use with a Drizzle app.

## Migrations and `kerf db`

Every layer keeps its migrations in a folder the server reads, in order, and records applied ones in a
`__kerf_migrations` table. In dev the folder is read on each request; a build embeds it. There is no `kerf db
migrate`: a new migration applies before the next statement any request runs.

| Command                     | `drizzle`                                         | `native`                                          | `prisma`                                                     |
| --------------------------- | ------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| `kerf db generate [name]`   | `drizzle-kit generate` from `src/db/schema.ts`    | a new, empty `migrations/NNNN_<name>.sql` to write | `prisma generate`, then a migration in `prisma/migrations` |
| Where migrations live       | `drizzle/`                                        | `migrations/`                                     | `prisma/migrations/<stamp>_<name>/migration.sql`             |
| `kerf db live`              | adds a `kerf_live` migration with change triggers | prints the trigger SQL for you to add             | prints the trigger SQL for you to add                        |
| `kerf db listen`            | runs the change feed as its own process           | same                                              | same                                                         |

```bash
npx kerf db generate add_due_dates
```

- **Native.** The new file holds one comment line for you to replace with SQL. Files run once each, in file-name order,
  and each is recorded in `__kerf_migrations` by name.
- **Prisma.** The first `generate` diffs from empty and writes `00000000000000_init/migration.sql`, with no database
  needed. Later ones run `prisma migrate dev --create-only`, which compares against a database.
- **Drizzle.** `generate` also records a schema hash; Q015 warns when `src/db/schema.ts` has changed since.

> [!WARNING]
> A Native file that holds only comments runs no SQL but is still recorded as applied. If the dev server handles a
> request that touches the database before you write the SQL, your later edit to that file won't run. Write the SQL
> first, or start a new file with `kerf db generate`.

A failed migration answers 503 with Q016 and the driver's error in the server log. Fix the file and the next statement
tries again. On MySQL, DDL commits as it goes, so a failed migration can't roll back: check what applied before you
retry.

## Auth on these layers

Better Auth needs a store. Start's `createAuth` takes it as `options.database`:

```ts
// src/auth.server.ts, Native layer
import { createAuth } from '@kerf/start/auth/better-auth'
import { nativeAuth } from '@kerf/db/plugin-native/auth'
import { db } from '#/db/index.server'
import { env } from './env.server'

export default createAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  options: { database: nativeAuth(db) },
})
```

`nativeAuth(db)` is a Kysely dialect over the Native client's own connection, so it needs `kysely` installed but no
second driver. It runs without transactions, which Better Auth treats as optional. On the Prisma layer, use Better
Auth's own adapter: `prismaAdapter(db, { provider: 'postgresql' })` from `better-auth/adapters/prisma`. `kerf add auth`
writes the right one, with the tables in your migrations or Prisma schema.

## List sources

A list source is one table or collection, read and written the same way whatever holds it. Pair it with `listInput` from
`@kerf/start/list` and a query serves paged, sorted, filtered and searched rows that veneer's `Table` reads directly.

```ts
// src/server/tasks.ts
import { query } from '@kerf/start'
import { listInput } from '@kerf/start/list'
import { sqlSource } from '@kerf/db/sql'
import { db } from '#/db/index.server'

const Tasks = sqlSource(db, {
  table: 'tasks',
  columns: {
    id: 'id',
    title: 'title',
    status: 'status',
    rank: 'rank_no',
  }, // public name -> stored name
  search: ['title'],
})

export const tasks = query({
  tags: ['tasks'],
  input: listInput({
    sort: ['rank', 'title'],
    filter: ['status'],
    search: ['title'],
    pageSize: { default: 25, max: 100 },
  }),
  run: ({ input }) => Tasks.list(input),
})
```

Every name a client sends is checked twice: by `listInput`'s allowlist, then against the source's `columns`. Only
`columns` are selected, returned or written, so a `secret` column in the same table never leaves the server. A filter
value is a scalar or a list of them; an object is refused, which is what stops `{ $ne: null }` reaching a document store.

### The spec

| Field     | Type                       | Default                    | What it does                                           |
| --------- | -------------------------- | -------------------------- | ------------------------------------------------------ |
| `columns` | `Record<string, string>`   | required                   | Public name to stored name. The only names that exist. |
| `id`      | `string`                   | `'id'`                     | The public name of the row's id                        |
| `search`  | `string[]`                 |                            | Public names `search` scans                            |
| `write`   | `string[]`                 | every column but the id    | Public names `create` and `update` may set             |

`listInput(spec)` takes `sort` and `filter` (both required, even empty), `search`, `defaultSort: { field, dir }` and
`pageSize: { default, max }` (25 and 100 unless set). A client sends `{ mode, page, pageSize, cursor, sort, search,
filter }`, and gets back `{ items, total?, next?, prev? }`.

Every source has the same methods: `list(params)`, `get(id)`, `create(data)`, `update(id, patch)` (null when there's
no such row) and `remove(id)`. `limits` says what a source can't do, so a page can leave that control out.

### Sources

| Import                  | Function                                | Target                                             | Notes                                                                                   |
| ----------------------- | --------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `@kerf/db/sql`       | `sqlSource(target, { table, ...spec })` | anything with `query(text, params)`: a Native `ctx.db`, or a driver wrapper | Identifiers must be plain names. `create` needs the id in `data`.          |
| `@kerf/db/kysely`    | `kyselySource(db, { table, returning?, ...spec })` | any `Kysely<DB>`                          | Set `returning: false` on MySQL. Needs `kysely`.                                       |
| `@kerf/db/prisma`    | `prismaSource(ctx.db.task, { insensitive?, ...spec })` | a Prisma model delegate             | `insensitive` (default `true`) adds `mode: 'insensitive'` to search, for Postgres and Mongo |
| `@kerf/db/mongo`     | `mongoSource(collection, spec)`         | a MongoDB driver `Collection`                      | Filters are `$eq`/`$in` on checked scalars; search is an escaped `$regex`             |
| `@kerf/db/dynamodb`  | `dynamoSource({ client, table }, { partition?, sortKey?, index?, ...spec })` | a `DynamoDBDocumentClient` | Cursor mode only. A `Scan` by default; a sorted `Query` when `partition` and `sortKey` name an index |
| `@kerf/db/firestore` | `firestoreSource(collection, spec)`     | an Admin SDK `CollectionReference`                 | The document id is the row id. Search is a prefix on the first search column          |
| `@kerf/start/list/drizzle` | `drizzleSource({ db, table }, spec)` | a Drizzle client and table                     | Lives in Start; `columns` maps to the table's property names                           |

```ts
// Prisma: the model delegate is the target
import { prismaSource } from '@kerf/db/prisma'

export const tasks = query({
  input: listInput({
    sort: ['title'],
    filter: ['status'],
    search: ['title'],
  }),
  run: ({ input, ctx }) =>
    prismaSource(ctx.db.task, {
      columns: { id: 'id', title: 'title', status: 'status' },
      search: ['title'],
    }).list(input),
})
```

```ts
// DynamoDB: one partition, sorted by an index's sort key
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { dynamoSource } from '@kerf/db/dynamodb'

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const Orders = dynamoSource(
  { client, table: 'orders' },
  {
    columns: {
      id: 'pk',
      customer: 'customer',
      placed: 'placedAt',
      total: 'total',
    },
    partition: { column: 'customer', value: 'c_42' },
    sortKey: 'placed',
    index: 'by_customer',
  },
)
```

## Changes from MongoDB and Postgres

Start's `dbChanges` covers Postgres, SQLite and MySQL through triggers. For the rest:

**MongoDB as a change feed.** `mongoChanges(db, collections)` is a `Source` for `realtime({ changes })`. It opens one
change stream, carries ids only, and pokes `todos` and `todos:<id>` for a write to `todos`. It needs a replica set: a
standalone `mongod` reports `off` with the fix (`mongod --replSet rs0`, then `rs.initiate()`). After a lost stream every
collection is poked, since a poke is cheaper than a stale page.

```ts
// src/realtime.server.ts
import { realtime } from '@kerf/start'
import { mongoChanges } from '@kerf/db/mongo'
import { mongo } from '#/db/index.server'

export default realtime({
  changes: mongoChanges(mongo, ['todos', 'projects']),
})
```

**One collection, poked directly.** `watchMongo(collection, { tag?, poke?, retry? })` watches one collection and pokes
its tag through the realtime hub, retrying every second (by default) after a failure. It returns a function that stops
it.

**A Postgres trigger by hand.** `postgresTrigger({ table, id?, tag? })` from `@kerf/db/sql` returns SQL for a row
trigger that publishes `tag` and `tag:<id>` on the Postgres bus. Run the text once in a migration. Tags only, never
rows.

## Registering in `kerf.config.ts`

Each layer and each list source has a `/plugin` subpath. Adding it to `plugins` tells the CLI where migrations live (for
the layers), records it in `.kerf/plugins.lock.json`, and lets `kerf check` name it.

```ts
// kerf.config.ts
import { defineConfig } from '@kerf/core/config'
import { native } from '@kerf/db/plugin-native/plugin'
import { sqlSource } from '@kerf/db/sql/plugin'

export default defineConfig({ plugins: [native(), sqlSource()] })
```

| Plugin subpath                          | Export            | Permissions it asks for                                      |
| --------------------------------------- | ----------------- | ------------------------------------------------------------ |
| `@kerf/db/plugin-native/plugin`      | `native`          | read and write `migrations/**`                               |
| `@kerf/db/plugin-prisma/plugin`      | `prisma`          | read `prisma/**`, write `prisma/migrations/**`, spawn `node` |
| `@kerf/db/sql/plugin`                | `sqlSource`       | `net: driver:query`                                          |
| `@kerf/db/kysely/plugin`             | `kyselySource`    | `net: driver:kysely`                                         |
| `@kerf/db/prisma/plugin`             | `prismaSource`    | `net: driver:prisma`                                         |
| `@kerf/db/mongo/plugin`              | `mongoSource`     | `net: driver:mongodb`                                        |
| `@kerf/db/dynamodb/plugin`           | `dynamoSource`    | `net: driver:aws-sdk`                                        |
| `@kerf/db/firestore/plugin`          | `firestoreSource` | `net: driver:firebase-admin`                                 |

`kerf add db` and `npm create kerf` add the layer plugin and approve it. A plugin you add by hand needs
`kerf plugins approve <name>` before the next `kerf check` passes (P109).

## API reference

| Import                                  | Exports                                                                             | Driver it loads          |
| --------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------ |
| `@kerf/db/plugin-native`             | `createNative(driver, { migrate })`; types `NativeDb`, `Driver`, `Sql`, `Row`      | none                     |
| `@kerf/db/plugin-native/sqlite`      | `createDb({ url?, migrate? })`                                                      | `node:sqlite` / `bun:sqlite` |
| `@kerf/db/plugin-native/postgres`    | `createDb({ url, migrate?, max? })`                                                 | `postgres`               |
| `@kerf/db/plugin-native/mysql`       | `createDb({ url, migrate?, max? })`                                                 | `mysql2`                 |
| `@kerf/db/plugin-native/auth`        | `nativeAuth(db)`: Better Auth's `database` option                                   | `kysely`                 |
| `@kerf/db/plugin-prisma`             | `withKerf(client, dialect, { migrate? })`                                           | none (your client)       |
| `@kerf/db/sql`                       | `sqlSource`, `postgresTrigger`, `adapter`; types `SqlTarget`, `SqlSpec`            | none                     |
| `@kerf/db/kysely`                    | `kyselySource`, `adapter`; type `KyselySpec`                                        | `kysely`                 |
| `@kerf/db/prisma`                    | `prismaSource`, `adapter`; types `PrismaDelegate`, `PrismaSpec`                     | none                     |
| `@kerf/db/mongo`                     | `mongoSource`, `mongoChanges`, `watchMongo`, `changeTags`, `adapter`               | none (your client)       |
| `@kerf/db/dynamodb`                  | `dynamoSource`, `adapter`; types `DynamoTarget`, `DynamoSpec`                       | `@aws-sdk/lib-dynamodb`  |
| `@kerf/db/firestore`                 | `firestoreSource`, `adapter`; types `FirestoreCollection`, …                        | none (your client)       |
| `…/plugin` for each of the above        | the plugin for `kerf.config.ts`                                                     | none                     |

Each `adapter` is the source as a `db.adapter@1` slot provider (`{ name, source(target, spec) }`).

## Troubleshooting

| Code / symptom                                            | Cause                                                              | Fix                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `… needs the \`kysely\` driver, which isn't installed`    | The subpath's optional peer is missing                             | Install the package the message names                                       |
| Q002                                                      | A sort, filter, column or table outside the allowlist, or not a plain identifier | Add it to the source's `columns` and to `listInput`              |
| Q011                                                      | A function touched a table its `tags`/`invalidates` don't name    | Add the table's name; on Prisma, keep `log: [{ emit: 'event', level: 'query' }]` |
| Q015                                                      | `src/db/schema.ts` changed since the last `kerf db generate`      | Run `kerf db generate`                                                      |
| Q016 (503)                                                | The database is down, or a migration failed                        | Start it, check `DATABASE_URL`, or fix the migration; no restart needed     |
| `this app has no database: \`kerf add db\` adds one`      | `kerf db generate` found no layer                                  | `kerf add db`, or register the layer plugin in `kerf.config.ts`             |
| `prisma is not installed in this project`                 | The Prisma layer's `generate` couldn't find the `prisma` CLI       | Install `prisma` as a dev dependency                                        |
| `another instance held the migration lock for 60s`        | Prisma on MySQL: another instance is migrating                     | Let it finish; the next request tries again                                 |
| A live query shows `off` on MongoDB                       | A standalone `mongod` has no change streams                        | Run it as a replica set (one member is enough)                              |
| P109 after adding a plugin                                | The plugin lock doesn't approve it yet                             | `kerf plugins approve <name>`                                               |

## Related packages

| Package                                                                         | What it is                                                                         |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`@kerf/start`](https://www.npmjs.com/package/@kerf/start) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/start)</sup>    | File routes, server functions, SSR, Drizzle, auth and realtime; this package's host |
| [`@kerf/core`](https://www.npmjs.com/package/@kerf/core) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/core)</sup>      | The reactive runtime and the plugin API these plugins use                          |
| [`@kerf/cli`](https://www.npmjs.com/package/@kerf/cli) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/cli)</sup>        | `kerf add db`, `kerf db generate`, `kerf db live` and `kerf db listen`             |
| [`create-kerf`](https://www.npmjs.com/package/create-kerf) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/create-kerf)</sup>  | `npm create kerf --db … --layer …`                                             |
| [`@kerf/veneer`](https://www.npmjs.com/package/@kerf/veneer) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/veneer)</sup>      | UI components; `Table` reads what a list source returns                            |

## Contributing

See [CONTRIBUTING.md](https://github.com/Ravonus/kerf/blob/main/CONTRIBUTING.md). From the repository root:

```bash
pnpm install
pnpm --filter @kerf/db test
```

The suites run on SQLite in memory. Set `KERF_TEST_POSTGRES`, `KERF_TEST_MYSQL` or `KERF_TEST_MONGO` (a replica set)
to a throwaway database to run the same tests against a real server. The tests drop and rewrite data there, so never
point them at one you care about.

## License

[MIT](https://github.com/Ravonus/kerf/blob/main/LICENSE)
