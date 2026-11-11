<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">Todo</h1>

<p align="center">
  <strong>A signed-in todo list over Postgres, in Kerf, SolidStart and Next.</strong><br>
  The race flagship: per-user rows, optimistic writes where the stack has them, and six race probes that check the list on screen against the database.
</p>

<p align="center">
  <a href="#run-it">Run it</a> ·
  <a href="#the-kerf-variant">Kerf variant</a> ·
  <a href="#the-comparison-variants">Comparison variants</a> ·
  <a href="#race-probes">Race probes</a> ·
  <a href="../README.md">All examples</a> ·
  <a href="https://github.com/Ravonus/kerf">GitHub</a>
</p>

> [!NOTE]
> This is a private benchmark site, not a published package. Nothing here is on npm. The Kerf version is not stored in
> this folder: it is generated from the `todo` template of `create-kerf` on every bench run.

A todo list looks trivial, which is why it is the flagship for races. Optimistic writes, double submits, toggles whose
replies come back out of order and two open tabs are where a list can quietly end up showing something the database
doesn't hold. `todo` is the one site in [`examples/`](../README.md) whose manifest has a `race` block, and a race failure
is reported above any speed number.

## What the app shows

| Page | What's on it |
| --- | --- |
| `/login` | Email and password sign-in. Signed in, `/login` goes to `/todos`. |
| `/todos` | The signed-in user's list (named `Todos`), newest first, with a `New todo` box and `Add` button, a checkbox per row, delete, "N left", and `All`, `Active` and `Done` filter links that set `?filter=`. |

What [`e2e.test.mjs`](./e2e.test.mjs) pins down in every stack: signed out redirects to `/login`, a wrong password does
not sign in, the list shows the 200 seeded rows, another user's rows aren't visible and can't be written, add, toggle
and delete reach the database and survive a reload, a new row lands on top, "N left" moves, and a filter link reads the
list again.

The seed in [`../shared/pg/seed.sql`](../shared/pg/seed.sql) gives the bench user 200 todos (`Seeded todo 1` to
`Seeded todo 200`, every third one done) and another user 3.

## The variants

[`app.json`](./app.json) declares three variants:

| Variant | Label in results | Where the code lives |
| --- | --- | --- |
| `kerf` | kerf + veneer | Generated: `{"template": "todo", "db": "postgres", "auth": true}` passed to create-kerf's `scaffold()` |
| `solid` | SolidStart 2.1 + Kobalte + Tailwind 4 | [`solid/`](./solid) |
| `next` | Next 16.4 + Radix + Tailwind 4 | [`next/`](./next) |

### The Kerf variant

The template source is [`packages/create-kerf/templates/todo`](../../packages/create-kerf/templates/todo) (Daybook). It uses:

- **Optimistic mutations.** `addTodo`, `toggleTodo` and `deleteTodo` are `mutation`s with `invalidates: ['todos']` and an
  `optimistic` function that edits every cached view of `listTodos` through the `OptimisticCache` API
  (`cache.get`, `cache.update`). The server's answer then confirms or replaces the guess.
- **Views in the URL.** `src/lib/views.ts` maps `?filter=active|done` to a view, and `listTodos` is a `query` keyed by it.
- **Auth.** Sign-in, sign-up and sign-out through Better Auth, with `redirect` guarding `/todos`.
- **Reactivity.** `state` and `derived` from `@kerf/core`, and `Boundary` around the list.
- **Veneer.** `Shell`, `AuthScreen`, `Checkbox`, `Progress`, `Skeleton`, `Alert`, `Toaster` and `toast`, plus icons from
  `@kerf/veneer-icons`.

### The comparison variants

| | `solid/` | `next/` |
| --- | --- | --- |
| Framework | `@solidjs/start` 2.1.0, `solid-js` 1.9.18, Nitro | `next` 16.4.3, React 19.3.1 |
| Components | `@kobalte/core` | `@radix-ui/react-dropdown-menu` |
| Writes | `action()`s wrapped in an `inOrder` queue, with `useSubmissions` for pending state | `useOptimistic` in `src/components/todo-app.tsx`; a failed write rolls the optimistic change back |
| Data and auth | Drizzle on `postgres`, Better Auth, `zod` | Drizzle on `postgres`, Better Auth, `zod` |
| Scripts | `dev`, `build`, `start`, `check` | `dev`, `build`, `start`, `check` |

## Race probes

The `race` block in [`app.json`](./app.json) tells [`../lib/race.mjs`](../lib/race.mjs) where the list is:

```json
{
  "path": "/todos",
  "list": "Todos",
  "input": "New todo",
  "submit": "Add",
  "toggle": "Seeded todo 1",
  "state": "select title, done from todos where user_id = 'bench-user'",
  "away": { "link": "Active", "keep": { "done": false } }
}
```

Each probe resets the database, drives a real browser, holds or shuffles the server's replies with Playwright route
interception, and then compares the list on screen with the `state` query. The probes, from
[`../lib/race/probes.mjs`](../lib/race/probes.mjs): `doubleSubmit`, `toggles`, `rollback`, `navigateDuring`,
`invalidateDuring` and `twoTabs`. Each is pass or fail, and the shuffle seed is printed on a failure so it can be replayed.

## Run it

> [!IMPORTANT]
> The bench and e2e scripts need Node 26, a local Postgres with `psql` on the path, and the benchmark tools installed once
> with `pnpm install` in `examples/`.

### Benchmark all three

```bash
pnpm run setup                         # repo root, once
cd examples
pnpm install                           # benchmark tools only
node bench.mjs todo
node bench.mjs todo --samples=5        # before stating a claim
```

### Run the end-to-end test

```bash
cd examples
node e2e.mjs todo kerf                 # build if needed, database, proxy, server, tests, stop
node e2e.mjs todo kerf --no-build      # the last build as it stands
node e2e.mjs todo --dir ./my-build     # a local build, by its start script
```

### Click through the Kerf build

```bash
cd examples
node bench.mjs todo
node show.mjs                          # the last Kerf builds, from port 5501
```

Sign in with the throwaway account in [`../shared/pg/bench-user.json`](../shared/pg/bench-user.json).

### Run a comparison variant on its own

```bash
cd examples/todo/solid                 # or examples/todo/next
cp .env.example .env                   # then set DATABASE_URL and BETTER_AUTH_SECRET
npm ci
npm run dev
```

### Make your own copy of the Kerf version

```bash
pnpm create kerf my-todos --template todo --db postgres --auth
```

## Manifest details

| Page | Keys |
| --- | --- |
| `/login` | `signedOut: true`: measured without the bench user's cookie |
| `/todos` | `freshness: live` with a canary that renames the oldest todo; `nav` clicks `link:Active` and expects `filter=active`; `interact` on four seeded checkboxes; `mutate` types a random value into `New todo`, clicks `Add` and waits for it; `rows` resizes the list to 50 or 500 rows for the byte metrics |

`"db": {}` and `"login": {}` take the defaults. [`../lib/fixture`](../lib/fixture) is the same todo contract with no
framework at all, used to test the harness itself.
