# Runtimes and deploying

:::learn
- How `weft build` targets Node, Bun or Deno, and what lands in `.output/`
- How to run the build with `weft start`, or on a host of your own
- Which environment variables a deployed app needs, and how they're checked
- What a host has to keep between deploys
- How realtime and live data change between a long-running server and a serverless host
:::

Everything so far ran under `weft dev`. Shipping it is one command, `weft build`, which writes a self-contained server
into `.output/`. That server runs on Node, Bun or Deno, the same app on all three, and you choose which when you build.

If you've deployed a Next.js or Remix app, the shape is familiar: a build step, a server entry, environment variables
for secrets. The differences are in the details this page covers: what Weft checks before it lets a build through, and
what changes when your host ends a process with each request.

## Building

```bash
weft build
```

`weft build` compiles the client and the server, prerenders what you asked it to, and writes:

- `.output/`: the server and its public files. `.output/server/index.mjs` is the entry point, and the built assets ship
  with Brotli and gzip copies next to each file, chosen by the request's `Accept-Encoding`.
- `.weft/contract.json`: every server function, its input and output schemas, its tags and auth. It's what the build
  checked, and what tools read.

The build holds no secrets. It sets `WEFT_BUILD=1` while it runs, so the app's environment check stands down and server
modules load without a database. Anything that needs real credentials happens when the server starts.

### Choosing a runtime

The target is `runtime` in `weft.config.ts`, `'node'`, `'bun'` or `'deno'`. `--runtime` overrides it for one build, and
with neither, the build targets whichever runtime is running `weft`:

```ts
// weft.config.ts
import { defineConfig } from '@weft-js/core/config'
import { warp } from '@weft-js/warp/plugin'

export default defineConfig({
  runtime: 'bun',
  site: { name: 'Acme', url: 'https://acme.dev' },
  plugins: [warp()],
})
```

```bash
weft build --runtime deno
```

The CLI itself runs on any of the three, with none of the others installed: `bun --bun weft build`, or
`deno run -A npm:@weft-js/cli build`. Server code that uses `node:` modules and web APIs (`fetch`, `Request`, `crypto`)
runs everywhere. Runtime-specific APIs (`Bun.*`, `Deno.*`, a driver like `better-sqlite3`) tie the app to that runtime
and break the other targets, so keep them out of shared server code.

:::deepdive Presets, and what's underneath
`weft build` runs Vite for the client and Nitro for the server. Each runtime is a Nitro preset: `node`, `bun` and
`deno_server`. `--preset <name>` passes any other Nitro preset through, such as `vercel`, `netlify` or
`cloudflare_module`, and Weft's own checks know what those hosts can and can't do for realtime and live data, which
the rest of this page covers. Node, Bun and Deno servers are the targets Weft is tested on end to end; for the others,
`weft doctor --preset <name>` is the place to start.
:::

## Running the build

```bash
weft start
```

`weft start` runs `.output/server/index.mjs` on the runtime it was built for, with the right flags for that runtime. It
loads `.env` under whatever is already set, which suits a local check of a production build. If the app has Rust
services ([Rust, in depth](/learn/rust)), it starts them first and gives the server their addresses.

On a host, you can run the entry directly: `node .output/server/index.mjs`, `bun run .output/server/index.mjs`, or
`deno run -A .output/server/index.mjs`. It listens on `PORT` (3000 by default) and `HOST`. Production takes its
environment from the host, never from `.env`. `.output/` is self-contained, so a container image needs that folder and
the runtime, not your source or `node_modules`.

## Environment variables

A scaffolded app checks its environment in `src/env.server.ts` when the server starts, so a missing secret stops the
server at boot with a clear message instead of failing on the first request that needs it. Add what your app reads:

```ts
// src/env.server.ts
import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1).default('file:.data/app.db'),
    BETTER_AUTH_SECRET: z.string().min(32),
    REDIS_URL: z.url().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.WEFT_BUILD,
})
```

Import `env` from server code: server modules (`src/server/**`), `*.server.ts` files and a route's `load`. Those stay on
the server, and the client only ever gets stubs of your server functions. The database, auth and buses reaching the
client bundle is an error at build time (**Q012**).

The variables Weft itself reads:

| Variable | What it's for |
|---|---|
| `PORT`, `HOST` | Where the built server listens. |
| `DATABASE_URL` | The database, read by the scaffold's `src/db/index.server.ts`. |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Sign-in. `BETTER_AUTH_URL` must match where the app is served, or sign-in answers `INVALID_ORIGIN`. |
| `WEFT_BUILD_ID` | At build time: pins the build's version. Set it when instances built separately serve one deploy, so they agree on it. `SOURCE_DATE_EPOCH` also works. |
| `WEFT_SITE_URL` | The site's address, when `site.url` isn't set ([Metadata and share images](/learn/metadata-and-share-images)). |
| `WEFT_MEDIA_DIR` | Where uploads are stored ([Uploads and media](/learn/uploads-and-media)). |
| `REDIS_URL`, `NATS_URL` | A realtime bus, with `@weft-js/realtime-redis` or `-nats`. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Payments ([Payments](/learn/payments)). |

### The site's address

Set `site.url` in `weft.config.ts` before you ship. Canonical URLs, `og:url` and share-card URLs must be absolute, and a
prerendered page has no request to take an origin from. Without it, Weft falls back to `WEFT_SITE_URL`, then to what
common hosts set (`VERCEL_PROJECT_PRODUCTION_URL`, Netlify's `URL`, `CF_PAGES_URL`, `RENDER_EXTERNAL_URL`,
`RAILWAY_PUBLIC_DOMAIN`, `FLY_APP_NAME` and a few more), then to the request's `Host` header, with a warning (**H001**).

## What a host must keep

Most of `.output/` can be thrown away and rebuilt. A few things can't:

- **The database.** Migrations are embedded in the build and apply before the first statement that needs them, as in
  dev. Run `weft db generate` before you build, never edit `drizzle/` by hand, and a deploy brings its schema with it.
- **Uploads.** `.weft/media` (or `WEFT_MEDIA_DIR`) holds every original and every encoded size. On a container or a VPS,
  put it on a volume that outlives the deploy.
- **Old stylesheets.** A page cached before a deploy links the CSS it was built with. `weft build` keeps old combined
  sheets for 30 days in `.weft/sheets` and copies them into the new build's assets, so keep that folder between builds
  (in CI, cache it). Without it, a cached page still paints from its own inline `<style>`, without hover and focus
  styles until it's cached again.

:::pitfall A database file on a disposable disk
The scaffold's SQLite database is `file:.data/app.db`, a file next to the app. On a host whose disk is replaced at each
deploy, that's a new, empty database every time. Put `.data` on a persistent volume, or point `DATABASE_URL` at a
database server, before the first real user signs up.
:::

## More than one instance

One server process needs nothing extra. Run two behind a load balancer, or deploy to a platform that scales instances
for you, and three things change:

- **Realtime needs a shared bus.** A message published on one instance must reach sockets on all of them. Add
  `@weft-js/realtime-redis` or `-nats`, or set `postgresBus` in `src/realtime.server.ts` ([Realtime and live
  data](/learn/live-data#more-than-one-server)). On a preset Weft knows runs many instances, `weft build` refuses the
  memory bus (**R002**).
- **Shared caches.** A query with `cache: { life }` caches in each process's memory by default, so each instance warms
  its own.
- **Sockets from other origins.** If a second domain connects to the realtime socket (an admin app, say), list it,
  scheme and port included, in `realtime({ origins })`.

## Live data on serverless hosts

On Vercel, Netlify, AWS Lambda, Azure Functions, Firebase, Cloudflare and Deno Deploy, a process ends with its request,
so nothing can hold a connection open to the database or keep a timer running. Mutations still work and still update
`.live()` queries. What you lose is writes from *outside* the app (`dbChanges`): there's no process to listen. `weft
check` and `weft build` warn about it (**R014**), and `.live()` shows `degraded`.

Ask before you deploy:

```bash
weft doctor --preset vercel
```

It prints the live mode this target gets, what that means, and the options. There are two ways to get the feed back:

1. **Deploy to a server preset** (`node`, `bun`, `deno_server`, or a container on Fly, Railway or Render). The server
   holds the connection itself.
2. **Run one always-on listener** somewhere else (a small VPS, Fly, Railway), publishing into a bus both can reach.
   `weft db listen` runs it from a checkout of the app, with the same environment. The app on the serverless host says
   the listener is external:

<!-- example: skip needs the postgres driver, which a SQLite app doesn't install -->
```ts
// src/realtime.server.ts
import { dbChanges, realtime } from '@weft-js/start'
import { postgresBus } from '@weft-js/start/bus/postgres'
import { db } from '#/db/index.server'
import { todos } from '#/db/schema'

export default realtime({
  bus: postgresBus({ url: process.env.DATABASE_URL ?? '' }),
  changes: dbChanges(db, [todos], { listener: 'external' }),
})
```

`listener: 'external'` tells the app not to listen itself but to read pokes from the bus. `weft db listen` loads the
same `src/realtime.server.ts` from its checkout, listens to the database, and publishes to that bus; it refuses the
memory bus (**R017**), which would stop at its own process. A listener that stops is noticed: its heartbeat ends, and
within a minute `.live()` shows `reconnecting`. A query that must not run without a feed says
`live: { required: true }`, and then `weft build` fails on a target that can't provide one (**R013**), instead of
shipping a page that only looks live.

Streams have a related limit. Serverless platforms cap how long a response may live, so set
`realtime({ maxDuration })` to that cap in seconds: streams end 10 seconds before it and the client resumes, and the
reader never sees the cut.

### Cloudflare and Durable Objects

A Cloudflare Worker can't hold a socket past the request that opened it, so the realtime bus lives in a Durable
Object. `@weft-js/realtime-durable-object` provides `durableObjectBus({ namespace })` and the `WeftBusObject` class:
export the class from the worker with a `new_sqlite_classes` migration, bind it as `WEFT_BUS`, and set the bus in
`src/realtime.server.ts`. It needs the `cloudflare_durable` preset; on any other, `weft build` refuses it (**R002**).

## Recap

- `weft build` writes a self-contained server to `.output/` and the function contract to `.weft/contract.json`. It
  holds no secrets and needs no database.
- The target is `runtime` (`node`, `bun`, `deno`) or `--runtime`; `--preset` passes a Nitro preset through. Keep
  runtime-specific APIs out of shared server code.
- `weft start` runs the build locally; on a host, run `.output/server/index.mjs`, listening on `PORT`.
- Secrets come from the host's environment and are checked at startup in `src/env.server.ts`. Set `site.url`.
- Keep the database, `.weft/media` and `.weft/sheets` between deploys.
- Several instances need a shared bus. Serverless hosts can't hear outside writes: deploy to a server preset, or run
  `weft db listen` on an always-on host with `listener: 'external'`. `weft doctor --preset` tells you what you'll get.

## Try it

:::challenge A container that forgets
You deploy to a container platform. Each deploy, every user is signed out and their uploads are gone, although the code
is fine. What's being thrown away, and what do you change?
:::solution
The container's disk is new on each deploy, and two things lived on it: the SQLite file at `.data/app.db` (with the
sessions and users) and `.weft/media` (the uploads). Mount a persistent volume and point the app at it:
`DATABASE_URL=file:/data/app.db` and `WEFT_MEDIA_DIR=/data/media`, or move the database to a database server. Keep
`.weft/sheets` in the build cache too, so pages cached before a deploy keep their hover styles.
:::

:::challenge Live on Vercel
An app shows a live order board with `orders.live()`, and orders also arrive from a warehouse system that writes to
Postgres directly. On Vercel, new warehouse orders only appear after a reload. Why, and what are your two options?
:::solution
The warehouse writes outside the app, so only `dbChanges` can see them, and on Vercel each process ends with its request:
nothing stays up to listen to Postgres. Mutations made through the app still update the board, which is why it looks
half-working. `weft doctor --preset vercel` says exactly this, and `weft build` warns with **R014**.

Either deploy the app to a server preset, where the server listens itself, or keep Vercel and run `weft db listen` on
an always-on host, with a shared bus (`postgresBus` on the same database works) and
`dbChanges(db, [orders], { listener: 'external' })` in the app. Mark the board's query `live: { required: true }` and
the build will refuse a setup that can't deliver it.
:::
