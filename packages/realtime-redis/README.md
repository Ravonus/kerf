<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">@weft-js/realtime-redis</h1>

<p align="center">
  <strong>Redis pub/sub as Weft's realtime bus, so live data reaches every instance of your app.</strong><br>
  One line in <code>weft.config.ts</code>, one <code>REDIS_URL</code>, and no change to your pages or server functions.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@weft-js/realtime-redis"><img src="https://img.shields.io/npm/v/@weft-js/realtime-redis?color=145c3c&label=npm" alt="npm version"></a>
  <a href="https://github.com/Ravonus/weft/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <a href="https://github.com/Ravonus/weft/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ravonus/weft/quality.yml?branch=main&label=checks" alt="checks"></a>
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

On one server, Weft's realtime needs nothing: messages, `.live()` pokes, channels and shared state go through a memory
bus inside the process. Run two instances and each one only reaches its own sockets, so a mutation on one never
refreshes a page connected to the other. This package fills the `realtime.bus` slot with Redis pub/sub, so every
instance hears every publish. It's for apps that already run Redis, or deploy to a host that runs several instances.

## Highlights

- **A plugin, not code.** `redis()` in `plugins` replaces the memory bus. Nothing in `src/` changes.
- **Reads `REDIS_URL`.** The URL comes from the environment unless you pass `url`, so no secret lands in the config.
- **Several apps, one server.** Every channel name is prefixed (`weft:` by default), so apps can share a Redis.
- **Lazy.** It opens no connection until the first publish or subscribe, and `weft build` never connects.
- **Reconnects on its own.** ioredis retries forever and resubscribes. Each reconnect after the first is reported to
  the hub as a gap, so clients know that messages may be missing.
- **Tested against a real server.** The test suite runs the shared `realtime.bus@1` conformance checks against a
  `redis-server` it starts, then kills and restarts, to prove the gap and the resume.

## Install

```bash
# npm
npm install @weft-js/realtime-redis

# pnpm
pnpm add @weft-js/realtime-redis

# bun
bun add @weft-js/realtime-redis
```

Or let the `weft` CLI install it and add it to `weft.config.ts` in one step:

```bash
npx weft add redis
```

`weft add` installs the package and adds the plugin to `weft.config.ts`.

## Quick start

1. Run a Redis server. For local work:

   ```bash
   docker run --rm -p 6379:6379 redis
   ```

2. Add the plugin. `weft add redis` writes this for you:

   ```ts
   // weft.config.ts
   import { defineConfig } from '@weft-js/core/config'
   import realtimeRedis from '@weft-js/realtime-redis/plugin'

   export default defineConfig({
     plugins: [realtimeRedis()],
   })
   ```

   `import { redis } from '@weft-js/realtime-redis/plugin'` is the same function under its own name.

3. Set the URL in the app's environment:

   ```bash
   # .env
   REDIS_URL=redis://localhost:6379
   ```

4. Start two instances on different ports and open a page that reads a query with `.live()` on each. A mutation through
   one refreshes the page on the other.

## How it plugs into Weft

Weft's realtime hub keeps everything that has state (tags, topics, replay rings, cursors, presence) and hands the bus
three things to do: publish a string to a channel, subscribe to a channel, and close. That is the `Bus` interface in
[`@weft-js/start/bus`](https://github.com/Ravonus/weft/blob/main/packages/start/src/bus.ts). A bus is at-most-once and
ordered per publisher, like this one.

The plugin provides the `realtime.bus` slot (version 1, one provider, server side). At build time Weft writes the slot
binding to `.weft/slots/realtime.bus.ts`, and the server entry wraps it in a bus that loads this package on the first
publish or subscribe. The order of precedence is:

| Where the bus comes from | Wins over |
| --- | --- |
| `bus` in `src/realtime.server.ts` | everything: an explicit choice beats a plugin |
| a `realtime.bus` plugin in `weft.config.ts` (this one, or `@weft-js/realtime-nats`) | the memory bus |
| nothing | the memory bus, one process only |

So if `src/realtime.server.ts` already sets `bus: postgresBus(...)`, adding this plugin changes nothing until you take
that line out.

### Using it without the plugin

`redisBus()` is a plain function, so you can set it in `src/realtime.server.ts` instead, next to the other realtime
options:

```ts
// src/realtime.server.ts
import { realtime } from '@weft-js/start'
import { redisBus } from '@weft-js/realtime-redis'

export default realtime({
  bus: redisBus({
    url: process.env.REDIS_URL ?? '',
    prefix: 'shop:',
  }),
  origins: ['https://admin.example.com'],
})
```

Use this form when you want the bus next to `origins`, `limits` or `changes`, or when you build the URL from other
settings. The package still has to be installed.

## Options

`redis(options)` in `weft.config.ts` and `redisBus(options)` take the same options. The plugin passes them through to
`bus()`, which fills `url` from `REDIS_URL` when it's missing.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `url` | `string` | `process.env.REDIS_URL` (plugin and `bus()` only) | Server to connect to. Must start with `redis://` or `rediss://` (TLS). Required for `redisBus()`. |
| `prefix` | `string` | `'weft:'` | Put in front of every Redis channel name. Give each app its own when apps share a server. |

The plugin's options end up in generated code, so keep them to plain values. Leave the password in `REDIS_URL` rather
than in `url`.

### Environment

| Variable | Read by | Needed |
| --- | --- | --- |
| `REDIS_URL` | the plugin and `bus()` | At run time, unless `url` is given. `redis://user:pass@host:6379/0` or `rediss://…` for TLS. |
| `WEFT_BUILD` | `redisBus()` | Set by `weft build`. While it's set a missing URL is not an error, since a build loads the module but never connects. |

### What the plugin declares

`weft plugins` and the trust check show what a plugin may reach. This one declares:

| Permission | Value |
| --- | --- |
| `net` | `env:REDIS_URL`, the host in that variable |
| `env` | `REDIS_URL`, `WEFT_BUILD` |

## How it behaves

- **Two connections.** A Redis connection in subscribe mode can't publish, so the bus opens one for publishing and one
  for subscribing, each on first use.
- **One Redis subscription per channel.** Several listeners on the same channel in one process share a single
  `SUBSCRIBE`. The bus unsubscribes from Redis when the last one stops.
- **Errors don't crash the process.** Connection errors are swallowed and ioredis keeps retrying
  (`maxRetriesPerRequest: null`), because an unhandled `error` event would end Node.
- **A reconnect is a gap.** Redis pub/sub keeps nothing for a subscriber that was away. Every `ready` after the first
  calls the hub's `gap`, and the hub treats everything before it as outside the resume window. Clients refetch rather
  than trust a stream with a hole in it.
- **`close()`** disconnects both connections. The next publish or subscribe connects again.

## API reference

| Export | From | What it is |
| --- | --- | --- |
| `redisBus(options)` | `@weft-js/realtime-redis` | A `Bus` over Redis pub/sub, connecting on first use. Throws Q013 without a `redis://` or `rediss://` URL, except during a build. |
| `bus(options?)` | `@weft-js/realtime-redis` | The `realtime.bus` provider the plugin loads: `redisBus` with `url` defaulting to `REDIS_URL`. |
| `RedisBusOptions` | `@weft-js/realtime-redis` | Type: `{ url: string; prefix?: string }`. |
| `redisStore(options?)` | `@weft-js/realtime-redis` | The shared query cache on Redis: default-export it from `src/cache.server.ts`. Values are JSON with their `life` as a TTL; tag versions live in Redis, so every instance sees an invalidation. |
| `redisRateLimit(options?)` | `@weft-js/realtime-redis` | Better Auth's rate limit on Redis, counted once across instances: `createAuth({ options: { rateLimit: { customStorage: redisRateLimit() } } })`. |
| `RedisStoreOptions` | `@weft-js/realtime-redis` | Type: `{ url?: string; prefix?: string }`. `url` defaults to `REDIS_URL`. |
| default export, `redis` | `@weft-js/realtime-redis/plugin` | The plugin for `weft.config.ts`. Takes the same options as `bus()`. |

The returned bus has `name: 'redis'`, `publish(channel, message)`, `subscribe(channel, on, gap?)` (resolves once Redis
confirms the subscription, with a function that stops it) and `close()`.

## Recipes

### The shared cache and sign-in limits on Redis

The bus carries realtime messages. The same Redis can also hold the query cache and auth's rate limit, so several
instances agree on both:

```ts
// src/cache.server.ts
import { redisStore } from '@weft-js/realtime-redis'
export default redisStore()
```

```ts
// src/auth.server.ts
import { redisRateLimit } from '@weft-js/realtime-redis'
export default createAuth({
  db,
  secret,
  options: {
    ...options,
    rateLimit: { customStorage: redisRateLimit() },
  },
})
```

### Several apps on one Redis

```ts
// weft.config.ts
import { defineConfig } from '@weft-js/core/config'
import { redis } from '@weft-js/realtime-redis/plugin'

export default defineConfig({
  plugins: [redis({ prefix: 'billing:' })],
})
```

### TLS on a managed Redis

Most hosted Redis services give a `rediss://` URL. Use it as it is:

```bash
REDIS_URL=rediss://default:secret@my-redis.example.com:6380
```

### Covering a gap in your own channel

The bus is at-most-once, and a reconnect can drop messages. Anything that must survive goes through a mutation, and a
channel's `collect` plus a history query fills in what a client missed. The
[live data guide](https://github.com/Ravonus/weft/blob/main/site/content/learn/live-data.md) shows the pattern.

## Limits

- **At-most-once.** Redis pub/sub has no history. A message published while an instance is disconnected is gone for
  that instance; it gets a gap instead.
- **Plain pub/sub only.** It doesn't use Redis Streams, keyspace notifications or sharded pub/sub (`SPUBLISH`).
- **Messages are strings.** The hub serializes before publishing; the bus never parses.
- **Sizes are the hub's.** A message over 1 MiB is refused by the hub (R008) before it reaches Redis.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Q013` "`redisBus` needs a `redis://` URL" at startup | `REDIS_URL` is unset, or the URL has another scheme (`http://`, a bare host) | Set `REDIS_URL` to a `redis://` or `rediss://` URL, or pass `url`. Credentials are masked in the message. |
| `R002` from `weft build` | The preset runs many instances and the app is still on the memory bus | Add this plugin, `@weft-js/realtime-nats`, or `postgresBus` in `src/realtime.server.ts`. |
| `E009` from `weft deploy` | The same problem, found for a deploy target | As above. |
| The plugin is listed but nothing crosses instances | `src/realtime.server.ts` sets its own `bus`, which wins | Remove that `bus`, or set `redisBus()` there. |
| Messages published while Redis was down never arrived | Pub/sub keeps nothing; the reconnect was reported as a gap | Expected. Put what must survive in a mutation, and refetch after a gap. |
| Two apps see each other's messages | Same server, same `prefix` | Give each app its own `prefix`. |

## Related packages

| Package | What it is |
| --- | --- |
| [`@weft-js/start`](https://www.npmjs.com/package/@weft-js/start) | The full-stack runtime: the realtime hub, `realtime()`, `memoryBus` and `postgresBus` (`@weft-js/start/bus/postgres`). |
| [`@weft-js/realtime-nats`](https://www.npmjs.com/package/@weft-js/realtime-nats) | The same slot on core NATS. |
| [`@weft-js/realtime-durable-object`](https://www.npmjs.com/package/@weft-js/realtime-durable-object) | The bus for Cloudflare, on Durable Objects. |
| [`@weft-js/multiplayer`](https://www.npmjs.com/package/@weft-js/multiplayer) | Presence, cursors and a relay on `channel`. Its traffic crosses instances through this bus. |
| [`@weft-js/core`](https://www.npmjs.com/package/@weft-js/core) | The plugin system (`definePlugin`, slots) and `busSuite`, the conformance checks a bus must pass. |

## Contributing

See [CONTRIBUTING.md](https://github.com/Ravonus/weft/blob/main/CONTRIBUTING.md). To test this package:

```bash
pnpm --filter @weft-js/realtime-redis test
```

The test against a real server needs a `redis-server` binary. Name it in `WEFT_TEST_REDIS`; without it that test is
skipped and says so:

```bash
WEFT_TEST_REDIS=$(command -v redis-server) \
  pnpm --filter @weft-js/realtime-redis test
```

## License

[MIT](https://github.com/Ravonus/weft/blob/main/LICENSE)
