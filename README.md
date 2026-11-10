# Weft

[![npm](https://img.shields.io/npm/v/@weft-js/core?label=%40weft-js%2Fcore)](https://www.npmjs.com/package/@weft-js/core)
[![licence](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

**A fine-grained reactive TSX framework, built so coding agents write it right the first time.**

A component is plain TSX and its body runs once. State is a box you read and write through `.value`, anything computed
from it is `derived`, and the JSX stays live. There are no hooks, no dependency arrays and no re-renders to reason about.
The mistakes agents and people tend to make come back from Weft's own compiler as diagnostics with a code, a reason and a
fix. The compiler is written in Rust on [Oxc](https://oxc.rs), and you never need Rust to use it.

Weft comes with a full stack (file routes, server functions, streaming SSR, a database, auth and live data) and with
**Warp**, a UI toolkit of more than a hundred accessible components that you theme from one config.

> **Early release (0.1.x).** The packages are on npm and work end to end, and APIs can still change between minor
> versions.

## Start an app

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
npx weft dev
```

You need Node 26, or Bun or Deno in its place. [Installation](site/content/learn/installation.md) covers every flag and
every file in a new app.

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

## The compiler tells you what's wrong

`npx weft check` compiles every component in check mode. Write the two most common mistakes, rendering the box instead
of its value and computing from a prop once, and it says:

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

Every code has a page (`npx weft docs W001`), `npx weft fix` applies the safe fixes, and `--json` gives the same thing
to a tool. Codes cover reactivity (W), plugins (P), design (D), page metadata (H), deploys (E) and built pages (L).

## What's in the box

- **Reactivity.** `state`, `derived`, `watch`, `resource` and `<Boundary>`, with keyed lists that move rows instead of
  rebuilding them. `defineState` adds persistence, cross-tab sync and undo history as options.
- **Full stack** with [`@weft-js/start`](packages/start). Pages from files in `src/routes`, `query` and `mutation`
  server functions the client calls like local ones, typed end to end. Streaming SSR, forms that work without
  JavaScript, optimistic updates, and live data that pushes changes to the pages that read them.
- **Data and auth.** Drizzle, Prisma or plain SQL on SQLite, Postgres or MySQL, with migrations from `weft db generate`.
  Sign-in comes through Better Auth, or your own.
- **Warp.** Forms, overlays, menus, data grids, charts, toasts, a command palette and more. Each has keyboard support,
  screen-reader names and a contrast check. Its tokens follow the theme, density and an expression dial (quiet,
  balanced, vivid). `warp({ seed, colors, parts, tokens, dials })` re-themes the app, and the Theme studio on the docs
  site writes that config for you.
- **Built for agents.** `weft agents-md` writes an `AGENTS.md` that matches the installed version, and `weft docs`
  prints any page or code. `weft mcp` serves the CLI as MCP tools, `weft browser` drives the running app, and
  `weft test --gate` checks tests with fail-before runs and mutants on changed lines.
- **Runs anywhere.** Node, Bun or Deno. `weft deploy hosts` says which hosts can run your app and why, and
  `weft deploy` ships to Netlify, Vercel, Cloudflare, Fly or Render.
- **Rust when you want it.** The compiler ships as WebAssembly, plus a native addon where one fits. Rust only comes in if
  you choose to write [server functions in Rust](site/content/learn/rust.md).

## Small and fast

Brotli sizes, as `node packages/core/scripts/size.mjs` reports them:

| What | Brotli |
|---|---|
| Hello world | 1.60 KB |
| The `@weft-js/core` entry | 5.63 KB |
| The whole runtime, every export | 13.37 KB |

An app built with Warp has a ceiling of 50 KB of JavaScript and CSS, which `evals/gates/warp-exit.mjs` checks.

[`benchmarks/compare`](benchmarks/compare) builds the same dashboard on each stack: a shell with a sidebar, an account
menu and a drawer, and a 200-row table with sorting, filtering, selection, paging and a live cell. Three stacks share
one hand-written stylesheet, so they compare frameworks. The latest run, 2026-11-06, on one Mac:

| Same CSS | JS (brotli) | App source | First paint |
|---|---|---|---|
| Weft, no Warp | 7.1 KB | 318 lines | 100 ms |
| Solid + Kobalte + TanStack | 47.4 KB | 330 lines | 152 ms |
| React + Radix + TanStack | 98.3 KB | 309 lines | 216 ms |

With its own design system, Weft + Warp is 72 lines of app code, 28.9 KB of JS and 22.1 KB of CSS, with no axe
violations. [The method](benchmarks/compare/README.md) has the throttling, the medians and what these numbers don't
show.

## Packages

| Package | What it is |
|---|---|
| [`@weft-js/core`](packages/core) | The runtime, the compiler binding, the Vite plugin, SSR and test utilities |
| [`@weft-js/start`](packages/start) | The full stack: file routes, server functions, SSR, a database, auth and live data |
| [`@weft-js/cli`](packages/cli) | The `weft` command: `dev`, `build`, `check`, `deploy`, `docs`, the MCP server and more |
| [`@weft-js/create`](packages/create) | `npm create @weft-js` |
| [`@weft-js/db`](packages/db) | Prisma and native SQL layers, and list sources, for `@weft-js/start` |
| [`@weft-js/warp`](packages/warp) | Warp's components, and the `warp()` theming plugin |
| [`@weft-js/warp-core`](packages/warp-core) | Warp's behaviour, tokens and CSS, with no framework |
| [`@weft-js/warp-icons`](packages/warp-icons) | 651 icons in three expression tiers, each hollow or solid |

The release also publishes `@weft-js/compiler-<platform>`, the native compiler addons that core picks from
`optionalDependencies`. The other folders in `packages/` are add-ons that aren't released yet, such as payments,
multiplayer, media processing, fonts and realtime transports. See [1.0 package scope](docs/ARCHITECTURE.md#10-package-scope).

## Docs

- [Learn](site/content/learn): the tutorial, from your first component to deploying.
- [Reference](packages/cli/docs): every API, command and config key. An app gets the same pages with `npx weft docs`.
- [docs/](docs/README.md): working on Weft, and the design notes and decisions behind it.
- [CHANGELOG.md](CHANGELOG.md): what changed in each release.

## In this repo

| Folder | What's there |
|---|---|
| `packages/` | Every npm package |
| `crates/` | The compiler (`weft-compiler`), layout (`weft-layout`) and the Rust server-function support (`weft`) |
| `site/` | The docs site, built with Weft and Warp: Learn, Reference, the component pages and the Theme studio |
| `benchmarks/` | The dashboard comparison, row and reactive benchmarks, and the js-framework-benchmark entry |
| `evals/` | Apps that agents build with Weft, and the gates that score them |
| `docs/` | Contributor docs, Warp's design spec and decision records |

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) has the setup and the one command to run before a change goes in. To use your
checkout in an app of your own, see [Using a Weft checkout](docs/getting-started.md). Report security problems
privately, as [SECURITY.md](.github/SECURITY.md) says.

## Licence

[MIT](LICENSE).
