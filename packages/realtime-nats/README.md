<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">@weft-js/realtime-nats</h1>

<p align="center">
  <strong>Core NATS as Weft's realtime bus, so live data reaches every instance of your app.</strong><br>
  One line in <code>weft.config.ts</code>, one <code>NATS_URL</code>, and no change to your pages or server functions.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@weft-js/realtime-nats"><img src="https://img.shields.io/npm/v/@weft-js/realtime-nats?color=145c3c&label=npm" alt="npm version"></a>
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
refreshes a page connected to the other. This package fills the `realtime.bus` slot with core NATS, so every instance
hears every publish. It's for apps that already run NATS, or want a small message server between instances.

## Highlights

- **A plugin, not code.** `nats()` in `plugins` replaces the memory bus. Nothing in `src/` changes.
- **Reads `NATS_URL`.** The servers come from the environment unless you pass `servers`.
- **Token or user/password auth.** Pass `token`, or `user` and `pass`, when the server asks for them.
- **Any channel name is safe.** Weft's channel names come from tags and keys, which can hold characters a NATS subject
  can't (`*`, `>`, spaces). Each channel becomes `weft.<base64url of the name>`.
- **Lazy.** It connects on the first publish or subscribe, and `weft build` never connects.
- **Reconnects on its own.** It retries without limit, every 500 ms. A reconnect is reported to the hub as a gap, so
  clients know that messages may be missing.
- **Tested against a real server.** The test suite runs the shared `realtime.bus@1` conformance checks against a
  `nats-server` it starts, then kills and restarts.

## Install

```bash
# npm
npm install @weft-js/realtime-nats

# pnpm
pnpm add @weft-js/realtime-nats

# bun
bun add @weft-js/realtime-nats
```

Or let the `weft` CLI install it and add it to `weft.config.ts` in one step:

```bash
npx weft add nats
```

`weft add` installs the package and adds the plugin to `weft.config.ts`.

## Quick start

1. Run a NATS server. For local work:

   ```bash
   docker run --rm -p 4222:4222 nats
   ```

2. Add the plugin. `weft add nats` writes this for you:

   ```ts
   // weft.config.ts
   import { defineConfig } from '@weft-js/core/config'
   import realtimeNats from '@weft-js/realtime-nats/plugin'

   export default defineConfig({
     plugins: [realtimeNats()],
   })
   ```

   `import { nats } from '@weft-js/realtime-nats/plugin'` is the same function under its own name.

3. Set the server in the app's environment:

   ```bash
   # .env
   NATS_URL=nats://localhost:4222
   ```

4. Start two instances on different ports and open a page that reads a query with `.live()` on each. A mutation through
   one refreshes the page on the other.

## How it plugs into Weft

Weft's realtime hub keeps everything that has state (tags, topics, replay rings, cursors, presence) and hands the bus
three things to do: publish a string to a channel, subscribe to a channel, and close. That is the `Bus` interface in
[`@weft-js/start/bus`](https://github.com/Ravonus/weft/blob/main/packages/start/src/bus.ts). A bus is at-most-once and
ordered per publisher; core NATS is both.

The plugin provides the `realtime.bus` slot (version 1, one provider, server side). At build time Weft writes the slot
binding to `.weft/slots/realtime.bus.ts`, and the server entry wraps it in a bus that loads this package on the first
publish or subscribe. The order of precedence is:

| Where the bus comes from | Wins over |
| --- | --- |
| `bus` in `src/realtime.server.ts` | everything: an explicit choice beats a plugin |
| a `realtime.bus` plugin in `weft.config.ts` (this one, or `@weft-js/realtime-redis`) | the memory bus |
| nothing | the memory bus, one process only |

### Using it without the plugin

`natsBus()` is a plain function, so you can set it in `src/realtime.server.ts` instead:

```ts
// src/realtime.server.ts
import { realtime } from '@weft-js/start'
import { natsBus } from '@weft-js/realtime-nats'

export default realtime({
  bus: natsBus({
    servers: ['nats://nats-1:4222', 'nats://nats-2:4222'],
    token: process.env.NATS_TOKEN,
  }),
})
```

Use this form when you want the bus next to `origins`, `limits` or `changes`, or read credentials from variables of
your own. The package still has to be installed.

## Options

`nats(options)` in `weft.config.ts` and `natsBus(options)` take the same options. The plugin passes them through to
`bus()`, which fills `servers` from `NATS_URL` when it's missing.

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `servers` | `string \| string[]` | `process.env.NATS_URL` (plugin and `bus()` only) | `nats://host:4222`, or several. Required for `natsBus()`. |
| `token` | `string` | none | Token auth. |
| `user` | `string` | none | User for user/password auth. |
| `pass` | `string` | none | Password for user/password auth. |

The options are passed to the NATS client's `connect()`, with `maxReconnectAttempts: -1` (retry forever) and
`reconnectTimeWait: 500` (ms) added. The plugin's options end up in generated code, so keep secrets out of them: set
credentials in `src/realtime.server.ts` from the environment, as in the example above.

### Environment

| Variable | Read by | Needed |
| --- | --- | --- |
| `NATS_URL` | the plugin and `bus()` | At run time, unless `servers` is given. One URL; pass `servers` for several. |
| `WEFT_BUILD` | `natsBus()` | Set by `weft build`. While it's set, missing `servers` is not an error, since a build never connects. |

### What the plugin declares

| Permission | Value |
| --- | --- |
| `net` | `env:NATS_URL`, the host in that variable |
| `env` | `NATS_URL`, `WEFT_BUILD` |

## How it behaves

- **One connection** per bus, opened on first use. If it fails, the next publish or subscribe tries again.
- **Subjects.** A channel `c` is published on `weft.` followed by `c` in base64url, so any string works and nothing
  collides with your own subjects outside `weft.`.
- **`subscribe` waits for the server.** It flushes after subscribing, so a publish made after `subscribe` resolves is
  delivered.
- **A reconnect is a gap.** Core NATS keeps nothing for a subscriber that was away. On each `reconnect` status the bus
  calls the hub's `gap`, and the hub treats everything before it as outside the resume window.
- **`close()`** closes the connection. The next use connects again.

## API reference

| Export | From | What it is |
| --- | --- | --- |
| `natsBus(options)` | `@weft-js/realtime-nats` | A `Bus` over core NATS, connecting on first use. Throws Q013 without `servers`, except during a build. |
| `bus(options?)` | `@weft-js/realtime-nats` | The `realtime.bus` provider the plugin loads: `natsBus` with `servers` defaulting to `NATS_URL`. |
| `NatsBusOptions` | `@weft-js/realtime-nats` | Type: `{ servers: string \| string[]; token?: string; user?: string; pass?: string }`. |
| default export, `nats` | `@weft-js/realtime-nats/plugin` | The plugin for `weft.config.ts`. Takes the same options as `bus()`. |

The returned bus has `name: 'nats'`, `publish(channel, message)`, `subscribe(channel, on, gap?)` and `close()`.

## Recipes

### A cluster

```ts
// src/realtime.server.ts
import { realtime } from '@weft-js/start'
import { natsBus } from '@weft-js/realtime-nats'

export default realtime({
  bus: natsBus({
    servers: (process.env.NATS_SERVERS ?? '').split(','),
  }),
})
```

### User and password from the environment

```ts
// src/realtime.server.ts
import { realtime } from '@weft-js/start'
import { natsBus } from '@weft-js/realtime-nats'

export default realtime({
  bus: natsBus({
    servers: process.env.NATS_URL ?? '',
    user: process.env.NATS_USER,
    pass: process.env.NATS_PASS,
  }),
})
```

### Watching Weft's traffic

Every subject starts with `weft.`, so the NATS CLI can show it: `nats sub 'weft.>'`. The rest of each subject is the
channel name in base64url.

## Limits

- **Core NATS only.** No JetStream, so there's no history or replay: a message published while an instance is
  disconnected is gone for that instance, which gets a gap instead.
- **No TLS, NKey or creds-file options.** Only `servers`, `token`, `user` and `pass` are typed.
- **Messages are strings.** The hub serializes; the bus never parses.
- **Sizes are the hub's.** A message over 1 MiB is refused by the hub (R008). The NATS server's own `max_payload`
  setting also applies.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Q013` "`natsBus` needs `servers`" at startup | `NATS_URL` is unset and no `servers` was passed | Set `NATS_URL`, or pass `servers`. |
| `R002` from `weft build` | The preset runs many instances and the app is still on the memory bus | Add this plugin, `@weft-js/realtime-redis`, or `postgresBus` in `src/realtime.server.ts`. |
| `E009` from `weft deploy` | The same problem, found for a deploy target | As above. |
| The plugin is listed but nothing crosses instances | `src/realtime.server.ts` sets its own `bus`, which wins | Remove that `bus`, or set `natsBus()` there. |
| Authorization errors in the server log | The server wants credentials | Pass `token`, or `user` and `pass`. |
| Messages published while NATS was down never arrived | Core NATS keeps nothing; the reconnect was reported as a gap | Expected. Put what must survive in a mutation, and refetch after a gap. |

## Related packages

| Package | What it is |
| --- | --- |
| [`@weft-js/start`](https://www.npmjs.com/package/@weft-js/start) | The full-stack runtime: the realtime hub, `realtime()`, `memoryBus` and `postgresBus` (`@weft-js/start/bus/postgres`). |
| [`@weft-js/realtime-redis`](https://www.npmjs.com/package/@weft-js/realtime-redis) | The same slot on Redis pub/sub. |
| [`@weft-js/realtime-durable-object`](https://www.npmjs.com/package/@weft-js/realtime-durable-object) | The bus for Cloudflare, on Durable Objects. |
| [`@weft-js/multiplayer`](https://www.npmjs.com/package/@weft-js/multiplayer) | Presence, cursors and a relay on `channel`. Its traffic crosses instances through this bus. |
| [`@weft-js/core`](https://www.npmjs.com/package/@weft-js/core) | The plugin system (`definePlugin`, slots) and `busSuite`, the conformance checks a bus must pass. |

## Contributing

See [CONTRIBUTING.md](https://github.com/Ravonus/weft/blob/main/CONTRIBUTING.md). To test this package:

```bash
pnpm --filter @weft-js/realtime-nats test
```

The test against a real server needs a `nats-server` binary. Name it in `WEFT_TEST_NATS`; without it that test is
skipped and says so:

```bash
WEFT_TEST_NATS=$(command -v nats-server) \
  pnpm --filter @weft-js/realtime-nats test
```

## License

[MIT](https://github.com/Ravonus/weft/blob/main/LICENSE)
