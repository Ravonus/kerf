# Importing and exporting components

:::learn
- What a root component file is, and where an app's files live
- How to import and export a component
- When to use default exports and when to use named exports
- How to keep several components in one file, and when to split them
- What Weft's compiler and tools care about in how you export
:::

Components are made to be reused, so sooner or later one file holds too many of them. Moving a component into its own
file and importing it where it's needed keeps files short and lets you use the component from anywhere in the app. This
is plain JavaScript modules: Weft adds no import system of its own, and only a few of its tools look at how you export.

## The root component file

In [Your first component](/learn/your-first-component) you wrote a `Profile` component and a `Gallery` that uses it, in
one file. In a Weft app made with `@weft-js/start`, the page a visitor sees is a route file under `src/routes`, and the
route's page is that file's default export:

```tsx
// src/routes/gallery.tsx
function Profile() {
  return <p>Katherine Johnson, mathematician</p>
}

export default function Gallery() {
  return (
    <section>
      <h1>Amazing scientists</h1>
      <Profile />
      <Profile />
      <Profile />
    </section>
  )
}
```

The file is the route `/gallery`. `index.tsx` in a folder is that folder's route, `_layout.tsx` wraps the routes beside
and below it, and `[id].tsx` takes a parameter: [Routing and layouts](/learn/routing-and-layouts) covers them. A
component that isn't a page doesn't belong in `src/routes`, because every file there becomes a route. Keep those in a
folder of their own. The scaffold doesn't make one for you; `src/components` is the usual name, and it's what these pages
use.

## Exporting and importing a component

To move `Profile` out of the route file:

1. **Make** a new file for the component.
2. **Export** the component from that file, with a default or a named export.
3. **Import** it in the file that uses it, the same way it was exported.

```tsx
// src/components/Profile.tsx
export default function Profile() {
  return <p>Katherine Johnson, mathematician</p>
}
```

```tsx
// src/routes/scientists.tsx
import Profile from '../components/Profile'

export default function Scientists() {
  return (
    <section>
      <h1>Amazing scientists</h1>
      <Profile />
      <Profile />
    </section>
  )
}
```

Notice the import: `'../components/Profile'` has no `.tsx` at the end. Vite, which runs Weft's dev server and build,
resolves the extension for you, so leave it off.

### The `#/` alias

Paths like `'../../components/Profile'` get long and break when a file moves. A Weft app has an alias for its `src`
folder: `#/components/Profile` means `src/components/Profile`, from any file.

```tsx
// src/routes/people/index.tsx
import Profile from '#/components/Profile'

export default function People() {
  return <Profile />
}
```

The alias is `paths` in `tsconfig.json` (`"#/*": ["./src/*"]`). Vite, the editor and `weft check` all read it from
there, so you can change it or add your own in that one place.

## Default and named exports

JavaScript has two kinds of export. A file can have at most one default export, and as many named exports as it likes.

| Syntax | Export statement | Import statement |
|---|---|---|
| Default | `export default function Button() {}` | `import Button from './Button'` |
| Named | `export function Button() {}` | `import { Button } from './Button'` |

With a default import you choose the local name: `import Banana from './Button'` gives you the same component under
another name. A named import must use the exported name (or rename it on purpose with `as`):
`import { Button as PlainButton } from './Button'`.

Both kinds have their place:

- **Route files** must default-export their page, because that's where `@weft-js/start` looks for it.
- **Component files** can use either. Warp, Weft's own component kit, uses named exports throughout
  (`import { Button, Card } from '@weft-js/warp'`), which has two advantages: every import of a component uses the same
  name, so a search finds every use, and an editor can offer the import as you type the name.

Pick one style for your own components and stick to it. These pages use a default export for a route's page and named
exports for everything else.

:::pitfall Name your default exports
`export default function () {}` is valid JavaScript, but give the function a name. Weft's compiler finds components by
their name: a function whose name starts with a capital letter is a component, and only a component gets its props made
live and its body checked. Hot reload swaps components by name too. An anonymous default export has no name, so it misses
all of that. `export default function Gallery() {}` costs nothing extra.
:::

## Several components in one file

You can export more than one component from a file. Here `Gallery.tsx` default-exports the gallery and also offers
`Profile` as a named export:

```tsx
// src/components/Gallery.tsx
export function Profile() {
  return <p>Alan L. Hart, physician</p>
}

export default function Gallery() {
  return (
    <section>
      <h1>Amazing scientists</h1>
      <Profile />
      <Profile />
    </section>
  )
}
```

A route can import both from the same file:

```tsx
// src/routes/team.tsx
import Gallery, { Profile } from '#/components/Gallery'

export default function Team() {
  return (
    <>
      <Profile />
      <Gallery />
    </>
  )
}
```

The `<>` and `</>` around the two components are a fragment: a way to return two things without a wrapping element.
[Writing markup with TSX](/learn/writing-markup-with-tsx) explains why you need one.

A component that's only used inside its own file doesn't need an export at all. That's the case for `Profile` in the
first example on this page, and it's fine to keep small helpers private like that.

## What Weft looks at when you export

Most of this page is JavaScript, and works as it does anywhere. A few of Weft's tools do read your exports, and knowing
what they look for saves you a surprise.

### Exported components write their prop types down

Inside one file, Weft can work out a component's prop types from the places that use it, so you may leave a private
component's props unannotated (see [Passing props](/learn/passing-props)). An export is a public API: any file may import
it, and a caller's edit shouldn't quietly change it. So `weft check` reports **W081** for an exported component whose
props have no written type, and its fix writes the inferred type for you. `weft dev` writes it on save, marked with an
`/*inferred*/` comment so it shows up in your diff; if callers later need something else, **W082** says the written type
is out of date.

```tsx
// src/components/Badge.tsx
export function Badge(props: { label: string; count: number }) {
  return (
    <span>
      {props.label} ({props.count})
    </span>
  )
}
```

### Hot reload works per component

In development, editing a component swaps that component in place: Weft registers every top-level component in a file,
and only the components whose code changed are rebuilt. A component's state survives the edit when the state keeps its
name and its starting value. A module can take its own update like this only when **everything it exports is a
component** (or a type). If a component file also exports a plain value, such as a list of prices or a helper function,
the update goes to the files that import it, and they run again instead.

So keep constants and helpers in their own modules, and keep component files to components:

```ts
// src/components/prices.ts
export const prices = { coffee: 4, tea: 3 }
```

```tsx
// src/components/Menu.tsx
import { prices } from './prices'

export function Menu() {
  return (
    <ul>
      <li>Coffee ${prices.coffee}</li>
      <li>Tea ${prices.tea}</li>
    </ul>
  )
}
```

### What reaches the browser follows your imports

With `@weft-js/start`, a page is rendered on the server, and only the components that need to run in the browser (because
they handle an event, hold state or use a `ref`) are sent there as code. Weft works this out by following your imports
from file to file, one top-level binding at a time. Two things follow from that:

- Files under `src/server/` and any file named `*.server.ts` never reach the browser. A component that imports a server
  function gets a small stub that calls the server instead.
- A component that does nothing interactive, and isn't rendered inside one that does, sends no JavaScript to the
  browser at all: the server's HTML is all it needs.

[Your UI as a tree](/learn/your-ui-as-a-tree) shows the module tree this works from, and
[SSR, islands and hydration](/learn/ssr-and-hydration) goes into the details.

:::deepdive Barrel files
A barrel is an `index.ts` that re-exports a folder's components (`export * from './Button'`), so callers can import them
all from one place. It works in Weft as anywhere, but it has a cost here: a module made only of `export * from` lines
isn't a component module, so an edit to one of its components can't be taken by the barrel itself during hot reload, and
everything that imports through it runs again. Import a component from its own file when you can, and keep barrels
for packages you publish.
:::

## Recap

- A route file in `src/routes` default-exports its page. Keep other components in their own folder, such as
  `src/components`.
- Export with `export default function X` or `export function X`, and import the same way:
  `import X from './X'` or `import { X } from './X'`.
- `#/` is the alias for `src/`, set in `tsconfig.json`.
- Name every component, default exports included: the compiler and hot reload find components by name.
- Exported components write their prop types down (W081); `weft dev` and `weft fix` write them for you.
- Keep component files to components, so hot reload can swap them in place.

## Try it

:::challenge Split the components further
This route file holds both components. Move `Scientist` to `src/components/Scientist.tsx` as a named export, and
import it in the route.

<!-- example: skip the starting point, which the solution splits in two -->
```tsx
// src/routes/scientist.tsx
function Scientist() {
  return <p>Katherine Johnson, mathematician</p>
}

export default function Scientists() {
  return (
    <section>
      <Scientist />
      <Scientist />
    </section>
  )
}
```
:::solution
```tsx
// src/components/Scientist.tsx
export function Scientist() {
  return <p>Katherine Johnson, mathematician</p>
}
```

```tsx
// src/routes/scientist.tsx
import { Scientist } from '#/components/Scientist'

export default function Scientists() {
  return (
    <section>
      <Scientist />
      <Scientist />
    </section>
  )
}
```
A named export is imported with braces and its own name. With a default export you'd write `export default function
Scientist()` and `import Scientist from '#/components/Scientist'`; both work.
:::

:::challenge Make hot reload swap the component
Editing this component's markup during development reruns every file that imports it, instead of swapping the component
in place. Why, and how do you fix it?

<!-- example: skip the starting point, deliberately mixed -->
```tsx
// src/components/Price.tsx
export const TAX = 0.2

export function Price(props: { amount: number }) {
  return <strong>${(props.amount * (1 + TAX)).toFixed(2)}</strong>
}
```
:::solution
A module takes its own hot update only when everything it exports is a component. `TAX` is a plain value, so the update
goes to the importers. Move the constant to a module of its own:

```ts
// src/components/tax.ts
export const TAX = 0.2
```

```tsx
// src/components/Price.tsx
import { TAX } from './tax'

export function Price(props: { amount: number }) {
  return <strong>${(props.amount * (1 + TAX)).toFixed(2)}</strong>
}
```
:::

:::challenge Give the export a type
`weft check` reports W081 on this file. What does it want, and what does the fix look like?

<!-- example: skip the starting point, which reports W081 -->
```tsx
// src/components/Hello.tsx
export function Hello(props) {
  return <p>Hello, {props.name}.</p>
}
```
:::solution
An exported component writes its prop type down, so a caller somewhere else can't change a public API without anyone
seeing it. `weft fix` (or saving under `weft dev`) writes the type it inferred from the callers. You can also write it
yourself:

```tsx
// src/components/Hello.tsx
export function Hello(props: { name: string }) {
  return <p>Hello, {props.name}.</p>
}
```
:::
