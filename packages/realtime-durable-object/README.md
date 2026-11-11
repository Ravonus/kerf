<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">@kerf-js/realtime-durable-object</h1>

<p align="center">
  <strong>A Cloudflare Durable Object as Kerf's realtime bus.</strong><br>
  Live data, channels and shared state across every Durable Object hub on Cloudflare, with no Redis or NATS to run.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@kerf-js/realtime-durable-object"><img src="https://img.shields.io/npm/v/@kerf-js/realtime-durable-object?color=145c3c&label=npm" alt="npm version"></a>
  <a href="https://github.com/Ravonus/kerf/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <a href="https://github.com/Ravonus/kerf/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ravonus/kerf/quality.yml?branch=main&label=checks" alt="checks"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="https://github.com/Ravonus/kerf/tree/main/docs">Docs</a> ·
  <a href="https://github.com/Ravonus/kerf/tree/main/examples">Examples</a> ·
  <a href="https://github.com/Ravonus/kerf/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/Ravonus/kerf">GitHub</a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** APIs can change between minor versions. Pin the version and read the
> [changelog](https://github.com/Ravonus/kerf/blob/main/CHANGELOG.md) before you upgrade.

On Cloudflare, Kerf's realtime hub runs in many places at once, and a Worker can't hold a socket open past the request
that started it. This package gives the hubs a meeting point that can: one Durable Object per channel, `KerfBusObject`,
which holds a WebSocket to every hub listening on that channel and writes each publish to all of them. It's the bus for
Kerf apps deployed with Nitro's `cloudflare_durable` preset.

## Highlights

- **One object per channel.** Each channel name maps to its own `KerfBusObject` through `idFromName`, so busy channels
  don't share an object.
- **Hibernation API.** The object accepts sockets with `state.acceptWebSocket`, so Cloudflare can evict it from memory
  between messages without dropping the sockets.
- **Holds nothing but sockets.** No storage, no history: a publish is a POST that the object writes to every socket it
  holds.
- **Redials with backoff.** A lost socket is reported to the hub as a gap, then redialled after 500 ms, doubling up to
  30 s, until it's back or the subscription stops.
- **No runtime imports.** The source imports only types, so workerd runs the file as it is. An app doesn't need
  `@cloudflare/workers-types` for it.
- **Checked by the build.** `kerf build` refuses this bus on any preset other than `cloudflare_durable` (R002), where it
  would silently lose messages.
- **Tested on workerd.** The tests run the object and two hubs in Miniflare, with no Cloudflare account.

## Install

```bash
# npm
npm install @kerf-js/realtime-durable-object

# pnpm
pnpm add @kerf-js/realtime-durable-object

# bun
bun add @kerf-js/realtime-durable-object
```

Or let the `kerf` CLI install it and add it to `kerf.config.ts` in one step:

```bash
npx kerf add realtime-durable-object
```


You also need a Cloudflare account and `wrangler` to deploy. `kerf deploy` writes a `wrangler.toml` for the
`cloudflare` target and builds with `kerf build --preset cloudflare_durable`.

## Quick start

Unlike `@kerf-js/realtime-redis` and `@kerf-js/realtime-nats`, this bus can't be built from plugin options: it needs a
Durable Object namespace binding, and a binding only exists at run time. So the plugin in `kerf.config.ts` only
declares the binding, and the bus itself is set in `src/realtime.server.ts`. There are four steps.

**1. The plugin.** `kerf add` writes this:

```ts
// kerf.config.ts
import { defineConfig } from '@kerf-js/core/config'
import realtimeDurableObject from
  '@kerf-js/realtime-durable-object/plugin'

export default defineConfig({
  plugins: [realtimeDurableObject()],
})
```

**2. The bus.** Pass the `KERF_BUS` binding to `durableObjectBus`:

<!-- example: skip reaching `env` depends on how your worker exposes bindings -->
```ts
// src/realtime.server.ts
import { realtime } from '@kerf-js/start'
import { durableObjectBus } from '@kerf-js/realtime-durable-object'
import { env } from 'cloudflare:workers'

export default realtime({
  bus: durableObjectBus({ namespace: env.KERF_BUS }),
})
```

> [!TIP]
> `cloudflare:workers` is Cloudflare's module for reading bindings outside a request handler. Any way of reaching the
> binding works: `durableObjectBus` only needs an object with `idFromName(name)` and `get(id)`.

**3. The class.** Export `KerfBusObject` from the worker entry, so Cloudflare can create it:

```ts
export { KerfBusObject } from '@kerf-js/realtime-durable-object'
```

**4. The binding and migration.** Add them to `wrangler.toml`:

```toml
[[durable_objects.bindings]]
name = "KERF_BUS"
class_name = "KerfBusObject"

[[migrations]]
tag = "kerf-bus-v1"
new_sqlite_classes = ["KerfBusObject"]
```

Then build and deploy:

```bash
npx kerf build --preset cloudflare_durable
cd .output && npx wrangler deploy
```

## How it plugs into Kerf

Kerf's realtime hub keeps everything that has state (tags, topics, replay rings, cursors, presence) and hands the bus
three things to do: publish a string to a channel, subscribe to a channel, and close. That is the `Bus` interface in
[`@kerf-js/start/bus`](https://github.com/Ravonus/kerf/blob/main/packages/start/src/bus.ts). The bus is at-most-once
and ordered per publisher.

```text
publishing hub ──POST message──▶ KerfBusObject for channel "c"
                                          │
                                       ws.send
                                          ▼
                        every hub subscribed to "c"
                        (each holds a WebSocket to the object)
```

- **`publish(channel, message)`** gets the channel's object with `namespace.get(namespace.idFromName(channel))` and
  POSTs the message to it. The object answers `204` after writing it to every socket. Any other status rejects the
  publish with `durable object bus: publish answered <status>`.
- **`subscribe(channel, on, gap)`** asks the same object for a WebSocket (an `upgrade: websocket` request), accepts it,
  and calls `on` for each message. It resolves once the socket is open.
- **A lost socket** calls `gap`, then redials after `min(30 s, 500 ms × 2^attempt)`. A failed redial is another gap and
  a longer wait. A successful one resets the backoff.
- **`close()`** stops every subscription this bus opened, closing their sockets with code 1000.

### Why it needs `cloudflare_durable`

A hub's subscription is a WebSocket that must stay open for as long as the hub listens. A stateless Worker's I/O
belongs to the request that opened it, so the socket would close with that request. Nitro's `cloudflare_durable`
preset runs the hub inside a Durable Object, which lives long enough to hold it. On any other preset `kerf build`
fails with R002.

`kerf deploy` recognises this bus from the source: a `durableObjectBus(` call, an import of
`@kerf-js/realtime-durable-object` or the plugin in `kerf.config.ts` counts as a shared bus, so E009 (the memory bus on
a many-instance host) doesn't fire.

### What the plugin declares

The plugin provides no slot. It declares the binding the bus reaches and gives agents the setup steps.

| Permission | Value |
| --- | --- |
| `net` | `binding:KERF_BUS` |

## API reference

| Export | From | What it is |
| --- | --- | --- |
| `durableObjectBus({ namespace })` | `@kerf-js/realtime-durable-object` | The `Bus` for `src/realtime.server.ts`: one `KerfBusObject` per channel, reached through `namespace`. Must be used from a Durable Object hub. |
| `KerfBusObject` | `@kerf-js/realtime-durable-object` | The Durable Object class. Export it from the worker and bind it as `KERF_BUS` with a `new_sqlite_classes` migration. |
| `DurableObjectNamespaceLike` | `@kerf-js/realtime-durable-object` | Type: the part of a namespace binding the bus uses, `idFromName(name)` and `get(id)`. `env.KERF_BUS` fits it. |
| default export, `durableObject` | `@kerf-js/realtime-durable-object/plugin` | The plugin for `kerf.config.ts`. Takes no options; declares `binding:KERF_BUS`. |

### `durableObjectBus` options

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `namespace` | `DurableObjectNamespaceLike` | required | The Durable Object namespace bound to `KerfBusObject`, usually `env.KERF_BUS`. |

### `KerfBusObject`

| Method | What it does |
| --- | --- |
| `fetch(request)` | With `upgrade: websocket`: accepts a socket through the hibernation API and answers `101`. Otherwise: reads the body as the message, sends it to every socket, answers `204`. |
| `webSocketMessage()` | Ignores messages from hubs. Traffic only flows out of the object. |
| `webSocketClose(ws)` | Closes its end with code 1000. |

## Limits

- **At-most-once.** The object stores nothing. A hub that was disconnected misses what was published meanwhile, and
  gets a gap instead.
- **`cloudflare_durable` only.** Not for Node, Bun, Deno or other serverless hosts; use Redis, NATS or `postgresBus`
  there.
- **One object per channel.** Each object's sockets and request rate are subject to Cloudflare's Durable Object limits.
- **Messages are strings.** The hub serializes; the bus never parses. A message over 1 MiB is refused by the hub (R008).

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `R002` "`durableObjectBus` holds a socket open, and on the `<preset>` preset that socket dies…" | Built for a preset other than `cloudflare_durable` | `kerf build --preset cloudflare_durable`. |
| `durable object bus: publish answered 500` | The object threw, or the binding points at another class | Check the binding's `class_name` is `KerfBusObject` and the class is exported from the worker. |
| `durable object bus: subscribe answered <status>` | The object didn't upgrade the request | Same as above; a route or middleware in front of the object can also strip the upgrade. |
| `env.KERF_BUS` is undefined | The binding is missing from `wrangler.toml`, or has another name | Add the `[[durable_objects.bindings]]` entry named `KERF_BUS`. |
| Cloudflare refuses the deploy over the class | No migration creates it | Add a `[[migrations]]` entry with `new_sqlite_classes = ["KerfBusObject"]`. |
| Pages on one hub miss messages after an object restart | The socket dropped: a gap, then a redial | Expected. What must survive goes through a mutation; clients refetch after a gap. |

## Related packages

| Package | What it is |
| --- | --- |
| [`@kerf-js/start`](https://www.npmjs.com/package/@kerf-js/start) | The full-stack runtime: the realtime hub, `realtime()`, `memoryBus` and `postgresBus`. |
| [`@kerf-js/realtime-redis`](https://www.npmjs.com/package/@kerf-js/realtime-redis) | The `realtime.bus` slot on Redis pub/sub, for server hosts. |
| [`@kerf-js/realtime-nats`](https://www.npmjs.com/package/@kerf-js/realtime-nats) | The `realtime.bus` slot on core NATS, for server hosts. |
| [`@kerf-js/multiplayer`](https://www.npmjs.com/package/@kerf-js/multiplayer) | Presence, cursors and a relay on `channel`. Its traffic crosses hubs through this bus. |
| [`@kerf-js/cli`](https://www.npmjs.com/package/@kerf-js/cli) | `kerf build`, `kerf deploy` and the R002 and E009 checks. |
| [`@kerf-js/core`](https://www.npmjs.com/package/@kerf-js/core) | The compiler and reactive runtime, the Vite plugin, the plugin system and test utilities. |

## Contributing

See [CONTRIBUTING.md](https://github.com/Ravonus/kerf/blob/main/CONTRIBUTING.md). To test this package:

```bash
pnpm --filter @kerf-js/realtime-durable-object test
```

The tests run `KerfBusObject` and two Durable Object hubs on workerd through Miniflare: a message crossing from one hub
to another, a refused publish, and a lost socket becoming a gap, a redial and a clean `close`. No account or deploy is
needed.

## License

[MIT](https://github.com/Ravonus/kerf/blob/main/LICENSE)
