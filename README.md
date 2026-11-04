# weft

weft is a fine-grained reactive TSX framework built for coding agents. A component is plain TSX and its body runs once.
State is a box you read and write through `.value`, anything computed from it is `derived`, and JSX stays live. The
mistakes agents tend to make are diagnostics with a code and a fix, reported by weft's own compiler, written in Rust on
[Oxc](https://oxc.rs).

You don't need Rust to use weft. An install gets the compiler as WebAssembly, plus a native addon where one fits your
platform. Rust is only for server code you choose to write in Rust.

warp is weft's UI toolkit. Its components are in `@weft-js/warp`, and their behaviour and CSS are in `@weft-js/warp-core`,
which works without any framework.

## Start an app

weft isn't on npm yet. Once it is, this starts an app:

```bash
npm create @weft-js my-app
```

Until then, make one from a checkout of this repo: [Installation](site/content/learn/installation.md).

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

`Counter` runs once. When `count` changes, only the text that reads it updates.

## Packages

| Package | Folder | What it is |
|---|---|---|
| `@weft-js/core` | [packages/core](packages/core) | The runtime, the compiler binding, the Vite plugin, SSR and test utilities |
| `@weft-js/cli` | [packages/cli](packages/cli) | The `weft` command: `dev`, `build`, `check`, `docs` and the MCP server |
| `@weft-js/create` | [packages/create](packages/create) | `npm create @weft-js` |
| `@weft-js/start` | [packages/start](packages/start) | The full stack: file routes, server functions, SSR, a database, auth and realtime |
| `@weft-js/db` | [packages/db](packages/db) | Database layers and list sources for `@weft-js/start` |
| `@weft-js/warp` | [packages/warp](packages/warp) | warp's components |
| `@weft-js/warp-core` | [packages/warp-core](packages/warp-core) | warp's behaviour, tokens and CSS, with no framework |
| `@weft-js/warp-icons` | [packages/warp-icons](packages/warp-icons) | weft's icon set |

The other folders in `packages/` (payments, multiplayer, media, realtime transports, fonts and text) are add-ons that
aren't released yet.

## Size

Brotli, as `node packages/core/scripts/size.mjs` reports it:

- The whole runtime, every export: 13.37 KB.
- The `@weft-js/core` entry alone: 4.76 KB.
- Hello world: 1.54 KB.

An app built with warp has a ceiling of 50 KB of JavaScript and CSS, which `evals/gates/warp-exit.mjs` checks.

## Docs

- [Learn](site/content/learn): the tutorial, in order.
- [Reference](packages/cli/docs): every API, command and config key. An app gets the same pages with `npx weft docs`.
- [docs/](docs/README.md): docs for working on weft, and the design notes behind it.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) has the setup and the one command to run. Report security problems privately, as
[SECURITY.md](SECURITY.md) says.

## Licence

[MIT](LICENSE).
