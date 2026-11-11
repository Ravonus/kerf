<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">@weft-js/start</h1>

<p align="center">
  <strong>Weft's full-stack layer: file routes, typed server functions, streaming SSR, a database, auth and live data.</strong><br>
  Pages ship only the islands that need the client, and one build runs on Node, Bun or Deno.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@weft-js/start"><img src="https://img.shields.io/npm/v/@weft-js/start?color=145c3c&label=npm" alt="npm version"></a>
  <a href="https://github.com/Ravonus/weft/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <a href="https://github.com/Ravonus/weft/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ravonus/weft/quality.yml?branch=main&label=checks" alt="checks"></a>
  <img src="https://img.shields.io/node/v/@weft-js/start?color=145c3c" alt="node version">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="https://github.com/Ravonus/weft/tree/main/docs">Docs</a> ·
  <a href="https://github.com/Ravonus/weft/tree/main/examples">Examples</a> ·
  <a href="https://github.com/Ravonus/weft/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/Ravonus/weft">GitHub</a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** APIs can change between minor versions. Pin the version and read the
> [changelog](https://github.com/Ravonus/weft/blob/main/CHANGELOG.md) before you upgrade.

`@weft-js/start` turns a folder of Weft components into a server-rendered app. Files in `src/routes` become pages,
exports in `src/server` become typed functions the client calls over HTTP, and the server streams each page as its
data arrives. A database, sign-in and realtime updates plug into the same `ctx` every server function gets. It runs on
Node, Bun or Deno and needs no Rust. An app made with `npm create @weft-js` already has it, wired up.

## Highlights

- **Routes from files.** `src/routes/shop/[id].tsx` is `/shop/:id`, with `_layout.tsx` for layouts, `404.tsx` and
  `_error.tsx` for failures, and typed `params` generated from the file names.
- **Server functions with a contract.** `query` and `mutation` validate input with any Standard Schema (Zod, Valibot…),
  run with `ctx`, return typed results, and name the cache tags they read and invalidate.
- **Streaming SSR.** The head and shell go first, then each `<Boundary>` as its data resolves. A `load` field left as a
  promise streams into the page instead of holding up the first byte.
- **Islands by default.** The compiler works out which components need the browser. The rest stays server HTML with no
  JavaScript, and an island loads when it is seen or used, with events before then replayed.
- **Forms that work without JavaScript.** `<Form of={mutation}>` posts to the mutation, shows schema errors by field,
  and restores what was typed when a no-JS submit comes back with errors.
- **A database and auth on `ctx`.** Drizzle over SQLite (`node:sqlite` or `bun:sqlite`, no native binary), Postgres or
  MySQL; migrations apply on the next request. Better Auth by default, or any provider with two functions.
- **Live data without polling code.** `query.live()` refetches whenever a mutation on any tab invalidates one of its
  tags, and `dbChanges` brings in writes from cron jobs, `psql` or other services.
- **Deploy targets checked before you deploy.** `weft deploy hosts` says which of Netlify, Vercel, Cloudflare, Fly and
  Render can run what the app uses, then `weft deploy init` writes their files and a GitHub workflow.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Project layout](#project-layout)
- [File routes](#file-routes)
- [Data loading](#data-loading)
- [Server functions](#server-functions)
- [Forms](#forms)
- [Streaming SSR and islands](#streaming-ssr-and-islands)
- [Navigation, view transitions and speculation rules](#navigation-view-transitions-and-speculation-rules)
- [Head, SEO and share cards](#head-seo-and-share-cards)
- [Database](#database)
- [Auth](#auth)
- [Realtime](#realtime)
- [Configuration](#configuration)
- [Runtimes, deploy targets and adapters](#runtimes-deploy-targets-and-adapters)
- [API reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Related packages](#related-packages)
- [Contributing](#contributing)
- [License](#license)

## Install

Start a new app. The wizard asks for a UI kit, a database, a data layer and auth, and installs everything:

```bash
npm create @weft-js my-app
# or
pnpm create @weft-js my-app
# or
bun create @weft-js my-app
# or (Deno)
deno run -A npm:@weft-js/create my-app
```

Each one scaffolds for its own runtime and package manager. To add Start to an existing Weft project:

```bash
npm install @weft-js/start @weft-js/core
# or
pnpm add @weft-js/start @weft-js/core
# or
bun add @weft-js/start @weft-js/core
```

Start needs Node 24 or later (the `engines` field), Bun or Deno. Drizzle, Better Auth, Zod and the database drivers are
optional peer dependencies: install the ones your app uses, or let `weft add db` and `weft add auth` do it.

## Quick start

A server function in `src/server/` runs on the server. The client gets a stub that calls it:

```ts
// src/server/greeting.ts
import { query } from '@weft-js/start'

export const greeting = query({
  run: () => {
    const time = new Date().toISOString()
    return `Hello at ${time}`
  },
})
```

A route in `src/routes/` reads it. Calling the query in a component gives a `Resource`, a box that fills when the data
arrives:

```tsx
// src/routes/hello.tsx
import type { Meta } from '@weft-js/start'
import { greeting } from '#/server/greeting'

export const meta: Meta = {
  title: 'Hello',
  description:
    'A greeting from the server, with the time it was made.',
}

export default function Hello() {
  const text = greeting()
  return <p>{text.value ?? 'Loading…'}</p>
}
```

```bash
npx weft dev     # serves it at http://localhost:5173/hello
npx weft build   # writes .output/ and .weft/contract.json
npx weft start   # runs .output/ on the configured runtime
```

`#/server/greeting` is `src/server/greeting`. That alias is `paths` in `tsconfig.json`: change it or add your own there,
and Vite and `weft check` follow.

## Project layout

```text
src/routes/**            file routes: _layout.tsx, index.tsx,
                         [id].tsx, [...rest].tsx, 404.tsx,
                         _error.tsx, x.og.tsx
src/server/**            queries, mutations, streams and channels
                         (the client gets stubs); also any *.server.ts
src/db/schema.ts         Drizzle tables; safe to import anywhere
src/db/index.server.ts   the database client
src/auth.server.ts       the auth provider, mounted at /api/auth/*
src/context.server.ts    what `ctx` holds
src/realtime.server.ts   bus, origins and change feed for realtime
weft.config.ts           site metadata, runtime, hydration, deploy
drizzle/                 generated migrations (never edit by hand)
```

`load` and `meta` never ship to the client, and neither does anything under `src/server` beyond a stub per function.
Importing `@weft-js/start/db*` or `@weft-js/start/auth` from code the client reaches is an error (Q012).

## File routes

The router reads `src/routes` into a manifest that the server, the client, the Vite plugin and `weft routes` share.

| File                         | URL                  | Notes                                                              |
| ---------------------------- | -------------------- | ------------------------------------------------------------------ |
| `index.tsx`                  | `/`                  |                                                                    |
| `about.tsx`                  | `/about`             |                                                                    |
| `users/[id].tsx`             | `/users/:id`         | `params.id`                                                        |
| `users/index.tsx`            | `/users`             |                                                                    |
| `docs/[...rest].tsx`         | `/docs/*`            | `params.rest` is the rest of the path; must be the last segment    |
| `_layout.tsx`                | wraps its folder     | the root one wraps the whole app                                   |
| `404.tsx`                    | any unmatched path   | root only; rendered inside the root layout with status 404         |
| `_error.tsx`                 | any thrown error     | root only; rendered inside the root layout with status 500         |
| `users/[id].og.tsx`          | that route's card    | `_default.og.tsx` replaces the built-in card for every route       |
| `_anything`, `*.test.tsx`    | ignored              | so are folders that start with `_`                                 |

Static segments outrank params, and params outrank a splat, so `users/new.tsx` wins over `users/[id].tsx`. A segment
that mixes text and a param (`user-[id].tsx`) is refused: use a whole segment.

A route module may export:

| Export      | What it is                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `default`   | The component. Gets `params`, `data` and, in a layout, `children`.                                 |
| `load`      | Async data for the page, run on the server before render. See [Data loading](#data-loading).       |
| `meta`      | Title, description and tags, as an object or a function of `data` and `params`.                    |
| `prerender` | The params `weft build` writes as static pages with their cards; `true` on a route without params. |
| `skeleton`  | A function of plain markup shown while the route's data loads, or `false` to keep the old page up. |

### A param route

```tsx
// src/routes/users/[id].tsx
import {
  notFound,
  type LoadArgs,
  type Meta,
  type RouteProps,
} from '@weft-js/start'
import { getUser } from '#/server/users'

export const load = async ({ params }: LoadArgs<'/users/[id]'>) => {
  const user = await getUser.fetch({ id: params.id })
  return user ?? notFound()
}

export const meta: Meta<typeof load> = ({ data }) => ({
  title: data.name,
  description: data.bio,
})

export default function User(
  props: RouteProps<typeof load, '/users/[id]'>,
) {
  const { data } = props
  return <h1>{data.name}</h1>
}
```

`LoadArgs<'/users/[id]'>` types `params` as `{ id: string }`, and `RouteProps<typeof load, …>` types `data` from what
`load` returns, without `notFound()`. Route paths come from `.weft/routes.d.ts`, which Start's Vite plugin writes during `weft dev` and `weft build`.

`props.data` and `const { data } = props` stay live across navigations: compute from them in JSX or `derived`, not
once in the component body (W001).

### Layouts

A `_layout.tsx` wraps every route in its folder and below. It renders `props.children` where the page goes:

```tsx
// src/routes/_layout.tsx
import { Link, type RouteProps } from '@weft-js/start'

export const meta = {
  extra: [{ name: 'theme-color', content: '#0b0b0f' }],
}

export default function Root(props: RouteProps) {
  return (
    <div class="root">
      <nav>
        <Link href="/">Home</Link>
        <Link
          href="/users"
          match="section"
        >
          Users
        </Link>
      </nav>
      {props.children}
    </div>
  )
}
```

- A layout's `load` runs before its children's, so it is where a guard goes:
  `export const load = ({ ctx }: LoadArgs) => ctx.user ?? redirect('/login')`.
- A layout's `params` are its page's, a `[...rest]` included, so a layout can mark the page it shows.
- Chrome shared by several sections (a sidebar, section tabs) goes in the one layout above them, following the URL with
  `currentPath()`. A `_layout.tsx` per section is replaced, chrome and all, whenever you move between sections, so the
  sidebar flashes and is rebuilt. Keep `{props.children}` in the same parent on every page.

### 404 and error pages

Until you add them, an app gets built-in pages. Your own get the path, or the status and message, as `data`:

```tsx
// src/routes/404.tsx
import type { RouteProps } from '@weft-js/start'

export const meta = {
  title: 'Page not found',
  description: 'There is nothing here.',
}

export default function NotFound(props: RouteProps) {
  return (
    <h1>Nothing lives at {(props.data as { path: string }).path}</h1>
  )
}
```

```tsx
// src/routes/_error.tsx
export const meta = { title: 'Something broke' }

export default function Failed(props: {
  data: { status: number; message: string }
}) {
  return (
    <h1>
      Error {props.data.status}: {props.data.message}
    </h1>
  )
}
```

`notFound()` returned or thrown from any `load` renders `404.tsx` with status 404, and `meta` isn't called. Both files
are read only at the routes root; one in a subfolder is reported and ignored.

### Skeletons

Navigation is instant: the URL and `aria-current` change on click, kept layouts stay, and the level that changes shows a
skeleton made from its own markup until its data arrives. Don't build a loading state for a route change yourself. When
the generated one doesn't fit, export a function of plain markup:

```tsx
function HomeSkeleton() {
  return (
    <section data-site="hero">
      <h1>Your headline</h1>
      <p data-skeleton></p>
    </section>
  )
}
export const skeleton = HomeSkeleton
```

It runs before the page's code loads, so it may use only `div span section article main header footer p h1`–`h6
ul ol li`, string `class` and `data-*` attributes, and text. Anything else warns and leaves no skeleton.

In a build, a skeleton's stylesheet text loads with the router once the page is up, not with the page's own code. A
navigation that comes before it keeps the old page up until the new one arrives.

## Data loading

`load` runs on the server for the first request and for each client navigation (the client fetches the route's data as
JSON). It gets:

| Argument  | What it is                                                                 |
| --------- | -------------------------------------------------------------------------- |
| `params`  | The route's params, typed from the path                                    |
| `request` | The incoming `Request` (headers, cookies, URL)                             |
| `signal`  | Aborts with the request                                                    |
| `ctx`     | What server functions get: `ctx.db`, `ctx.user`, whatever your context adds |

Call queries with `await q.fetch(input)` here. It shares the request cache with the page's `q()`, so a query that `load`
and a component both read runs once.

### Deferred fields stream

Return a promise as a top-level field and it isn't awaited before the first byte. It streams into the `<Boundary>` that
reads it:

```tsx
// src/routes/product/[id].tsx
import { Boundary, resource } from '@weft-js/core'
import type { LoadArgs, RouteProps } from '@weft-js/start'
import { getProduct, getReviews } from '#/server/products'

export const load = async ({
  params,
}: LoadArgs<'/product/[id]'>) => ({
  // Awaited: in the first byte
  product: await getProduct.fetch({ id: params.id }),
  // A promise: streams later
  reviews: getReviews.fetch({ id: params.id }),
})

export const meta = ({
  data,
}: {
  data: { product: { name: string } }
}) => ({
  title: data.product.name,
})

function Reviews(props: { list: Promise<string[]> }) {
  const r = resource(() => props.list)
  return (
    <ul>
      {(r.value ?? []).map((t) => (
        <li>{t}</li>
      ))}
    </ul>
  )
}

export default function Product(
  props: RouteProps<typeof load, '/product/[id]'>,
) {
  return (
    <main>
      <h1>{props.data.product.name}</h1>
      <Boundary pending={<p>Loading reviews</p>}>
        <Reviews list={props.data.reviews} />
      </Boundary>
    </main>
  )
}
```

`meta` and share cards only see settled fields. Reading a deferred one there is H007, an error, because it is still
streaming. On a client navigation the deferred fields arrive resolved in the route's JSON.

### Redirects and errors in `load`

- `redirect('/x')` answers 307 (or pass `301 | 302 | 303 | 308`).
- `notFound()` renders the 404 route.
- Anything else thrown renders `_error.tsx` with status 500.

## Server functions

Any module under `src/server/` (or named `*.server.ts`) can export queries and mutations. The `weft:start` Vite plugin
gives each an id and replaces it in the client build with a stub that calls `/_weft/fn/<id>`. Only `optimistic` ships to
the client.

```ts
// src/server/todos.ts
import { mutation, query } from '@weft-js/start'
import { schemasOf } from '@weft-js/start/db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '#/db/schema'

const { todos } = schema
const schemas = schemasOf(schema, {
  todos: { title: (s: z.ZodString) => s.trim().min(1) },
})

export const listTodos = query({
  tags: ['todos'], // what invalidates it
  auth: 'user', // anyone else gets A002; ctx.user is non-null
  run: ({ ctx }) =>
    ctx.db.select().from(todos).where(eq(todos.userId, ctx.user.id)),
})

export const addTodo = mutation({
  input: schemas.todos.insert.pick({ title: true }),
  auth: 'user',
  invalidates: ['todos'], // tagged queries come back in the response
  optimistic: ({ input }, cache) =>
    cache.update(
      listTodos,
      undefined,
      (list) =>
        void list.push({
          id: `tmp:${input.title}`,
          title: input.title,
          done: false,
          userId: '',
          createdAt: 0,
        }),
    ),
  run: async ({ input, ctx }) => {
    const [row] = await ctx.db
      .insert(todos)
      .values({
        id: crypto.randomUUID(),
        userId: ctx.user.id,
        createdAt: Date.now(),
        ...input,
      })
      .returning()
    return row
  },
})

export const removeTodo = mutation({
  input: z.object({ id: z.string() }),
  auth: 'user',
  invalidates: ({ id }) => ['todos', `todo:${id}`],
  run: async ({ input, ctx }) => {
    // auth: 'user' says who is calling, not what they may touch:
    // check ownership in the where.
    await ctx.db
      .delete(todos)
      .where(
        and(eq(todos.id, input.id), eq(todos.userId, ctx.user.id)),
      )
  },
})
```

### Calling them

| Where                                         | How                                        | You get                                    |
| --------------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| A component or `defineState` setup            | `listTodos()`                              | a `Resource`: `.value`, `.pending`, `.error` |
| With tracked input                            | `q(() => (id.value ? { id: id.value } : skip))` | refetches when `id` changes; `skip` waits |
| `load`, handlers, other server functions, tests | `await listTodos.fetch(input)`           | a promise (Q001 if you call `q()` there)   |
| An event handler                              | `await addTodo({ title })`                 | the result, or a rejected `FnError`        |
| Mutation state                                | `addTodo.pending.value`, `addTodo.error.value` | every caller's state                   |

A query created inside a `<Boundary pending={…}>` streams from the server; created outside one, the first byte waits for
it. Read results in JSX as `(q().value ?? []).map(…)`; never copy query results into `state`.

### Options

| Option        | On                | What it does                                                                                           |
| ------------- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| `input`       | both              | A Standard Schema. Validated on the server before `run`; issues come back on `FnError.issues`.        |
| `output`      | both              | Checked in dev and tests (C002), and written to `.weft/contract.json`.                                |
| `auth`        | both              | `'user'` refuses a call with no session (A002) and types `ctx.user` as non-null.                       |
| `tags`        | query             | Strings, or `(input, ctx) => string[]`. Every cache (client, request, shared) goes by these.          |
| `invalidates` | mutation          | Tags whose queries the response refreshes in one round trip, or `(input, result) => string[]`.        |
| `optimistic`  | mutation          | `({ input }, cache) => void`. Runs on the client; `cache.update(query, input, draft => …)` edits a cached value until the server answers. |
| `limit`       | both              | `{ max, window, by? }`: at most `max` calls per `window` seconds per signed-in user (or per address, `by: 'ip'`); the next is 429 (Q019) with `Retry-After`. Counted in the cache store, so `redisStore()` shares it. |
| `cache`       | query             | `{ life: 'seconds' \| 'minutes' \| 'hours' \| 'days' \| 'max' \| number }` shares one value across requests. It can't read `ctx.user` (Q006) unless you add `scope: 'user'`. |
| `live`        | query             | `{ required: true }` fails the build on a target with no real change feed; `verify` proves it. See [Realtime](#realtime). |
| `errors`      | both              | Named failures, raised with `raise(code, data)`; the client sees `FnError.code` and `.data`.          |
| `shape`       | query             | An example result that sizes a pending view.                                                           |

A table a function touches must be named in its `tags` or `invalidates` (Q011, checked at run time in `weft dev`): a
tag named after the table, or `table:…`.

### Failing on purpose

```ts
import { FnError, invalid, raise, redirect } from '@weft-js/start'

// A user-facing message and a status
throw new FnError({ message: 'Not yours' }, 403)
// A field error, shown next to the field by <Form>
invalid({ email: 'That address is taken' })
// A declared error: FnError.code and .data on the client
raise('out_of_stock', { sku })
redirect('/todos') // in run, the client follows it
```

On the client, a failed call rejects with an `FnError` carrying `.message`, `.code`, `.status` and `.issues`.

### Invalidating by hand

`invalidate('todos')` drops those tags: on the server for this response and the shared cache, on the client by
refetching what reads them. Tags can name one row: `tags: ({ id }) => ['todos', `todo:${id}`]`.

### Where the shared cache lives

`cache: { life }` values live in one process's memory by default. It keeps up to 10,000 values (the least recently
used go first) and drops an expired one when it's read. When several requests miss the same value at once, the first
runs the query and the rest wait for its answer instead of each running it.

With more than one server instance, put the cache in Redis so they all read the same values and an invalidation on one
reaches the others:

```ts
// src/cache.server.ts
import { redisStore } from '@weft-js/realtime-redis'

// REDIS_URL, or redisStore({ url, prefix })
export default redisStore()
```

Any object with `get`, `set`, `versions` and `bump` works (the `Store` type from `@weft-js/start/cache`), and
`memoryStore({ values, tags })` changes the memory store's limits.

## Forms

`<Form of={mutation}>` renders a real `<form>` that posts to the mutation. Before JavaScript loads, it is a plain POST
and the page comes back with errors and typed values restored. After, it submits with `fetch`, keeps focus on the first
invalid field, and never reloads.

```tsx
import { Form, type FormApi } from '@weft-js/start'
import { joinWaitlist } from '#/server/waitlist'

export function WaitlistForm() {
  return (
    <Form
      of={joinWaitlist}
      class="waitlist"
    >
      {(form: FormApi) => (
        <>
          {form.message.value && (
            <p role="alert">That didn't go through.</p>
          )}
          <label>
            Email
            <input
              type="email"
              required
              {...form.field('email', 'email')}
            />
          </label>
          <form.Error name="email" />
          <button
            type="submit"
            disabled={form.pending.value}
          >
            Join
          </button>
        </>
      )}
    </Form>
  )
}
```

| Prop        | Default | What it does                                                         |
| ----------- | ------- | -------------------------------------------------------------------- |
| `of`        |         | The mutation (F001 if it isn't one)                                  |
| `id`        |         | Tells two forms for one mutation apart on the no-JS path            |
| `reset`     | `true`  | Empty the fields after a success                                     |
| `onSuccess` |         | `(result) => void`                                                   |
| `onError`   |         | `(error) => void`                                                    |

The `FormApi` gives `pending`, `errors`, `message`, `result`, `error(name)`, `value(name)`, `field(name, kind?)` and an
`Error` component that renders a live region. `field(name)` restores the raw submitted value; pass `'text'` or
`'email'` for a string, or `'multiple'` for an array. Field names with dots nest (`address.city`), and `x[]` or repeated
names become arrays.

## Streaming SSR and islands

### What a response looks like

The server matches the path, runs every `load` in the chain, merges the metadata, then streams:

1. The `<head>` with every tag and the critical CSS, and the page shell.
2. Each `<Boundary>`'s content as its resources resolve, one chunk each.
3. The page data the client needs to take over.

```tsx
import { Boundary } from '@weft-js/core'

;<Boundary
  pending={<p>Loading…</p>}
  error={(e, retry) => <button onClick={retry}>Retry</button>}
>
  <Orders />
</Boundary>
```

A `<Boundary>` covers every resource created while its children are built. Its fallback shows after 150 ms and stays
at least 400 ms, and a refetch keeps the current content. `weft docs async` has the details.

### Islands

Most of a page has nothing to do in the browser. Weft's compiler follows each route's component graph and marks a
component as client only when it has a reason: an event handler, a `ref` or spread on an element, a read of reactive
state or a query, an `import()` outside a handler, or a top-level side effect. Each call site of such a component from
static code is an island. Everything else stays server HTML and ships no JavaScript.

Each island then loads when it is needed:

| Timing        | When it loads                    | What earns it                                                                     |
| ------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| `interaction` | on the first event inside it     | only handlers: every change starts with an event, and events replay              |
| `visible`     | when it scrolls into view        | work that starts by itself but stays inside the island                           |
| `load`        | with the page                    | anything else: `autofocus`, a module that runs as it loads, a box at module level |

A small inline script captures clicks, input and submits on an island whose code hasn't arrived, holds the default of a
click or submit, and replays them in order once the code is there. If the code never comes, the defaults run late. When
the visitor asks for less data (`prefers-reduced-data` or Save-Data), pointer hover doesn't start a load early.

When the compiler can't prove what you know, say it with a comment above the component:

```tsx
/* @weft visible */
export function Chart(props: { points: number[] }) {
  // measures and draws once it's on screen
}
```

| Comment                    | Means                                                          |
| -------------------------- | -------------------------------------------------------------- |
| `/* @weft client */`       | always ship this component and load it with the page           |
| `/* @weft static */`       | this component needs no client code                            |
| `/* @weft visible */`      | its work only matters once it's on screen                      |
| `/* @weft interaction */`  | its work only matters to someone using it                      |

`.weft/hydration.json` says why each island loads when it does, and H010 points out islands that load with the page for
a reason their code could avoid. An island's props cross from server to client as JSON: a function, a `Date` or a class
instance there is H009. A prop that is a function over local names can't cross either, so the component around it
hydrates whole (H017).

Set `hydration` in `weft.config.ts` to change the policy: `'lazy'` (the default), `'partial'` (every island loads with
the page) or `'full'` (every route hydrates whole).

### CSS on a page

A built page carries the CSS its first paint needs in a `<style>`, found by matching the page's HTML against a table from
the build, and links the rest at the end of its shell. The links are at most two hashed files: one with what every route
shares, one with the rest of that route. Hover and focus rules aren't in the first paint, so they work once the late
sheet lands. Mark a region that must not show before then with `data-weft="styled"`: it keeps its room, stays hidden,
and shows anyway after 3 s.

`site.criticalCss: false` goes back to one sheet per chunk, inlined up to 48 KB. `site.inlineCss: false` keeps plain
links, as a strict CSP needs. `weft build` keeps old combined sheets for 30 days in `.weft/sheets`, so a page cached
before a deploy still finds its sheets: keep that folder between builds.

## Navigation, view transitions and speculation rules

Links are `<Link href>`, or any same-origin `<a href>`: once the client has started, clicks on either navigate without a
page load. Code navigates with `navigate(href, { replace?, scroll? })`. `<Link match="section">` sets
`aria-current="page"` on any page under its `href`, for a site's top links.

**View transitions.** A client navigation swaps the page inside `document.startViewTransition` when the browser has it,
the tab is visible and has painted, and the visitor hasn't asked for reduced motion. On a device with four cores or
fewer it skips the fade, and it stops fading after one transition takes over 100 ms to start. Style it with the usual
`::view-transition-*` pseudo-elements.

**Prefetch on intent.** Hovering a link (after 80 ms, on a 4G connection) or focusing it fetches that route's data, not
its code, within a byte budget per connection type (64 KB per response on 4G, 16 KB otherwise, 8 KB on 2G). Nothing is
prefetched offline or with Save-Data. Put `data-preload="off"` on a link or a container to opt out.

**Speculation rules.** A page that runs no client code until it's needed follows its links with full page loads. So the
server adds a `<script type="speculationrules">` that asks the browser to prefetch the link the pointer rests on
(`eagerness: 'moderate'`). It is a prefetch, not a prerender, which would run the next page's code unseen. It leaves out
island links, `/_weft/*`, downloads and anything under `data-preload="off"`, and the router removes the rules when it
takes over, so nothing is fetched twice.

## Head, SEO and share cards

Every page gets a title, a description, a canonical URL, Open Graph and Twitter tags and a share card in the first
response, where a crawler can read them. Most of it is automatic; the words are yours.

```tsx
import type { Meta } from '@weft-js/start'

export const meta: Meta = {
  title: 'Pricing',
  description:
    'Three plans, billed monthly, and what each one includes.',
}
```

`meta` is plain data, computed once per request after the loaders and before the first byte. It can't read a box (H006)
or a deferred field (H007). It also takes `title: { absolute: 'Home' }` to skip the site template, `og`, `twitter`,
`extra` for other tags, and `jsonLd` for structured data. Layers merge in this order, later winning: `site` in
`weft.config.ts`, what the page rendered, each layout's `meta`, the route's `meta`.

With no `meta`, or a field left out:

- **Title**: the page's `h1` (or its first `h2`/`h3`), through `site.title`'s `%s` template.
- **Description**: the first prose paragraph after the `h1` inside `<main>`, cut at a sentence by 155 characters.
- **Share card**: a 1200×630 PNG of the title, description, app name and address. `routes/x.og.tsx` replaces one route's
  card and `_default.og.tsx` every card; `og: { image: '/x.png' }` or `image: false` skips it. The card URL holds a
  hash of what it draws, so it is cached forever and changes when the page does.
- **Canonical and `og:url`** from `site.url`, `WEFT_SITE_URL`, or the host's own variable (Vercel, Netlify, Cloudflare
  Pages, Render, Railway, Fly). With none, the server uses the request's origin and warns once in production (H001).

`weft check` reports metadata for every route from what the routes really produce (H001–H016), and
`weft routes --meta` prints a table of each page's tags and where each came from. Full details:
[`weft docs meta`](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/meta.md).

## Database

`ctx.db` is a Drizzle client, async on every driver. `@weft-js/start` ships three, each a `createDb` that connects on
the first statement, so `weft build` and a page with no queries need no database:

| Import                          | Driver                                                         | Options                                                    |
| ------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| `@weft-js/start/db/sqlite`      | `node:sqlite` on Node and Deno, `bun:sqlite` on Bun; no native binary | `schema`, `url` (default `file:.data/app.db`, or `:memory:`), `migrate` |
| `@weft-js/start/db/postgres`    | postgres.js                                                    | `schema`, `url`, `migrate`, `max` (pool, default 10), `prepare` (default `true`; off behind a pooler in transaction mode) |
| `@weft-js/start/db/mysql`       | mysql2                                                         | `schema`, `url`, `migrate`, `max` (pool, default 10)       |

`migrate` defaults to `true`: pending migrations apply before the first statement a request runs. Postgres and MySQL hold
a lock while they do, so instances starting together apply each file once.

```ts
// src/db/index.server.ts
import { createDb } from '@weft-js/start/db/postgres'
import { env } from '../env.server'
import * as schema from './schema'

export const db = createDb({ schema, url: env.DATABASE_URL })
```

```ts
// src/context.server.ts
import { db } from '#/db/index.server'

export default () => ({ db })

declare module '@weft-js/start' {
  interface Context {
    db: typeof db
  }
}
```

### Migrations

Change `src/db/schema.ts`, run `weft db generate` (Q015 warns until you do), reload. The new migration in `drizzle/`
applies before the next statement. There is no `weft db migrate`. Never edit `drizzle/` by hand.

```bash
# Drizzle-kit generate, then records the schema hash
npx weft db generate add_due_dates
# A migration with change triggers for realtime
npx weft db live
# The change feed as its own process
npx weft db listen
```

A request that hits a missing table gets Q014, which names it. If the database is down, a request that uses it answers
503 with Q016, pages with no queries still serve, and the next statement tries again once it is back, with no restart.

### Validating input from tables

`schemasOf(schema, refine?)` from `@weft-js/start/db` gives a Zod `select`, `insert` and `update` schema per table
(through drizzle-zod), so a table is its own validator:

```ts
const schemas = schemasOf(schema, {
  todos: { title: (s: z.ZodString) => s.trim().min(1) },
})
export const addTodo = mutation({
  input: schemas.todos.insert.pick({ title: true }) /* … */,
})
```

### Other data layers

Prisma, or plain SQL with no ORM, come from [`@weft-js/db`](https://www.npmjs.com/package/@weft-js/db) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/db)</sup>:

```bash
npx weft add db postgres --layer native   # ctx.db.sql`select …`
# Ctx.db is your Prisma client
npx weft add db sqlite --layer prisma
```

Paged, filtered and searchable lists over any of them (`listInput` and a list source) are covered in the `@weft-js/db`
README. A Drizzle table's source is `drizzleSource({ db, table }, spec)` from `@weft-js/start/list/drizzle`.

## Auth

Auth is a provider in `src/auth.server.ts` with two jobs: `handler(request)` serves everything under `/api/auth`, and
`session(request)` says who a request is. `ctx.user`, `ctx.session` and `auth: 'user'` come from those.

### Better Auth (the default)

```ts
// src/auth.server.ts
import { createAuth } from '@weft-js/start/auth/better-auth'
import { drizzleAuth } from '@weft-js/start/auth/drizzle'
import { db } from '#/db/index.server'
import * as schema from './db/schema'
import { env } from './env.server'

export default createAuth({
  db,
  secret: env.BETTER_AUTH_SECRET,
  options: { database: drizzleAuth(db, schema) },
})
```

```ts
// src/context.server.ts
import { session } from '@weft-js/start/auth'
import auth from '#/auth.server'
import { db } from '#/db/index.server'

export default async ({ request }: { request: Request }) => ({
  db,
  ...(await session(auth, request)),
})

type Session = Awaited<ReturnType<typeof auth.session>>

declare module '@weft-js/start' {
  interface Context {
    db: typeof db
    user: Session['user']
    session: Session['session']
  }
}
```

`createAuth` takes `db`, `secret` (32+ characters; A001 in production), `options` (any Better Auth option, which wins
over Weft's defaults) and `api`. `options.database` is required (A005): `drizzleAuth(db, schema)`, `nativeAuth(db)` from
`@weft-js/db/plugin-native/auth`, or Better Auth's Prisma adapter. `weft add auth` sets all of this up.

Sign-in is a mutation. `forward` puts the provider's cookies on the response and turns its failure into an `FnError`:

```ts
// src/server/session.ts
import { mutation, redirect } from '@weft-js/start'
import { forward } from '@weft-js/start/auth'
import { z } from 'zod'
import auth from '#/auth.server'

export const signIn = mutation({
  auth: 'public',
  input: z.object({ email: z.email(), password: z.string().min(8) }),
  run: async ({ input, ctx }) => {
    await forward(
      ctx,
      auth.api.signInEmail({
        body: input,
        headers: ctx.request.headers,
        asResponse: true,
      }),
    )
    // A new session needs a full load (A004 without one)
    redirect('/todos')
  },
})
```

**Who may call a function.** `auth` takes four forms:

| `auth`                          | Who gets through                                    | Everyone else             |
| ------------------------------- | --------------------------------------------------- | ------------------------- |
| `'user'`                        | Anyone signed in                                    | Q019 (429)                           | A function's `limit` ran out for this caller                             | Wait `Retry-After` seconds, or raise `limit`                            |
| J001                                 | A cron job threw                                                         | Fix the job; it runs again when next due                                |
| J002                                 | A cron schedule that doesn't parse                                       | Five fields: `minute hour day month weekday`                            |
| J003                                 | A queued job threw and will run again after its backoff                  | Fix the job; it retries until `retries` runs out                        |
| J004                                 | A queued job is dead: out of retries, or no job by its name              | Fix it and enqueue again; the queue keeps the dead job and its error    |
| J006                                 | `enqueue` got input the job's schema rejects (400)                       | Enqueue what the schema accepts                                         |
| E001                                 | `sendEmail` in production with no mailer                                 | Set `RESEND_API_KEY` or `SMTP_URL`, or export a mailer                  |
| E002                                 | An email with no sender                                                  | Set `EMAIL_FROM`, or pass `from`                                        |
| E003                                 | Resend refused the message                                               | Check the key and that the sending domain is verified                   |
| E004                                 | SMTP failed, or nodemailer is missing                                    | Check `SMTP_URL`; `pnpm add nodemailer`                                 |
| A002 (401)                |
| `{ role: 'admin' }` or an array | A signed-in user with one of the roles              | A002 (401) or A006 (403)  |
| `{ can: (ctx) => boolean }`     | A signed-in user your check passes (it may be async) | A002 (401) or A006 (403)  |
| `'public'`                      | Anyone                                              |                           |

Roles are read from `ctx.user.role`, as Better Auth's `admin` plugin writes it (`'admin'`, or `'admin,user'`); an
array works too.

**In an app with auth, a mutation needs someone signed in unless it says otherwise.** When `ctx` has a `user` field
(it does once `session(auth, request)` is in `src/context.server.ts`), a mutation with no `auth` acts as `auth: 'user'`.
Sign-in, sign-up, sign-out and anything else a visitor may send say `auth: 'public'`. Queries stay open unless they say
otherwise, since a page's data is usually for anyone. An app without auth is unchanged.

**Behind a proxy.** Better Auth rate-limits sign-in by the client's address. Behind a load balancer or CDN, every
request comes from the proxy, so set `site.trustProxy` (`true` for one proxy, or how many) and the address comes from
`X-Forwarded-For` instead. With several instances, give it one store: `rateLimit: { customStorage: redisRateLimit() }` from
`@weft-js/realtime-redis`. In production `createAuth` also needs its own URL (`BETTER_AUTH_URL` or `options.baseURL`,
A007): without it Better Auth trusts each request's `Host` header for the links in its emails. The JWT signing key
rotates every 30 days (`api: { jwks: { rotationInterval } }` changes it).

> [!WARNING]
> **`auth: 'user'` says who is calling, not what they may touch.** A `run` that takes a row's id must check that row
> belongs to `ctx.user`, usually with `and(eq(todos.id, input.id), eq(todos.userId, ctx.user.id))` in the `where`.

**Sessions are opaque tokens in the database, not JWTs.** The HTTP-only cookie holds a random token, so deleting the
row revokes the session. `createAuth` turns on Better Auth's cookie cache, which spares pages and queries their session
reads for **5 minutes**. A revoked session can still see pages for up to that long, but it can't write: mutations,
realtime connections and Better Auth's own routes always read the database. Shorten it with
`options: { session: { cookieCache: { maxAge: 60 } } }`, or turn it off with `{ cookieCache: { enabled: false } }`.

**API access.** `GET /api/auth/token` gives a signed-in user a JWT good for 15 minutes, and `GET /api/auth/jwks` is
public, so another service verifies it with no database. A function takes a bearer token only if you list it:

```ts
createAuth({
  db,
  secret,
  options,
  api: {
    functions: () => [orders, shipOrder],
    jwt: {
      audience: 'https://api.example.com',
      expirationTime: '15m',
    },
  },
})
```

```text
GET  /_weft/fn/<id>?i=<json>
     authorization: Bearer <token>

POST /_weft/fn/<id>
     authorization: Bearer <token>
     content-type: application/json
     x-weft: 1
     body: {"i": input}
```

With no `BETTER_AUTH_URL` or fixed `baseURL`, no token is accepted, since nothing could check `iss` and `aud`.
`api: false` removes all of it.

### Any other provider

```ts
// src/auth.server.ts
import { defineAuth } from '@weft-js/start/auth'

export default defineAuth<{ id: string }, { id: string }>({
  async session(request) {
    return { user: null, session: null } // who this request is
  },
  async handler(request) {
    // Everything under /api/auth
    return new Response('Not found', { status: 404 })
  },
})
```

A provider that caches sessions may answer a GET from the cache, and must ask its store for any other method. Set
`basePath` to mount `handler` somewhere other than `/api/auth`.

## Realtime

Don't poll, and don't open a socket yourself (R007, T013). A live query, a `stream` and a `channel` reconnect, resume
and clean up for you.

### Live queries

Live queries need no server code. Tags are the contract: any mutation that invalidates one of a query's tags, on any
tab, refetches it for every reader. Unchanged rows keep their identity, so the page writes only what changed.

```tsx
const todos = listTodos.live()
todos.value // the rows, as with listTodos()
// 'connecting' | 'live' | 'degraded' | 'reconnecting' | 'offline'
todos.live.value
```

A live query needs `tags` (W053), and its mutations need one of them in `invalidates` (R003 in dev).

### Writes from outside the app

Give the database's writes to `realtime` and a cron job, `psql` or another service reaches the same queries:

```ts
// src/realtime.server.ts
import { realtime } from '@weft-js/start'
import { dbChanges } from '@weft-js/start/changes'
import { db } from '#/db/index.server'
import { notes } from '#/db/schema'

export default realtime({ changes: dbChanges(db, [notes]) })
```

Then `weft db live` writes the trigger migration and it applies on the next request. A notification carries a table and
primary keys, never a column: each client refetches through its own `query`, so `auth` and every filter still apply.

| Database | How it hears changes                                         | Limits                                                                  |
| -------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Postgres | triggers and NOTIFY on one held connection                   | a transaction-mode pooler breaks LISTEN: pass `{ listenUrl }` for a direct connection |
| SQLite   | `PRAGMA data_version` every 100 ms, then the triggers' log   | same host only                                                          |
| MySQL    | the triggers' log, read every 500 ms                          | a row in the log per row written                                        |
| MongoDB  | a change stream (`mongoChanges` from `@weft-js/db/mongo`)     | needs a replica set                                                     |

`notes.liveMode.value` says what the server settled on (`'feed'`, `'external'`, `'poll'`, `'app'` or `'off'`), and
`weft doctor --preset vercel` says what a target can do before you deploy. `live: { required: true }` on a query fails
`weft check` and `weft build` (R013) on a target that can't deliver it, and `liveHealth()` reports it for a health route.

### Streams and topics

```ts
// src/server/prices.ts
import { stream, topic } from '@weft-js/start'
import { z } from 'zod'

const Price = z.object({ symbol: z.string(), price: z.number() })

export const priceTopic = topic('prices', {
  key: z.string().max(12),
  message: Price,
})

export const prices = stream({
  // Bound the input (R005)
  input: z.object({ symbols: z.array(z.string().max(12)).max(50) }),
  message: Price,
  auth: 'user', // re-checked every 5 minutes
  async *run({ input, signal, lastEventId }) {
    yield* priceTopic.subscribe(input.symbols, {
      signal,
      after: lastEventId,
    })
  },
})
// anywhere on the server: await priceTopic.publish('AAPL', { symbol:
// 'AAPL', price: 1 })
```

```tsx
// The latest message: tick.value
const tick = prices({ symbols: ['AAPL'] })
const board = prices(() => ({ symbols: syms.value }), {
  fold: (acc, m) => ({ ...acc, [m.symbol]: m }),
  initial: {},
  keep: '30s',
})
```

### Channels and shared state

`channel` is a WebSocket with named, validated messages each way, for what the client sends often (chat, typing,
cursors). `authorize` is required (R001) and runs on every join and every 5 minutes.

```ts
// src/server/chat.ts
import { channel } from '@weft-js/start'
import { z } from 'zod'
import { insertMessage, isMember, Message } from '#/server/messages'

export const room = channel({
  params: z.object({ roomId: z.string().max(64) }),
  authorize: ({ ctx, params }) => isMember(ctx.user, params.roomId),
  client: { say: z.object({ text: z.string().min(1).max(2000) }) },
  server: { said: Message },
  on: {
    say: async ({ msg, ctx, params, room }) => {
      const row = await insertMessage(ctx, params.roomId, msg.text)
      await room.publish('said', row)
    },
  },
  limits: { perSecond: 10 }, // default 20 a second per socket
})
```

```tsx
const chat = room.connect(() => ({ roomId: props.roomId }))
const said = chat.collect('said', { max: 200, key: (m) => m.id })
await chat.send('say', { text }) // resolves on the server's ack
// 'connecting' | 'open' | 'reconnecting' | 'closed' | 'unauthorized'
chat.status.value
```

A channel is a wire, not a log: a reconnect replays the last 60 s or 256 messages per instance, so what must last goes
in the database. `sharedState(name, { key, value, initial, authorize: { read, write } })` is one last-writer-wins value
per key, held in server memory.

### More than one instance

One instance needs nothing. Several need a bus, and `weft build` refuses the in-memory bus on a multi-instance preset
(R002):

```ts
// src/realtime.server.ts
import { realtime } from '@weft-js/start'
import { postgresBus } from '@weft-js/start/bus/postgres'

export default realtime({
  bus: postgresBus({ url: process.env.DATABASE_URL! }),
  // Exact; the app's own origin is always allowed
  origins: ['https://other.example'],
  // The platform's response limit: streams end 10 s earlier and
  // resume
  maxDuration: 300,
})
```

On function hosts (Vercel, Netlify, Lambda, Azure Functions, Firebase, Cloudflare Workers, Deno Deploy) a process ends
with its request, so `.live()` shows `degraded` for outside writes (R014). Deploy to a server preset, or run
`weft db listen` on any always-on host with a bus both can reach and `dbChanges(db, tables, { listener: 'external' })`
in the app.

The full realtime reference, including `verify` round trips against staging and the test helpers in
`@weft-js/core/test`, is [`weft docs start`](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/start.md).

## Configuration

Start reads these keys from `weft.config.ts` (or `.json` / `.yaml`). `weft check` validates them and writes
`.weft/config.schema.json` for editor completion.

```ts
// weft.config.ts
import { defineConfig } from '@weft-js/core/config'

export default defineConfig({
  site: {
    name: 'Acme',
    url: 'https://acme.dev',
    title: '%s · Acme',
    description: 'Tools for builders.',
    headers: { '/admin/**': { 'x-frame-options': 'DENY' } },
  },
  runtime: 'node',
  hydration: 'lazy',
  deploy: {
    target: 'fly',
    fly: {
      app: 'acme',
      region: 'iad',
      volume: { name: 'data', sizeGb: 1 },
    },
  },
  live: {
    targets: {
      staging: {
        url: 'https://staging.acme.dev',
        db: 'STAGING_DATABASE_URL',
        production: false,
      },
    },
  },
})
```

| Key                  | Values                                         | Default        | What it does                                                                                 |
| -------------------- | ---------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------- |
| `site`               | object                                         |                | Metadata defaults: `name`, `url`, `title` (with `%s`), `description`, `locale`, `image`, `twitter`, `card` |
| `site.headers`       | `{ [pattern]: headers }`                       |                | Response headers by route pattern, static files included                                     |
| `site.security`      | `false` \| `{ [header]: string \| false }`     | see below      | Headers every response gets unless it sets its own; name one to change it, `false` drops it |
| `site.trustProxy`    | `boolean` \| `number`                          | `false`        | Proxies in front: the client's address comes from `X-Forwarded-For` (rate limits)          |
| `site.log`           | `'text'` \| `'json'`                          | `'text'`       | The server log's lines: readable, or JSON objects for a log collector                       |
| `site.limits`        | `{ body, upload }` (bytes)                     | 1 MB, 25 MB    | Largest JSON and multipart (file) request body; past it, 413 (Q018) before the rest is read |
| `site.inlineCss`     | `boolean`                                      | `true`         | First-paint CSS in a `<style>`; `false` for plain links (strict CSP)                         |
| `site.criticalCss`   | `boolean`                                      | `true`         | One hashed sheet plus first-paint CSS; `false` splits by chunk and inlines up to 48 KB       |
| `site.criticalKeep`  | `string[]`                                     |                | Classes a head script sets, kept in the first paint                                          |
| `site.head`          | `string`                                       |                | Raw HTML before the stylesheets on every page                                                |
| `runtime`            | `'node'` \| `'bun'` \| `'deno'`                | the one running the CLI | What `weft build` targets                                                           |
| `hydration`          | `'lazy'` \| `'partial'` \| `'full'`            | `'lazy'`       | When islands load, or hydrate every route whole                                              |
| `deploy`             | `{ target, <host>, ci, branch, cdn }`          |                | The host `weft build` and `weft deploy` target                                               |
| `live.targets`       | `{ [name]: { url, db, production } }`          |                | Where a live query's `verify` runs its round trip                                            |
| `rust`               | `{ unions, services }`                         |                | Server functions with a Rust body (`weft docs rust`)                                         |

Every response Start sends carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`X-Frame-Options: SAMEORIGIN` and `Cross-Origin-Opener-Policy: same-origin-allow-popups`, plus
`Strict-Transport-Security: max-age=31536000` over https outside dev. None of them can break a page. A
Content-Security-Policy is left to the app (it lists the app's own sources): set it in `site.security` or `site.headers`.

Pages are sent `private, no-cache`, so no shared cache or CDN keeps one user's page for another. A route that sets its
own `cache-control` (`ctx.response.headers.set(...)` in `load`) replaces that default; server function answers stay
`no-store`.

The full key list is [`weft docs config`](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/config.md).

## Running in production

**Health.** `GET /_weft/health` answers 200 when every database answers `select 1` (within 2 s) and live data is
delivered as `live: { required }` needs, and 503 otherwise, as JSON: `{ ok, db: [{ dialect, ok, ms }], live }`. It
runs before migrations, so a failed one still reports. Point a load balancer or uptime check at it.

**Logs.** Problems the server finds go to stderr, one line each. `site.log: 'json'` makes them JSON objects (`time`,
`level`, `code`, `message`, `route`, `requestId`) for a log collector. Every response carries `x-request-id`, and every
line from that request names it, so a user's report leads to the line. Behind `site.trustProxy`, a proxy's own
`x-request-id` is kept.

**Shutdown.** On SIGTERM (a deploy or scale-down) the server stops taking requests and finishes the ones it has, the
schedule stops, queued jobs that are running finish, and realtime connections close as "going away", so open pages reconnect to an instance that's staying.

**Scheduled jobs.** `src/cron.server.ts` default-exports the jobs:

```ts
// src/cron.server.ts
import { defineCron } from '@weft-js/start/cron'

export default defineCron({
  // 03:00 UTC every day
  cleanup: {
    schedule: '0 3 * * *',
    run: ({ ctx }) => ctx.db.delete(sessions).where(expired()),
  },
})
```

Schedules are five fields in UTC (`*`, `*/n`, `a-b` and lists), checked when the server starts (J002). A job runs with
the app's `ctx` and no signed-in user; a failure is logged (J001) and the job runs again when it's next due. With
several instances and `redisStore()` in `src/cache.server.ts`, each job runs on one of them per minute; with the memory
store, every instance runs it. Jobs run on server presets (`node`, `bun`, `deno`), not on function hosts, which only
wake for requests: there, call a mutation from the host's own scheduler.

**Email.** `sendEmail()` from `@weft-js/start/email` sends through whichever is set: `RESEND_API_KEY` (Resend's API,
no package needed) or `SMTP_URL` (`smtps://user:pass@smtp.example.com:465`, through `nodemailer`, which you add). The
sender is `EMAIL_FROM` unless a message passes `from`. In dev with neither, each message is printed to the server log,
links and all. Better Auth's password-reset and verification emails go through it too, unless you pass your own.

```ts
import { sendEmail } from '@weft-js/start/email'

await sendEmail({
  to: user.email,
  subject: 'Your export is ready',
  text: url,
})
```

To choose in code (another provider, a test double), default-export a mailer from `src/email.server.ts`:
`resendMailer({ apiKey })`, `smtpMailer({ url })`, or any `{ name, send(message) }`.

**Queued jobs.** Work that shouldn't hold up a response (emails, webhooks, image processing) goes on a queue.
`src/jobs.server.ts` default-exports the jobs, and server code enqueues them:

```ts
// src/jobs.server.ts
import { defineJobs, job } from '@weft-js/start/jobs'
import { redisQueue } from '@weft-js/realtime-redis'
import { z } from 'zod'

export default defineJobs(
  {
    welcome: job({
      input: z.object({ userId: z.string() }),
      run: ({ ctx, input }) =>
        sendWelcome(ctx.db, input.userId),
    }),
  },
  { queue: redisQueue() }, // leave out for the in-memory queue
)

// in a mutation (import jobs from './jobs.server')
await jobs.welcome.enqueue(
  { userId },
  { key: `welcome:${userId}` },
)
```

`enqueue` checks the input against the schema (J006) and returns the job's id; `delay` holds it back, and `key` keeps one
job per key until it has run. A job runs with the app's `ctx` and no signed-in user. When it throws it's logged (J003)
and tried again after 2, 4, 8… seconds (`backoff`), up to `retries` more times (5); then it's dead (J004) and kept with
its error. Jobs run at least once: a job whose instance dies is claimed again when its lease (5 minutes) ends, so make
them safe to repeat. The memory queue loses its jobs on restart and isn't shared; `redisQueue()` keeps them in Redis,
and every instance works the same queue. Like cron, the queue is worked on server presets (`node`, `bun`, `deno`).

## Runtimes, deploy targets and adapters

`weft build` runs Vite with Start's plugin and Nitro, and writes `.output/` and `.weft/contract.json`. The Nitro preset
comes from, in order: `--preset`, `--runtime`, `deploy.target`, `runtime` in the config, then the runtime running the
CLI.

| Runtime | Nitro preset   | Run it with                    |
| ------- | -------------- | ------------------------------ |
| `node`  | `node`         | `weft start`                   |
| `bun`   | `bun`          | `weft start --runtime bun`     |
| `deno`  | `deno_server`  | `weft start --runtime deno`    |

The CLI itself runs on whichever runtime starts it (`bun --bun`, or `deno run -A npm:@weft-js/cli`). Server code that
uses `node:` modules and web APIs works on all three; `Bun.*`, `Deno.*` or `better-sqlite3` break the others. Built
assets ship with `.br` and `.gz` copies, and the server picks by `Accept-Encoding`.

### Hosts

`weft deploy` knows five hosts. It reads what the app uses and says which can run it, before a build:

| What the app uses                                    | Netlify / Vercel | Cloudflare            | Fly / Render                  |
| ---------------------------------------------------- | ---------------- | --------------------- | ----------------------------- |
| pages, queries, mutations, forms, `stream()`         | yes              | yes                   | yes                           |
| `channel`, `sharedState`                             | no (E001)        | yes, Durable Objects  | yes                           |
| `.live({ required })`, Rust `remote()` sidecars      | no (E002)        | no (E002)             | yes                           |
| a SQLite file, media uploads                         | no (E003)        | no (E003)             | with a volume or disk         |
| `changes` without an external listener               | degraded (R014)  | degraded              | yes                           |

| Target       | Preset               | Files `weft deploy init` writes             | Secrets it reads                                   |
| ------------ | -------------------- | ------------------------------------------- | -------------------------------------------------- |
| `netlify`    | `netlify`            | `netlify.toml`                              | `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`            |
| `vercel`     | `vercel`             | `vercel.json`                               | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` |
| `cloudflare` | `cloudflare_durable` | `wrangler.toml`                             | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`    |
| `fly`        | the runtime's server | `fly.toml`, `Dockerfile`, `.dockerignore`   | `FLY_API_TOKEN`                                    |
| `render`     | the runtime's server | `render.yaml`, `Dockerfile`, `.dockerignore` | `RENDER_DEPLOY_HOOK_URL`                          |

```bash
npx weft deploy hosts   # fit, cost and a suggestion
# Host files, a GitHub workflow and `deploy` in the config
npx weft deploy init
# Dry run: prints the build and commands --yes would run
npx weft deploy
npx weft deploy --yes   # deploy a preview; add --prod for production
```

Every target also gets `.github/workflows/weft-deploy.yml`, which runs `weft check` then deploys on push. Tokens come
from the environment only: one written into the config or a host file is E008. Any other Nitro preset works with
`weft build --preset <name>`; `weft doctor --preset <name>` says what live data does there. Full details:
[`weft docs deploy`](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/deploy.md).

## API reference

### `@weft-js/start`

| Export                                                         | What it is                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `query(def)`, `mutation(def)`                                  | Define server functions                                                        |
| `stream(def)`, `topic(name, def)`, `tracked(id, value)`        | Server-to-client message streams                                               |
| `channel(def)`, `sharedState(name, def)`                       | WebSocket rooms and shared per-key values                                      |
| `realtime(options)`                                            | The default export of `src/realtime.server.ts`: bus, origins, limits, changes  |
| `dbChanges(db, tables, options?)`                              | A change feed from Postgres, SQLite or MySQL triggers                          |
| `memoryBus()`                                                  | The one-process bus (the default)                                              |
| `liveHealth()`, `realtimeStats()`                              | Feed status for a health route; hub counters                                   |
| `redirect(href, status?)`, `notFound()`                        | Leave a `load` or `run` early                                                  |
| `raise(code, data?)`, `invalid(fields)`                        | A declared error; a field error for `<Form>`                                   |
| `FnError`, `StartError`, `isRedirect(v)`                       | Error types, and a redirect check                                              |
| `invalidate(...tags)`, `cache`, `skip`, `stale`                | Drop tags; the client cache; skip a tracked input; "a newer build is running"  |
| `listInput(spec)`                                              | A query `input` for paged, sorted, filtered lists                              |
| `Link`, `currentPath()`, `navigate(href, options?)`            | Links with `aria-current`, the current path, and code navigation               |
| `Form`                                                         | A form that posts to a mutation, with or without JavaScript                    |
| Types: `LoadArgs`, `RouteProps`, `Meta`, `OgProps`, `Prerender`, `ParamsOf`, `Context`, `Query`, `Mutation`, `LiveQuery`, `ListSource`, … | Typing routes, cards and functions |

<details>
<summary>Every subpath</summary>

| Import                                | What it has                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| `@weft-js/start/db`                   | `schemasOf(schema, refine?)`, `getTableName`, and the `DbHandle` type                 |
| `@weft-js/start/db/sqlite`            | `createDb` on `node:sqlite` or `bun:sqlite`                                            |
| `@weft-js/start/db/postgres`          | `createDb` on postgres.js                                                              |
| `@weft-js/start/db/mysql`             | `createDb` on mysql2                                                                   |
| `@weft-js/start/db/core`              | The migration gate and handle that data layers build on (used by `@weft-js/db`)        |
| `@weft-js/start/auth`                 | `defineAuth`, `session`, `forward`, and the `AuthProvider` type                       |
| `@weft-js/start/auth/better-auth`     | `createAuth`: Better Auth with Weft's defaults                                         |
| `@weft-js/start/auth/drizzle`         | `drizzleAuth(db, schema?)`: Better Auth's store on a Drizzle client                    |
| `@weft-js/start/list`                 | `listInput` and the list contract that sources implement                              |
| `@weft-js/start/list/drizzle`         | `drizzleSource({ db, table }, spec)`                                                   |
| `@weft-js/start/changes`              | `dbChanges` and the `Source` interface for your own change feed                        |
| `@weft-js/start/bus/postgres`         | `postgresBus({ url })`: LISTEN/NOTIFY as the realtime bus                              |
| `@weft-js/start/bus`                  | The `Bus` interface and `memoryBus`                                                    |
| `@weft-js/start/media`                | `z`, Zod with `z.media()` for upload records `<Media>` takes                           |
| `@weft-js/start/rust`                 | `remote()` and `native()`: server functions with a Rust body (`weft docs rust`)       |
| `@weft-js/start/extension`            | `server.extension@1`: how a plugin adds a server route                                 |
| `@weft-js/start/og`                   | The share-card renderer                                                                |
| `@weft-js/start/client`               | `start()`: the client entry                                                            |
| `@weft-js/start/server`               | `createHandler()`: the request handler                                                 |
| `@weft-js/start/vite`                 | `weftStart()`, the Vite plugin, and `scanRoutes`                                       |
| `@weft-js/start/app`                  | `dev()` and `build()`, as `weft dev` and `weft build` call them                        |
| `@weft-js/start/data`, `/hub`, `/live`, `/channel`, `/share`, `/listen`, `/verify`, `/live-target`, `/changes-sql`, `/routes`, `/inspect`, `/contract`, `/derive`, `/sidecar` | Internals the CLI, the build and sibling packages use. Not a stable API |

</details>

## Troubleshooting

`weft docs <code>` explains any diagnostic below, with its fix.

| Code / symptom                       | Cause                                                                    | Fix                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Q001                                 | `q()` called outside a component or `defineState` setup                  | `await q.fetch(input)` in `load`, handlers and server code              |
| Q006                                 | A query with `cache` read `ctx.user`                                     | Add `cache: { scope: 'user' }`, or drop the shared cache                |
| Q011                                 | A function touched a table its `tags`/`invalidates` don't name           | Add the table's name (or `table:…`)                                     |
| Q012                                 | `@weft-js/start/db*` or `/auth` reached the client                       | Import it only from server modules or `load`                            |
| Q013                                 | A database URL the driver can't open                                     | Use the matching `createDb` (`postgres://` needs `/db/postgres`)        |
| Q014                                 | A table or column is missing                                             | `weft db generate`, then reload                                         |
| Q015                                 | `src/db/schema.ts` changed since the last generate                       | `weft db generate`                                                      |
| Q016 (503)                           | The database is down, or a migration failed                              | Start it, check `DATABASE_URL`, or fix the migration; no restart needed |
| Q018 (413)                           | A request body over `site.limits`                                        | Send less, or raise `site.limits.body` / `.upload`                      |
| Q019 (404)                           | `api.call` / `serverCall` named no query or mutation                     | Call one by its `$id`                                                   |
| Q020 (500)                           | `serverCall` outside a request                                           | Call it from a query, mutation, `load` or extension route               |
| A001                                 | The auth secret is missing or under 32 characters in production          | Set `BETTER_AUTH_SECRET`                                                |
| A002 (401)                           | `auth: 'user'` (or a mutation in an app with auth) called with no session | Sign in first, or guard the route in a layout's `load`                  |
| A006 (403)                           | A signed-in user without the `role`, or `can` said no                    | Sign in as a user it allows, or change the rule                         |
| A007                                 | No `BETTER_AUTH_URL` or `options.baseURL` in production                  | Set `BETTER_AUTH_URL` to the site's https URL                           |
| A004                                 | A mutation changed the session cookie without a redirect                 | `redirect()` after sign-in or sign-out                                  |
| A005                                 | `createAuth` has no store                                                | Pass `options.database`                                                 |
| H007 (500)                           | `meta` or a card read a deferred `load` field                           | Await it in `load`, or leave it out of `meta`                           |
| H009                                 | An island prop JSON can't carry                                          | Pass plain data, or `/* @weft client */` on the parent                  |
| R002                                 | The memory bus on a multi-instance preset                                | Set `bus` in `realtime()`                                               |
| R014, `.live` shows `degraded`       | Outside writes on a function host                                        | A server preset, or `weft db listen` with a shared bus                  |
| W053                                 | `.live()` on a query with no `tags`                                      | Add `tags`                                                              |
| Sign-in answers `INVALID_ORIGIN`     | `BETTER_AUTH_URL` doesn't match where the app runs (`weft dev --port`)   | Update `BETTER_AUTH_URL` in `.env`                                      |
| `postgresBus` or `.live` goes quiet  | pgBouncer in transaction mode breaks LISTEN                              | Give it a direct connection                                             |
| A native addon fails after deploy (E004) | Built on a Mac, deployed to Linux                                   | Build where the host runs; the generated workflow builds on Linux      |

## Related packages

| Package                                                                                         | What it is                                                                                     |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`@weft-js/core`](https://www.npmjs.com/package/@weft-js/core) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/core)</sup>                      | The reactive runtime, compiler binding, Vite plugin, SSR and test utilities Start is built on  |
| [`@weft-js/cli`](https://www.npmjs.com/package/@weft-js/cli) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/cli)</sup>                        | The `weft` command: `dev`, `build`, `check`, `db`, `deploy`, `docs` and the MCP server         |
| [`@weft-js/create`](https://www.npmjs.com/package/@weft-js/create) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/create)</sup>                  | `npm create @weft-js`: scaffolds an app with Start, a database and auth                        |
| [`@weft-js/db`](https://www.npmjs.com/package/@weft-js/db) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/db)</sup>                          | Prisma and no-ORM data layers, and list sources for SQL, Kysely, Prisma, MongoDB, DynamoDB and Firestore |
| [`@weft-js/warp`](https://www.npmjs.com/package/@weft-js/warp) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/warp)</sup>                      | The UI toolkit; its `Table` reads list sources                                                 |
| [`@weft-js/realtime-redis`](https://www.npmjs.com/package/@weft-js/realtime-redis) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/realtime-redis)</sup>, [`-nats`](https://www.npmjs.com/package/@weft-js/realtime-nats), [`-durable-object`](https://www.npmjs.com/package/@weft-js/realtime-durable-object) | Realtime buses for Redis, NATS and Cloudflare Durable Objects |

## Contributing

See [CONTRIBUTING.md](https://github.com/Ravonus/weft/blob/main/CONTRIBUTING.md). From the repository root:

```bash
pnpm install
# Unit and integration tests (Vitest)
pnpm --filter @weft-js/start test
# The runtime matrix against a built app
pnpm --filter @weft-js/start test:e2e <built-app>
```

`test:e2e` takes `--e2e <path>` to pick another scenario in `test/e2e`. The live database scripts in that folder run
directly with Node and need the database environment named in each script. They stay `.mjs` because Node and the
runtime matrix load them without a test transform.

## License

[MIT](https://github.com/Ravonus/weft/blob/main/LICENSE)
