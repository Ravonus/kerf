<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">@weft-js/core</h1>

<p align="center">
  <strong>A fine-grained reactive TSX runtime whose compiler catches reactivity bugs before they ship.</strong><br>
  Components run once, props stay live, and every mistake the compiler finds comes with a code and a fix.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@weft-js/core"><img src="https://img.shields.io/npm/v/@weft-js/core?color=145c3c&label=npm" alt="npm version"></a>
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

`@weft-js/core` is the heart of [Weft](https://github.com/Ravonus/weft): the reactive runtime, the binding to Weft's
Rust compiler, the Vite plugin, the server renderer and the test utilities. You write TSX components that run once and
read state through `.value`. The compiler turns each read into a precise DOM update, and it rejects the patterns that
silently break reactivity, such as computing from a prop once, a list without keys, or a React hook. It was built so
that coding agents, and people, get reactive code right the first time.

An app made with `npm create @weft-js` already has this package, wired up. Read on to use it directly, or to understand
what the scaffold set up for you.

## Highlights

- **Components run once.** A component's body is setup, not a render function. There are no hooks, no dependency
  arrays and no re-renders: a write to `count.value` updates only the text and attributes that read it.
- **The compiler explains what's wrong.** 27 compiler diagnostics (`W000`–`W061`) catch reactivity mistakes at
  build time, each with a one-line reason, a fix and, where it's mechanical, an autofix. An error fails the Vite build.
- **Props stay live, even destructured.** `({ items }) =>` and `const { items } = props` both stay current. The
  compiler rewrites them into live reads, so there's no `splitProps` or `props.x` discipline to remember.
- **Shared state with persistence, tab sync and undo built in.** `defineState` gives you a named store, and
  `persist`, `sync: 'tabs'` and `history` are options on it, validated by any Standard Schema (Zod, Valibot, ArkType).
- **Async without flashes.** `resource` is async `derived` with abort, and `<Boundary>` waits for it. The server can
  render to a string, wait for data first, or stream each Boundary as it resolves.
- **Tests that measure work, not just output.** `@weft-js/core/test` renders, clicks and fakes the clock, and
  `toTouchAtMost(n, { runs })` fails a test when one interaction writes the DOM or re-runs reactive code more than it should.
- **Small.** Hello world is 1.60 KB of brotli and the whole `@weft-js/core` entry is 5.63 KB (`scripts/size.mjs`,
  [sizes below](#size)).
- **No Rust needed.** The compiler ships as a native addon for seven platforms and as WebAssembly for everything
  else. Both produce byte-identical output, and a parity test holds them to it.

## Contents

- [Install](#install)
  - [What installing runs](#what-installing-runs)
  - [The reference, offline](#the-reference-offline)
- [Quick start](#quick-start)
  - [A static site](#a-static-site)
- [The model](#the-model)
  - [A component runs once](#a-component-runs-once)
  - [State is a box](#state-is-a-box)
  - [Derived values](#derived-values)
  - [Side effects with watch](#side-effects-with-watch)
  - [batch, flush and untrack](#batch-flush-and-untrack)
  - [onMount and onCleanup](#onmount-and-oncleanup)
  - [Context](#context)
  - [Shared state with defineState](#shared-state-with-definestate)
  - [Async data: resource and Boundary](#async-data-resource-and-boundary)
  - [Lists and keyed entries](#lists-and-keyed-entries)
- [Props stay live](#props-stay-live)
- [Compiler diagnostics](#compiler-diagnostics)
- [Entry points](#entry-points)
- [The Vite plugin](#the-vite-plugin)
- [Server rendering](#server-rendering)
- [Images and video with Media](#images-and-video-with-media)
- [Content Security Policy](#content-security-policy)
- [Testing](#testing)
- [The compiler: native and WASM](#the-compiler-native-and-wasm)
- [TypeScript setup](#typescript-setup)
- [How Weft compares to React and Solid](#how-weft-compares-to-react-and-solid)
- [Size](#size)
- [Troubleshooting](#troubleshooting)
- [Related packages](#related-packages)
- [Contributing](#contributing)
- [License](#license)

## Install

The fastest start is a full app, which includes this package, routing, SSR and the `weft` CLI:

```bash
npm create @weft-js
```

To add Weft to a Vite project yourself:

```bash
# npm
npm install @weft-js/core
npm install -D vite

# pnpm
pnpm add @weft-js/core
pnpm add -D vite

# bun
bun add @weft-js/core
bun add -d vite
```

The package declares `node >= 24`. It ships its runtime as TypeScript source, so build with Vite and the `weft()`
plugin, which compiles your `.tsx` and the runtime together.

For tests, add the optional peers:

```bash
npm install -D vitest jsdom \
  @testing-library/dom @testing-library/user-event
```

### What installing runs

Nothing. No Weft package has an `install` or `postinstall` script, and
`@weft-js/core` has one runtime dependency, `dom-accessibility-api`, which
has none either.

What does run is the compiler, at build time, inside Vite:

| Build | Where it comes from | What it can reach |
| --- | --- | --- |
| Native addon | `@weft-js/compiler-<platform>`, an optional dependency: a prebuilt `.node` file of about 4 MB | Native code in the Vite process. It reads the source text it's given and returns code; it opens no files or sockets |
| WASM | `native/weft-compiler.wasm`, in this package | Nothing. The module has no imports, so it can only turn the input text into output text |

Both come from the same Rust source in
[`crates/weft-compiler`](https://github.com/Ravonus/weft/tree/main/crates/weft-compiler)
and produce byte-identical output. To keep native code out of your builds
entirely, skip the optional dependencies and pin WASM:

```bash
npm install @weft-js/core --omit=optional
WEFT_COMPILER=wasm npx vite build
```

`--omit=optional` alone is enough: with no addon installed the loader
falls back to WASM. `WEFT_COMPILER=wasm` makes that a rule, so an addon
that arrives later is still ignored. `--ignore-scripts` doesn't change
which build runs, because an addon needs no install script.

### The reference, offline

The reference pages that `npx weft docs <topic>` prints ship in this
package too, as Markdown in `node_modules/@weft-js/core/docs/`, with an
index in its `README.md`. They match the installed version, and need no
network or CLI. The links in this README go to the same pages on GitHub.

## Quick start

A complete client-only app in five files.

```json
// package.json
{
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": { "@weft-js/core": "^0.1.4" },
  "devDependencies": { "vite": "^8.0.0" }
}
```

`"type": "module"` matters: without it Vite 8 warns that
`vite.config.ts` uses ESM syntax.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import weft from '@weft-js/core/vite'

export default defineConfig({
  plugins: [weft()],
})
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "jsx": "preserve",
    "jsxImportSource": "@weft-js/core",
    "lib": ["es2023", "dom", "dom.iterable"],
    "types": ["@weft-js/core/client"]
  },
  "include": ["src"]
}
```

```html
<!-- index.html -->
<!doctype html>
<html lang="en">
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
// src/main.tsx
import { derived, state } from '@weft-js/core'
import { render } from '@weft-js/core/dom'

function Counter() {
  const count = state(0)
  const doubled = derived(() => count.value * 2)
  return (
    <button type="button" onClick={() => count.value++}>
      Clicked {count.value} times, doubled {doubled.value}
    </button>
  )
}

render(() => <Counter />, document.getElementById('root')!)
```

Run `npm run dev`. `Counter` runs once. Each click writes `count.value`, and only the two text nodes that read `count`
and `doubled` change. `render` returns a function that unmounts the app.

### A static site

The quick start is already a static site. `npm run build` writes `dist/`:
`index.html`, one hashed JS file per entry and chunk, and the CSS. There is
no server and no inline script or style, so `dist/` deploys to any static
host as it is: Cloudflare (Workers static assets or Pages), Netlify,
Vercel, GitHub Pages, S3 or an nginx folder.

- **Several pages.** Give Vite more HTML inputs with
  `build.rolldownOptions.input`, one per page, each with its own
  `render(...)`.
- **Client routes.** A single-page app with its own router needs the host
  to serve `index.html` for unknown paths (Cloudflare's
  `not_found_handling = "single-page-application"`, Netlify's
  `/* /index.html 200`).
- **Pre-rendered HTML.** For pages that arrive as HTML and then hydrate,
  use [`@weft-js/start`](https://www.npmjs.com/package/@weft-js/start):
  a route with `prerender` is written as a static page at build time.
- **A strict CSP.** See [Content Security Policy](#content-security-policy).

## The model

Weft's reactive model has few parts. Everything below comes from `@weft-js/core` unless it says otherwise. The full
reference pages are [`rules`](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/rules.md) and
[`state`](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/state.md), and `npx weft docs <topic>` prints them.

### A component runs once

A component is a function that runs once, when it is created. It sets up state, derived values and effects, and
returns JSX. The JSX is live: each `{expression}` and each attribute re-evaluates when the values it reads change.
Nothing else re-runs.

That has two consequences the compiler enforces:

- An early `return` that depends on state is never re-checked (`W040`). Branch in JSX instead.
- A `let` that a handler changes never shows the change (`W041`). Use `state`.

```tsx
import { state } from '@weft-js/core'

export function Panel() {
  const open = state(false)
  return (
    <section>
      <button
        type="button"
        onClick={() => (open.value = !open.value)}
      >
        {open.value ? 'Hide' : 'Show'}
      </button>
      {open.value ? <p>Details</p> : null}
    </section>
  )
}
```

### State is a box

`state(initial)` returns a box with a `.value`. Read `.value` in JSX and that spot updates when it changes; assign
`.value` and the dependents update. Writing a value that is `Object.is` the old one does nothing.

```tsx
import { state } from '@weft-js/core'

export function Name() {
  const name = state('')
  return (
    <label>
      Name
      <input
        value={name.value}
        onInput={(e) => (name.value = e.currentTarget.value)}
      />
      <span>Hello, {name.value || 'stranger'}</span>
    </label>
  )
}
```

Rendering the box itself (`{name}`) is `W015`, with an autofix to `{name.value}`.

Object and array boxes have two more methods, from `@weft-js/core/keyed`. The main entry and the Vite plugin bring that
module in when a file uses them, so you rarely import it yourself.

| Call | What it does |
| --- | --- |
| `box.set(d => { d.x = 1 })` | Copies the value one level deep, lets you write the copy, then stores it as the new value |
| `box.get(key)` | Reads one entry. The reader re-runs only when that entry changes (`Object.is`) |
| `state.linked(() => source, { key? })` | A box that follows `source` until you write it. With `key`, an edit holds while the key stays the same, and `.conflict.value` tells you when the source moved underneath it |

### Derived values

Anything computed from other values is `derived`. It tracks what it reads, caches the result, and recomputes when one
of those inputs changed and it is read again. Its `.value` is read-only.

```tsx
import { derived, state } from '@weft-js/core'

export function Cart() {
  const price = state(20)
  const quantity = state(1)
  const total = derived(() => price.value * quantity.value)
  return (
    <p>
      <button
        type="button"
        onClick={() => quantity.value++}
      >
        Add one
      </button>
      Total: {total.value}
    </p>
  )
}
```

`derived` must stay pure: writing state inside it is `W002`, and `derived(async …)` is `W012` (use `resource`).
`memo(fn)` is the same computation as an accessor, `() => T`, for code that wants a function rather than a box.

### Side effects with watch

`watch(source, act)` runs `act(value, prev)` now and whenever `source` changes. Only `source` is tracked, so `act`
can read anything without subscribing to it. If `act` returns a function, it runs before the next run and when the
owner is disposed.

```tsx
import { state, watch } from '@weft-js/core'

export function Title() {
  const unread = state(3)
  watch(
    () => unread.value,
    (n) => {
      document.title = n ? `(${n}) Inbox` : 'Inbox'
      return () => (document.title = 'App')
    },
  )
  return (
    <button
      type="button"
      onClick={() => (unread.value = 0)}
    >
      Mark all read
    </button>
  )
}
```

`watch` is for effects outside the reactive graph. A `watch` that only copies one value into another box is `W004`
(use `derived`), and one that writes a box its own source reads is `W003`, a cycle.

### batch, flush and untrack

- **Writes are batched.** Effects and DOM updates run together on the next microtask. `batch(fn)` runs `fn` and
  exists to say this at the call site; it doesn't change behavior.
- **`flush()`** applies pending updates now. Use it when the next line needs the DOM, for example to focus an element
  a write just showed.
- **`untrack(() => …)`** reads without subscribing. The result is a snapshot that never updates, so rendering one is
  `W018`.

```tsx
import { flush, state } from '@weft-js/core'

export function Search() {
  const open = state(false)
  let input: HTMLInputElement | undefined
  const show = () => {
    open.value = true
    flush() // the input exists now
    input?.focus()
  }
  return (
    <div>
      <button
        type="button"
        onClick={show}
      >
        Search
      </button>
      {open.value ? (
        <input
          ref={(n: HTMLInputElement) => (input = n)}
          aria-label="Search"
        />
      ) : null}
    </div>
  )
}
```

### onMount and onCleanup

Every component, list row and `createRoot` is an **owner**. When an owner is disposed, everything it created goes
with it: watchers, listeners from `@weft-js/core/browser`, and child components.

- `onMount(fn)` runs once the component's DOM is in place and its refs are set. It never runs on the server.
- `onCleanup(fn)` runs when the owner is disposed.
- `createRoot(dispose => …)` makes an owner that outlives its caller, ended by calling `dispose()`.

```tsx
import { onCleanup, onMount } from '@weft-js/core'

export function Chart() {
  let canvas: HTMLCanvasElement | undefined
  onMount(() => {
    const observer = new ResizeObserver(
      () => canvas && console.log(canvas.clientWidth),
    )
    if (canvas) observer.observe(canvas)
    onCleanup(() => observer.disconnect())
  })
  return <canvas ref={(n: HTMLCanvasElement) => (canvas = n)} />
}
```

`onCleanup` works inside `onMount`, because the mount callback runs under the component's owner.

### Context

`context(fallback)` passes a value down without threading props. `ctx.provide(value, () => …)` sets it for everything
created inside the callback, and `ctx.use` (a property, not a call) reads the nearest one, or the fallback.

```tsx
import { context } from '@weft-js/core'

const Theme = context<'light' | 'dark'>('light')

function Badge() {
  const theme = Theme.use
  return <span data-theme={theme}>{theme}</span>
}

export function App() {
  return <main>{Theme.provide('dark', () => <Badge />)}</main>
}
```

The provided subtree is disposed with its parent.

### Shared state with defineState

`defineState(name, setup, options?)` declares a named scope of state that any component can import. The setup runs once
per app, the first time the scope is used, and returns boxes, derived values and actions. Each action call is one
transaction and one undo step.

```ts
import { defineState, derived, state } from '@weft-js/core'
import { z } from 'zod'

export const cart = defineState(
  'cart',
  () => {
    const lines = state<Record<string, number>>(
      {},
      {
        persist: {
          in: 'local',
          schema: z.record(z.string(), z.number()),
          version: 1,
        },
        sync: 'tabs',
      },
    )
    const count = derived(() =>
      Object.values(lines.value).reduce((a, b) => a + b, 0),
    )
    const add = (id: string) =>
      lines.set((d) => {
        d[id] = (d[id] ?? 0) + 1
      })
    return { lines, count, add }
  },
  { history: { limit: 100 } },
)
```

Read it as `cart.count.value` and call `cart.add('p1')`. The handle also has `$name`, `$reset()` (every box back to
its initial value), `$snapshot()` (a plain copy) and, with `history`, `$history`: `undo()`, `redo()`, `clear()`,
`canUndo`, `canRedo` and `entries`.

Options on a `state` inside a setup:

| Option | Values | What it does |
| --- | --- | --- |
| `persist` | `'local'` · `'session'` · `'cookie'` · `'memory'` | Keeps the box through reloads. The short form takes a primitive `init` only |
| `persist` | `{ in, schema, version, migrate, maxAge }` | Objects and arrays need a Standard Schema. `migrate` maps old versions by number; `maxAge` is for cookies, in seconds (default one year) |
| `sync` | `'tabs'` | The same value in every tab of the browser. Needs `persist`, and not `'session'` |
| `history` | `false` | Leaves this box out of undo |
| `name` | `string` | The box's name in its scope. A persisted box the setup doesn't return needs one |

`persist`, `sync` and `history` live in `@weft-js/core/persist`, `/sync` and `/history`. The Vite plugin adds each
import only where it's used, so an app without them ships none of that code.

Misuse throws a `StateError` in dev with a code and a fix: `S008` (persistence or sync set up wrongly) and `S009` (two
scopes with one name, a reserved `$` key, or `$history` without `history`). On the server, a scope is per request.

### Async data: resource and Boundary

`resource(fetcher)` is async `derived`. It has `.value`, `.pending`, `.error` and `.refresh()`. It re-fetches when
what it read before the first `await` changes, and aborts the superseded request through `signal`. A read after the
`await` isn't tracked, which is `W012`.

`<Boundary pending error>` waits for every resource created while its children are built, and catches what they throw.
The fallback shows after 150 ms and stays at least 400 ms, so fast loads don't flash. A refetch keeps the current
content on screen.

```tsx
import { Boundary, resource } from '@weft-js/core'

type User = { name: string }

function Name(props: { id: string }) {
  // A new id refetches and aborts the old request.
  const user = resource((signal) =>
    fetch(`/api/users/${props.id}`, { signal }).then(
      (r) => r.json() as Promise<User>,
    ),
  )
  // On a refetch, dim the old value rather than replace it.
  return (
    <h1 aria-busy={user.pending ? 'true' : 'false'}>
      {user.value?.name}
    </h1>
  )
}

export function Profile(props: { id: string }) {
  return (
    <Boundary
      pending={<p>Loading…</p>}
      error={(e, retry) => (
        <button
          type="button"
          onClick={retry}
        >
          Retry
        </button>
      )}
    >
      <Name id={props.id} />
    </Boundary>
  )
}
```

> [!WARNING]
> A resource must be created *inside* the Boundary's children. One made above the `<Boundary>` in the same component
> isn't below it, and the fallback never shows. Move the resource into a child component, as `Name` does above.

`resource(fetcher, { initial })` starts with a value. See [Server rendering](#server-rendering) for how resources
resolve on the server and transfer to the client.

### Lists and keyed entries

`xs.map(x => <Row key={x.id} />)` in JSX compiles to a keyed list. Each key keeps its row and its DOM; a new object
under the same key updates that row in place, and moved keys move their nodes instead of rebuilding them.

```tsx
import { state } from '@weft-js/core'

type Product = { id: string; name: string; price: number }

export function Products() {
  const products = state<Product[]>([
    { id: 'a', name: 'Lamp', price: 40 },
    { id: 'b', name: 'Desk', price: 220 },
  ])
  const cart = state<Record<string, number>>({})
  const discount = (id: string) => {
    // Replace only the item that changed, so only its row re-runs.
    products.value = products.value.map((p) =>
      p.id === id ? { ...p, price: p.price - 5 } : p,
    )
  }
  return (
    <ul>
      {products.value.map((p) => (
        <li key={p.id}>
          {p.name}: {p.price} (in cart: {cart.get(p.id) ?? 0})
          <button
            type="button"
            onClick={() => discount(p.id)}
          >
            -5
          </button>
          <button
            type="button"
            onClick={() =>
              cart.set((d) => void (d[p.id] = (d[p.id] ?? 0) + 1))
            }
          >
            Add
          </button>
        </li>
      ))}
    </ul>
  )
}
```

The rules that keep lists fast are all checked:

| Code | The mistake | Instead |
| --- | --- | --- |
| `W010` | `.map` over objects with no `key` | `key={item.id}` on the row's root (autofix when items have `id`) |
| `W013` | An early `return` inside the `.map` callback | Filter first: `xs.filter(…).map(…)` |
| `W011` | `count && <X />` with a number on the left renders `0` | `count > 0 && <X />` |
| `W014` | `xs.value = xs.value.map(p => ({ ...p, price }))` gives every item a new identity, so every row re-runs | Replace only the item that changed: `p.id === id ? { ...p, price } : p` |
| `W017` | A row reads `cart[p.id]` or `cart.value[p.id]`, so any change to `cart` re-runs every row | `cart.get(p.id)`; for a row component, pass the box and read `.get(id)` there |
| `W019` | A row parameter with a default, an object rest or a computed key | Take the item as one parameter and read from it |

Over primitives, the value is the key. Put a long `filter().sort().map()` chain in a `derived` when other code needs
the same list.

## Props stay live

The compiler turns a component's props into live reads, so a parent can write `count={count.value}` and the child
sees every change. You can destructure, rename, default and rest props as you would in plain TypeScript.

```tsx
export function Price({
  amount,
  currency = 'USD',
  ...rest
}: {
  amount: number
  currency?: string
  id?: string
}) {
  // `amount` and `currency` are live reads of the props; `rest` is a
  // live object.
  return (
    <span {...rest}>
      {amount.toFixed(2)} {currency}
    </span>
  )
}
```

| Form | Behavior |
| --- | --- |
| `({ a, b }) =>` | Each name is a live read of `props.a` |
| `(props) =>` | `props.a` is a live getter |
| `({ size = 'md' }) =>` | The default applies on every read where the prop is `undefined` |
| `({ a, ...rest }) =>` | `rest` is a live object, and `<div {...rest}>` stays live |
| `const x = props.y` in the body | Another name for the prop: each use reads it live, at no cost |
| `const { a: b, c = 1, ...rest } = props` in the body | The same as in the parameter |
| `const n = props.items.length` in the body | A path off a prop is live too |
| `({ user: { name } }) =>` | `W006`: nested destructuring can't stay live. Read `user.name` where you use it |

What doesn't stay live is *computing* in the body, because the body runs once:

```tsx
import { derived } from '@weft-js/core'

export function Count({ items }: { items: string[] }) {
  // W001: `const n = items.length + 1` is read once, never updated
  const n = derived(() => items.length + 1) // follows `items`
  return <p>{n.value}</p>
}
```

- **Copying a prop into state:** `state(props.value)` never follows the prop (`W005`, React's `useState(prop)` bug).
  Use `state.linked(() => props.value)` for an editable local copy that resets when the prop changes.
- **Writing a prop:** `let n = props.n; n = 5` or `props.n = 5` writes locally until the parent's value next changes.
  Only `bind:n={box}` at the call site writes back to the parent's box. `bind:` takes a box, on a component (`W061`).
- **A snapshot on purpose:** `const first = untrack(() => props.x)`.

With the `weft` CLI, unannotated props are also *typed*: `weft check`, `weft tsc` and the editor plugin infer them
from the callers. See [`props`](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/props.md).

## Compiler diagnostics

The compiler reads every component and reports the patterns that break reactivity, leak resources or render wrong
HTML. Each diagnostic has a stable code, a severity, a message saying *why*, a `help` line saying *what to write
instead*, and a line and column. Where the fix is mechanical it carries an edit, and `weft fix` applies the safe ones.

This is the main reason Weft suits code written by agents: a mistake that would ship silently in other frameworks is a
build error here, with the fix in the message. In the Vite plugin, an `error` fails the transform and a `warning`
prints. Either way the message carries the code, the reason and the help, at the file, line and column:

```text
W015 `count` is a box; JSX needs its value.
  help: Read `count.value`.
```

`npx weft docs W001` prints any code's page, and `npx weft check --json` gives the same diagnostics to a tool.

### Codes the compiler reports

These run in the compiler itself: in `weft()` during every build and dev transform, and in `transform()` from
`@weft-js/core/compiler`.

| Code | Severity | What it catches | Fix |
| --- | --- | --- | --- |
| `W000` | error | A syntax error; nothing else in the file is checked | Fix the syntax first |
| `W001` | error | A prop or `.value` used to compute something in the component body, which runs once | `derived`, `watch`, or `untrack()` for an intended snapshot |
| `W002` | error | Writing state inside `derived` | Move the write to a handler or action |
| `W003` | error | A `watch` that writes state its own source reads (a cycle) | Use `derived` |
| `W004` | warning | A `watch` that only copies one value into another box | Replace it with `derived` |
| `W005` | error | `state(prop)`: the box never follows the prop | `state.linked(() => prop)`, or `untrack` for a one-time copy |
| `W006` | error | Nested prop destructuring (`({ user: { name } })`) | Read `user.name` at the use site |
| `W010` | error | `.map` over objects with no `key`, or row roots keyed differently | `key={item.id}` on the row root |
| `W011` | error | A number on the left of `&&` (renders `0`) | `n > 0 &&` |
| `W012` | error | `derived(async …)`, or reads after `await` in a `resource` | `resource`, reading before the `await` |
| `W013` | error | An early `return` inside a JSX `.map` callback | Filter first |
| `W014` | error | `.map(p => ({ ...p, … }))` feeding a keyed list: every row re-runs on every change | Replace only the changed item |
| `W015` | error | A box rendered without `.value` | Add `.value` (autofix) |
| `W016` | warning | A non-reactive call passed as a component prop, which runs again on each read of the prop | Create the value once before the JSX |
| `W017` | warning | One entry of a whole object read per row (`cart[p.id]`) | `cart.get(p.id)` |
| `W018` | warning | An `untrack(() => …)` snapshot that only the JSX reads: it never updates | `derived(() => …)` |
| `W019` | error | An unsupported row pattern (default, object rest or computed key) | Read from one item parameter |
| `W020` | error | React hooks (`useState`, `useEffect`, custom `useX()`), and dependency arrays on `watch`, `derived` or `memo` | `state`, `watch`, `derived`, `ref`; reads are tracked for you |
| `W040` | error | An early `return` in a component body that depends on state | Branch in JSX |
| `W041` | error | A `let` changed in a handler and read in JSX | Make it `state` |
| `W050` | error | Raw `addEventListener`, `setInterval`, `new WebSocket` or `new EventSource` in a component with no cleanup | `on` / `interval` from `@weft-js/core/browser`, or `onCleanup` |
| `W051` | error | A browser value, `on` or `interval` created with no owner (module scope, a timer, a handler, after `await`) | Create it in setup or inside `createRoot` |
| `W052` | error | A `watch` that folds a stream into a list by hand | `fold` and `initial` where the stream is read |
| `W054` | error | `media(query)` with no `ssr` value in a server-rendered component (a warning when it can't tell) | `media(query, { ssr: false })` |
| `W056` | warning | A `watch` that copies a live value into `state` | Read the live value directly, or `derived` |
| `W060` | error | A style `group()` that can't be evaluated at build | Literal tokens; `export const x = group('x', { … })` |
| `W061` | error | `bind:x` on a native element, or `bind:` / `bind(box)` with something that isn't a box | `<Card bind:person={name} />` with `name` a box |

<details>
<summary><strong>Codes <code>weft check</code> adds across files</strong></summary>

These need the whole project, so the [`@weft-js/cli`](https://www.npmjs.com/package/@weft-js/cli) runs them in
`weft check`, `weft dev` and `weft tsc`, not the Vite plugin.

| Code | Severity | What it catches |
| --- | --- | --- |
| `W007` | error | Assigning to a `Derived` (maps TypeScript's TS2540) |
| `W008` | error | A box where a value is expected at a prop, or the reverse |
| `W030` | error | Module-level `state` reachable from the server entry, which leaks across requests |
| `W043` | warning | `data-x={true}` or `data-x={false}`: `data-*` booleans are presence flags in Weft |
| `W044` | warning | A `key` from `crypto.randomUUID()`, `Date.now()`, `Math.random()` or `performance.now()`, which differs between server and client |
| `W080`–`W085` | mixed | Prop type inference: no caller, a missing or stale inferred type, an `any` source, a caller that disagrees |

`weft check` also follows `W014` through props into other files. Other families cover state (`S`), tests (`T`),
design (`D`), plugins (`P`), page metadata (`H`) and shared UI state (`U`); `npx weft docs <code>` explains each.

</details>

## Entry points

Import application code from these. Each is a separate entry, so an app ships only what it imports.

| Import | What it has |
| --- | --- |
| `@weft-js/core` | `state`, `derived`, `memo`, `watch`, `batch`, `flush`, `untrack`, `onMount`, `onCleanup`, `createRoot`, `getOwner`, `context`, `bind`, `defineState`, `StateError`, `resource`, `<Boundary>`, and the types `State`, `Derived`, `Linked`, `Resource`, `Props` |
| `@weft-js/core/keyed` | `box.get(key)`, `box.set(fn)` and `state.linked`. Import it yourself only for a page the Vite plugin builds without it, such as when a key is built at run time (`box[name]`) |
| `@weft-js/core/dom` | `render(() => <App />, el)` and `hydrate(() => <App />, el, { data? })` |
| `@weft-js/core/ssr` | `renderToString`, `renderToStringAsync` and `renderToStream` |
| `@weft-js/core/test` | `render`, `screen`, `user`, `flush`, `clock`, `scope`, `memoryStorage`, `touches`, `toTouchAtMost`, `leaks`, and the page fakes `net`, `page` and `tabs` |
| `@weft-js/core/persist`, `/sync`, `/history` | `defineState`'s `persist`, `sync: 'tabs'` and `history`. The Vite plugin adds each import where it's used |
| `@weft-js/core/browser` | Browser events as values: `online`, `visible`, `lifecycle`, `media`, `on`, `interval`, and `tabs.channel` ([docs](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/browser.md)) |
| `@weft-js/core/interaction` | `interaction()`: hover, focus and press as state, optionally shared across tabs and clients ([docs](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/ui-state.md)) |
| `@weft-js/core/style` | `group()`: style groups written in design tokens ([docs](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/style.md)) |
| `@weft-js/core/ds` | The design language's vocabulary: `SPACE`, `TONE`, `EMPHASIS`, `SIZE`, `DENSITY`, `TEXT_ROLE` and their types. The primitives that use them are in [`@weft-js/warp`](https://www.npmjs.com/package/@weft-js/warp) ([docs](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/design.md)) |
| `@weft-js/core/surface` | `defineSurface` and `<Surface>`: canvas 2D and WebGL2 as layout children with live props ([docs](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/surface.md)) |
| `@weft-js/core/media`, `/text`, `/shape`, `/head` | `<Media>`, `<Text>`, skeleton shapes, and `setHead`, which `@weft-js/start` uses |
| `@weft-js/core/config` | `defineConfig` for `weft.config.ts` ([docs](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/config.md)) |
| `@weft-js/core/plugin` | `definePlugin`, `defineSlot` and `provide`, for writing Weft plugins |
| `@weft-js/core/client` | Types only: ambient declarations for the Vite plugin's virtual imports (`*?media`, `weft:tokens/*`, `*.css`) |
| `@weft-js/core/vite` | The Vite plugin |
| `@weft-js/core/compiler` | `transform(source, options)`, which returns `{ code, map, diagnostics }`, and `backend`, which says which build is running |
| `@weft-js/core/markup` | `markup(html)` indexes selectors for CSS pruning; `esc(text, context?)` escapes HTML |

`esc` escapes `&`, `<` and double quotes by default. Pass `'text'` to escape `&`, `<` and `>`, or `'full'` to escape
all four. Apostrophes stay literal. This entry runs in Node and in browsers.

<details>
<summary><strong>Entries for tooling and compiled code</strong></summary>

These are package exports, but not application APIs. The CLI, `@weft-js/start`, plugins and compiled output use them.

| Import | Used by |
| --- | --- |
| `@weft-js/core/internal` | Compiler output and renderers. Shares the runtime's graph; it is not a second runtime |
| `@weft-js/core/jsx-runtime` | JSX types for `jsxImportSource` |
| `@weft-js/core/hmr` | Hot updates the compiler generates in dev |
| `@weft-js/core/devtools` | The dev graph and overlay |
| `@weft-js/core/agent` | The in-page dev agent behind `weft browser`; needs the test peers |
| `@weft-js/core/test/plugins` | Conformance suites for plugin authors |
| `@weft-js/core/hydration`, `/node-purge`, `/style/matrix`, `/media-probe` | Node tooling for hydration, CSS purging, the style matrix and media probing |

The full list, with each entry's environment, is
[`entrypoints`](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/entrypoints.md).

</details>

## The Vite plugin

`weft()` from `@weft-js/core/vite` compiles `.tsx` and `.jsx` files with Weft's compiler, for the client or for the
server (Vite's SSR transforms get server output). It also wires style groups, design tokens, plugin slots, icons,
assets and, in production, CSS purging. It targets Vite 8.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import weft from '@weft-js/core/vite'

export default defineConfig({
  plugins: [
    weft({
      hydratable: true, // the client adopts server HTML
      // A class name built only at run time
      purge: { keep: ['knob'] },
    }),
  ],
})
```

| Option | Type | Default | What it does |
| --- | --- | --- | --- |
| `hydratable` | `boolean` | `false` | Client output adopts server HTML (`hydrate`), and server output writes hydration keys. Set it when you server-render |
| `dev` | `boolean` | `true` when serving | Dev output: diagnostic text, dev names for the graph, dev-only checks |
| `hmr` | `boolean` | `true` when serving, outside Vitest | Client modules accept their own hot updates. Never for server output |
| `purge` | `false` · `{ keep?: string[] }` | on | Drops unreachable CSS from the production client build (below) |
| `style.taggedParts` | `boolean` | `false` | Style-group parts carry `data-g` as well as `data-part` |
| `style.matrix` | `boolean` | `true` | `false` stops writing `.weft/styles.json` |
| `off` | `string[]` | `[]` | Speed paths to leave out, to measure them (`['SWAP']`, or `['all']`). `WEFT_OFF=SWAP,TEXT` does it for a whole run |

The plugin also sets Vite's `oxc` JSX handling to `preserve` and turns on `resolve.tsconfigPaths` unless you set it,
so aliases from your `tsconfig.json` work.

### CSS purge

A production build drops CSS that nothing can reach. After bundling, the plugin collects the words in every built
`.js`, `.mjs` and `.html` file, then removes:

1. rules keyed on a `data-scope`, `data-part`, `data-variant`, `data-tone` or `data-emphasis` value that no built file
   mentions;
2. then the tokens and keyframes those removals left unused.

Each purged stylesheet gets a new content hash in its file name, so a browser never keeps an old, smaller copy after
your app starts using a new component. Purging runs only on `vite build`, only for the client.

- `purge: { keep: ['knob'] }` keeps a name the app only builds at run time, such as `` `data-variant=${name}` ``.
- `purge: false` turns purging off.

### Server and hydrate builds in one process

`import { App } from './App.tsx?weft-ssr'` (or `?weft-hydrate`) loads a component graph compiled for the server (or
for hydration) into any process. The query follows `.tsx` and `.jsx` imports. Weft's own SSR tests use this to render
and hydrate the same fixture in one Vitest run.

## Server rendering

Import only these three from `@weft-js/core/ssr`; its other exports are what compiled server code calls. Build the
server and the client with `weft({ hydratable: true })`. [`@weft-js/start`](https://www.npmjs.com/package/@weft-js/start)
does all of this for you, with routing.

| Function | Returns | Use it when |
| --- | --- | --- |
| `renderToString(() => <App />, options?)` | `string` | Render what's ready now. Pending resources render empty, and the client fetches them |
| `renderToStringAsync(() => <App />, options?)` | `Promise<string>` | Wait for resources, then put their values in the page |
| `renderToStream(() => <App />, options?)` | `Stream` | Send the shell at once, then each `<Boundary>` as its resources resolve |

Effects, `watch` and `onMount` don't run on the server.

### renderToString and renderToStringAsync

`renderToStringAsync` renders, waits for the resources that pass started, and renders again until none is pending
(at most `passes`, default 10, or until a pass stops making progress). Hydratable output ends with
`<script type="application/json" data-weft>` holding resolved resources, Boundary states and `defineState` scopes, and
`hydrate` reads it from the container.

```tsx
// server.tsx
import { renderToStringAsync } from '@weft-js/core/ssr'
import { App } from './App.tsx'

export async function page() {
  const html = await renderToStringAsync(() => <App />, {
    hydratable: true,
  })
  return [
    '<!doctype html><html><body>',
    `<div id="app">${html}</div>`,
    '<script type="module" src="/src/client.tsx"></script>',
    '</body></html>',
  ].join('')
}
```

```tsx
// src/client.tsx
import { hydrate } from '@weft-js/core/dom'
import { App } from './App.tsx'

hydrate(() => <App />, document.getElementById('app')!)
```

`hydrate` takes over the server's DOM without rewriting it. Use it instead of `render` whenever the HTML came from
`@weft-js/core/ssr`.

### renderToStream

The stream has a `shell` with each pending Boundary's fallback between markers, then `chunks`: each Boundary's content
as a `<template>` plus a small script that swaps it in, in the order they resolve. After the chunks, `data()` returns
the page data for `hydrate`.

```tsx
import type { ServerResponse } from 'node:http'
import { renderToStream } from '@weft-js/core/ssr'
import { App } from './App.tsx'

export async function stream(res: ServerResponse) {
  const s = renderToStream(() => <App />, { hydratable: true })
  await s.settle() // resources outside any Boundary land in the shell
  res.write(
    `<!doctype html><html><body><div id="app">${s.shell}</div>`,
  )
  // Outside the container
  for await (const chunk of s.chunks) res.write(chunk)
  const data = JSON.stringify(s.data()).replace(/</g, '\\u003c')
  res.end(
    `<script>window.__data=${data}</script>` +
      '<script type="module" src="/src/client.tsx"></script>' +
      '</body></html>',
  )
}
```

On the client, pass the data explicitly: `hydrate(() => <App />, el, { data: window.__data })`.

| Stream member | What it does |
| --- | --- |
| `shell` | The first pass, with each pending Boundary's fallback between `<!--wb:key-->` markers |
| `chunks` | An async iterable of swap chunks. Send them after the shell, outside the container `hydrate` gets |
| `data()` | After `chunks` ends: the page data for `hydrate(code, el, { data })`, or `null` |
| `settle()` | Wait for resources outside any Boundary and update `shell`. Without it they render empty and the client fetches them |
| `hold(ms)` | Wait up to `ms` for the Boundaries; if they all land, render them into `shell` with no chunk to swap. Call after `settle` |

<details>
<summary><strong>Render options</strong></summary>

| Option | Applies to | Default | What it does |
| --- | --- | --- | --- |
| `hydratable` | all | `true` | Write hydration keys and the page data. `false` gives plain HTML |
| `head` | all | | Page metadata, written as tags at the top of the app's `<head>`; with no `<head>`, the output is wrapped in a minimal document |
| `app` | all | | Seeds this request's `defineState` scopes |
| `shown` | all | | Maps an error to what the page may show |
| `stalled` | all | | Called when the passes stop making progress |
| `passes` | async, stream | `10` | The most render passes |
| `timeout` | stream | `10000` | Boundaries still pending after this many ms keep their fallbacks, and the client fetches them after hydrating |
| `landing` | stream | | A script run just before each chunk's swap |

</details>

## Images and video with Media

`<Media>` from `@weft-js/core/media` renders an image or video import with
its width and height, a placeholder, `srcset` and `sizes`, so nothing
shifts while it loads.

```tsx
import { Media } from '@weft-js/core/media'
import hero from './hero.jpg?media'

export const Hero = () => (
  <Media
    src={hero}
    alt="The harbour at dawn"
    priority
    width="1/2"
  />
)
```

What a `?media` import gives you depends on the plugins in
`weft.config.ts`:

| Setup | Images | Video and audio |
| --- | --- | --- |
| No media plugin | Dimensions from the file header; the original file, no ladder | Not supported |
| [`@weft-js/plugin-media`](https://www.npmjs.com/package/@weft-js/plugin-media) | AVIF (and WebP) width ladders tuned to a quality target, a fallback, the dominant colour and a 16 px placeholder | Not supported |
| plus [`@weft-js/plugin-media-ffmpeg`](https://www.npmjs.com/package/@weft-js/plugin-media-ffmpeg) | As above | AV1 and H.264 ladders, a poster, GIFs turned into video |

| Prop | What it does |
| --- | --- |
| `src` | The `?media` import |
| `alt` | Required. What the image shows; `alt=""` with `decorative` for purely visual media (`M007`) |
| `priority` | The route's one LCP image: eager, `fetchpriority="high"` (`M008`, `M009`) |
| `width` | Rendered width for `sizes`: a fraction of the viewport (`"1/3"`) or a CSS length (`"240px"`) |
| `sizes` | An explicit `sizes`, which wins over `width` |
| `focus` | Focal point, `[x, y]` from 0 to 1, as `object-position` |

A page with one `<Media>` is about 8 KB of brotli in all (see
[Size](#size)). The plugin's README has every option:
[`@weft-js/plugin-media`](https://github.com/Ravonus/weft/tree/main/packages/plugin-media).

> [!NOTE]
> **The placeholder and CSP.** By default the 16 px placeholder is inlined
> as a `data:` URL, which `img-src 'self'` blocks. Set
> `media({ placeholder: 'file' })` and it is written as its own small
> hashed `.webp` next to the other files instead; `placeholder: false`
> leaves it and the dominant colour out. The box `<Media>` sets is a
> `style` value, which needs the note on style attributes below when the
> page is server-rendered.

## Content Security Policy

A client-rendered Weft build works under a strict policy with no
exceptions:

```text
default-src 'self'; script-src 'self'; style-src 'self'
```

The build writes every script and stylesheet to a file, so nothing is
inline. At run time, a `style` value from an expression
(`style={{ color: c }}` or `style={css}`) is applied through the CSSOM
(`el.style`), which CSP allows.

Three things need more than that:

| What | Why | What to do |
| --- | --- | --- |
| A literal `style="color:red"` in JSX | It is part of the element's HTML template, and `style-src` without `'unsafe-inline'` blocks style attributes in HTML | Use a class, or an expression: `style={{ color: 'red' }}` |
| Server-rendered pages | Every `style` value is written into the HTML as an attribute, `<Media>`'s box included | Add `style-src-attr 'unsafe-inline'` (style attributes only; still no inline `<style>` or script) |
| `<Media>`'s default placeholder | It's a `data:` URL | `media({ placeholder: 'file' })`, or add `data:` to `img-src` |

## Testing

`@weft-js/core/test` is a Vitest toolkit: it mounts components into jsdom with a fresh app each time, queries by
role, label and text, drives real user events, fakes the clock, and asserts how much work an interaction did.

```ts
// vitest.config.ts
import weft from '@weft-js/core/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [weft()],
  test: { environment: 'jsdom' },
})
```

```tsx
import { state } from '@weft-js/core'
import { render, screen, user } from '@weft-js/core/test'
import { expect, test } from 'vitest'

function Cart() {
  const count = state(0)
  return (
    <button
      type="button"
      onClick={() => count.value++}
    >
      Cart ({count.value})
    </button>
  )
}

test('adding to the cart', async () => {
  render(Cart)
  await user.click(screen.getByRole('button', { name: 'Cart (0)' }))
  expect(
    screen.getByRole('button', { name: 'Cart (1)' }),
  ).toBeTruthy()
  // One click: at most 1 DOM write and 2 reactive re-runs.
  const click = () => user.click(screen.getByRole('button'))
  await expect(click).toTouchAtMost(1, { runs: 2 })
})
```

| Export | What it does |
| --- | --- |
| `render(Component, props?, options?)` | Mounts with a fresh app; unmounted after each test. `options.state` seeds `defineState` scopes, `options.storage` shares storage between renders (to play two tabs or a reload), `options.slots` binds plugin slots |
| `screen` | Role, label and text queries only: `getByRole`, `getByLabelText`, `getByText`, with the `getAll`, `query` and `find` forms |
| `user` | `click`, `dblClick`, `type`, `clear`, `keyboard`, `hover`, `unhover`, `tab`, `selectOptions`, `deselectOptions`, `upload` and `paste`. Each ends in `flush()`, so never sleep or `waitFor` |
| `flush()` | Applies pending updates |
| `clock` | `clock.install()`, then `await clock.advance(ms)` or `clock.runAll()`: drives timers, `requestAnimationFrame`, `Date` and the resources waiting on them. Uninstalled after each test |
| `touches(fn)` | `{ mutations, runs, … }` for one interaction |
| `toTouchAtMost(n, { runs? })` | Bounds DOM writes and reactive re-runs. DOM writes alone miss identity bugs that re-run every row but write once (`W014`) |
| `scope(handle)` | A fresh instance of one `defineState` scope, with no UI |
| `memoryStorage()` | A storage to pass to several renders |
| `net`, `page`, `tabs` | Fakes for `@weft-js/core/browser`: `net.offline()`, `page.hide()`, `page.media(query, true)`, `tabs.post(name, msg)` and more |
| `leaks()`, `assertNoLeaks()` | After each test, the toolkit fails if a listener or timer is still open (`T012`); `leaks()` lists what is |

`weft check` also flags junk tests statically (`T001`–`T009`): no assertion, a tautology, sleeping on real timers,
CSS-selector queries, mocking `@weft-js/core`, snapshots, conditional `expect`, and `.only` or `.skip`. A test that
finishes without asserting also fails at run time. See [`testing`](https://github.com/Ravonus/weft/blob/main/packages/cli/docs/testing.md).

## The compiler: native and WASM

The compiler is the Rust crate in
[`crates/weft-compiler`](https://github.com/Ravonus/weft/tree/main/crates/weft-compiler), built on
[Oxc](https://oxc.rs). You never need Rust to use it. `compiler.cjs` loads the fastest build this machine has:

1. a native addon built in a Weft checkout (contributors only);
2. otherwise the prebuilt `@weft-js/compiler-<platform>` addon, an optional dependency that your package manager
   installs only on a matching OS, CPU and libc;
3. otherwise `native/weft-compiler.wasm`, shipped in this package, which runs anywhere.

The addon must be the same version as `@weft-js/core`. If an override pulls a different one, the loader skips it and
uses WASM, which produces the same output. `test/compiler-parity.test.ts` compiles a corpus of over 100 files with
both builds, in every mode, and fails on any difference in output or diagnostics.

| Platform | Package | Build |
| --- | --- | --- |
| macOS, Apple silicon | `@weft-js/compiler-darwin-arm64` | native |
| macOS, Intel | `@weft-js/compiler-darwin-x64` | native |
| Linux x64, glibc | `@weft-js/compiler-linux-x64-gnu` | native |
| Linux arm64, glibc | `@weft-js/compiler-linux-arm64-gnu` | native |
| Linux x64, musl (Alpine) | `@weft-js/compiler-linux-x64-musl` | native |
| Linux arm64, musl (Alpine) | `@weft-js/compiler-linux-arm64-musl` | native |
| Windows x64 | `@weft-js/compiler-win32-x64` | native |
| Anything else, including Windows on Arm | none | WASM |

The native addon is native code running in your build process, even when you install with `--ignore-scripts`: it
needs no script to load. To keep it out, see [What installing runs](#what-installing-runs).

`npx weft doctor` says which build an app is using. In code, `backend` from `@weft-js/core/compiler` reports
`{ kind: 'native' | 'wasm', file, … }`; a WASM backend also lists the addons it wanted and why each was skipped.
`WEFT_COMPILER=native` or `WEFT_COMPILER=wasm` pins one build; with `native`, a missing addon is an error rather than a
fallback.

```js
import { backend, transform } from '@weft-js/core/compiler'

const out = transform(
  `export const A = (p) => <p>{p.n}</p>`,
  { filename: 'a.tsx', generate: 'dom', sourceMap: true },
)
console.log(backend.kind, out.diagnostics)
```

## TypeScript setup

TSX files need two compiler options, and the client types:

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@weft-js/core",
    "moduleResolution": "bundler",
    "types": ["@weft-js/core/client"]
  }
}
```

- `"jsx": "preserve"` leaves JSX for Weft's compiler; TypeScript only type-checks it.
- `"jsxImportSource": "@weft-js/core"` gives JSX its types from `@weft-js/core/jsx-runtime`.
- `"types": ["@weft-js/core/client"]` declares the Vite plugin's virtual imports, such as `./photo.jpg?media` and
  side-effect `.css` imports.

An app from `npm create @weft-js` also adds the editor plugin, `"plugins": [{ "name": "@weft-js/cli/ts-plugin" }]`,
which infers unannotated props and understands `bind:`. Run `weft tsc` in CI rather than plain `tsc` if you rely on
inferred props.

## How Weft compares to React and Solid

Concepts only. For measured numbers, see the
[`benchmarks/compare`](https://github.com/Ravonus/weft/tree/main/benchmarks/compare) method and results.

| | React | Solid | Weft |
| --- | --- | --- | --- |
| Component body | Re-runs on every update | Runs once | Runs once |
| Reading state | A variable from `useState` | Call a getter: `count()` | Read a box: `count.value` |
| Computed values | `useMemo` with a dependency array | `createMemo`, tracked | `derived`, tracked |
| Effects | `useEffect` with a dependency array | `createEffect`, tracked | `watch(source, act)`: only `source` is tracked |
| Destructured props | Fine (values are re-read each render) | Lose reactivity; use `props.x` or `splitProps` | Stay live; the compiler rewrites them |
| Lists | `.map` with `key`, re-rendered | `<For>` | `.map` with `key`, compiled to a keyed list |
| Async | `Suspense` with a data library | `createResource`, `Suspense` | `resource`, `<Boundary>` |
| Shared state | Context or a store library | `createStore`, context | `defineState`, with `persist`, `sync` and `history` as options |
| Mistakes | Lint rules | Lint rules | Compiler errors with a fix, and an autofix where safe |

Coming from React, the habits that matter are covered: `useState(prop)` is `W005`, hooks are `W020` with the Weft form
to use, and React's prop names (`className`, `htmlFor`, `onChange` per keystroke, camelCase SVG attributes) work on
native elements. See [React prop names](https://github.com/Ravonus/weft/blob/main/docs/react-props.md).

Coming from Solid, the model is close. The differences are `.value` boxes instead of getter calls, destructured props
that stay live, plain `.map` instead of `<For>`, and checks that run in the compiler rather than a linter.

## Size

Brotli sizes of production builds, as `node scripts/size.mjs` in this package reports them, measured on 2026-11-10.
`size.mjs` fails when an entry with a budget goes over it.

| Build | Brotli | Budget |
| --- | --- | --- |
| Hello world | 1.60 KB | 3.00 KB |
| Counter (`state` + `derived`) | 2.48 KB | |
| Counter + `@weft-js/core/browser` | 3.48 KB | |
| `<Boundary>` + `resource` | 5.00 KB | |
| The `@weft-js/core` entry, every export | 5.63 KB | 6.90 KB |
| A reference shop app | 6.20 KB | 10.00 KB |
| The same app with `defineState` | 7.17 KB | 10.00 KB |
| The same app, hydrating server HTML | 7.23 KB | 10.00 KB |
| js-framework-benchmark (keyed rows) | 5.45 KB | |
| The whole runtime, every entry's exports | 13.37 KB | 13.37 KB |

What each entry adds to a page, as whole pages measured with and without it:

| Entry | A page with it | The same page without it | It adds |
| --- | --- | --- | --- |
| `@weft-js/core/head` (`setHead`) | 0.64 KB on its own | | 0.64 KB |
| `pending="shape"` (`@weft-js/core/shape`) | 6.40 KB | 6.06 KB | 0.34 KB |
| `<Surface>`, canvas 2D | 7.29 KB | 2.64 KB | 4.65 KB |
| `<Surface>`, WebGL2 | 7.31 KB | 2.64 KB | 4.67 KB |
| `<Media>` (`@weft-js/core/media`) | 8.06 KB | 1.60 KB (hello world) | about 6.5 KB |

The full runtime lands on exactly 13.37 KB on purpose. `src/egg.ts` pads it with the digits of π, in an export nothing
reads, so no app ships them. Apps pay only for what they import, so the other rows are what a real page costs.

## Troubleshooting

<details>
<summary><strong>The build fails with a code like <code>W001</code> or <code>W015</code></strong></summary>

That is a compiler error, and the message says what to write instead. `npx weft docs W001` prints the full page with
an example, and `npx weft fix` applies the safe autofixes. Warnings (`W004`, `W016`, `W017`, `W018`, `W056`) print but
don't fail the build.

</details>

<details>
<summary><strong>A value renders once and never updates</strong></summary>

Something was computed in the component body, which runs once. The compiler catches the common forms (`W001`, `W005`,
`W018`, `W040`, `W041`). If it didn't, look for a value read outside JSX, `derived`, `watch` or a handler, and wrap it
in `derived`.

</details>

<details>
<summary><strong><code>weft: rendered fresh, a key differs between server and client</code></strong></summary>

Hydration found server HTML whose keys don't match the client's, so it rebuilt that part. The usual cause is a `key`
from `Date.now()`, `Math.random()` or `crypto.randomUUID()` (`W044`). Key on a stable id from the data. Also check
that both builds use `weft({ hydratable: true })` and render the same component tree. In dev,
`N server element(s) were never claimed` names the first element the client didn't adopt.

</details>

<details>
<summary><strong>A <code>&lt;Boundary&gt;</code> fallback never shows</strong></summary>

The resource was created above the Boundary, in the same component. A Boundary only waits for resources created while
its children are built. Move the `resource` call into a child component.

</details>

<details>
<summary><strong><code>weft: WEFT_COMPILER=native, and no addon for … loads</code></strong></summary>

You pinned the native compiler on a platform with no prebuilt addon, or the addon failed to install. Unset
`WEFT_COMPILER` to fall back to WASM, or reinstall with optional dependencies enabled (some CI setups pass
`--no-optional`). `npx weft doctor` shows which addon was wanted and why it was skipped.

</details>

<details>
<summary><strong>A class or <code>data-variant</code> style is missing in production only</strong></summary>

The CSS purge removed a rule whose name no built file mentions, usually because the name is assembled at run time.
Add it to `weft({ purge: { keep: ['name'] } })`, or set `purge: false` to confirm that's the cause.

</details>

<details>
<summary><strong>TypeScript errors in <code>vite.config.ts</code> or on props</strong></summary>

- `@weft-js/core/vite` has no type declarations yet, so a strict `vite.config.ts` that TypeScript checks reports
  TS7016. Keep config files out of `include`, as the scaffold does.
- Plain `tsc` reports TS7006 on unannotated, inferred props and can't connect `bind:n` to `n`. Run `weft tsc`, or
  write `n={bind(box)}`, which plain `tsc` accepts.

</details>

<details>
<summary><strong>A test fails after it passes, with <code>T012</code></strong></summary>

Something the test opened, a listener, timer or socket, was still open after it ended. `leaks()` from
`@weft-js/core/test` lists it. Create listeners with `on` and `interval` from `@weft-js/core/browser` so their owner
removes them.

</details>

<details>
<summary><strong><code>StateError</code> with <code>S008</code> or <code>S009</code></strong></summary>

`S008`: persistence or sync is set up wrongly, for example `sync: 'tabs'` without `persist`, with `'session'`, or an
object box persisted without a `schema`. It also fires when a scope persists a box but
`@weft-js/core/persist` isn't loaded: the Vite plugin adds that import, so without the plugin, add
`import '@weft-js/core/persist'` yourself. `S009`: two `defineState` scopes share a name, the setup returned a reserved
`$` key, or code used `$history` on a scope without `history`.

</details>

## Related packages

| Package | What it is |
| --- | --- |
| [`@weft-js/start`](https://www.npmjs.com/package/@weft-js/start) | The full stack: file routes, server functions, streaming SSR, a database, auth and live data |
| [`@weft-js/cli`](https://www.npmjs.com/package/@weft-js/cli) | The `weft` command: `dev`, `build`, `check`, `fix`, `docs`, `doctor`, the agent layer and the MCP server |
| [`@weft-js/create`](https://www.npmjs.com/package/@weft-js/create) | Scaffolds an app: `npm create @weft-js` |
| [`@weft-js/warp`](https://www.npmjs.com/package/@weft-js/warp) | The UI toolkit for Weft: layout primitives and accessible components |
| [`@weft-js/warp-core`](https://www.npmjs.com/package/@weft-js/warp-core) | Warp's tokens, CSS and framework-agnostic behavior |
| [`@weft-js/warp-icons`](https://www.npmjs.com/package/@weft-js/warp-icons) | Icons for Warp and Weft |
| [`@weft-js/db`](https://www.npmjs.com/package/@weft-js/db) | Weft's data layers and list sources, with each driver an optional peer |

## Contributing

Read [CONTRIBUTING.md](https://github.com/Ravonus/weft/blob/main/CONTRIBUTING.md) first. From the repository root,
`pnpm run setup` installs every package and builds the compiler, which needs Rust. Then, in `packages/core`:

```bash
pnpm run build:native   # after a compiler change
pnpm test               # the style check, then Vitest
pnpm run parity         # native and WASM output must match
node scripts/size.mjs   # brotli sizes against the budgets
```

`node --test scripts/node-style.test.mjs` runs the style-generation check directly in Node. It stays `.mjs` because
Node runs it without a TypeScript loader. In a checkout, a native addon or WASM build older than the compiler source
is an error, not a fallback: rebuild with `pnpm run build:native`.

`src/egg.ts` pads the full runtime to exactly 13.37 KB. Run `node scripts/egg.mjs` last, after any merge that changes
the runtime.

The source is in [`packages/core`](https://github.com/Ravonus/weft/tree/main/packages/core), and issues go to
[GitHub](https://github.com/Ravonus/weft/issues).

## License

[MIT](https://github.com/Ravonus/weft/blob/main/LICENSE)
