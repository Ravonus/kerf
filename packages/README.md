<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">Weft packages</h1>

<p align="center">
  <strong>Every package in this workspace, what it does, and where to get it.</strong><br>
  Twenty are published to npm under the <code>@weft-js</code> scope; <code>@weft-js/scroll</code> goes out with the next release.
</p>

<p align="center">
  <a href="#framework">Framework</a> ·
  <a href="#add-ons">Add-ons</a> ·
  <a href="https://github.com/Ravonus/weft/tree/main/docs">Docs</a> ·
  <a href="https://github.com/Ravonus/weft/blob/main/CONTRIBUTING.md">Contributing</a> ·
  <a href="https://github.com/Ravonus/weft/blob/main/CHANGELOG.md">Changelog</a>
</p>

Each folder here is one package in the pnpm workspace (`pnpm-workspace.yaml`), named `@weft-js/<folder>`. Every
package is published on npm; the Package column links to its npm page and the Source column to its folder.

## Framework

An app made with `npm create @weft-js` already has the ones it needs.

| Package | What it is | Status | Source |
| --- | --- | --- | --- |
| [`@weft-js/core`](https://www.npmjs.com/package/@weft-js/core) | The fine-grained reactive TSX framework: runtime, compiler binding, Vite plugin and test utilities. | Published on npm | [core/](https://github.com/Ravonus/weft/tree/main/packages/core) |
| [`@weft-js/start`](https://www.npmjs.com/package/@weft-js/start) | The full-stack layer: file routes, server functions, streaming SSR, a database, auth and realtime. | Published on npm | [start/](https://github.com/Ravonus/weft/tree/main/packages/start) |
| [`@weft-js/cli`](https://www.npmjs.com/package/@weft-js/cli) | The `weft` command: dev, build, check, deploy, docs, the agent layer and the MCP server. | Published on npm | [cli/](https://github.com/Ravonus/weft/tree/main/packages/cli) |
| [`@weft-js/create`](https://www.npmjs.com/package/@weft-js/create) | The app scaffolder behind `npm create @weft-js`. | Published on npm | [create/](https://github.com/Ravonus/weft/tree/main/packages/create) |
| [`@weft-js/db`](https://www.npmjs.com/package/@weft-js/db) | Data layers and list sources, each driver an optional peer loaded by its own subpath. | Published on npm | [db/](https://github.com/Ravonus/weft/tree/main/packages/db) |
| [`@weft-js/warp`](https://www.npmjs.com/package/@weft-js/warp) | Warp, the UI toolkit for Weft: components over `@weft-js/warp-core`. | Published on npm | [warp/](https://github.com/Ravonus/weft/tree/main/packages/warp) |
| [`@weft-js/warp-core`](https://www.npmjs.com/package/@weft-js/warp-core) | Warp's tokens, CSS and framework-agnostic behaviour. | Published on npm | [warp-core/](https://github.com/Ravonus/weft/tree/main/packages/warp-core) |
| [`@weft-js/warp-icons`](https://www.npmjs.com/package/@weft-js/warp-icons) | Icons for Warp and Weft. | Published on npm | [warp-icons/](https://github.com/Ravonus/weft/tree/main/packages/warp-icons) |

## Add-ons

Install one with your package manager, or with `npx weft add <name>`, which also adds its plugin to `weft.config.ts`
where it has one.

### Realtime

| Package | What it is | Status | Source |
| --- | --- | --- | --- |
| [`@weft-js/realtime-redis`](https://www.npmjs.com/package/@weft-js/realtime-redis) | The `realtime.bus` provider on Redis pub/sub, at `REDIS_URL`, so live data reaches every instance. | Published on npm | [realtime-redis/](https://github.com/Ravonus/weft/tree/main/packages/realtime-redis) |
| [`@weft-js/realtime-nats`](https://www.npmjs.com/package/@weft-js/realtime-nats) | The `realtime.bus` provider on core NATS, at `NATS_URL`. | Published on npm | [realtime-nats/](https://github.com/Ravonus/weft/tree/main/packages/realtime-nats) |
| [`@weft-js/realtime-durable-object`](https://www.npmjs.com/package/@weft-js/realtime-durable-object) | The realtime bus on Cloudflare: a Durable Object per channel, for the `cloudflare_durable` preset. | Published on npm | [realtime-durable-object/](https://github.com/Ravonus/weft/tree/main/packages/realtime-durable-object) |
| [`@weft-js/multiplayer`](https://www.npmjs.com/package/@weft-js/multiplayer) | Presence, cursors anchored to elements, a typed interaction relay and synced scroll on `channel`. A library, not a plugin. | Published on npm | [multiplayer/](https://github.com/Ravonus/weft/tree/main/packages/multiplayer) |
| [`@weft-js/realtime-livekit`](https://www.npmjs.com/package/@weft-js/realtime-livekit) | A `@weft-js/multiplayer` transport: cursors over a LiveKit room, with the token signed by the room. | Published on npm | [realtime-livekit/](https://github.com/Ravonus/weft/tree/main/packages/realtime-livekit) |
| [`@weft-js/realtime-socketio`](https://www.npmjs.com/package/@weft-js/realtime-socketio) | A `@weft-js/multiplayer` transport: cursors through a Socket.IO relay you run, with tickets the room signs. | Published on npm | [realtime-socketio/](https://github.com/Ravonus/weft/tree/main/packages/realtime-socketio) |
| [`@weft-js/realtime-webrtc`](https://www.npmjs.com/package/@weft-js/realtime-webrtc) | A `@weft-js/multiplayer` transport: cursors over WebRTC data channels, signalled through the room. | Published on npm | [realtime-webrtc/](https://github.com/Ravonus/weft/tree/main/packages/realtime-webrtc) |

### Media, text and rendering

| Package | What it is | Status | Source |
| --- | --- | --- | --- |
| [`@weft-js/text`](https://www.npmjs.com/package/@weft-js/text) | Fonts for the build (subsets, matched fallbacks) and exact line breaking in the browser, on Pretext by Cheng Lou. | Published on npm | [text/](https://github.com/Ravonus/weft/tree/main/packages/text) |
| [`@weft-js/plugin-media`](https://www.npmjs.com/package/@weft-js/plugin-media) | Image encoding at build time (sharp and SVGO: AVIF with a fallback, a quality search, width ladders, placeholders), the upload route, and checks M001–M019. | Published on npm | [plugin-media/](https://github.com/Ravonus/weft/tree/main/packages/plugin-media) |
| [`@weft-js/plugin-media-ffmpeg`](https://www.npmjs.com/package/@weft-js/plugin-media-ffmpeg) | Video and audio encoding (AV1, VP9, HEVC, H.264, Opus, AAC) through an ffmpeg you install. | Published on npm | [plugin-media-ffmpeg/](https://github.com/Ravonus/weft/tree/main/packages/plugin-media-ffmpeg) |
| [`@weft-js/plugin-surface-keel`](https://www.npmjs.com/package/@weft-js/plugin-surface-keel) | The `keel-pixel` surface kind: KEEL's WebGL2 pixel renderer and theme recipes. | Published on npm | [plugin-surface-keel/](https://github.com/Ravonus/weft/tree/main/packages/plugin-surface-keel) |
| [`@weft-js/scroll`](https://www.npmjs.com/package/@weft-js/scroll) | Scrolling run in JavaScript: native-feeling wheel, touch, keys and focus, with bars drawn in the DOM or on a canvas. | Next release | [scroll/](https://github.com/Ravonus/weft/tree/main/packages/scroll) |

### Payments

| Package | What it is | Status | Source |
| --- | --- | --- | --- |
| [`@weft-js/pay`](https://www.npmjs.com/package/@weft-js/pay) | Products, one ledger for every payment rail, and entitlements, with a Stripe rail. Weft's reference plugin: read it to build your own. | Published on npm | [pay/](https://github.com/Ravonus/weft/tree/main/packages/pay) |

## Working on a package

```bash
pnpm run setup                        # once, from the repo root
pnpm --filter @weft-js/<name> test    # one package's tests
pnpm run check                        # everything CI runs
```

[CONTRIBUTING.md](https://github.com/Ravonus/weft/blob/main/CONTRIBUTING.md) has the rules, and [docs/RELEASING.md](https://github.com/Ravonus/weft/blob/main/docs/RELEASING.md) how a release is
made.

## License

Every package is [MIT](https://github.com/Ravonus/weft/blob/main/LICENSE). `@weft-js/text` includes Pretext (MIT), and `@weft-js/plugin-surface-keel` vendors
KEEL code under the terms in its [`vendor/README.md`](https://github.com/Ravonus/weft/blob/main/packages/plugin-surface-keel/vendor/README.md).
