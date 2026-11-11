<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">Kerf packages</h1>

<p align="center">
  <strong>Every package in this workspace, what it does, and where to get it.</strong><br>
  Twenty are published to npm under the <code>@kerf-js</code> scope; <code>@kerf-js/scroll</code> goes out with the next release.
</p>

<p align="center">
  <a href="#framework">Framework</a> ·
  <a href="#add-ons">Add-ons</a> ·
  <a href="https://github.com/Ravonus/kerf/tree/main/docs">Docs</a> ·
  <a href="https://github.com/Ravonus/kerf/blob/main/CONTRIBUTING.md">Contributing</a> ·
  <a href="https://github.com/Ravonus/kerf/blob/main/CHANGELOG.md">Changelog</a>
</p>

Each folder here is one package in the pnpm workspace (`pnpm-workspace.yaml`), named `@kerf-js/<folder>`. Every
package is published on npm; the Package column links to its npm page and the Source column to its folder.

## Framework

An app made with `npm create kerf` already has the ones it needs.

| Package | What it is | Status | Source |
| --- | --- | --- | --- |
| [`@kerf-js/core`](https://www.npmjs.com/package/@kerf-js/core) | The fine-grained reactive TSX framework: runtime, compiler binding, Vite plugin and test utilities. | Published on npm | [core/](https://github.com/Ravonus/kerf/tree/main/packages/core) |
| [`@kerf-js/start`](https://www.npmjs.com/package/@kerf-js/start) | The full-stack layer: file routes, server functions, streaming SSR, a database, auth and realtime. | Published on npm | [start/](https://github.com/Ravonus/kerf/tree/main/packages/start) |
| [`@kerf-js/cli`](https://www.npmjs.com/package/@kerf-js/cli) | The `kerf` command: dev, build, check, deploy, docs, the agent layer and the MCP server. | Published on npm | [cli/](https://github.com/Ravonus/kerf/tree/main/packages/cli) |
| [`create-kerf`](https://www.npmjs.com/package/create-kerf) | The app scaffolder behind `npm create kerf`. | Published on npm | [create/](https://github.com/Ravonus/kerf/tree/main/packages/create-kerf) |
| [`@kerf-js/db`](https://www.npmjs.com/package/@kerf-js/db) | Data layers and list sources, each driver an optional peer loaded by its own subpath. | Published on npm | [db/](https://github.com/Ravonus/kerf/tree/main/packages/db) |
| [`@kerf-js/veneer`](https://www.npmjs.com/package/@kerf-js/veneer) | Veneer, the UI toolkit for Kerf: components over `@kerf-js/veneer-core`. | Published on npm | [veneer/](https://github.com/Ravonus/kerf/tree/main/packages/veneer) |
| [`@kerf-js/veneer-core`](https://www.npmjs.com/package/@kerf-js/veneer-core) | Veneer's tokens, CSS and framework-agnostic behaviour. | Published on npm | [veneer-core/](https://github.com/Ravonus/kerf/tree/main/packages/veneer-core) |
| [`@kerf-js/veneer-icons`](https://www.npmjs.com/package/@kerf-js/veneer-icons) | Icons for Veneer and Kerf. | Published on npm | [veneer-icons/](https://github.com/Ravonus/kerf/tree/main/packages/veneer-icons) |

## Add-ons

Install one with your package manager, or with `npx kerf add <name>`, which also adds its plugin to `kerf.config.ts`
where it has one.

### Realtime

| Package | What it is | Status | Source |
| --- | --- | --- | --- |
| [`@kerf-js/realtime-redis`](https://www.npmjs.com/package/@kerf-js/realtime-redis) | The `realtime.bus` provider on Redis pub/sub, at `REDIS_URL`, so live data reaches every instance. | Published on npm | [realtime-redis/](https://github.com/Ravonus/kerf/tree/main/packages/realtime-redis) |
| [`@kerf-js/realtime-nats`](https://www.npmjs.com/package/@kerf-js/realtime-nats) | The `realtime.bus` provider on core NATS, at `NATS_URL`. | Published on npm | [realtime-nats/](https://github.com/Ravonus/kerf/tree/main/packages/realtime-nats) |
| [`@kerf-js/realtime-durable-object`](https://www.npmjs.com/package/@kerf-js/realtime-durable-object) | The realtime bus on Cloudflare: a Durable Object per channel, for the `cloudflare_durable` preset. | Published on npm | [realtime-durable-object/](https://github.com/Ravonus/kerf/tree/main/packages/realtime-durable-object) |
| [`@kerf-js/multiplayer`](https://www.npmjs.com/package/@kerf-js/multiplayer) | Presence, cursors anchored to elements, a typed interaction relay and synced scroll on `channel`. A library, not a plugin. | Published on npm | [multiplayer/](https://github.com/Ravonus/kerf/tree/main/packages/multiplayer) |
| [`@kerf-js/realtime-livekit`](https://www.npmjs.com/package/@kerf-js/realtime-livekit) | A `@kerf-js/multiplayer` transport: cursors over a LiveKit room, with the token signed by the room. | Published on npm | [realtime-livekit/](https://github.com/Ravonus/kerf/tree/main/packages/realtime-livekit) |
| [`@kerf-js/realtime-socketio`](https://www.npmjs.com/package/@kerf-js/realtime-socketio) | A `@kerf-js/multiplayer` transport: cursors through a Socket.IO relay you run, with tickets the room signs. | Published on npm | [realtime-socketio/](https://github.com/Ravonus/kerf/tree/main/packages/realtime-socketio) |
| [`@kerf-js/realtime-webrtc`](https://www.npmjs.com/package/@kerf-js/realtime-webrtc) | A `@kerf-js/multiplayer` transport: cursors over WebRTC data channels, signalled through the room. | Published on npm | [realtime-webrtc/](https://github.com/Ravonus/kerf/tree/main/packages/realtime-webrtc) |

### Media, text and rendering

| Package | What it is | Status | Source |
| --- | --- | --- | --- |
| [`@kerf-js/text`](https://www.npmjs.com/package/@kerf-js/text) | Fonts for the build (subsets, matched fallbacks) and exact line breaking in the browser, on Pretext by Cheng Lou. | Published on npm | [text/](https://github.com/Ravonus/kerf/tree/main/packages/text) |
| [`@kerf-js/media`](https://www.npmjs.com/package/@kerf-js/media) | Image encoding at build time (sharp and SVGO: AVIF with a fallback, a quality search, width ladders, placeholders), the upload route, and checks M001–M019. | Published on npm | [plugin-media/](https://github.com/Ravonus/kerf/tree/main/packages/media) |
| [`@kerf-js/media-ffmpeg`](https://www.npmjs.com/package/@kerf-js/media-ffmpeg) | Video and audio encoding (AV1, VP9, HEVC, H.264, Opus, AAC) through an ffmpeg you install. | Published on npm | [plugin-media-ffmpeg/](https://github.com/Ravonus/kerf/tree/main/packages/media-ffmpeg) |
| [`@kerf-js/keel-pixel`](https://www.npmjs.com/package/@kerf-js/keel-pixel) | The `keel-pixel` surface kind: KEEL's WebGL2 pixel renderer and theme recipes. | Published on npm | [plugin-surface-keel/](https://github.com/Ravonus/kerf/tree/main/packages/keel-pixel) |
| [`@kerf-js/keel`](https://www.npmjs.com/package/@kerf-js/keel) | KEEL generation: the `keel-lit` surface kind and generators for trees, looks, light and music. | Not published yet | [plugin-keel/](https://github.com/Ravonus/kerf/tree/main/packages/keel) |
| [`@kerf-js/capture`](https://www.npmjs.com/package/@kerf-js/capture) | Dev only: stills at scroll stops, frame times and contact sheets from headless Chrome on the GPU, and the bake that renders a scene stage's posters. | Not published yet | [capture/](https://github.com/Ravonus/kerf/tree/main/packages/capture) |
| [`@kerf-js/scroll`](https://www.npmjs.com/package/@kerf-js/scroll) | Custom scrollbars in the DOM or on a canvas, over the browser's scrolling (on the compositor) or a JavaScript engine. | Next release | [scroll/](https://github.com/Ravonus/kerf/tree/main/packages/scroll) |

### Payments

| Package | What it is | Status | Source |
| --- | --- | --- | --- |
| [`@kerf-js/agent`](https://www.npmjs.com/package/@kerf-js/agent) | An assistant that runs the app: server functions opt in as tools, grants per role and token, conversations, usage, MCP, and bridges to Claude, the Claude CLI or a Rust planner. | New | [agent/](https://github.com/Ravonus/kerf/tree/main/packages/agent) |
| [`@kerf-js/pay`](https://www.npmjs.com/package/@kerf-js/pay) | Products, one ledger for every payment rail, and entitlements, with a Stripe rail. Kerf's reference plugin: read it to build your own. | Published on npm | [pay/](https://github.com/Ravonus/kerf/tree/main/packages/pay) |

## Working on a package

```bash
pnpm run setup                        # once, from the repo root
pnpm --filter @kerf-js/<name> test    # one package's tests
pnpm run check                        # everything CI runs
```

[CONTRIBUTING.md](https://github.com/Ravonus/kerf/blob/main/CONTRIBUTING.md) has the rules, and [docs/RELEASING.md](https://github.com/Ravonus/kerf/blob/main/docs/RELEASING.md) how a release is
made.

## License

Every package is [MIT](https://github.com/Ravonus/kerf/blob/main/LICENSE). `@kerf-js/text` includes Pretext (MIT), and `@kerf-js/keel-pixel` vendors
KEEL code under the terms in its [`vendor/README.md`](https://github.com/Ravonus/kerf/blob/main/packages/keel-pixel/vendor/README.md).
