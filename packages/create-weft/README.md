# @weft-js/create

> **Early release (0.1.0).** APIs will change between minor versions. weft isn't on npm yet.

Starts a new weft app.

```bash
npm create @weft-js my-app
```

In a terminal it asks what the flags don't answer. `--yes` takes the defaults.

| Flag | Values | Default |
|---|---|---|
| `--ui` | `warp`, `headless` (warp-core only), `tailwind`, `none` | `warp` |
| `--db` | `sqlite`, `postgres`, `mysql`, `none` | `sqlite` |
| `--layer` | `drizzle`, `prisma`, `native` | `drizzle` |
| `--auth`, `--no-auth` | Sign-in, when there's a database | on |
| `--auth-provider` | `better-auth`, `custom` | `better-auth` |
| `--runtime` | `node`, `bun`, `deno` | the one running it |
| `--config` | `ts`, `json`, `yaml`: the format of the weft config | `ts` |
| `--pm` | `npm`, `pnpm`, `bun`, `deno`, `yarn` | the one you ran it with |
| `--git`, `--no-git`, `--install`, `--no-install` | Start a git repository; install dependencies | on, or off with no terminal and no `--yes` |
| `--name` | The package name | the folder's name |

With npm, flags go after `--`: `npm create @weft-js my-app -- --ui tailwind --db none`.

Until weft is on npm, make an app from a checkout instead: [Installation](../../site/content/learn/installation.md).
