<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">@weft-js/realtime-livekit</h1>

<p align="center">
  <strong>Live cursors over a LiveKit room, with the token signed by your Weft server.</strong><br>
  LiveKit proves who sent each frame, and the same room can carry audio and video.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@weft-js/realtime-livekit"><img src="https://img.shields.io/npm/v/@weft-js/realtime-livekit?color=145c3c&label=npm" alt="npm version"></a>
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

A cursor transport for [`@weft-js/multiplayer`](https://www.npmjs.com/package/@weft-js/multiplayer) <sup>[source](https://github.com/Ravonus/weft/tree/main/packages/multiplayer)</sup>. By
default cursors go through your server over the channel's socket. With this package they go through a
[LiveKit](https://livekit.io) room instead, which takes that traffic off your server. It suits an app that already uses
LiveKit, or wants audio and video in the same room as its cursors.

## Highlights

- **Your server signs the token.** `livekitTicket()` signs a LiveKit access token whose identity is the channel
  connection's id. No client can name itself to LiveKit.
- **The sender is proven.** A frame's sender is the LiveKit participant's identity, and `@weft-js/multiplayer` only
  accepts frames from connections that are in the room.
- **Data only by default.** The token allows joining, subscribing and publishing data. `media: true` adds publishing
  audio and video.
- **Rooms that say nothing.** The LiveKit room name is a hash of the channel's params, so LiveKit never sees them.
- **Falls back on its own.** Until every peer is in the LiveKit room, cursors keep going over the socket.
- **Lossy on purpose.** Cursor frames are published with `reliable: false` on the topic `weft`: a late cursor is
  replaced by the next one.

## Install

```bash
# npm
npm install @weft-js/multiplayer @weft-js/realtime-livekit

# pnpm
pnpm add @weft-js/multiplayer @weft-js/realtime-livekit

# bun
bun add @weft-js/multiplayer @weft-js/realtime-livekit
```

Or install `@weft-js/multiplayer`, then let the `weft` CLI install this package and add its plugin to
`weft.config.ts`:

```bash
npm install @weft-js/multiplayer
npx weft add realtime-livekit
```

`@weft-js/multiplayer` is a peer dependency, so add it too. `livekit-client` comes with this package.

`weft add` installs the package and puts its plugin in `weft.config.ts`:

```ts
// weft.config.ts
import { defineConfig } from '@weft-js/core/config'
import realtimeLivekit from '@weft-js/realtime-livekit/plugin'

export default defineConfig({
  plugins: [realtimeLivekit()],
})
```

The plugin fills no slot. It records what the app reaches (LiveKit from the browser, and the `LIVEKIT_API_KEY` and
`LIVEKIT_API_SECRET` variables), and tells agents how the transport is used. The transport itself is passed to
`presence()` in a page.

## Setup

You need a LiveKit server: [LiveKit Cloud](https://livekit.io) or your own. The server reads two variables:

| Variable             | Where       | What it is |
| -------------------- | ----------- | ---------- |
| `LIVEKIT_API_KEY`    | your server | The key `livekitTicket()` puts in the token's `iss`. |
| `LIVEKIT_API_SECRET` | your server | The secret it signs the token with (HS256). Never send it to a page. |

The page needs the LiveKit URL (`wss://…`). It isn't secret: read it on the server and hand it to the page, for
example from a route's `load`.

## Quick start

Give `multiplayer()` the ticket:

```ts
// src/server/doc.ts
import { channel } from '@weft-js/start'
import { multiplayer } from '@weft-js/multiplayer/server'
import { livekitTicket } from '@weft-js/realtime-livekit/server'
import { z } from 'zod'

const mp = multiplayer<{ id: string }>({
  user: ({ ctx }) => ({ id: ctx.user!.id, name: ctx.user!.name }),
  ticket: livekitTicket(), // LIVEKIT_API_KEY and LIVEKIT_API_SECRET
})

export const doc = channel({
  params: z.object({ id: z.string().max(64) }),
  authorize: ({ ctx }) => !!ctx.user,
  client: { ...mp.client },
  server: { ...mp.server },
  on: { ...mp.on },
  left: mp.left,
})
```

Pass the transport to `presence()`:

```tsx
// src/routes/room.tsx
import { cursors, presence } from '@weft-js/multiplayer'
import { Cursors } from '@weft-js/multiplayer/ui'
import { livekit } from '@weft-js/realtime-livekit'
import { doc } from '#/server/doc'

export const load = () => ({ livekit: process.env.LIVEKIT_URL ?? '' })

export default function Room(props: { data: { livekit: string } }) {
  const chat = doc.connect({ id: 'lobby' })
  const live = presence(chat, {
    transport: livekit({ url: props.data.livekit }),
  })
  const pointers = cursors(live)
  return (
    <main>
      <p>Cursors via {live.via.value}</p>
      <Cursors of={pointers} />
    </main>
  )
}
```

`live.via.value` is `'socket'` until every other peer is in the LiveKit room, then `'livekit'`.

## How it works

1. A page joins the channel and sends `mp.hello`. The server calls `livekitTicket()` with the connection's id, the
   peer's `user` and the channel's params, and returns the token with `mp.you`.
2. `livekit({ url })` connects a `livekit-client` `Room` to `url` with that token. Without a ticket it doesn't
   connect, and cursors stay on the socket.
3. A cursor is published as data on the topic `weft`, unreliable. A received frame is handed to `presence` with the
   participant's identity as the sender, and checked there like any frame off a transport.
4. The link is `up` while every peer the channel knows is also a remote participant in the LiveKit room.

## API reference

### `@weft-js/realtime-livekit`

`livekit(options): PeerTransport`: the transport, for `presence(conn, { transport })`. Its `open` returns the
`PeerLink` with one more field, `room`: the `livekit-client` `Room`, for audio and video.

| Option | Type     | Default  | What it does |
| ------ | -------- | -------- | ------------ |
| `url`  | `string` | required | The LiveKit server, `wss://…`. |

Type: `LivekitOptions`.

### `@weft-js/realtime-livekit/server`

`livekitTicket(options?)`: returns the function `multiplayer({ ticket })` calls. It refuses to run without a key and
secret.

| Option   | Type      | Default                       | What it does |
| -------- | --------- | ----------------------------- | ------------ |
| `key`    | `string`  | `process.env.LIVEKIT_API_KEY`    | The API key, the token's `iss`. |
| `secret` | `string`  | `process.env.LIVEKIT_API_SECRET` | The API secret the token is signed with. |
| `ttl`    | `number`  | `3600`                        | Seconds the token is valid. |
| `media`  | `boolean` | `false`                       | Also allow publishing audio and video (`canPublish`). Data only is what cursors need. |

The token's claims: `iss` (the key), `sub` (the connection id), `name` (`user.name`), `nbf`, `exp`, and a `video`
grant with `room` (`roomId(params)` from `@weft-js/multiplayer/server`), `roomJoin`, `canPublish` (from `media`),
`canSubscribe` and `canPublishData`. Type: `LivekitTicketOptions`.

### `@weft-js/realtime-livekit/plugin`

The plugin for `weft.config.ts`, as a default export and as the named export `livekit`. Import the default, or rename
the named one, so it doesn't clash with the transport of the same name.

## Recipes

**Audio and video in the same room.** Sign tokens that may publish media:

```ts
const mp = multiplayer({
  user,
  ticket: livekitTicket({ media: true }),
})
```

The `room` on the link `livekit()` opens is a `livekit-client` `Room`, so its own API publishes tracks.

**Shorter-lived tokens.**

```ts
livekitTicket({ ttl: 600 })
```

## Limits

- Only cursors ride LiveKit. Presence state, the relay and signalling stay on the channel, where the server checks them.
- Frames are unreliable. A lost cursor is replaced by the next; nothing is retried.
- A connection gets its token once, with `mp.you`. A token past `ttl` can't open a new LiveKit connection; a new
  `mp.hello` (a reconnect or a reset) brings a fresh one.

## Troubleshooting

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| `` `livekitTicket` needs `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` `` on join | The server has neither variable nor options. | Set both variables, or pass `key` and `secret`. |
| `via` stays `'socket'` | No ticket reached the page (no `ticket` in `multiplayer()`), the URL is wrong, LiveKit refused the token, or a peer hasn't joined LiveKit yet. Connection errors are swallowed. | Check the URL and the key pair; cursors keep working over the socket meanwhile. |
| `weft check` stops after `weft add` | A newly added plugin's permissions must be approved. | `weft plugins approve @weft-js/realtime-livekit`. |

## Related packages

| Package | What it is |
| ------- | ---------- |
| [`@weft-js/multiplayer`](https://www.npmjs.com/package/@weft-js/multiplayer) | Presence, cursors and the relay that this transport carries cursors for. |
| [`@weft-js/realtime-webrtc`](https://www.npmjs.com/package/@weft-js/realtime-webrtc) | Cursors browser to browser, with no service in between. |
| [`@weft-js/realtime-socketio`](https://www.npmjs.com/package/@weft-js/realtime-socketio) | Cursors through a Socket.IO relay you run. |
| [`@weft-js/realtime-redis`](https://www.npmjs.com/package/@weft-js/realtime-redis) | A `realtime.bus` over Redis: how server instances reach each other, not a cursor transport. |
| [`@weft-js/realtime-nats`](https://www.npmjs.com/package/@weft-js/realtime-nats) | A `realtime.bus` over NATS. |
| [`@weft-js/realtime-durable-object`](https://www.npmjs.com/package/@weft-js/realtime-durable-object) | A `realtime.bus` on Cloudflare Durable Objects. |
| [`@weft-js/core`](https://www.npmjs.com/package/@weft-js/core) | The compiler and reactive runtime, the Vite plugin, the plugin system and test utilities. |
| [`@weft-js/start`](https://www.npmjs.com/package/@weft-js/start) | The full-stack runtime: routes, server functions, `channel`, `realtime()` and the realtime hub. |

## Contributing

See [CONTRIBUTING.md](https://github.com/Ravonus/weft/blob/main/CONTRIBUTING.md). From the repository,
`pnpm --filter @weft-js/realtime-livekit test` checks the token against LiveKit's rules. The transport against a real
LiveKit server runs in Chromium through `@weft-js/multiplayer`'s end-to-end test with `--via livekit`, which needs
`LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.

## License

[MIT](https://github.com/Ravonus/weft/blob/main/LICENSE)
