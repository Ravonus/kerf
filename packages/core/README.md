# @weft-js/core

> **Early release (0.1.1).** APIs will change between minor versions.

weft's runtime, compiler binding, Vite plugin, server renderer and test utilities. An app made with `npm create @weft-js`
already has it, wired up.

```bash
npm install @weft-js/core
```

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

TSX files need `"jsx": "preserve"` and `"jsxImportSource": "@weft-js/core"` in `tsconfig.json`, and the Vite plugin from
`@weft-js/core/vite` to compile them.

## Docs

`npx weft docs <topic>` prints each of these, and the site serves them under `/reference`:

- `rules` and `state`: the rules, and every reactive function.
- `props`, `lists` and `async`: components, lists, `resource` and `<Boundary>`.
- `browser`, `ui-state`, `surface`, `style`, `design`: the other entries below.
- `testing`: `@weft-js/core/test`.

The source of each page is in [packages/cli/docs](../cli/docs).

## Entries

| Import                                            | What it has                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `@weft-js/core`                                   | `state`, `derived`, `watch`, `onMount`, `onCleanup`, `untrack`, `flush`, `batch`, `context`, `defineState`, `resource`, `<Boundary>` |
| `@weft-js/core/keyed`                             | `box.get(key)`, `box.set(fn)` and `state.linked`, for a page the Vite plugin builds without them                                     |
| `@weft-js/core/dom`                               | `render` and `hydrate`                                                                                                               |
| `@weft-js/core/ssr`                               | `renderToString`, `renderToStringAsync` and `renderToStream`                                                                         |
| `@weft-js/core/test`                              | `render`, `screen`, `user`, `flush`, a fake clock, `scope`, `touches` and `toTouchAtMost`                                            |
| `@weft-js/core/persist`, `/sync`, `/history`      | `defineState`'s `persist`, `sync: 'tabs'` and `history` options. The Vite plugin adds each import where it's used                    |
| `@weft-js/core/browser`                           | Browser events as values: `online`, `visible`, `lifecycle`, `media`, `on`, `interval`                                                |
| `@weft-js/core/interaction`                       | `interaction()`: hover, focus and press as state                                                                                     |
| `@weft-js/core/style`                             | Style groups                                                                                                                         |
| `@weft-js/core/ds`                                | The design language: `Stack`, `Row`, `Heading`, `Text` and the rest                                                                  |
| `@weft-js/core/surface`                           | Canvas and WebGL as layout children: `defineSurface` and `<Surface>`                                                                 |
| `@weft-js/core/media`, `/text`, `/shape`, `/head` | `<Media>`, `<Text>`, skeleton shapes and `setHead`, which `@weft-js/start` uses                                                      |
| `@weft-js/core/config`                            | `defineConfig` for `weft.config.ts`                                                                                                  |
| `@weft-js/core/vite`                              | The Vite plugin                                                                                                                      |
| `@weft-js/core/compiler`                          | `transform(source, options)`, which returns `{ code, map, diagnostics }`, and `backend`, which says which build is running           |
| `@weft-js/core/markup`                            | `markup(html)` indexes selectors for CSS pruning; `esc(text, context?)` escapes HTML                                                 |

`esc` escapes `&`, `<` and double quotes by default. Pass `'text'` to escape `&`, `<` and `>`,
or `'full'` to escape all four. Apostrophes stay literal. This entry runs in Node and browsers.

The other entries (`/client`, `/hydration`, `/node-purge`, `/hmr`, `/plugin`, `/devtools`, `/agent`,
`/media-probe`, `/test/plugins`, `/style/matrix`, `/jsx-runtime`) are for the CLI, `@weft-js/start`, plugins and compiled
code.

## The Vite plugin

`weft()` from `@weft-js/core/vite` compiles `.tsx` and `.jsx` files with weft's compiler, for the client or the server.
A production build also drops CSS that nothing can reach: a rule keyed on a `data-scope`, `data-part`, `data-variant`,
`data-tone` or `data-emphasis` value that no built file mentions, then the tokens and keyframes left unused.
`weft({ purge: { keep: ['knob'] } })` keeps a name that's only built at run time, and `purge: false` turns this off.

## The compiler

The compiler is the Rust crate in `crates/weft-compiler`, built on Oxc. You don't need Rust to use it. An install gets it
as WebAssembly (`native/weft-compiler.wasm`), plus the `@weft-js/compiler-<platform>` addon that fits, from
`optionalDependencies`. `compiler.cjs` loads the addon when it can and the WebAssembly build when it can't.
`test/compiler-parity.test.ts` holds the two to the same output and diagnostics. `npx weft doctor` says which one an app
is using.

## Working on it

Run these in `packages/core`. Building the compiler needs Rust.

```bash
npm ci
npm run build:native   # the addon and the WebAssembly build, into native/
npm test
node scripts/size.mjs  # brotli sizes against the budgets
```

`size.mjs` holds the whole runtime to 13.37 KB of brotli and the `@weft-js/core` entry to 6.90 KB. Today the entry is
4.76 KB.
