<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">@kerf-js/realtime-socketio</h1>

<p align="center">
  <strong>Live cursors through a Socket.IO relay you run, with tickets your Kerf server signs.</strong><br>
  For apps moving off Socket.IO: keep the relay you have, and let it carry cursors.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@kerf-js/realtime-socketio"><img src="https://img.shields.io/npm/v/@kerf-js/realtime-socketio?color=145c3c&label=npm" alt="npm version"></a>
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

A cursor transport for [`@kerf-js/multiplayer`](https://www.npmjs.com/package/@kerf-js/multiplayer) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/multiplayer)</sup>. It has
two halves: `socketio()` in the page, and `relay(io, { secret })` on a Socket.IO server you run. The relay admits only
connections with a ticket your Kerf server signed, and stamps every frame with the ticket's subject, so a client can't
speak as anyone else.

> [!TIP]
> This is for migrations. If you don't already run a Socket.IO server, leave it out: cursors work over the channel's
> socket with nothing extra, and [`@kerf-js/realtime-webrtc`](https://www.npmjs.com/package/@kerf-js/realtime-webrtc) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/realtime-webrtc)</sup>
> takes them off your server without one.

## Highlights

- **Tickets, not trust.** `socketioTicket({ secret })` signs an HS256 token naming the connection and its room. The
  relay refuses any connection without a good one.
- **The sender is the ticket's.** The relay ignores who a client says it is and fans each frame out under the
  ticket's `sub`.
- **One room per channel room.** The ticket's room is a hash of the channel's params, so the relay never sees them.
- **WebSocket only, volatile.** The client connects with `transports: ['websocket']` and sends with `volatile.emit`:
  a cursor that can't go now is dropped, not queued.
- **Bounded frames.** The relay drops a frame that isn't a string or is over 1024 characters.
- **Falls back on its own.** Until the relay accepts the socket, and while no other peer is here, cursors go over the
  channel.

## Install

```bash
# npm
npm install @kerf-js/multiplayer @kerf-js/realtime-socketio

# pnpm
pnpm add @kerf-js/multiplayer @kerf-js/realtime-socketio

# bun
bun add @kerf-js/multiplayer @kerf-js/realtime-socketio
```

Or install `@kerf-js/multiplayer`, then let the `kerf` CLI install this package and add its plugin to
`kerf.config.ts`:

```bash
npm install @kerf-js/multiplayer
npx kerf add realtime-socketio
```

`@kerf-js/multiplayer` is a peer dependency, so add it too. `socket.io-client` comes with this package. `socket.io`
(`^4.8.0`) is an optional peer: only the relay needs it, on the server that runs the relay.

`kerf add` puts its plugin in `kerf.config.ts`:

```ts
// kerf.config.ts
import { defineConfig } from '@kerf-js/core/config'
import realtimeSocketio from '@kerf-js/realtime-socketio/plugin'

export default defineConfig({
  plugins: [realtimeSocketio()],
})
```

The plugin fills no slot. It records that the browser reaches your relay and tells agents how the pieces fit. The
transport itself is passed to `presence()` in a page.

## Setup

| Piece | Where | What it needs |
| ----- | ----- | ------------- |
| `relay(io, { secret })` | Your Socket.IO server | `socket.io` 4.8 or later, and the shared secret. |
| `socketioTicket({ secret })` | Your Kerf server, in `multiplayer({ ticket })` | The same secret. |
| `socketio({ url, path })` | The page | The relay's URL, and its `path` if not the default. |

The package reads no environment variable itself. Keep the secret in one (the end-to-end test calls it
`KERF_E2E_SOCKETIO_SECRET`) and pass it to both halves.

## Quick start

The relay, on your Socket.IO server:

```ts
// relay.ts
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { relay } from '@kerf-js/realtime-socketio/relay'

const http = createServer()
const io = new Server(http, {
  cors: { origin: 'https://app.example.com' },
})
relay(io, { secret: process.env.CURSOR_SECRET! })
http.listen(3001)
```

The ticket, in your channel:

```ts
// src/server/doc.ts
import { channel } from '@kerf-js/start'
import { multiplayer } from '@kerf-js/multiplayer/server'
import { socketioTicket } from '@kerf-js/realtime-socketio/relay'
import { z } from 'zod'

const mp = multiplayer<{ id: string }>({
  user: ({ ctx }) => ({ id: ctx.user!.id, name: ctx.user!.name }),
  ticket: socketioTicket({ secret: process.env.CURSOR_SECRET! }),
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

The transport, in the page:

```tsx
// src/routes/room.tsx
import { cursors, presence } from '@kerf-js/multiplayer'
import { Cursors } from '@kerf-js/multiplayer/ui'
import { socketio } from '@kerf-js/realtime-socketio'
import { doc } from '#/server/doc'

export default function Room() {
  const chat = doc.connect({ id: 'lobby' })
  const live = presence(chat, {
    transport: socketio({ url: 'https://relay.example.com' }),
  })
  return <Cursors of={cursors(live)} />
}
```

`live.via.value` is `'socket'` until the relay has accepted this page and another peer is here, then `'socketio'`.

## How it works

1. On `mp.hello` the Kerf server signs a ticket: `{ sub: <connection id>, room: roomId(params), exp }`. The page gets
   it with `mp.you`.
2. `socketio({ url })` connects with `auth: { ticket }`. The relay's middleware verifies it with the secret; a bad,
   expired or incomplete ticket is refused with `bad ticket`.
3. An admitted socket joins the ticket's room and receives `kerf:ok`. From then on the link is up while there's
   another peer.
4. The page sends a cursor as `kerf:f`. The relay re-emits it to the rest of the room as `kerf:f` with the ticket's
   `sub` as the sender, and `presence` checks it like any frame off a transport.

## API reference

### `@kerf-js/realtime-socketio`

`socketio(options): PeerTransport`: the transport, for `presence(conn, { transport })`.

| Option | Type     | Default            | What it does |
| ------ | -------- | ------------------ | ------------ |
| `url`  | `string` | required           | The relay. |
| `path` | `string` | Socket.IO's default | The relay's Socket.IO path, if it isn't the default. |

Type: `SocketIoOptions`.

### `@kerf-js/realtime-socketio/relay`

| Export | What it does |
| ------ | ------------ |
| `relay(io, { secret })` | Adds the ticket check to a Socket.IO `Server` and fans out each frame to its room under the ticket's subject. |
| `socketioTicket({ secret, ttl })` | Returns the function `multiplayer({ ticket })` calls: a signed claim of who this connection is and which room it may enter. |

| `socketioTicket` option | Type     | Default  | What it does |
| ----------------------- | -------- | -------- | ------------ |
| `secret`                | `string` | required | Shared with the relay. |
| `ttl`                   | `number` | `3600`   | Seconds a ticket can open a connection. |

Type: `TicketOptions`. The relay checks the ticket when a socket connects, so a socket already open stays open past
`ttl`.

### `@kerf-js/realtime-socketio/plugin`

The plugin for `kerf.config.ts`, as a default export and as the named export `socketio`. Import the default, or rename
the named one, so it doesn't clash with the transport of the same name.

## Limits

- Only cursors ride the relay. Presence state, the relay events of `@kerf-js/multiplayer` and signalling stay on the
  channel, where the server checks them.
- Frames are volatile and over 1024 characters are dropped. Nothing is retried.
- The relay keeps no state beyond Socket.IO's rooms. To run several relay instances, they need Socket.IO's own adapter
  between them; this package doesn't set one up.

## Troubleshooting

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| `connect_error` with `bad ticket` | The secrets differ, the ticket expired, or `multiplayer()` has no `ticket`. | Use one secret on both sides; check `ttl`. |
| `via` stays `'socket'` | The relay isn't reachable from the page (URL, `path`, CORS), or no other peer is here. | Check the relay's URL and its CORS origin. Cursors keep working over the channel meanwhile. |
| R007 from `kerf check` | `socket.io-client` is in the app's own dependencies. Kerf owns the app's connections. | Let this package bring `socket.io-client`; don't add it to the app. |
| `kerf check` stops after `kerf add` | A newly added plugin's permissions must be approved. | `kerf plugins approve @kerf-js/realtime-socketio`. |

## Related packages

| Package | What it is |
| ------- | ---------- |
| [`@kerf-js/multiplayer`](https://www.npmjs.com/package/@kerf-js/multiplayer) | Presence, cursors and the relay that this transport carries cursors for. |
| [`@kerf-js/realtime-webrtc`](https://www.npmjs.com/package/@kerf-js/realtime-webrtc) | Cursors browser to browser, with no service in between. |
| [`@kerf-js/realtime-livekit`](https://www.npmjs.com/package/@kerf-js/realtime-livekit) | Cursors over a LiveKit room, which also carries audio and video. |
| [`@kerf-js/realtime-redis`](https://www.npmjs.com/package/@kerf-js/realtime-redis) | A `realtime.bus` over Redis: how server instances reach each other, not a cursor transport. |
| [`@kerf-js/realtime-nats`](https://www.npmjs.com/package/@kerf-js/realtime-nats) | A `realtime.bus` over NATS. |
| [`@kerf-js/realtime-durable-object`](https://www.npmjs.com/package/@kerf-js/realtime-durable-object) | A `realtime.bus` on Cloudflare Durable Objects. |
| [`@kerf-js/core`](https://www.npmjs.com/package/@kerf-js/core) | The compiler and reactive runtime, the Vite plugin, the plugin system and test utilities. |
| [`@kerf-js/start`](https://www.npmjs.com/package/@kerf-js/start) | The full-stack runtime: routes, server functions, `channel`, `realtime()` and the realtime hub. |

## Contributing

See [CONTRIBUTING.md](https://github.com/Ravonus/kerf/blob/main/CONTRIBUTING.md). From the repository,
`pnpm --filter @kerf-js/realtime-socketio test` starts a real Socket.IO server with the relay and runs
`@kerf-js/multiplayer`'s transport suite against real clients, plus a forged-ticket refusal. No external service is
needed.

## License

[MIT](https://github.com/Ravonus/kerf/blob/main/LICENSE)
