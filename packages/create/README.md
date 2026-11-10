# @weft-js/create

> **Early release (0.1.x).** APIs can change between minor versions.

Starts a new [Weft](https://github.com/Ravonus/weft) app: pages, a server, a database, sign-in and Warp's components,
wired up and ready for `weft dev`.

```bash
npm create @weft-js my-app
```

```bash
pnpm create @weft-js my-app
```

```bash
bun create @weft-js my-app
```

```bash
deno run -A npm:@weft-js/create my-app
```

In a terminal it asks what the flags don't answer, with the default already picked. `--yes` takes every default: Warp,
SQLite through Drizzle, and Better Auth. Then:

```bash
cd my-app
npx weft dev
```

With a database, run `npx weft db generate` first. The new app has a home page, an about page, a todo list on server
functions, a sign-in page, and an `AGENTS.md` written for the installed Weft. `weft check` passes on it as made; its one
warning asks for `site.url` before you deploy.

## Flags

| Flag | Values | Default |
|---|---|---|
| `[dir]` | A folder that's missing or empty | asked; `my-weft-app` with `--yes` |
| `--template` | `todo`, `admin`, `catalog`, `landing`: a fuller starting app (below) | none |
| `--ui` | `warp`, `headless` (Warp's behaviour and tokens, your markup), `tailwind`, `none` | `warp` |
| `--db` | `sqlite`, `postgres`, `mysql`, `none` | `sqlite` |
| `--layer` | `drizzle`, `prisma`, `native` (SQL migrations, no ORM) | `drizzle` |
| `--auth`, `--no-auth` | Sign-in, when there's a database | on |
| `--auth-provider` | `better-auth`, `custom` (a stub for your own) | `better-auth` |
| `--runtime` | `node`, `bun`, `deno`: what `weft build` targets | the one running it |
| `--config` | `ts`, `json`, `yaml`: the format of the Weft config | `ts` |
| `--pm` | `npm`, `pnpm`, `bun`, `deno`, `yarn` | the one you ran it with |
| `--git`, `--no-git` | Start a git repository | on |
| `--install`, `--no-install` | Install the dependencies | on, or off with no terminal and no `--yes` |
| `--name` | The package name | the folder's name |
| `--yes`, `-y` | Take the defaults for anything not given | |

With npm, flags go after `--`: `npm create @weft-js my-app -- --ui tailwind --db none`.

## Templates

A template is a fuller app on Postgres. It sets `--db postgres` and the sign-in it needs, and keeps the other flags.

| Template | Pages |
|---|---|
| `todo` | Sign-in and sign-up, and a todo list |
| `admin` | An admin area with an orders table, order pages and nested layouts, behind sign-in |
| `catalog` | A shop: categories, product pages and a cart |
| `landing` | A landing page with pricing, a privacy page and a sign-up list |

## Docs

[Installation](https://github.com/Ravonus/weft/blob/main/site/content/learn/installation.md) walks through every file in
a new app, and how to run, check, build and deploy it.

## Links

- [Source](https://github.com/Ravonus/weft/tree/main/packages/create)
- [Weft on GitHub](https://github.com/Ravonus/weft): the framework, the docs and every package
- [Changelog](https://github.com/Ravonus/weft/blob/main/CHANGELOG.md)
- [Issues](https://github.com/Ravonus/weft/issues)
