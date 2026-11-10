<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">Admin</h1>

<p align="center">
  <strong>A signed-in back office over 10,000 orders, built three times: Weft, SolidStart and Next.</strong><br>
  It also carries the data-loading shapes agents really write: nested loads, per-row loads and a slow panel.
</p>

<p align="center">
  <a href="#run-it">Run it</a> ·
  <a href="#the-weft-variant">Weft variant</a> ·
  <a href="#the-comparison-variants">Comparison variants</a> ·
  <a href="../README.md">All examples</a> ·
  <a href="https://github.com/Ravonus/weft">GitHub</a>
</p>

> [!NOTE]
> This is a private benchmark site, not a published package. Nothing here is on npm. The Weft version is not stored in
> this folder at all: it is generated from the `admin` template of `@weft-js/create` on every bench run.

`admin` is one of the four database-driven sites in [`examples/`](../README.md). The same back office, called Backroom in
the Weft template, is written in three stacks so `bench.mjs` can compare them on production builds against one seeded
Postgres database. The pages sort, filter and page on the server, everything sits behind a sign-in, and the manifest
pins down a canary for each live page, so a stack can't score well by serving stale rows.

## What the app shows

| Page | What's on it |
| --- | --- |
| `/login` | Email and password sign-in. Every `/admin` page redirects here when signed out. |
| `/admin` | Four stats (Revenue, Orders, Customers, Refunded), a revenue chart and the 10 latest orders. |
| `/admin/orders` | 50 orders a page. Column headers sort, a `Status` select filters and a `Search` box finds customers by name, all on the server and all held in the URL. Checked rows can be marked shipped in bulk. |
| `/admin/orders/[id]` | One order with its customer and product names, and a `Status` select that saves. |
| `/admin/nested` | A nested layout whose layout and page each load their own data. |
| `/admin/per-row` | An order feed where each row loads its own customer: the N+1 shape. |
| `/admin/slow` | A slow year report that streams in while a `Count` button already works. |

The data comes from [`../shared/pg/seed.sql`](../shared/pg/seed.sql): 2,000 customers, 10,000 orders, their order
items and 5,000 products, generated with fixed seeds so every run sees the same rows.

## The variants

[`app.json`](./app.json) declares three variants:

| Variant | Label in results | Where the code lives |
| --- | --- | --- |
| `weft` | weft + warp | Generated: `{"template": "admin", "db": "postgres", "auth": true}` passed to create-weft's `scaffold()` |
| `solid` | SolidStart 2.1 + Kobalte + Tailwind 4 | [`solid/`](./solid) |
| `next` | Next 16.4 + Radix + Tailwind 4 | [`next/`](./next) |

All three have to pass [`e2e.test.mjs`](./e2e.test.mjs) before their numbers count. The test uses roles and accessible
names only, so the same file drives every stack.

### The Weft variant

The template source is
[`packages/create/templates/admin`](../../packages/create/templates/admin). It uses:

- **Server functions.** `query` and `mutation` from `@weft-js/start`, with `zod` inputs. The order list takes
  `page`, `sort`, `dir`, `status` and `q` and does the work in SQL through Drizzle.
- **Auth.** `createAuth` from `@weft-js/start/auth/better-auth` with `drizzleAuth`, plus `forward` from
  `@weft-js/start/auth` for sign-in and sign-up mutations. `ctx.user` gates the pages.
- **Routing.** File routes with `_layout.tsx` nesting, `[id]` params, `redirect`, `notFound`, `navigate`, `Link` and `Form`.
- **Reactivity.** `state`, `derived` and `watch` from `@weft-js/core`, and `Boundary` around each panel that loads, so a
  slow or failed load shows a skeleton or an error in place.
- **Warp.** `Shell`, `Table` (with typed `Column`s), `Select`, `Input`, `Skeleton`, `Card`, `Grid`, `Toaster` and
  `toast`, themed in `weft.config.ts` through the `warp()` plugin, plus icons from `@weft-js/warp-icons`.

### The comparison variants

| | `solid/` | `next/` |
| --- | --- | --- |
| Framework | `@solidjs/start` 2.1.0, `solid-js` 1.9.18, Nitro | `next` 16.4.3, React 19.3.1 |
| Components | `@kobalte/core` | `@radix-ui/react-dropdown-menu` |
| Styling | Tailwind 4 through `@tailwindcss/vite` | Tailwind 4 through `@tailwindcss/postcss` |
| Data and auth | Drizzle on `postgres`, Better Auth, `zod` | Drizzle on `postgres`, Better Auth, `zod` |
| Scripts | `dev`, `build`, `start`, `check` | `dev`, `build`, `start`, `check` |

They exist to be measured against, so they are written the way each stack is normally written, not tuned to lose.

## Run it

> [!IMPORTANT]
> The bench and e2e scripts need Node 26 (`examples/package.json` sets `engines.node` to `>=26`), a local Postgres with
> `psql` on the path, and the benchmark tools installed once with `pnpm install` in `examples/`.

### Benchmark all three

```bash
pnpm run setup                         # repo root, once
cd examples
pnpm install                           # benchmark tools only
node bench.mjs admin                   # every variant, 3 samples a page
node bench.mjs admin --only weft --no-record   # try a change, write nothing
node bench.mjs admin --detect          # what each variant resolves to, without building
```

`bench.mjs` refuses to start when the 1-minute load average is over 40. See [the examples README](../README.md) for
every flag and what is measured.

### Run the end-to-end test

```bash
cd examples
node e2e.mjs admin weft                # build if needed, database, proxy, server, tests, stop
node e2e.mjs admin solid --no-build    # the last build as it stands
node e2e.mjs admin next
```

Each test runs on a fresh clone of the seeded database.

### Click through the Weft build

```bash
cd examples
node bench.mjs admin                   # leaves a build in ~/.cache/weft-app-bench
node show.mjs                          # serves it from port 5501
```

Sign in with the throwaway account in [`../shared/pg/bench-user.json`](../shared/pg/bench-user.json).

### Run a comparison variant on its own

The variant folders are ordinary apps locked with npm, which is also how bench installs them (`npm ci`).

```bash
cd examples/admin/solid                # or examples/admin/next
cp .env.example .env                   # then set DATABASE_URL and BETTER_AUTH_SECRET
npm ci
npm run dev
```

The bench loads `../shared/pg/schema.sql` and `../shared/pg/seed.sql` into the database; do the same for a local copy
that has the same rows.

### Make your own copy of the Weft version

```bash
pnpm create @weft-js my-admin --template admin --db postgres --auth
```

## Manifest details

What [`app.json`](./app.json) asks bench to check on top of the defaults:

| Page | Keys |
| --- | --- |
| `/admin`, `/admin/per-row`, `/admin/orders/1` | `freshness: live` with a canary that renames the customer of an order the page shows |
| `/admin/orders` | the same, plus `nav` (click `link:Next`, expect `page=2`) and `interact` (`textbox:Search`, `link:Next`) |
| `/admin/nested` | no keys: measured, freshness `unchecked` |
| `/admin/slow` | `streaming` (click `button:Count` until the `Count: ` status changes) and three `button:Count` interactions |

`"db": {}` and `"login": {}` take the defaults: RTTs of 2 and 40 ms through the latency proxy, a pool of 10, and the
`/login` form with `Email`, `Password` and `Sign in`.
