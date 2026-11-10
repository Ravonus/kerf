<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">Weft</h1>

<p align="center">
  <strong>A fine-grained reactive TSX framework, built so coding agents write it right the first time.</strong><br>
  Components run once, state is a box, and the compiler explains every mistake with a code, a reason and a fix.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@weft-js/core"><img src="https://img.shields.io/npm/v/@weft-js/core?color=145c3c&label=npm" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <a href="https://github.com/Ravonus/weft/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ravonus/weft/quality.yml?branch=main&label=checks" alt="checks"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D26-145c3c" alt="Node 26 or later">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="site/content/learn">Docs</a> ·
  <a href="examples">Examples</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/Ravonus/weft">GitHub</a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** The packages are on npm and work end to end, and APIs can still change between minor
> versions.

A Weft component is plain TSX, and its body runs once. State is a box you read and write through `.value`, anything
computed from it is `derived`, and the JSX stays live. There are no hooks, no dependency arrays and no re-renders to
reason about. The mistakes agents and people tend to make come back from Weft's own compiler as diagnostics with a code,
a reason and a fix. The compiler is written in Rust on [Oxc](https://oxc.rs), and you never need Rust to use it.

Weft comes with a full stack (file routes, server functions, streaming SSR, a database, auth and live data) and with
**Warp**, a UI toolkit of more than a hundred accessible components that you theme from one config.

## Highlights

- **Run-once components.** When state changes, only the text, attribute or list row that reads it updates. Nothing
  diffs and no component runs again.
- **A compiler that explains.** `weft check` reports reactivity, design, metadata and deploy mistakes as codes with a
  fix, and `weft fix` applies the safe ones.
- **Agent tooling in the box.** `weft agents-md`, `weft docs`, an MCP server, a browser driver for the running app, and
  a test gate that checks new tests against mutants.
- **A full stack.** File routes, typed `query` and `mutation` server functions, streaming SSR, forms without
  JavaScript, a database, auth and live data.
- **Warp.** More than a hundred components with keyboard support, screen-reader names and a contrast check, themed from
  one `warp()` config.
- **Small.** Hello world is 1.60 KB of brotli, and the whole runtime is 13.37 KB.
- **Runs anywhere.** Node, Bun or Deno, and `weft deploy` to Netlify, Vercel, Cloudflare, Fly or Render.

## Contents

- [Quick start](#quick-start)
- [A component](#a-component)
- [Why Weft: the compiler tells you what's wrong](#why-weft-the-compiler-tells-you-whats-wrong)
- [Feature tour](#feature-tour)
- [Packages](#packages)
- [Platform support](#platform-support)
- [Performance](#performance)
- [Docs](#docs)
- [In this repo](#in-this-repo)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Quick start

```bash
npm create @weft-js my-app
```

```bash
pnpm create @weft-js my-app
```

```bash
bun create @weft-js my-app
```

```bash
deno run -A npm:@weft-js/create my-app
```

It asks what it needs (UI kit, database, auth, runtime), or takes `--yes` for the defaults: Warp, SQLite through
Drizzle, and sign-in with Better Auth. Then:

```bash
cd my-app
npx weft db generate   # the first migration
npx weft dev
```

You need Node 26, or Bun or Deno in its place. [`@weft-js/create`](packages/create) lists every flag and template, and
[Installation](site/content/learn/installation.md) walks through every file in a new app.

## A component

```tsx
import { derived, state } from '@weft-js/core'

export default function Counter() {
  const count = state(0)
  const doubled = derived(() => count.value * 2)
  return (
    <button type="button" onClick={() => count.value++}>
      Clicked {count.value} times, doubled {doubled.value}
    </button>
  )
}
```

`Counter` runs once. When `count` changes, only the text that reads it updates: no diffing and no component re-run.

The server side is a function in `src/server/`. The client gets a stub that calls it, typed end to end:

```ts
// src/server/greeting.ts
import { query } from '@weft-js/start'

export const greeting = query({
  run: () => `Hello at ${new Date().toISOString()}`,
})
```

```tsx
// src/routes/hello.tsx
import { greeting } from '#/server/greeting'

export default function Hello() {
  const text = greeting()
  return <p>{text.value ?? 'Loading…'}</p>
}
```

Calling the query gives a `Resource`, a box that fills when the data arrives. `npx weft dev` serves the page at `/hello`.

## Why Weft: the compiler tells you what's wrong

Fine-grained reactivity is fast, and easy to get subtly wrong: read a prop once and it never updates, or render the box
instead of its value. Weft's answer is a compiler that knows these rules and says so, in a form both people and agents
can act on.

`npx weft check` compiles every component in check mode. Write the two most common mistakes and it says:

```text
src/routes/counter.tsx:5:17  W001 error
  `props` is read once when the component is set up,
  so this never updates.
  fix: wrap it in `derived(() => …)`, move it into
  `watch`, or use `untrack()` for a snapshot. (autofix)
src/routes/counter.tsx:8:8  W015 error
  `count` is a box; JSX needs its value.
  fix: Read `count.value`. (autofix)
```

(Shortened to fit here: each diagnostic prints on one line, with its fix under it.)

| For | What there is |
|---|---|
| Fixing | `npx weft fix` applies the safe fixes. Each fix says whether it's safe, and carries its edits |
| Learning | Every code has a page: `npx weft docs W001`. It says whether the installed Weft reports it |
| Tools | `--json` gives the same result on stdout, with 1-based spans, UTF-16 offsets and related locations |
| Agents | `weft agents-md` writes an `AGENTS.md` for the installed version, and `weft mcp` serves the CLI as MCP tools |
| Verifying | `weft browser` drives the running app; `weft test --gate` checks that new tests fail before the change and kill mutants |

Codes cover reactivity (W), state (S), plugins (P), design (D), page metadata (H), server functions and realtime (Q, R),
tests (T), deploys (E) and built pages (L). The 0.1.2 compiler added codes for the mistakes agents make most: state
written inside `derived`, a `watch` that only copies a value, reactive reads in async callbacks, early returns from
component setup, numeric `&&` in JSX, and more ([CHANGELOG](CHANGELOG.md)).

## Feature tour

### Core: `@weft-js/core`

- **Reactivity.** `state`, `derived`, `watch`, `untrack`, `batch` and `context`, with `resource` and `<Boundary>` for
  async. Keyed lists move rows instead of rebuilding them.
- **State that outlives a page.** `defineState` adds persistence, cross-tab sync and undo history as options.
- **Testing.** `@weft-js/core/test` has `render`, `screen`, `user`, `flush` and a clock, and reports T-codes after
  each test.
- **More entries.** Canvas and WebGL as layout children (`/surface`), style groups (`/style`), browser state such as
  online and visibility (`/browser`), hover and press as state (`/interaction`), and SSR (`/ssr`).
- **The Vite plugin.** `@weft-js/core/vite` compiles `.tsx` for client and server, and drops CSS nothing can reach.

### Start: `@weft-js/start`

- **Pages from files** in `src/routes`, with layouts, `load`, `notFound()`, `redirect()` and `meta` for titles and
  share cards.
- **Server functions.** `query` and `mutation` validate input with a schema, run with `ctx` (the request, the user, the
  database) and come back typed. Mutations name the tags they invalidate, and `optimistic` updates the page first.
- **Streaming SSR and islands**, forms that work without JavaScript, and view transitions.
- **Data and auth.** Drizzle, Prisma or plain SQL on SQLite, Postgres or MySQL, with migrations from
  `weft db generate`. Sign-in through Better Auth, or your own.
- **Live data.** A page that reads a table updates when another user changes it, from the database's change feed.
- **Rust when you want it.** [Server functions in Rust](site/content/learn/rust.md), in process with `native()` or as a
  sidecar with `remote()`.

### Warp: `@weft-js/warp`

- **Components.** Forms, overlays, menus, data grids, charts, toasts, a command palette and more. Each has keyboard
  support, screen-reader names and a contrast check.
- **One config.** `warp({ seed, colors, parts, tokens, dials })` re-themes the app. Tokens follow the theme, density and
  an expression dial (quiet, balanced, vivid).
- **The Theme studio** on the docs site tries a theme on real components and writes the config for you.
- **Icons.** [`@weft-js/warp-icons`](packages/warp-icons) has 651 icons in three expression tiers, each hollow or solid.
- **No framework needed underneath.** [`@weft-js/warp-core`](packages/warp-core) holds Warp's behavior, tokens and
  CSS, with no framework.

### The compiler: `crates/weft-compiler`

- **Rust on Oxc**, shipped as a native addon for seven platforms and as WebAssembly for the rest.
- **One output.** The addon and the WASM build are held to the same output and diagnostics by a parity test.
- **Check mode** powers `weft check`, `weft fix` and the MCP `check` tool.

## Packages

Every package is released together, at one version.

### Framework

| Package | Version | What it is |
|---|---|---|
| [`@weft-js/core`](packages/core) | [![npm](https://img.shields.io/npm/v/@weft-js/core?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/core) | The runtime, the compiler binding, the Vite plugin, SSR and test utilities |
| [`@weft-js/start`](packages/start) | [![npm](https://img.shields.io/npm/v/@weft-js/start?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/start) | The full stack: file routes, server functions, SSR, a database, auth and live data |
| [`@weft-js/cli`](packages/cli) | [![npm](https://img.shields.io/npm/v/@weft-js/cli?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/cli) | The `weft` command: `dev`, `build`, `check`, `deploy`, `docs`, the MCP server and more |
| [`@weft-js/create`](packages/create) | [![npm](https://img.shields.io/npm/v/@weft-js/create?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/create) | `npm create @weft-js`: a new app, with templates |
| [`@weft-js/db`](packages/db) | [![npm](https://img.shields.io/npm/v/@weft-js/db?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/db) | Prisma and native SQL layers, and list sources, for `@weft-js/start` |
| [`@weft-js/warp`](packages/warp) | [![npm](https://img.shields.io/npm/v/@weft-js/warp?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/warp) | Warp's components, and the `warp()` theming plugin |
| [`@weft-js/warp-core`](packages/warp-core) | [![npm](https://img.shields.io/npm/v/@weft-js/warp-core?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/warp-core) | Warp's behavior, tokens and CSS, with no framework |
| [`@weft-js/warp-icons`](packages/warp-icons) | [![npm](https://img.shields.io/npm/v/@weft-js/warp-icons?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/warp-icons) | 651 icons in three expression tiers, each hollow or solid |

The release also publishes `@weft-js/compiler-<platform>`, the native compiler addons that core picks from
`optionalDependencies` ([below](#platform-support)). You never install those yourself.

### Add-ons

`npx weft add <name>` installs one and registers its plugin, where it has one. Each is released with the framework, at the same version.

| Package | Version | What it is |
|---|---|---|
| [`@weft-js/text`](packages/text) | [![npm](https://img.shields.io/npm/v/@weft-js/text?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/text) | Fonts for the build (subsets, matched fallbacks) and exact line breaking in the browser |
| [`@weft-js/pay`](packages/pay) | [![npm](https://img.shields.io/npm/v/@weft-js/pay?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/pay) | Products, one ledger for every payment rail, and entitlements, with Stripe |
| [`@weft-js/multiplayer`](packages/multiplayer) | [![npm](https://img.shields.io/npm/v/@weft-js/multiplayer?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/multiplayer) | Presence, cursors anchored to elements, a typed interaction relay and synced scroll |
| [`@weft-js/plugin-media`](packages/plugin-media) | [![npm](https://img.shields.io/npm/v/@weft-js/plugin-media?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/plugin-media) | Image builds (AVIF plus a fallback, quality search, width ladders, placeholders) and a media route |
| [`@weft-js/plugin-media-ffmpeg`](packages/plugin-media-ffmpeg) | [![npm](https://img.shields.io/npm/v/@weft-js/plugin-media-ffmpeg?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/plugin-media-ffmpeg) | Video and audio encoding (AV1, VP9, HEVC, H.264, Opus, AAC) through your ffmpeg |
| [`@weft-js/plugin-surface-keel`](packages/plugin-surface-keel) | [![npm](https://img.shields.io/npm/v/@weft-js/plugin-surface-keel?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/plugin-surface-keel) | The `keel-pixel` surface kind: KEEL's WebGL2 pixel renderer and theme recipes |
| [`@weft-js/realtime-redis`](packages/realtime-redis) | [![npm](https://img.shields.io/npm/v/@weft-js/realtime-redis?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/realtime-redis) | The realtime bus on Redis pub/sub |
| [`@weft-js/realtime-nats`](packages/realtime-nats) | [![npm](https://img.shields.io/npm/v/@weft-js/realtime-nats?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/realtime-nats) | The realtime bus on core NATS |
| [`@weft-js/realtime-durable-object`](packages/realtime-durable-object) | [![npm](https://img.shields.io/npm/v/@weft-js/realtime-durable-object?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/realtime-durable-object) | The realtime bus on a Cloudflare Durable Object |
| [`@weft-js/realtime-livekit`](packages/realtime-livekit) | [![npm](https://img.shields.io/npm/v/@weft-js/realtime-livekit?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/realtime-livekit) | Cursors over a LiveKit room |
| [`@weft-js/realtime-socketio`](packages/realtime-socketio) | [![npm](https://img.shields.io/npm/v/@weft-js/realtime-socketio?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/realtime-socketio) | Cursors through a Socket.IO relay you run |
| [`@weft-js/realtime-webrtc`](packages/realtime-webrtc) | [![npm](https://img.shields.io/npm/v/@weft-js/realtime-webrtc?color=145c3c&label=)](https://www.npmjs.com/package/@weft-js/realtime-webrtc) | Cursors over WebRTC data channels, signalled through the room |

[packages/README.md](packages/README.md) lists every package with its source and status.

## Platform support

| Runs on | Notes |
|---|---|
| Node | 26 or later |
| Bun, Deno | In place of Node. `weft build --runtime bun\|deno` builds for them, and `weft start` runs the build on them |
| Hosts | `weft deploy` ships to Netlify, Vercel, Cloudflare, Fly and Render. `weft deploy hosts` says which ones can run your app, and why not |

The compiler comes two ways. An install picks by itself, and `npx weft doctor` says which one an app is using.

| Platform | Compiler |
|---|---|
| macOS, Apple silicon and Intel | Native addon |
| Linux x64 and arm64, glibc and musl | Native addon |
| Windows x64 | Native addon |
| Everywhere else | WebAssembly |

The WASM build gives the same output as the addon; the addon only adds speed. A native compiler that is missing, a
different version or fails to load falls back to WASM by itself. Rust is never needed to use Weft.

## Performance

### Size

Brotli sizes, as `node packages/core/scripts/size.mjs` reports them:

| What | Brotli |
|---|---|
| Hello world | 1.60 KB |
| The `@weft-js/core` entry | 5.63 KB |
| The whole runtime, every export | 13.37 KB |

An app built with Warp has a ceiling of 50 KB of JavaScript and CSS, which
[`evals/gates/warp-exit.mjs`](evals/gates/warp-exit.mjs) checks.

### The same dashboard, every stack

[`benchmarks/compare`](benchmarks/compare) builds the same dashboard on each stack: a shell with a sidebar, an account
menu and a drawer, and a 200-row table with sorting, filtering, selection, paging and a live cell. Four stacks share
one hand-written stylesheet, so they compare frameworks. The latest run, 2026-11-06, on one Mac, from
[`results.json`](benchmarks/compare/results.json):

| Same CSS | JS (brotli) | App source | First paint |
|---|---|---|---|
| Weft, no Warp | 7.1 KB | 318 lines | 100 ms |
| Solid + Kobalte + TanStack | 47.4 KB | 330 lines | 152 ms |
| React + Radix + TanStack | 98.3 KB | 309 lines | 216 ms |
| React + Zustand + TanStack | 98.4 KB | 317 lines | 212 ms |

Warp and MUI each bring a design system, so they compare as kits:

| Own design system | JS (brotli) | CSS (brotli) | App source | First paint |
|---|---|---|---|---|
| Weft + Warp | 28.9 KB | 22.1 KB | 72 lines | 208 ms |
| React + MUI | 239.6 KB | in the JS | 177 lines | 516 ms |

First paint is the median of five fresh Chromium contexts at 1280 x 800 with 4x CPU throttling. It doesn't establish
device performance. [The method](benchmarks/compare/README.md) has the measurement, what each stack leaves out, and the
history in [`evals/results/compare-history.jsonl`](evals/results/compare-history.jsonl).

### One brief, built by an agent

The same run audits apps a fresh agent built from one brief, three screens on each stack in its usual kit. Weft + Warp
had 0 axe violations, against 14 for Solid + Kobalte, 0 for React + Radix, 32 for React + Zustand, 17 for React +
MUI, and 6 for Weft on raw Tailwind. The audit reads the page in Chromium, so it can't see whether a page looks good. See
[One brief, built by an agent](benchmarks/compare/README.md#one-brief-built-by-an-agent).

[`benchmarks/speed`](benchmarks/speed) has the row and reactive benchmarks, and
[`benchmarks/js-framework-benchmark`](benchmarks/js-framework-benchmark) the keyed entry.

## Docs

| Where | What's there |
|---|---|
| [Learn](site/content/learn) | The tutorial, from your first component to deploying |
| [Reference](packages/cli/docs) | Every API, command and config key. An app gets the same pages with `npx weft docs` |
| [docs/](docs/README.md) | Working on Weft, and the design notes and decisions behind it |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each release |

Each package's README covers its own API: start with [`@weft-js/core`](packages/core),
[`@weft-js/start`](packages/start) and [`@weft-js/cli`](packages/cli).

## In this repo

| Folder | What's there |
|---|---|
| [`packages/`](packages) | Every npm package |
| [`crates/`](crates) | The compiler (`weft-compiler`), layout (`weft-layout`) and the Rust server-function support (`weft`) |
| [`site/`](site) | The docs site, built with Weft and Warp: Learn, Reference, the component pages and the Theme studio |
| [`benchmarks/`](benchmarks) | The dashboard comparison, row and reactive benchmarks, and the js-framework-benchmark entry |
| [`examples/`](examples) | Real apps on each stack, and the tool that compares them |
| [`evals/`](evals) | Apps that agents build with Weft, the gates that score them, and the comparison history |
| [`docs/`](docs) | Contributor docs, Warp's design spec and decision records |
| [`scripts/`](scripts) | Setup, the one `check` command, quality rules and the release |
| [`patches/`](patches) | Patches the workspace applies to dependencies |

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) has the setup and the one command to run before a change goes in:

```bash
pnpm run setup   # one install for every package, then the compiler
pnpm run check   # every rule and every test
```

Working on Weft needs Node 26 and [Rust](https://rustup.rs); using it needs neither Rust nor this repo. The workspace
uses pnpm. To use your checkout in an app of your own, see [Using a Weft checkout](docs/getting-started.md).

## Security

Report security problems privately, through GitHub's private advisories, as [SECURITY.md](.github/SECURITY.md) says.
Don't open a public issue for them. Only the latest published version of each `@weft-js/*` package gets security fixes.

## License

[MIT](LICENSE).
