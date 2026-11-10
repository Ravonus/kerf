<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">@weft-js/realtime-webrtc</h1>

<p align="center">
  <strong>Live cursors browser to browser, over WebRTC data channels.</strong><br>
  Signalled through your channel, so the server still vouches for who each peer is.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@weft-js/realtime-webrtc"><img src="https://img.shields.io/npm/v/@weft-js/realtime-webrtc?color=145c3c&label=npm" alt="npm version"></a>
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
default cursors go through your server over the channel's socket. With `webrtc()`, each browser opens a data channel to
every other one and sends its cursor directly. Offers and ICE candidates go through the channel, so a frame's sender is
the peer the server named when the connection was made. There is no extra service to run, only STUN, and TURN when
peers are on different networks.

## Highlights

- **No server in the path.** Cursors go peer to peer. Your server only carries the signalling.
- **Identity from the room.** Offers and candidates are signals through the channel, stamped by the server with who
  sent them. Signals from a connection that isn't in the room are ignored.
- **Built for cursors.** Data channels are unordered with no retransmits (`ordered: false, maxRetransmits: 0`): a lost
  position is replaced by the next.
- **A mesh, with a ceiling.** Each peer holds one connection per other peer. Past `max` peers (default 8) it doesn't
  open any and stays on the socket.
- **Falls back on its own.** The link is `up` only when every peer's data channel is open. Until then, and for a peer
  with no working path, cursors go over the socket.
- **Perfect negotiation.** When two peers offer at once, the one with the lower id gives way, so a connection settles
  without a retry loop.

## Install

```bash
# npm
npm install @weft-js/multiplayer @weft-js/realtime-webrtc

# pnpm
pnpm add @weft-js/multiplayer @weft-js/realtime-webrtc

# bun
bun add @weft-js/multiplayer @weft-js/realtime-webrtc
```

Or install `@weft-js/multiplayer`, then let the `weft` CLI install this package and add its plugin to
`weft.config.ts`:

```bash
npm install @weft-js/multiplayer
npx weft add realtime-webrtc
```

`@weft-js/multiplayer` is a peer dependency, so add it too. The package has no runtime dependencies: it uses the
browser's `RTCPeerConnection`.

`weft add` puts its plugin in `weft.config.ts`:

```ts
// weft.config.ts
import { defineConfig } from '@weft-js/core/config'
import realtimeWebrtc from '@weft-js/realtime-webrtc/plugin'

export default defineConfig({
  plugins: [realtimeWebrtc()],
})
```

The plugin fills no slot. Listed, it puts what the browser reaches on the record (`browser:peers`,
`browser:ice-servers`): STUN, TURN and other browsers, none of which goes through your server. The transport itself is
passed to `presence()` in a page.

## Setup

| Network | What you need |
| ------- | ------------- |
| Peers on one network | Nothing. The default `iceServers` is empty. |
| Peers on different networks | A STUN server, so each browser learns its public address. |
| Peers behind strict NATs or firewalls | A TURN server, which relays the data when no direct path exists. |

Pass them as standard `RTCIceServer` entries. TURN credentials are visible to the page, so use short-lived ones.

## Quick start

The channel needs nothing extra: signalling uses the `mp.signal` message `multiplayer()` already defines.

```ts
// src/server/doc.ts
import { channel } from '@weft-js/start'
import { multiplayer } from '@weft-js/multiplayer/server'
import { z } from 'zod'

const mp = multiplayer<{ id: string }>({
  user: ({ ctx }) => ({ id: ctx.user!.id, name: ctx.user!.name }),
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

```tsx
// src/routes/room.tsx
import { cursors, presence } from '@weft-js/multiplayer'
import { Cursors } from '@weft-js/multiplayer/ui'
import { webrtc } from '@weft-js/realtime-webrtc'
import { doc } from '#/server/doc'

export default function Room() {
  const chat = doc.connect({ id: 'lobby' })
  const live = presence(chat, {
    transport: webrtc({
      iceServers: [{ urls: 'stun:stun.example.com' }],
    }),
  })
  return (
    <main>
      <p>Cursors via {live.via.value}</p>
      <Cursors of={cursors(live)} />
    </main>
  )
}
```

`live.via.value` is `'socket'` until every peer's data channel is open, then `'webrtc'`.

## How it works

1. When `presence` learns this connection's id, it opens the transport. For each peer in the room, it creates an
   `RTCPeerConnection`. The peer with the lower id creates the data channel, named `weft`.
2. Offers, answers and ICE candidates are sent with `signal(to, data)`, which goes through the channel as
   `mp.signal`. The server stamps each with its sender and forwards it to that one peer only.
3. A signal from a connection that isn't in the room, or that isn't an object, is ignored. A bad offer or candidate
   costs that peer its link; frames to it stay on the socket.
4. A message on a data channel is passed on only when it's a string under 1024 characters, and then checked again by
   `presence` like any frame off a transport.
5. A peer that leaves the room has its connection closed. Over `max` peers, no new connections open.

## API reference

### `@weft-js/realtime-webrtc`

`webrtc(options?): PeerTransport`: the transport, for `presence(conn, { transport })`.

| Option       | Type             | Default | What it does |
| ------------ | ---------------- | ------- | ------------ |
| `iceServers` | `RTCIceServer[]` | `[]`    | STUN and TURN servers. Empty works for peers on one network. |
| `max`        | `number`         | `8`     | With more peers than this, it stays on the socket: a mesh costs each peer one connection per other. |

Type: `WebRtcOptions`.

### `@weft-js/realtime-webrtc/plugin`

The plugin for `weft.config.ts`, as a default export and as the named export `webrtc`. Import the default, or rename
the named one, so it doesn't clash with the transport of the same name.

## Limits

- Only cursors ride WebRTC. Presence state, `@weft-js/multiplayer`'s relay events and signalling stay on the channel,
  where the server checks them.
- One connection per pair of peers, so cost grows with the square of the room's size. Above `max` (8) the room stays
  on the socket.
- A signal is up to 16384 bytes of JSON (`@weft-js/multiplayer`'s limit), and a frame under 1024 characters.
- It needs a browser. During server rendering nothing is opened.

## Troubleshooting

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| `via` stays `'socket'` on different networks | No STUN, so peers can't find a path. | Add a STUN server to `iceServers`. |
| `via` stays `'socket'` for some users | A strict NAT or firewall blocks direct paths. | Add a TURN server. |
| `via` stays `'socket'` in a big room | More than `max` peers. | Expected: raise `max` only if each browser can hold that many connections. |
| `weft check` stops after `weft add` | A newly added plugin's permissions must be approved. | `weft plugins approve @weft-js/realtime-webrtc`. |

## Related packages

| Package | What it is |
| ------- | ---------- |
| [`@weft-js/multiplayer`](https://www.npmjs.com/package/@weft-js/multiplayer) | Presence, cursors and the relay that this transport carries cursors for. |
| [`@weft-js/realtime-livekit`](https://www.npmjs.com/package/@weft-js/realtime-livekit) | Cursors over a LiveKit room, which also carries audio and video. |
| [`@weft-js/realtime-socketio`](https://www.npmjs.com/package/@weft-js/realtime-socketio) | Cursors through a Socket.IO relay you run. |
| [`@weft-js/realtime-redis`](https://www.npmjs.com/package/@weft-js/realtime-redis) | A `realtime.bus` over Redis: how server instances reach each other, not a cursor transport. |
| [`@weft-js/realtime-nats`](https://www.npmjs.com/package/@weft-js/realtime-nats) | A `realtime.bus` over NATS. |
| [`@weft-js/realtime-durable-object`](https://www.npmjs.com/package/@weft-js/realtime-durable-object) | A `realtime.bus` on Cloudflare Durable Objects. |
| [`@weft-js/core`](https://www.npmjs.com/package/@weft-js/core) | The compiler and reactive runtime, the Vite plugin, the plugin system and test utilities. |
| [`@weft-js/start`](https://www.npmjs.com/package/@weft-js/start) | The full-stack runtime: routes, server functions, `channel`, `realtime()` and the realtime hub. |

## Contributing

See [CONTRIBUTING.md](https://github.com/Ravonus/weft/blob/main/CONTRIBUTING.md). From the repository,
`pnpm --filter @weft-js/realtime-webrtc test` runs what holds without a browser. `RTCPeerConnection` needs one, so the
real check is `@weft-js/multiplayer`'s end-to-end test with `--via webrtc`, which runs two Chromium contexts in one
room.

## License

[MIT](https://github.com/Ravonus/weft/blob/main/LICENSE)
