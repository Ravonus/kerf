<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">Kerf</h1>

<p align="center">
  <strong>A fine-grained reactive TSX framework, built so coding agents write it right the first time.</strong><br>
  Components run once, state is a box, and the compiler explains every mistake with a code, a reason and a fix.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@kerf/core"><img src="https://img.shields.io/npm/v/@kerf/core?color=145c3c&label=npm" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <a href="https://github.com/Ravonus/kerf/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ravonus/kerf/quality.yml?branch=main&label=checks" alt="checks"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D24-145c3c" alt="Node 24 or later">
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="site/content/learn">Docs</a> ·
  <a href="examples">Examples</a> ·
  <a href="CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/Ravonus/kerf">GitHub</a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** The packages are on npm and work end to end, and APIs can still change between minor
> versions.

A Kerf component is plain TSX, and its body runs once. State is a box you read and write through `.value`, anything
computed from it is `derived`, and the JSX stays live. There are no hooks, no dependency arrays and no re-renders to
reason about. The mistakes agents and people tend to make come back from Kerf's own compiler as diagnostics with a code,
a reason and a fix. The compiler is written in Rust on [Oxc](https://oxc.rs), and you never need Rust to use it.

Kerf comes with a full stack (file routes, server functions, streaming SSR, a database, auth and live data) and with
**Veneer**, a UI toolkit of more than a hundred accessible components that you theme from one config.

## Highlights

- **Run-once components.** When state changes, only the text, attribute or list row that reads it updates. Nothing
  diffs and no component runs again.
- **A compiler that explains.** `kerf check` reports reactivity, design, metadata and deploy mistakes as codes with a
  fix, and `kerf fix` applies the safe ones.
- **Agent tooling in the box.** `kerf agents-md`, `kerf docs`, an MCP server, a browser driver for the running app, and
  a test gate that checks new tests against mutants.
- **A full stack.** File routes, typed `query` and `mutation` server functions, streaming SSR, forms without
  JavaScript, a database, auth and live data.
- **Veneer.** More than a hundred components with keyboard support, screen-reader names and a contrast check, themed from
  one `veneer()` config.
- **Small.** Hello world is 1.60 KB of brotli, and the whole runtime is 13.37 KB.
- **Runs anywhere.** Node, Bun or Deno, and `kerf deploy` to Netlify, Vercel, Cloudflare, Fly or Render.

## Contents

- [Quick start](#quick-start)
- [A component](#a-component)
- [Why Kerf: the compiler tells you what's wrong](#why-kerf-the-compiler-tells-you-whats-wrong)
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
npm create kerf my-app
```

```bash
pnpm create kerf my-app
```

```bash
bun create kerf my-app
```

```bash
deno run -A npm:create-kerf my-app
```

It asks what it needs (UI kit, database, auth, runtime), or takes `--yes` for the defaults: Veneer, SQLite through
Drizzle, and sign-in with Better Auth. Then:

```bash
cd my-app
npx kerf db generate   # the first migration
npx kerf dev
```

You need Node 24 or later, or Bun or Deno in its place. [`create-kerf`](packages/create-kerf) lists every flag and template, and
[Installation](site/content/learn/installation.md) walks through every file in a new app.

## A component

```tsx
import { derived, state } from '@kerf/core'

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
import { query } from '@kerf/start'

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

Calling the query gives a `Resource`, a box that fills when the data arrives. `npx kerf dev` serves the page at `/hello`.

## Why Kerf: the compiler tells you what's wrong

Fine-grained reactivity is fast, and easy to get subtly wrong: read a prop once and it never updates, or render the box
instead of its value. Kerf's answer is a compiler that knows these rules and says so, in a form both people and agents
can act on.

`npx kerf check` compiles every component in check mode. Write the two most common mistakes and it says:

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
| Fixing | `npx kerf fix` applies the safe fixes. Each fix says whether it's safe, and carries its edits |
| Learning | Every code has a page: `npx kerf docs W001`. It says whether the installed Kerf reports it |
| Tools | `--json` gives the same result on stdout, with 1-based spans, UTF-16 offsets and related locations |
| Agents | `kerf agents-md` writes an `AGENTS.md` for the installed version, and `kerf mcp` serves the CLI as MCP tools |
| Verifying | `kerf browser` drives the running app; `kerf test --gate` checks that new tests fail before the change and kill mutants |

Codes cover reactivity (W), state (S), plugins (P), design (D), page metadata (H), server functions and realtime (Q, R),
tests (T), deploys (E) and built pages (L). The 0.1.2 compiler added codes for the mistakes agents make most: state
written inside `derived`, a `watch` that only copies a value, reactive reads in async callbacks, early returns from
component setup, numeric `&&` in JSX, and more ([CHANGELOG](CHANGELOG.md)).

## Feature tour

### Core: `@kerf/core`

- **Reactivity.** `state`, `derived`, `watch`, `untrack`, `batch` and `context`, with `resource` and `<Boundary>` for
  async. Keyed lists move rows instead of rebuilding them.
- **State that outlives a page.** `defineState` adds persistence, cross-tab sync and undo history as options.
- **Testing.** `@kerf/core/test` has `render`, `screen`, `user`, `flush` and a clock, and reports T-codes after
  each test.
- **More entries.** Canvas and WebGL as layout children (`/surface`), style groups (`/style`), browser state such as
  online and visibility (`/browser`), hover and press as state (`/interaction`), and SSR (`/ssr`).
- **The Vite plugin.** `@kerf/core/vite` compiles `.tsx` for client and server, and drops CSS nothing can reach.

### Start: `@kerf/start`

- **Pages from files** in `src/routes`, with layouts, `load`, `notFound()`, `redirect()` and `meta` for titles and
  share cards.
- **Server functions.** `query` and `mutation` validate input with a schema, run with `ctx` (the request, the user, the
  database) and come back typed. Mutations name the tags they invalidate, and `optimistic` updates the page first.
- **Streaming SSR and islands**, forms that work without JavaScript, and view transitions.
- **Data and auth.** Drizzle, Prisma or plain SQL on SQLite, Postgres or MySQL, with migrations from
  `kerf db generate`. Sign-in through Better Auth, or your own.
- **Live data.** A page that reads a table updates when another user changes it, from the database's change feed.
- **Rust when you want it.** [Server functions in Rust](site/content/learn/rust.md), in process with `native()` or as a
  sidecar with `remote()`.

### Veneer: `@kerf/veneer`

- **Components.** Forms, overlays, menus, data grids, charts, toasts, a command palette and more. Each has keyboard
  support, screen-reader names and a contrast check.
- **One config.** `veneer({ seed, colors, parts, tokens, dials })` re-themes the app. Tokens follow the theme, density and
  an expression dial (quiet, balanced, vivid).
- **The Theme studio** on the docs site tries a theme on real components and writes the config for you.
- **Icons.** [`@kerf/veneer-icons`](packages/veneer-icons) has 651 icons in three expression tiers, each hollow or solid.
- **No framework needed underneath.** [`@kerf/veneer-core`](packages/veneer-core) holds Veneer's behavior, tokens and
  CSS, with no framework.

### The compiler: `crates/kerf-compiler`

- **Rust on Oxc**, shipped as a native addon for seven platforms and as WebAssembly for the rest.
- **One output.** The addon and the WASM build are held to the same output and diagnostics by a parity test.
- **Check mode** powers `kerf check`, `kerf fix` and the MCP `check` tool.

## Packages

Every package is released together, at one version.

### Framework

| Package | Version | What it is |
|---|---|---|
| [`@kerf/core`](packages/core) | [![npm](https://img.shields.io/npm/v/@kerf/core?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/core) | The runtime, the compiler binding, the Vite plugin, SSR and test utilities |
| [`@kerf/start`](packages/start) | [![npm](https://img.shields.io/npm/v/@kerf/start?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/start) | The full stack: file routes, server functions, SSR, a database, auth and live data |
| [`@kerf/cli`](packages/cli) | [![npm](https://img.shields.io/npm/v/@kerf/cli?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/cli) | The `kerf` command: `dev`, `build`, `check`, `deploy`, `docs`, the MCP server and more |
| [`create-kerf`](packages/create-kerf) | [![npm](https://img.shields.io/npm/v/create-kerf?color=145c3c&label=)](https://www.npmjs.com/package/create-kerf) | `npm create kerf`: a new app, with templates |
| [`@kerf/db`](packages/db) | [![npm](https://img.shields.io/npm/v/@kerf/db?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/db) | Prisma and native SQL layers, and list sources, for `@kerf/start` |
| [`@kerf/veneer`](packages/veneer) | [![npm](https://img.shields.io/npm/v/@kerf/veneer?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/veneer) | Veneer's components, and the `veneer()` theming plugin |
| [`@kerf/veneer-core`](packages/veneer-core) | [![npm](https://img.shields.io/npm/v/@kerf/veneer-core?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/veneer-core) | Veneer's behavior, tokens and CSS, with no framework |
| [`@kerf/veneer-icons`](packages/veneer-icons) | [![npm](https://img.shields.io/npm/v/@kerf/veneer-icons?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/veneer-icons) | 651 icons in three expression tiers, each hollow or solid |

The release also publishes `@kerf/compiler-<platform>`, the native compiler addons that core picks from
`optionalDependencies` ([below](#platform-support)). You never install those yourself.

### Add-ons

`npx kerf add <name>` installs one and registers its plugin, where it has one. Each is released with the framework, at the same version.

| Package | Version | What it is |
|---|---|---|
| [`@kerf/text`](packages/text) | [![npm](https://img.shields.io/npm/v/@kerf/text?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/text) | Fonts for the build (subsets, matched fallbacks) and exact line breaking in the browser |
| [`@kerf/pay`](packages/pay) | [![npm](https://img.shields.io/npm/v/@kerf/pay?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/pay) | Products, one ledger for every payment rail, and entitlements, with Stripe |
| [`@kerf/multiplayer`](packages/multiplayer) | [![npm](https://img.shields.io/npm/v/@kerf/multiplayer?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/multiplayer) | Presence, cursors anchored to elements, a typed interaction relay and synced scroll |
| [`@kerf/media`](packages/media) | [![npm](https://img.shields.io/npm/v/@kerf/media?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/media) | Image builds (AVIF plus a fallback, quality search, width ladders, placeholders) and a media route |
| [`@kerf/media-ffmpeg`](packages/media-ffmpeg) | [![npm](https://img.shields.io/npm/v/@kerf/media-ffmpeg?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/media-ffmpeg) | Video and audio encoding (AV1, VP9, HEVC, H.264, Opus, AAC) through your ffmpeg |
| [`@kerf/keel-pixel`](packages/keel-pixel) | [![npm](https://img.shields.io/npm/v/@kerf/keel-pixel?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/keel-pixel) | The `keel-pixel` surface kind: KEEL's WebGL2 pixel renderer and theme recipes |
| [`@kerf/keel`](packages/keel) | not published yet | KEEL generation: the `keel-lit` surface kind and generators for trees, looks, light and music |
| [`@kerf/scroll`](packages/scroll) | next release | Custom scrollbars in the DOM or on a canvas, kept moving by the compositor |
| [`@kerf/realtime-redis`](packages/realtime-redis) | [![npm](https://img.shields.io/npm/v/@kerf/realtime-redis?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/realtime-redis) | The realtime bus on Redis pub/sub |
| [`@kerf/realtime-nats`](packages/realtime-nats) | [![npm](https://img.shields.io/npm/v/@kerf/realtime-nats?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/realtime-nats) | The realtime bus on core NATS |
| [`@kerf/realtime-durable-object`](packages/realtime-durable-object) | [![npm](https://img.shields.io/npm/v/@kerf/realtime-durable-object?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/realtime-durable-object) | The realtime bus on a Cloudflare Durable Object |
| [`@kerf/realtime-livekit`](packages/realtime-livekit) | [![npm](https://img.shields.io/npm/v/@kerf/realtime-livekit?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/realtime-livekit) | Cursors over a LiveKit room |
| [`@kerf/realtime-socketio`](packages/realtime-socketio) | [![npm](https://img.shields.io/npm/v/@kerf/realtime-socketio?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/realtime-socketio) | Cursors through a Socket.IO relay you run |
| [`@kerf/realtime-webrtc`](packages/realtime-webrtc) | [![npm](https://img.shields.io/npm/v/@kerf/realtime-webrtc?color=145c3c&label=)](https://www.npmjs.com/package/@kerf/realtime-webrtc) | Cursors over WebRTC data channels, signalled through the room |

[packages/README.md](packages/README.md) lists every package with its source and status.

## Platform support

| Runs on | Notes |
|---|---|
| Node | 26 or later |
| Bun, Deno | In place of Node. `kerf build --runtime bun\|deno` builds for them, and `kerf start` runs the build on them |
| Hosts | `kerf deploy` ships to Netlify, Vercel, Cloudflare, Fly and Render. `kerf deploy hosts` says which ones can run your app, and why not |

The compiler comes two ways. An install picks by itself, and `npx kerf doctor` says which one an app is using.

| Platform | Compiler |
|---|---|
| macOS, Apple silicon and Intel | Native addon |
| Linux x64 and arm64, glibc and musl | Native addon |
| Windows x64 | Native addon |
| Everywhere else | WebAssembly |

The WASM build gives the same output as the addon; the addon only adds speed. A native compiler that is missing, a
different version or fails to load falls back to WASM by itself. Rust is never needed to use Kerf.

## Performance

### Size

Brotli sizes, as `node packages/core/scripts/size.mjs` reports them:

| What | Brotli |
|---|---|
| Hello world | 1.60 KB |
| The `@kerf/core` entry | 5.63 KB |
| The whole runtime, every export | 13.37 KB |

An app built with Veneer has a ceiling of 50 KB of JavaScript and CSS, which
[`evals/gates/veneer-exit.mjs`](evals/gates/veneer-exit.mjs) checks.

### The same dashboard, every stack

[`benchmarks/compare`](benchmarks/compare) builds the same dashboard on each stack: a shell with a sidebar, an account
menu and a drawer, and a 200-row table with sorting, filtering, selection, paging and a live cell. Four stacks share
one hand-written stylesheet, so they compare frameworks. The latest run, 2026-11-06, on one Mac, from
[`results.json`](benchmarks/compare/results.json):

| Same CSS | JS (brotli) | App source | First paint |
|---|---|---|---|
| Kerf, no Veneer | 7.1 KB | 318 lines | 100 ms |
| Solid + Kobalte + TanStack | 47.4 KB | 330 lines | 152 ms |
| React + Radix + TanStack | 98.3 KB | 309 lines | 216 ms |
| React + Zustand + TanStack | 98.4 KB | 317 lines | 212 ms |

Veneer and MUI each bring a design system, so they compare as kits:

| Own design system | JS (brotli) | CSS (brotli) | App source | First paint |
|---|---|---|---|---|
| Kerf + Veneer | 28.9 KB | 22.1 KB | 72 lines | 208 ms |
| React + MUI | 239.6 KB | in the JS | 177 lines | 516 ms |

First paint is the median of five fresh Chromium contexts at 1280 x 800 with 4x CPU throttling. It doesn't establish
device performance. [The method](benchmarks/compare/README.md) has the measurement, what each stack leaves out, and the
history in [`evals/results/compare-history.jsonl`](evals/results/compare-history.jsonl).

### One brief, built by an agent

The same run audits apps a fresh agent built from one brief, three screens on each stack in its usual kit. Kerf + Veneer
had 0 axe violations, against 14 for Solid + Kobalte, 0 for React + Radix, 32 for React + Zustand, 17 for React +
MUI, and 6 for Kerf on raw Tailwind. The audit reads the page in Chromium, so it can't see whether a page looks good. See
[One brief, built by an agent](benchmarks/compare/README.md#one-brief-built-by-an-agent).

[`benchmarks/speed`](benchmarks/speed) has the row and reactive benchmarks, and
[`benchmarks/js-framework-benchmark`](benchmarks/js-framework-benchmark) the keyed entry.

## Docs

| Where | What's there |
|---|---|
| [Learn](site/content/learn) | The tutorial, from your first component to deploying |
| [Reference](packages/cli/docs) | Every API, command and config key. An app gets the same pages with `npx kerf docs` |
| [docs/](docs/README.md) | Working on Kerf, and the design notes and decisions behind it |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each release |

Each package's README covers its own API: start with [`@kerf/core`](packages/core),
[`@kerf/start`](packages/start) and [`@kerf/cli`](packages/cli).

## In this repo

| Folder | What's there |
|---|---|
| [`packages/`](packages) | Every npm package |
| [`crates/`](crates) | The compiler (`kerf-compiler`), layout (`kerf-layout`) and the Rust server-function support (`kerf`) |
| [`site/`](site) | The docs site, built with Kerf and Veneer: Learn, Reference, the component pages and the Theme studio |
| [`benchmarks/`](benchmarks) | The dashboard comparison, row and reactive benchmarks, and the js-framework-benchmark entry |
| [`examples/`](examples) | Real apps on each stack, and the tool that compares them |
| [`evals/`](evals) | Apps that agents build with Kerf, the gates that score them, and the comparison history |
| [`docs/`](docs) | Contributor docs, Veneer's design spec and decision records |
| [`scripts/`](scripts) | Setup, the one `check` command, quality rules and the release |
| [`patches/`](patches) | Patches the workspace applies to dependencies |

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) has the setup and the one command to run before a change goes in:

```bash
pnpm run setup   # one install for every package, then the compiler
pnpm run check   # every rule and every test
```

Working on Kerf needs Node 26 and [Rust](https://rustup.rs); using it needs neither Rust nor this repo. The workspace
uses pnpm. To use your checkout in an app of your own, see [Using a Kerf checkout](docs/getting-started.md).

## Security

Report security problems privately, through GitHub's private advisories, as [SECURITY.md](.github/SECURITY.md) says.
Don't open a public issue for them. Only the latest published version of each `@kerf/*` package gets security fixes.

## License

[MIT](LICENSE).
