# Editor and TypeScript setup

:::learn
- What your editor shows for a Kerf app, and how to set it up
- Why you run `kerf tsc` rather than `tsc`, and what it adds
- How to name another component's props with `Props<typeof X>`
- Which build of the compiler you're running, and why you never need Rust
- How to look at the live reactive graph in the browser
:::

You have an app from [Installation](/learn/installation). Before you write much of it, it helps to know what's watching
your code: the editor, TypeScript, and Kerf's compiler each see something different, and each has a place in your day.
This page goes through all three, then the devtools that show you the running page.

## Your editor

A Kerf app is TypeScript and TSX, so any editor that speaks TypeScript works. What Kerf adds is **prop inference**: you
leave a component's props unannotated, and Kerf works out their types from the places that render it.

```tsx
// src/components/Greeting.tsx
export function Greeting(props: { name: string; excited: boolean }) {
  return <p>Hello, {props.name}{props.excited ? '!' : '.'}</p>
}
```

Written that way, the type is spelled out by hand. In a Kerf app you can also write `function Greeting(props)` and let
the callers decide: `<Greeting name="Ada" excited />` makes `name` a `string` and `excited` a `boolean`. Your editor shows
those types on hover, completes them, and reports a wrong one at the caller. For that, it has to see what Kerf
inferred, and that takes one of two pieces:

| Your editor runs | What gives it Kerf's types | Set up by |
|---|---|---|
| TypeScript's own server (`tsserver`), as VS Code does | A plugin, `@kerf/cli/ts-plugin`, in `tsconfig.json` | The generator, for VS Code |
| TypeScript 7's `tsc --lsp` | `kerf lsp`, a language server in front of it | You, in the editor's language-server settings |

### VS Code

A new app is already set up. Its `tsconfig.json` names the plugin:

```json
{
  "compilerOptions": {
    "plugins": [{ "name": "@kerf/cli/ts-plugin" }]
  }
}
```

And `.vscode/settings.json` tells VS Code where to look for it, since the plugin lives in the app's own `node_modules`:

```json
{ "typescript.tsserver.pluginPaths": ["."] }
```

For an app you made some other way, add both. Then restart the TypeScript server (the command palette's
"TypeScript: Restart TS Server") so it loads the plugin.

### An editor on TypeScript 7

TypeScript 7 loads no plugins: it reads the `plugins` entry in `tsconfig.json` and ignores it without a word. An editor
that runs TypeScript 7's language server directly gets Kerf's types from `kerf lsp` instead. Point the editor's
TypeScript language-server command at it:

```bash
npx kerf lsp
```

`kerf lsp` sits between the editor and `tsc --lsp`, adds the inferred types, and maps every position back to your
source. Hover and diagnostics are tested. Completion and go-to-definition go through the same mapping. No editor
extension launches it for you yet, so you set it up by hand.

### What the editor doesn't show

The editor shows TypeScript's errors, and the prop-inference diagnostics (W080–W085). The compiler's own diagnostics,
such as W001 or W015, come from the compiler, which the editor doesn't run. You see those in two places:

- **`kerf dev`** compiles each file as you save it. An error stops that file and shows in the terminal and on the page;
  a warning prints in the terminal.
- **`kerf check`** compiles every file and reports everything at once.

[Diagnostics and kerf check](/learn/diagnostics) is about reading them.

:::note Completion in the config
`kerf.config.ts` is typed through `defineConfig`, so the editor completes its keys. If you chose `--config json` or
`yaml`, `kerf check` writes `.kerf/config.schema.json`, and the generated file already points at it (`$schema` in JSON, a
`yaml-language-server` comment in YAML).
:::

## TypeScript

The generator writes a strict `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "jsx": "preserve",
    "jsxImportSource": "@kerf/core",
    "lib": ["es2023", "dom", "dom.iterable"],
    "paths": { "#/*": ["./src/*"] },
    "types": ["@kerf/core/client", "node"],
    "plugins": [{ "name": "@kerf/cli/ts-plugin" }]
  },
  "include": ["src", "kerf.config.ts", ".kerf/*.d.ts"]
}
```

The lines that are Kerf's own:

- **`"jsx": "preserve"` and `"jsxImportSource": "@kerf/core"`** hand TSX to Kerf's compiler and take its JSX types
  from `@kerf/core`. TypeScript doesn't turn TSX into function calls; the compiler turns it into DOM code.
- **`"types": ["@kerf/core/client"]`** declares what the Vite plugin adds to imports: a `.css` import, and the
  `?media` imports. `node` is there when the app has a server with a database.
- **`"paths": { "#/*": ["./src/*"] }`** lets you write `import { db } from '#/db/index.server'` from anywhere in `src`.
- **`.kerf/*.d.ts`** are types Kerf generates, such as the ones for plugin slots.

The app's `typescript` is pinned to version 7 in `devDependencies`, because the prop inference uses its checker.

### `kerf tsc`, not `tsc`

Type-check the whole project with:

```bash
npx kerf tsc
```

The app's `typecheck` script runs the same thing. `kerf tsc` runs TypeScript's checker with Kerf's inferred props
applied, so it sees what your editor sees. Plain `tsc` can't, and it goes wrong in two ways:

- **It reports TS7006 on every inferred parameter.** To `tsc`, `function Greeting(props)` is a parameter with no type
  under `strict`. Nothing can change that from outside the file.
- **It reports a `bind:` prop as missing.** `<Stepper bind:count={count} />` passes the box to `count`, and
  `kerf tsc` reads it as `count` with the box's value. `tsc` doesn't know the `bind:` prefix, so to it a required
  `count` was never passed.

Use `kerf tsc` in CI, and anywhere you'd have run `tsc --noEmit`. When you need code that plain `tsc` also accepts, as
in a library others will type-check, write `count={bind(count)}`: it's the same binding, in a form `tsc` understands.
[Writing to a parent with bind:](/learn/bind) is about what binding means.

```tsx
// src/components/Stepper.tsx
import { Button } from '@kerf/veneer'

export function Stepper(props: { count: number }) {
  return (
    <Button onClick={() => props.count++}>
      Count: {props.count}
    </Button>
  )
}
```

```tsx
// src/components/Counter.tsx
import { state } from '@kerf/core'
import { Stepper } from '#/components/Stepper'

export function Counter() {
  const count = state(0)
  return (
    <section>
      <Stepper bind:count={count} />
      <p>The parent sees {count.value}</p>
    </section>
  )
}
```

`kerf tsc` accepts this, and would report an error if `count` held a string. `tsc` would say `count` is missing.

### Inferred types in your files

An exported component is a public face, so Kerf writes its inferred type into the file, with an `/*inferred*/` comment
to show where it came from. `kerf dev` does it when you save, and `kerf fix` does it on demand. A diff then shows the
type, and code outside the app gets an ordinary typed function.

The codes that go with it:

- **W081**: an exported component has no written type yet. `kerf fix` writes it.
- **W082**: the written `/*inferred*/` type no longer matches the callers. `kerf fix` rewrites it. Delete the comment
  to keep the type as you wrote it.
- **W080**: a component with an untyped parameter that nothing renders. There's nothing to infer from: render it,
  delete it, or write the type.
- **W084**: one caller passes a type the component can't handle while the others agree. The odd caller is flagged.

`check: { props: 'manual' }` in `kerf.config.ts` stops `kerf dev` writing to your files, and leaves it to `kerf fix`.
`check: { props: false }` turns inference off, and then every component needs a written type.

:::pitfall An editor with unsaved changes
When `kerf dev` writes an inferred type into a file you have open with unsaved changes, your editor asks which version to
keep when you next save. Keep yours and run `kerf fix` afterwards, or set `check: { props: 'manual' }` while you're
editing exported components heavily.
:::

### `Props<typeof X>`

Sometimes you need another component's props as a type: to forward them, to build a list of them, or to wrap the
component. `Props<typeof X>` from `@kerf/core` names them, written or inferred:

```tsx
// src/components/Badge.tsx
export function Badge(props: { label: string; count: number }) {
  return (
    <span>
      {props.label}: {props.count}
    </span>
  )
}
```

```tsx
// src/components/BadgeList.tsx
import type { Props } from '@kerf/core'
import { Badge } from '#/components/Badge'

export function BadgeList(
  { items }: { items: (Props<typeof Badge> & { id: string })[] },
) {
  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>
          <Badge label={item.label} count={item.count} />
        </li>
      ))}
    </ul>
  )
}
```

When `Badge`'s props change, `BadgeList` follows. There's no separate `BadgeProps` type to keep in step.

:::deepdive When to write a type yourself
Inference covers most components. Write the type when:

- two props must agree with each other, which takes a type parameter;
- the file is `.jsx`, where there's nowhere to put an inferred type;
- the component is a public API with no caller in this repository to infer from.

Inference also has edges worth knowing. A caller that passes `any` weakens the prop, and W083 names where the `any` came
from. A prop that callers pass and the body never reads stays in the type. A component with more than one parameter
isn't inferred: Kerf components take one. The [props reference](/reference/props) has the full table.
:::

## The compiler

Kerf's compiler is written in Rust, on [Oxc](https://oxc.rs). You never need Rust to use it, because it ships two ways
and the install picks one:

| Build | Where it comes from | Speed |
|---|---|---|
| A native addon | `@kerf/compiler-<platform>`, an optional dependency that installs by itself on macOS, Linux and Windows (x64 and arm64) | The fastest |
| WebAssembly | `kerf-compiler.wasm`, inside `@kerf/core` | Slower, and runs anywhere |

Both give the same output and the same diagnostics, byte for byte; a test in the repo holds them to it. The addon only
adds speed. When it's missing, or doesn't load on your machine, Kerf uses WebAssembly and carries on.

To see which one you're on:

```bash
npx kerf doctor
```

```text
kerf 0.1.4 on Node v26.1.0
compiler: native addon (@kerf/compiler-darwin-arm64)
rust: no cargo on PATH. Not needed for kerf; only `kerf add rust`
sidecars and native() use it
```

On WebAssembly, the second line says so, and names the addon that would make it faster where one exists for your
platform. Nothing `kerf doctor` reports about the compiler fails the command: it's information. `kerf check --verbose`
adds the same compiler line to its summary.

`KERF_COMPILER=wasm` or `KERF_COMPILER=native` in the environment pins one build, if you want to compare them or rule one
out.

### The no-Rust path

There are two places Rust could come in, and neither is required:

- **Building Kerf itself.** A checkout of the repo builds its compiler with `cargo`, which is why `local.mjs` needs Rust
  today. A published install gets the prebuilt addon or WebAssembly and never builds anything.
- **Server functions written in Rust.** That's a choice you make for CPU-heavy code, with `kerf add rust`. Everything
  else in an app is TypeScript. [Rust, in depth](/learn/rust) covers when it's worth it.

A machine with no Rust toolchain creates, runs, checks, builds and starts a Kerf app.

## Devtools in the browser

In dev, the Vite plugin loads Kerf's devtools into every page. Production builds never include them. They give you the
**reactive graph**: every named box and derived value on the page, what each reads, and what reads it.

Press **Alt+Shift+G** on the page to open the overlay. It lists the graph and refreshes as you click around:

```text
Cart.count = 2 → Cart.total, 1 binding in <Cart> (Cart.tsx:6)
Cart.total = 9 ← Cart.count → 1 binding in <Cart> (Cart.tsx:6)
```

Names come from the code: `count` in a component named `Cart` is `Cart.count`, and a store made with `defineState` uses
its own names. Type in the overlay's box to filter by name.

The same is in the console as `__kerf__`:

| Call | What it does |
|---|---|
| `__kerf__.graph('Cart')` | The graph as data, filtered by a name prefix |
| `__kerf__.set('Cart.count', 5)` | Writes a box by its name, to reach a state quickly. A derived value can't be set |
| `__kerf__.errors()` | Errors the page has thrown since you last asked, with the component they came from |
| `__kerf__.overlay()` | Shows or hides the overlay |

When the app has `@testing-library/dom` and `@testing-library/user-event` installed, the page also gets
`__kerf__.agent`, which drives the page the way a test does. That's for agents and `kerf browser`, and
[Working with AI agents](/learn/working-with-agents) covers it.

:::note There's no browser extension
Kerf's devtools live in the page, so they work in any browser with nothing to install. React's are an extension; these
are a keyboard shortcut and a console global.
:::

## Recap

- VS Code is set up by the generator: a tsserver plugin in `tsconfig.json` and a line in `.vscode/settings.json`. An
  editor on TypeScript 7's own server uses `kerf lsp`.
- The editor shows TypeScript's errors and the prop-inference codes. Compiler diagnostics show in `kerf dev` and
  `kerf check`.
- Run `kerf tsc`, not `tsc`: it sees inferred props and `bind:`.
- `Props<typeof X>` names another component's props.
- The compiler is a native addon or WebAssembly, with the same output. `kerf doctor` says which. Rust is never required.
- Alt+Shift+G opens the reactive graph in dev, and `__kerf__` has it in the console.

Next, [Diagnostics and kerf check](/learn/diagnostics): what the codes mean and how to fix them.

## Try it

:::challenge Wrap a component without repeating its props
`Badge` from this page takes `label` and `count`. Write `HighlightedBadge`, which takes the same props plus `note`, a
string, and shows the badge with the note beside it. Don't write `label: string; count: number` again.
:::solution
```tsx
// src/components/HighlightedBadge.tsx
import type { Props } from '@kerf/core'
import { Badge } from '#/components/Badge'

export function HighlightedBadge(
  { label, count, note }: Props<typeof Badge> & { note: string },
) {
  return (
    <p>
      <Badge label={label} count={count} /> <em>{note}</em>
    </p>
  )
}
```

`Props<typeof Badge>` is whatever `Badge` takes, so adding a prop to `Badge` reaches `HighlightedBadge` too.
:::
