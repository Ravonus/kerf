<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">create-kerf</h1>

<p align="center">
  <strong>Start a Kerf app: pages, a server, a database, sign-in and Veneer's components, wired up.</strong><br>
  The new app passes <code>kerf check</code> as made, and comes with an <code>AGENTS.md</code> for the Kerf it installed.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-kerf"><img src="https://img.shields.io/npm/v/create-kerf?color=145c3c&label=npm" alt="npm version"></a>
  <a href="https://github.com/Ravonus/kerf/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <a href="https://github.com/Ravonus/kerf/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ravonus/kerf/quality.yml?branch=main&label=checks" alt="checks"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D24-145c3c" alt="Node 24 or later">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="https://github.com/Ravonus/kerf/blob/main/site/content/learn/installation.md">Docs</a> ·
  <a href="https://github.com/Ravonus/kerf/tree/main/packages/create-kerf/templates">Templates</a> ·
  <a href="https://github.com/Ravonus/kerf/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/Ravonus/kerf">GitHub</a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** The scaffolds install and check clean, and flags and generated files can still change
> between minor versions.

`create-kerf` is what runs when you type `npm create kerf`. It writes a new
[Kerf](https://github.com/Ravonus/kerf) app into an empty folder: a home page, an about page, a todo list on server
functions, sign-in, and the config, types and editor setup around them. Then it installs the dependencies, starts a git
repository and writes an `AGENTS.md` from the Kerf it just installed.

In a terminal it asks what the flags don't answer, with the default already picked. Without one (an agent, CI), it never
prompts.

## Highlights

- **One question per choice, or none.** UI kit, database, data layer, sign-in, runtime, config format and package
  manager. A flag answers its question, and `--yes` takes every default.
- **A full stack by default.** `--yes` gives Veneer, SQLite through Drizzle, and Better Auth, with a guarded todo list
  that works before you write a line.
- **Four UI choices.** Veneer's components, Veneer's behavior and tokens with your own markup, Tailwind, or plain CSS.
- **Three databases, three data layers.** SQLite, Postgres or MySQL, through Drizzle, Prisma or plain SQL migrations.
- **Four starting apps.** `--template todo`, `admin`, `catalog` or `landing`: real apps with their own look and
  their own migrations.
- **Pinned versions.** Every dependency is pinned to the version the test matrix ran, and Kerf's own packages to the
  version of this scaffold.
- **Agent-ready.** `AGENTS.md`, `kerf check --json` and `kerf docs` are there from the first run.

## Contents

- [Quick start](#quick-start)
- [Flags](#flags)
- [The questions](#the-questions)
- [UI](#ui)
- [Database and data layer](#database-and-data-layer)
- [Sign-in](#sign-in)
- [Templates](#templates)
- [What gets generated](#what-gets-generated)
- [Package managers and runtimes](#package-managers-and-runtimes)
- [Recipes](#recipes)
- [Using it from code](#using-it-from-code)
- [Troubleshooting](#troubleshooting)
- [Related packages](#related-packages)

## Quick start

```bash
npm create kerf my-app
```

```bash
pnpm create kerf my-app
```

```bash
bun create kerf my-app
```

```bash
deno run -A npm:create-kerf my-app
```

Then:

```bash
cd my-app
npx kerf db generate   # with a database: the first migration
npx kerf dev
```

The last thing it prints is the exact commands for your package manager. Open the URL `kerf dev` prints, sign up, and
the todo list at `/todos` is yours.

You need Node 24 or later, or Bun or Deno in its place.

## Flags

| Flag | Values | Default | What it does |
|---|---|---|---|
| `[dir]` | a folder that's missing or empty | asked; `my-kerf-app` with `--yes` | Where the app goes |
| `--template` | `todo`, `admin`, `catalog`, `landing` | none | Starts from a fuller app ([below](#templates)) |
| `--ui` | `veneer`, `headless`, `tailwind`, `none` | `veneer` | The UI kit ([below](#ui)) |
| `--db` | `sqlite`, `postgres`, `mysql`, `none` | `sqlite` | The database |
| `--layer` | `drizzle`, `prisma`, `native` | `drizzle` | The data layer. `native` is SQL migrations with no ORM. Asked only with a database |
| `--auth`, `--no-auth` | | on, with a database | Sign-in |
| `--auth-provider` | `better-auth`, `custom` | `better-auth` | `custom` writes a stub for your own provider |
| `--runtime` | `node`, `bun`, `deno` | the one running it | What `kerf build` targets |
| `--config` | `ts`, `json`, `yaml` | `ts` | The format of the Kerf config |
| `--pm` | `npm`, `pnpm`, `bun`, `deno`, `yarn` | the one you ran it with | The package manager |
| `--git`, `--no-git` | | on | Start a git repository |
| `--install`, `--no-install` | | on; off with no terminal and no `--yes` | Install the dependencies, then write `AGENTS.md` |
| `--name` | a package name | the folder's name | The `name` in `package.json`, and the app's title |
| `--tarballs` | a folder with `tarballs.json` | none | Pins Kerf's packages to local tarballs, for testing a checkout |
| `--yes`, `-y` | | | Take the defaults for anything not given |
| `--help`, `-h` | | | Print the usage |

With npm, flags go after `--`:

```bash
npm create kerf my-app -- --ui tailwind --db none
```

> [!NOTE]
> With no terminal and no `[dir]`, it prints the usage and exits 1: it can't ask where to put the app. With no terminal
> and no `--yes`, it writes the app and runs nothing else, so git and the install stay off unless you ask for them.

## The questions

In a terminal, each question is a list: the arrow keys move, Enter picks. Enter all the way through is the same app as
`--yes`.

| # | Question | Options | Default | Asked when |
|---|---|---|---|---|
| 1 | UI | Veneer, Headless, Tailwind, None | Veneer | always |
| 2 | Database | SQLite, Postgres, MySQL, none | SQLite | always |
| 3 | Data layer | Drizzle, Prisma, Native (no ORM) | Drizzle | there's a database |
| 4 | Sign-in | Better Auth, Bring your own, None | Better Auth | there's a database |
| 5 | Runtime | Node, Bun, Deno | the one running it | always |
| 6 | Config file | TypeScript, JSON, YAML | TypeScript | always |
| 7 | Package manager | npm, pnpm, Bun, Deno, Yarn | the one you ran it with | always |
| 8 | Start a git repository | Yes, No | Yes | always |
| 9 | Install dependencies | Yes, No | Yes | always |

A flag skips its question, and a template skips the ones it settles.

## UI

| `--ui` | What you get | Dependencies |
|---|---|---|
| `veneer` | Veneer's components (`Card`, `Button`, `Badge`…) and the `veneer()` plugin in the config. The look is `veneer({ seed, dials, radius, fonts, tokens })`, and `kerf check` fails with D010 if a color pair can't pass contrast | `@kerf/veneer` |
| `headless` | Veneer's behavior and tokens, your markup. `src/app.css` styles plain elements over Veneer's `--veneer-*` tokens, and the layout imports `@kerf/veneer-core/styles/veneer.css` | [`@kerf/veneer-core`](https://www.npmjs.com/package/@kerf/veneer-core) |
| `tailwind` | Tailwind utilities. Writes `vite.config.ts` and `src/app.css`, the same files `kerf add tailwind` writes | Tailwind, as dev dependencies |
| `none` | A small `src/app.css` on system colors, and nothing else | none |

## Database and data layer

`--db` picks the engine, and `--layer` how the app talks to it.

| `--layer` | Schema | Migrations | `ctx.db` | Packages |
|---|---|---|---|---|
| `drizzle` | `src/db/schema.ts` | `drizzle/`, from `kerf db generate` | Drizzle, from `@kerf/start/db/<engine>` | `drizzle-orm`, `drizzle-zod`, `drizzle-kit` |
| `prisma` | `prisma/schema.prisma` | `kerf db generate` | a Prisma client with the engine's adapter | `@prisma/client`, `prisma`, `@kerf/db` |
| `native` | SQL | `migrations/0000_todos.sql`; `kerf db generate <name>` starts a new one | `@kerf/db/plugin-native/<engine>` | `@kerf/db` |

| `--db` | `DATABASE_URL` in `.env` | Driver |
|---|---|---|
| `sqlite` | `file:.data/app.db` | none |
| `postgres` | `postgres://localhost:5432/<name>` | `postgres` |
| `mysql` | `mysql://root@localhost:3306/<name>` | `mysql2` |

`src/env.server.ts` checks the environment with `@t3-oss/env-core` and `zod`. Migrations apply on the next request, so
after `kerf db generate` there's nothing else to run. With Prisma, `postinstall` runs `prisma generate`, and its
client goes to `src/generated/`, which `.gitignore` leaves out.

## Sign-in

Sign-in needs a database: `--auth` with `--db none` is refused.

| Choice | What it writes |
|---|---|
| Better Auth (`--auth`, the default) | `src/auth.server.ts` on Better Auth, with its tables in your schema; `src/server/session.ts`; a sign-in and sign-up page at `/login`; a guard on `/todos`; and a `BETTER_AUTH_SECRET` that's new for every scaffold |
| Bring your own (`--auth-provider custom`) | `src/auth.server.ts` with `defineAuth` from `@kerf/start/auth`: a `session` and a `handler` to fill in. The app compiles, with no one signed in, and the todo list is public |
| None (`--no-auth`) | No sign-in. The todo list is public |

Login with Better Auth is an opaque session in the database, in an HTTP-only cookie, never a JWT. `ctx.user` is the
signed-in user in every server function, and `auth: 'user'` on a `query` or `mutation` requires one.

## Templates

A template is a real app laid over the scaffold, in place of the default todo app. Each runs on Postgres, uses Veneer and
Drizzle, has a TypeScript config, and ships its own look, migrations and pages.

| Template | What it is | Pages | Sign-in | Look |
|---|---|---|---|---|
| `todo` | Sign-in and sign-up, and a todo list | `/`, `/login`, `/signup`, `/todos` | on | quiet, cozy, sharp corners, a serif display face |
| `admin` | An admin area with an orders table, order pages and nested layouts, behind sign-in | `/`, `/login`, `/signup`, `/admin`, `/admin/orders`, `/admin/orders/[id]`, `/admin/nested`, `/admin/per-row`, `/admin/slow` | on | balanced, compact, soft corners, system fonts |
| `catalog` | A shop: categories, product pages and a cart, with seed data in `seed.sql` | `/`, `/c/[slug]`, `/p/[slug]`, `/cart` | off | balanced, comfortable, round corners |
| `landing` | A landing page with pricing, a privacy page and a sign-up list | `/`, `/pricing`, `/privacy`, `/joined` | off | vivid, round corners, the Figtree font |

A template settles what it needs, and refuses a flag that conflicts rather than ignoring it:

| Setting | Every template |
|---|---|
| `--db` | `postgres` |
| `--ui` | `veneer` |
| `--layer` | `drizzle` |
| `--config` | `ts` (fonts and media are plugin options in code) |
| sign-in | as in the table above |

`todo` and `admin` also add [`@kerf/veneer-icons`](https://www.npmjs.com/package/@kerf/veneer-icons). `landing` adds `@kerf/veneer-icons`, [`@kerf/media`](https://www.npmjs.com/package/@kerf/media) and
[`@kerf/text`](https://www.npmjs.com/package/@kerf/text), with its hero image and font in `assets/`.

A template's `drizzle/` ships with it, written so it runs on a fresh database and on one that already has these tables.
Set `DATABASE_URL` in `.env` to an empty Postgres database and start the app: `drizzle/` applies on the first request,
and there's no `kerf db generate` to run. The theme is `src/theme.css` plus `veneer({ seed, dials, radius })` in the config.

```bash
npm create kerf shop -- --template catalog
```

## What gets generated

The default app (`--yes`):

| File | What it is |
|---|---|
| `package.json` | `dev`, `build`, `check`, `typecheck`, `start` and `db:generate` scripts, each a `kerf` command. `@kerf/cli` and TypeScript 7 as dev dependencies |
| `kerf.config.ts` | `site` (name, title, description), `plugins`, and `runtime` when it isn't Node |
| `tsconfig.json` | Strict, `jsxImportSource: '@kerf/core'`, the `#/*` alias for `src/*`, and the `@kerf/cli/ts-plugin` editor plugin |
| `.vscode/settings.json` | Points VS Code's TypeScript at that plugin |
| `.gitignore` | `node_modules/`, `.kerf/` (except the plugin lock), `.output/`, `dist/`, and with a database `.env` and `.data/` |
| `.kerf/plugins.lock.json` | The plugins you chose, with the permissions they declare |
| `AGENTS.md` | A short guide; after the install, `kerf agents-md` writes the full one over it |
| `.env`, `.env.example` | `DATABASE_URL`, and with Better Auth `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` |
| `src/env.server.ts` | The environment, checked |
| `src/context.server.ts` | What `ctx` holds in server functions |
| `src/routes/_layout.tsx` | The shell: links, and sign in or sign out |
| `src/routes/index.tsx` | The home page: a counter in a card |
| `src/routes/about.tsx` | The about page |
| `src/routes/todos/index.tsx`, `_layout.tsx` | The todo list, and the guard that sends a signed-out visitor to sign in |
| `src/routes/login.tsx` | Sign in and sign up |
| `src/server/todos.ts` | The todo list's `query` and `mutation` functions |
| `src/server/session.ts` | `me`, `signUp`, `signIn` and `signOut` |
| `src/auth.server.ts` | Better Auth |
| `drizzle.config.ts`, `src/db/schema.ts`, `src/db/index.server.ts` | The database |

Other choices change that list:

| Choice | Adds | Drops |
|---|---|---|
| `--ui headless`, `none` | `src/app.css` | |
| `--ui tailwind` | `src/app.css`, `vite.config.ts` | |
| `--db none` | | the database, server and sign-in files, and the layout's Todos link |
| `--layer prisma` | `prisma/schema.prisma`, `prisma.config.ts`, a `postinstall` script | `drizzle.config.ts`, `src/db/schema.ts` |
| `--layer native` | `migrations/0000_todos.sql` | `drizzle.config.ts`, `src/db/schema.ts` |
| `--no-auth` | | the sign-in files, the guard and the auth secret |
| `--config json`, `yaml` | `kerf.config.json` or `.yaml`, with a `$schema` for editor completion | `kerf.config.ts` |
| `--pm pnpm` | `pnpm-workspace.yaml`, which settles the build scripts pnpm would stop at | |
| `--template <t>` | the template's files, and `src/db/auth.ts` when it has sign-in | the about page and the default todo app |

Everything else in `.kerf/` is generated by `kerf` itself on the first `kerf dev` or `kerf check`, so a scaffold never
goes stale against the CLI.

`kerf check` passes on the new app as made. Its one finding is the warning H001, which asks for `site.url` in the
config before you deploy.

### Pinned versions

| Package | Version |
|---|---|
| `@kerf/*` | the version of this package |
| `typescript` | 7.0.2 |
| `drizzle-orm`, `drizzle-kit`, `drizzle-zod` | 0.45.4, 0.31.11, 0.8.3 |
| `prisma`, `@prisma/client`, `@prisma/adapter-*` | 7.10.1 |
| `better-auth` | 1.7.14 |
| `postgres`, `mysql2` | 4.0.0, 3.24.6 |
| `kysely` (native layer with sign-in) | 0.29.7 |
| `@t3-oss/env-core`, `zod` | 0.13.11, 4.6.7 |
| `@types/node` | 26.6.5 |

## Package managers and runtimes

`--pm` picks the package manager for the install and for the commands it prints at the end. Without it, a run under Node
uses the one that started it (from `npm_config_user_agent`), and a run under Bun or Deno uses that one.

| `--pm` | How to start it | The `kerf` command it prints |
|---|---|---|
| `npm` | `npm create kerf my-app` | `npx kerf` |
| `pnpm` | `pnpm create kerf my-app` | `pnpm exec kerf` |
| `bun` | `bun create kerf my-app` | `bunx --bun kerf` |
| `deno` | `deno run -A npm:create-kerf my-app` | `deno run -A npm:@kerf/cli` |
| `yarn` | `yarn create kerf my-app` | `yarn kerf` |

`--runtime` is separate: it's what `kerf build` targets and `kerf start` runs. Without it, the scaffold picks the one
running it, since a machine may have only that one. Anything but Node is written into the config as `runtime`.

## Recipes

A front end with no server code:

```bash
npm create kerf site -- --db none --yes
```

Postgres with Prisma and your own auth:

```bash
pnpm create kerf app --db postgres --layer prisma \
  --auth-provider custom --yes
```

Tailwind on MySQL with plain SQL, a YAML config, and no install:

```bash
bun create kerf app --ui tailwind --db mysql \
  --layer native --config yaml --no-install --yes
```

For an agent or CI: no prompts, and everything run.

```bash
npm create kerf my-app -- --yes
```

## Using it from code

The package exports what the command is built from. `kerf add db` and `kerf add auth` use `./stack`.

| Import | Exports |
|---|---|
| `create-kerf` | `scaffold(dir, options)`, `template(options)`, `withTemplate(options)`, and the choice lists `UI`, `DB`, `LAYERS`, `RUNTIMES`, `CONFIGS`, `TEMPLATES` |
| `create-kerf/stack` | `stackDeps`, `stackFiles`, `authFiles`, `VERSIONS`, `VERSION` and the page builders: the database and auth part of a scaffold |

```js
import { scaffold, template } from 'create-kerf'

// Every file as { path: text }, written nowhere
const files = template({
  name: 'shop',
  ui: 'veneer',
  db: 'sqlite',
  auth: true,
})

// The same, written into an empty folder
const { files: written } = scaffold('./shop', {
  ui: 'veneer',
  db: 'sqlite',
  auth: true,
})
```

> [!NOTE]
> `template()` and `scaffold()` don't apply the wizard's defaults: without `db` there's no database, and without
> `auth` no sign-in. They don't install or start git either.

## Troubleshooting

| Message | Why | Fix |
|---|---|---|
| `<dir> is not empty` | It only writes into a missing or empty folder | Pick another name, or empty it |
| `--auth keeps users in a database` | Sign-in with `--db none` | Add `--db sqlite`, `postgres` or `mysql`, or `--no-auth` |
| `the <name> template needs --db postgres` (or `--ui veneer`, `--layer drizzle`, `--config ts`, sign-in on or off) | A flag conflicts with the template | Drop the flag, or use the value it names |
| `--ui must be one of …` and the like | An unknown value | Use one from [Flags](#flags) |
| `The install didn't finish; run … yourself.` | The package manager failed. The app is already written | Run the command it prints. The run exits 1 |
| `git init didn't finish` | git isn't installed, or failed | The app is fine; run `git init` when you want it |

## Related packages

| Package | What it is |
|---|---|
| [`@kerf/cli`](https://www.npmjs.com/package/@kerf/cli) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/cli)</sup> | The `kerf` command every new app uses |
| [`@kerf/core`](https://www.npmjs.com/package/@kerf/core) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/core)</sup> | The runtime, the compiler binding, the Vite plugin, SSR and test utilities |
| [`@kerf/start`](https://www.npmjs.com/package/@kerf/start) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/start)</sup> | File routes, server functions, SSR, the database, auth and live data |
| [`@kerf/db`](https://www.npmjs.com/package/@kerf/db) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/db)</sup> | The Prisma and native SQL data layers |
| [`@kerf/veneer`](https://www.npmjs.com/package/@kerf/veneer) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/veneer)</sup> | Veneer's components, and the `veneer()` theming plugin |

[Installation](https://github.com/Ravonus/kerf/blob/main/site/content/learn/installation.md) walks through every file in
a new app, and how to run, check, build and deploy it.

## Contributing

[CONTRIBUTING.md](https://github.com/Ravonus/kerf/blob/main/CONTRIBUTING.md) has the setup. To work on this package:

```bash
pnpm --filter create-kerf test
```

A template is a folder in
[`packages/create-kerf/templates`](https://github.com/Ravonus/kerf/tree/main/packages/create-kerf/templates) with a
`template.json` (what it `requires`, its `pages`, its `veneer()` options and `dependencies`) and a `files/` folder that's
copied as it is.

## License

[MIT](https://github.com/Ravonus/kerf/blob/main/LICENSE).
