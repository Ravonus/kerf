<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">Catalog</h1>

<p align="center">
  <strong>A public shop of 5,000 products with a cart behind Suspense, in Weft, SolidStart and Next.</strong><br>
  The holdout site: it is measured like the others, and no change to Weft or Warp is made because of its numbers.
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
> this folder: it is generated from the `catalog` template of `@weft-js/create` on every bench run.

`catalog` is one of the four database-driven sites in [`examples/`](../README.md). Its manifest calls it the holdout:
the other sites are where Weft and Warp get tuned, and this one checks whether those changes help an app nobody tuned
for. A shop (Mendwell, in the Weft template) is a good holdout because its pages are public, cacheable, list-heavy and
have one small piece of per-visitor state, the cart.

## What the app shows

| Page | What's on it |
| --- | --- |
| `/` | The categories and the first 12 featured products by id. |
| `/c/[slug]` | A category: 24 products a page, sorted by price then id, with min and max price filters (whole dollars) and an in-stock checkbox, all read from the URL. Nonsense in the URL falls back to the first page. |
| `/p/[slug]` | A product with its details, an `Add to cart` button and the 4 lowest-id related products in the same aisle. |
| `/cart` | The visitor's cart lines and quantities. |

The header shows `Cart (n)`. The count loads separately from the page, so the page is usable before it lands. Unknown
products and categories answer 404. The cart lives in a cookie per visitor, and one visitor never sees another's.

The data comes from [`../shared/pg/seed.sql`](../shared/pg/seed.sql): 8 categories (Kitchen, Garden, Office, Outdoor,
Audio, Lighting, Travel, Bath) and 5,000 products named `product-1` to `product-5000`, with fixed seeds.

## The variants

[`app.json`](./app.json) declares three variants:

| Variant | Label in results | Where the code lives |
| --- | --- | --- |
| `weft` | weft + warp | Generated: `{"template": "catalog", "db": "postgres", "auth": false}` passed to create-weft's `scaffold()` |
| `solid` | SolidStart 2.1 + Kobalte + Tailwind 4 | [`solid/`](./solid) |
| `next` | Next 16.4 + Radix + Tailwind 4 | [`next/`](./next) |

> [!NOTE]
> The `solid` and `next` labels name Kobalte and Radix, but `catalog/solid/package.json` has no `@kobalte/core` and
> `catalog/next/package.json` has no Radix package. Read the labels as the family the site belongs to, not as a
> dependency list.

All three have to pass [`e2e.test.mjs`](./e2e.test.mjs) before their numbers count, including a test that every variant
shows the same shop.

### The Weft variant

The template source is
[`packages/create/templates/catalog`](../../packages/create/templates/catalog). It uses:

- **Server functions.** `query` from `@weft-js/start` for categories, featured products, the product list, a product and
  related products. `listCategories` sets `cache: { life: 'hours' }`.
- **Mutations with tags.** `addToCart` and `setQuantity` are `mutation`s that declare `invalidates` (`carts`,
  `cart_items`), and the cart queries declare matching `tags`, so the header count refreshes after a write.
- **Validation in the action.** `invalid({ slug: 'That one just sold out.' })` returns a field error when stock runs out.
- **Islands.** `CartLink` wraps the count in its own `Boundary`, so the header renders with the page and the count fills
  in after.
- **Routing.** `[slug]` routes, `notFound`, `navigate`, `Link`, `Form` and `type Meta`.
- **Warp.** `Grid`, `Split`, `Badge`, `Checkbox`, `NumberField`, `Skeleton`, `Toaster` and `toast`, themed through the
  `warp()` plugin in `weft.config.ts`.

### The comparison variants

| | `solid/` | `next/` |
| --- | --- | --- |
| Framework | `@solidjs/start` 2.1.0, `solid-js` 1.9.18, Nitro | `next` 16.4.3, React 19.3.1 |
| Styling | Tailwind 4 through `@tailwindcss/vite` | Tailwind 4 through `@tailwindcss/postcss` |
| Data | Drizzle on `postgres` | Drizzle on `postgres`, `zod` |
| Scripts | `dev`, `build`, `start`, `check` | `dev`, `build`, `start`, `check` |

## Run it

> [!IMPORTANT]
> The bench and e2e scripts need Node 26, a local Postgres with `psql` on the path, and the benchmark tools installed once
> with `pnpm install` in `examples/`.

### Benchmark all three

```bash
pnpm run setup                         # repo root, once
cd examples
pnpm install                           # benchmark tools only
node bench.mjs catalog
node bench.mjs catalog --only weft,solid --samples=5
node bench.mjs catalog --detect
```

### Run the end-to-end test

```bash
cd examples
node e2e.mjs catalog weft
node e2e.mjs catalog next --no-build
node e2e.mjs catalog --dir http://localhost:3000 --db weft_bench_x   # a server already running
```

### Click through the Weft build

```bash
cd examples
node bench.mjs catalog
node show.mjs                          # the last Weft builds, from port 5501
```

### Run a comparison variant on its own

```bash
cd examples/catalog/solid              # or examples/catalog/next
cp .env.example .env                   # then point DATABASE_URL at a database
npm ci
npm run dev
```

Load [`../shared/pg/schema.sql`](../shared/pg/schema.sql) and [`../shared/pg/seed.sql`](../shared/pg/seed.sql) into that
database to get the bench's rows.

### Make your own copy of the Weft version

```bash
pnpm create @weft-js my-shop --template catalog --db postgres
```

## Manifest details

| Page | Keys |
| --- | --- |
| `/` | `freshness: live`, canary renames the first featured product |
| `/c/kitchen` | `freshness: live`, canary renames the Kitchen category |
| `/p/product-1` | `freshness: live`, canary renames the product; `interact` on `button:Add to cart`; `mutate` clicks it and waits for `Cart (1)` |

`"db": {}` takes the defaults (RTTs of 2 and 40 ms, a pool of 10). There is no `login`: every page is public.
