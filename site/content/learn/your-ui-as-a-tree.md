# Your UI as a tree

:::learn
- What the render tree is, and where it can change
- How Weft's ownership tree decides what gets cleaned up, and when
- What the module dependency tree is, and how it decides which code reaches the browser
- How islands and hydration follow from these trees
:::

Your app is components inside components. Trees are a natural way to picture that: a root at the top, branches below,
leaves at the ends. Weft works with three trees. The render tree is the one you see. The ownership tree is the one Weft
uses to clean up. The module tree is the one your imports make, and it decides what JavaScript is sent to the browser.
They have the same shape most of the time, and knowing where they differ explains a lot of Weft's behaviour.

## The render tree

A component can render other components, which render others in turn. Drawn out, with each component as a node and each
"renders" as a line from parent to child, that's the render tree:

```tsx
function Search() {
  return <input aria-label="Search" />
}

function Sidebar() {
  return (
    <aside>
      <Search />
    </aside>
  )
}

function Article() {
  return (
    <article>
      <p>Words.</p>
    </article>
  )
}

export default function Page() {
  return (
    <main>
      <Sidebar />
      <Article />
    </main>
  )
}
```

```
Page
├── Sidebar
│   └── Search
└── Article
```

`Page` is the root. `Sidebar` and `Article` are its children. `Search` is a leaf: it renders only HTML. Components near
the top tend to arrange the page; components near the leaves tend to be the small, reused pieces. HTML elements aren't
in the picture: the tree is about your components and the decisions they make.

With `@weft-js/start`, the root of each page is its layouts and route: `src/routes/_layout.tsx` renders the route inside
it, so the layouts sit at the top of the render tree and the route's page below them.

### Where the tree changes

In React, a component's place in the tree is redrawn every time it renders. In Weft, each component runs once, so the
tree is built once, top to bottom, and then holds still. It changes in exactly two kinds of place:

- **Conditions**: `{open.value && <Sidebar />}` and `{a ? <A /> : <B />}`. When the condition flips, the branch under
  it is removed and the other built. See [Conditional rendering](/learn/conditional-rendering).
- **Lists**: `{items.value.map(i => <Row key={i.id} … />)}`. A new key adds a row's subtree, a gone key removes one,
  and a moved key moves one. See [Rendering lists](/learn/rendering-lists).

Everything else is fixed for as long as its parent is on the page. A text node or an attribute can change its value, but
the components themselves stay where they are.

## The ownership tree

Every live thing Weft makes (a binding in your markup, a `derived`, a `watch`, an `onCleanup` callback) has an owner:
whatever was running when it was made. When an owner goes away, everything it owns goes with it: bindings stop, watches
stop, and cleanups run, children first.

The owner of a component's work is the binding that created the component. For `{open.value && <Sidebar />}`, that's
the binding for the condition. So the ownership tree has the same shape as the render tree, with one extra node at each
place the tree can change. That's what makes removing a branch safe: the condition's binding owns everything under it,
and disposing it disposes all of it, however deep.

:::demo describe-tree

Each `Part` in the demo says when it's made (`onMount`) and when it's cleaned up (`onCleanup`). Removing the sidebar
disposes the condition's branch, and both `Sidebar` and `Search` report being cleaned up, though only `Sidebar` was
named in the condition. `Page` isn't touched. Adding it back runs both components again, from the start.

Lists work the same way, row by row. Each row of a keyed list is a root of its own, owned by the list. Removing an item
disposes only that row's subtree; moving one moves the subtree and keeps its owner.

:::note You rarely see owners directly
You don't create owners in everyday code: components, conditions and lists make them for you. You use the ownership tree
through `onCleanup`, which registers a function on the current owner, and through `watch`, which can return a cleanup
that runs before its next run and when its owner goes away. [Cleanup and ownership](/learn/cleanup-and-ownership)
covers these in depth.
:::

### Context follows the ownership tree

Some values should reach a whole subtree without being passed through every component: a theme, the signed-in user, a
form's settings. `context()` from `@weft-js/core` does this along the ownership tree. `provide` sets a value for
everything created inside it, and `use` reads the nearest one above:

```tsx
import { context } from '@weft-js/core'

const Theme = context<'light' | 'dark'>('light')

function Swatch() {
  return <p>The theme is {Theme.use}.</p>
}

export function Themed() {
  return <section>{Theme.provide('dark', () => <Swatch />)}</section>
}
```

`Swatch` doesn't take a prop and isn't told the theme: it looks up the ownership tree and finds the nearest `provide`.
[Passing data deeply](/learn/passing-data-deeply) is the page on this.

:::deepdive Roots you make yourself
At the very top of the ownership tree is a root. `render(() => <App />, element)` from `@weft-js/core/dom` makes one for
a client-only app, and `@weft-js/start` makes one for each page for you. You can make your own with `createRoot` for live
code that should outlive the component that started it, or that runs outside any component:

```ts
import { createRoot, state, watch } from '@weft-js/core'

export const price = state(10)

// This root keeps the watch alive until `stop` is called.
export const stop = createRoot(dispose => {
  watch(
    () => price.value,
    p => console.log('price is now', p),
  )
  return dispose
})
```

`createRoot` runs its function under a new owner and hands it `dispose`, which ends that owner and everything it owns.
Without a root, a `watch` made outside any component has no owner to end it, and it lives until the page does.
:::

## The module dependency tree

The third tree is made by your imports. Each file is a node, and each `import` is a line to the file it imports. The
root is an entry: a route, a layout. Build tools use this tree to decide what goes in each bundle: a file that no route
reaches isn't bundled at all.

```
src/routes/index.tsx
├── #/components/Gallery.tsx
│   └── #/components/Profile.tsx
├── #/server/todos.ts        (server only: the browser gets a stub)
└── @weft-js/warp
```

The module tree and the render tree are related but not the same. A file can export several components; a component
can render one it never imports, passed in as `children`; and an import can be used for something other than rendering.

## Islands: how the trees decide what reaches the browser

With `@weft-js/start`, every page is rendered to HTML on the server, the whole render tree at once. Then the browser
needs code only for the parts that must do something there. Weft works out which parts those are by reading the module
tree and each file's components:

- A component **needs the browser** if it has an event handler or a `ref` on an element, does something as its module
  loads, or reads Weft's reactive API (it makes state, reads a query, uses a box from somewhere else). Reading another
  binding that needs the browser counts too, across files: the analysis follows your imports.
- A component that needs none of that is **static**: the server's HTML is all it ever is, and it ships no JavaScript.
- Where static code renders a component that needs the browser, that call site becomes an **island**: a piece of the
  page that loads its own code and takes over the server's HTML (it hydrates) without rebuilding it.

So in the tree above, if only `Profile` has a button with a handler, the browser gets the code for `Profile`, and
`Gallery` and the route stay HTML. The tree also explains the limits: a component rendered inside an island is part of
that island, and ships with it, even if it's static itself.

By default islands load lazily: an island that only reacts to events loads when someone interacts with it, and the event
that woke it is replayed once it's ready, so no click is lost. One whose work starts by itself loads when it scrolls into
view, or with the page if it must. `hydration` in `weft.config.ts` changes this: `'partial'` loads every island with the
page, and `'full'` hydrates each route whole, as a single-page app would.

When the analysis can't see something you know, say so with a comment above the component: `// @weft client` to always
ship it, `// @weft static` to never ship it, or `// @weft visible` to load it when it comes into view.
[SSR, islands and hydration](/learn/ssr-and-hydration) covers the details.

:::deepdive Why the module tree, and not the render tree?
The render tree only exists once the page runs, and on the server it's thrown away after the HTML is written. The module
tree is known at build time, from your source, so Weft can decide what each page ships before anyone visits it. That
decision errs one way only: something the analysis can't see through is treated as needing the browser. The worst case
is a few extra bytes, never a button that doesn't work.
:::

## Recap

- The render tree is your components nested inside each other. In Weft it's built once and changes only at conditions
  and keyed lists.
- The ownership tree has the same shape, plus a node at each condition and list. Disposing an owner stops everything
  below it and runs its cleanups.
- `context()` passes values down the ownership tree; `createRoot` makes a root of your own.
- The module tree is your imports. Weft reads it to decide which components need the browser and which call sites are
  islands; static components ship no JavaScript.
- `hydration` in `weft.config.ts` and the `@weft client`, `@weft static` and `@weft visible` comments adjust that
  decision.

## Try it

:::challenge Draw the render tree
Draw the render tree for this page, and mark the places where it can change.

<!-- example: skip a drawing exercise, not a module to compile -->
```tsx
function Planet(props: { name: string }) {
  return <li>{props.name}</li>
}

function Moon() {
  return <p>The moon</p>
}

export default function Sky() {
  const night = state(true)
  const planets = state([
    { id: 1, name: 'Venus' },
    { id: 2, name: 'Mars' },
  ])
  return (
    <section>
      {night.value && <Moon />}
      <ul>
        {planets.value.map(p => (
          <Planet key={p.id} name={p.name} />
        ))}
      </ul>
    </section>
  )
}
```
:::solution
```
Sky
├── {night.value && …}      can change: the branch is added or removed
│   └── Moon
└── {planets.value.map(…)}  rows change and move by key
    ├── Planet (key 1)
    └── Planet (key 2)
```
`Sky` itself never changes place. Under it, the condition and the list are the two points where subtrees come and go,
and each is an owner for what's below it.
:::

:::challenge Predict the cleanups
In the tree demo on this page, `Search` registers an `onCleanup`. Nothing in `Sidebar` mentions `Search`'s cleanup. Why
does it run when the sidebar is removed?
:::solution
`Search` was created while `Sidebar`'s markup was being built, inside the binding for `{open.value && …}`. That binding
is `Search`'s owner's owner. When `open` turns false, the binding disposes everything it owned the last time it ran, all
the way down, and every `onCleanup` registered there runs. Ownership follows creation, so no component has to pass
cleanups along.
:::

:::challenge What ships?
In this app, which components send JavaScript to the browser?

<!-- example: skip a reading exercise: three files in one block -->
```tsx
// Header.tsx
export function Header() {
  return <h1>Shop</h1>
}

// AddButton.tsx
export function AddButton() {
  const count = state(0)
  return (
    <button onClick={() => count.value++}>
      Add ({count.value})
    </button>
  )
}

// routes/index.tsx
export default function Home() {
  return (
    <>
      <Header />
      <AddButton />
    </>
  )
}
```
:::solution
Only `AddButton`. It has a handler and makes state, so it needs the browser, and since `Home` doesn't, `<AddButton />`
in `Home` becomes an island. `Header` renders plain HTML, and `Home` only arranges the two, so both stay as the server's
HTML and ship no code.
:::
