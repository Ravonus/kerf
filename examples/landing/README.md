<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">Landing</h1>

<p align="center">
  <strong>A marketing site with a waitlist form, in Weft, SolidStart and Next.</strong><br>
  No page reads the database, one form writes to it, and it all works with JavaScript off.
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
> this folder: it is generated from the `landing` template of `@weft-js/create` on every bench run.

`landing` is the simplest of the four database-driven sites in [`examples/`](../README.md). A landing page (Emberline,
in the Weft template) is mostly static: what decides it is how fast the hero paints, how many bytes ship, and whether
the one form still works without JavaScript. The three versions say the same words, so the comparison is about the
framework, not the copy.

## What the app shows

| Page | What's on it |
| --- | --- |
| `/` | A hero with an image, the product pitch and a waitlist form (`Email` and `Join`). |
| `/pricing` | Plans. |
| `/privacy` | What is stored, for how long and who can see it. |
| `/joined` | The confirmation page after joining: "You're on the list". |

The form posts to the server and redirects to `/joined`, so a plain HTML POST works when scripts are off. What
[`e2e.test.mjs`](./e2e.test.mjs) pins down, in every stack:

- Each page answers 200, has a heading and says the same text, checked with JavaScript off.
- Joining adds a row and lands on `/joined`, with JavaScript on or off.
- The same address in other capitals joins once, stored in lower case, and looks the same to the visitor.
- The server refuses a bad address with "That doesn't look like an email address.", with JavaScript on or off.
- Joining sets no cookie, and another site can't post the form.

The only table this site touches is `waitlist` in [`../shared/pg/schema.sql`](../shared/pg/schema.sql).

## The variants

[`app.json`](./app.json) declares three variants:

| Variant | Label in results | Where the code lives |
| --- | --- | --- |
| `weft` | weft + warp | Generated: `{"template": "landing", "db": "postgres", "auth": false}` passed to create-weft's `scaffold()` |
| `solid` | SolidStart 2.1 + Tailwind 4 | [`solid/`](./solid) |
| `next` | Next 16.4 + Tailwind 4 | [`next/`](./next) |

### The Weft variant

The template source is
[`packages/create/templates/landing`](../../packages/create/templates/landing). It uses:

- **A form that needs no script.** `joinWaitlist` is a `mutation` with a `zod` email input; it inserts with
  `onConflictDoNothing()` and calls `redirect('/joined', 303)`. The page renders it with `Form` from `@weft-js/start`.
- **Images.** `Media` from `@weft-js/core/media` with `priority` and `sizes` for the hero, with the
  `media()` plugin from `@weft-js/plugin-media` registered in `weft.config.ts`.
- **Fonts.** The `text()` plugin from `@weft-js/text` loads Figtree (`assets/fonts/figtree.woff2`, weights 300 to 900)
  with an Arial fallback.
- **Warp.** `Accordion`, `Badge`, `Card`, `Grid`, `Split`, `Alert`, `Input` and `Button`, themed with the `warp()` plugin,
  plus `CheckIcon` from `@weft-js/warp-icons`.
- **Site metadata.** `site` in `weft.config.ts` sets the name, locale, title pattern (`%s · Emberline`) and description.

### The comparison variants

| | `solid/` | `next/` |
| --- | --- | --- |
| Framework | `@solidjs/start` 2.1.0, `solid-js` 1.9.18, Nitro | `next` 16.4.3, React 19.3.1 |
| Styling | Tailwind 4 through `@tailwindcss/vite` | Tailwind 4 through `@tailwindcss/postcss` |
| Hero image | AVIF and WebP at 640, 960, 1280 and 1600 px in `src/assets` | `src/assets/hero.webp` |
| Font | Figtree `woff2` in `src/assets/fonts` | Figtree `woff2` in `src/assets` |
| Data | Drizzle on `postgres`, `zod` | Drizzle on `postgres`, `zod` |
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
node bench.mjs landing
node bench.mjs landing --only weft --no-record
```

### Run the end-to-end test

```bash
cd examples
node e2e.mjs landing weft
node e2e.mjs landing solid
node e2e.mjs landing next
```

### Run a comparison variant on its own

```bash
cd examples/landing/solid              # or examples/landing/next
cp .env.example .env                   # then point DATABASE_URL at a database with the waitlist table
npm ci
npm run dev
```

### Make your own copy of the Weft version

```bash
pnpm create @weft-js my-landing --template landing --db postgres
```

## Manifest details

| Page | Keys |
| --- | --- |
| `/` | `interact` on `textbox:Email` and `button:Join`; `mutate` fills `Email` with a random `$value@bench.test`, clicks `Join` and waits for "You're on the list" |
| `/pricing`, `/privacy` | none: measured, freshness `unchecked` |

`"db": {}` takes the defaults. There is no `login` and no canary, since no page reads the database.
