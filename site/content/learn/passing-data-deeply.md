# Passing data deeply

:::learn
- What "prop drilling" is, and when it's a problem
- How to give a whole subtree a value with `context(fallback)`, `provide` and `use`
- How a provided box keeps every reader up to date
- Where a context must be read, and why
- When a module box or `defineState` is the better tool
:::

Passing props is the clearest way to get data from a parent to a child: you can read the call site and see what flows
where. It gets tiresome when a value has to pass through many components that don't use it, only to reach one deep
below. A *context* lets a parent make a value available to everything built inside it, however deep, without passing it
through each layer.

## The problem with passing props

Say a `Section` component knows how deep it is in an outline, and every heading inside it should be one level smaller.
With props, each `Title` needs a `level`, and every section has to pass the right one to every title in it:

```tsx
<Section>
  <Title level={2}>Lisbon</Title>
  <Section>
    <Title level={3}>Where to eat</Title>
    <Title level={3}>Where to stay</Title>
  </Section>
</Section>
```

Move a block into a deeper section and you have to fix every number. Worse, in a real app the components in the middle
often know nothing about the value: a layout passes a `user` to a sidebar so the sidebar can pass it to an avatar. This
is called *prop drilling*.

It would be better if a `Title` could ask "how deep am I?" and get the answer from the nearest section above it. That's
what a context does.

## Context: a value for a subtree

:::demo manage-context

No `Title` above is given a level. Each asks the context, and the nearest `Section` above it answers. Here is how it
works, in three steps.

### Step 1: create the context

```ts
import { context } from '@weft-js/core'

type Level = 2 | 3 | 4 | 5 | 6
export const LevelContext = context<Level>(2)
```

`context(fallback)` returns an object with two members, `provide` and `use`. The fallback is what `use` gives where no
one has provided a value. Make the context in a module, so the components that provide it and the ones that read it can
import the same object.

### Step 2: read it with `use`

```tsx
function Title(props: { children?: unknown }) {
  const level = LevelContext.use
  return <Heading level={level}>{props.children}</Heading>
}
```

`use` is a property, not a function: `LevelContext.use`, with no parentheses. It returns the value from the nearest
`provide` above the component, or the fallback.

### Step 3: provide it with `provide`

```tsx
function Section(props: { children?: unknown }) {
  const inner = Math.min(LevelContext.use + 1, 6) as Level
  return LevelContext.provide(inner, () => (
    <section>{props.children}</section>
  ))
}
```

`provide(value, fn)` runs `fn` and returns what it returns. Everything `fn` builds, and everything built inside that, reads
`value` from `use`. Here a section reads its own level and gives the content inside it one more. Sections nest, so the
levels count themselves.

Here is the whole thing as one module. This time the provider is an expression inside JSX, which works too:

```tsx
import { context } from '@weft-js/core'

const ThemeContext = context<'light' | 'dark'>('light')

function Label() {
  const theme = ThemeContext.use
  return <p>This text is on a {theme} background.</p>
}

export function Page() {
  return (
    <>
      <Label />
      {ThemeContext.provide('dark', () => (
        <div data-theme="dark">
          <Label />
        </div>
      ))}
    </>
  )
}
```

The first `Label` is outside any provider and reads the fallback, `light`. The second reads `dark`.

:::note Build the subtree inside the function
Pass `provide` a function that builds the subtree, as `() => <div>{props.children}</div>` does, rather than a subtree
built beforehand. A component reads the context when it's made, so it has to be made inside `fn`. `props.children` is
built when it's read, which is why reading it inside `fn` works.

Wrapping it in an element, as here, also means content that appears *later* under the provider, such as the inside of a
`{show.value && …}` branch or a new list row, is still made inside the provider and reads its value.
:::

## A context's value is read once

In React, a context value can change, and every component that uses it renders again. In weft, nothing renders again.
`Section` above runs once, calls `provide` once, and the level it gives is fixed. That suits values that are part of the
structure, like a level.

For a value that changes, provide a **box**. The context holds the box, which never changes, and every reader reads its
`.value`, which does:

:::demo manage-theme

```tsx
import { context, state, type State } from '@weft-js/core'

const Armed = context<State<boolean>>(state(false))

function DeleteButton() {
  const armed = Armed.use
  return <button
    type="button"
    disabled={!armed.value}
  >
    Delete everything
  </button>
}

function Actions() {
  return <div><DeleteButton /></div>
}

export function DangerZone() {
  const armed = state(false)
  return Armed.provide(armed, () => (
    <section>
      <label>
        <input
          type="checkbox"
          checked={armed.value}
          onChange={e => (armed.value = e.currentTarget.checked)}
        /> Allow
        deleting
      </label>
      <Actions />
    </section>
  ))
}
```

`Actions` in the middle passes nothing. `DeleteButton` gets the box from the context and reads `armed.value` in its JSX,
so it follows the switch, and it could write the box too. Only the button's `disabled` attribute updates when the switch
moves.

## Read the context in the body

`use` looks for the nearest provider from *where the code is running*. While a component is being made, that's the
component's place in the tree. Read it there, in the body, and keep the result:

```tsx
function DeleteButton() {
  // Right: read once, while the component is made.
  const armed = Armed.use
  return <button
    type="button"
    onClick={() => console.log(armed.value)}
  >
    Delete
  </button>
}
```

:::pitfall Reading `use` in a handler or after `await`
A click handler runs later, from the browser's event loop, not from inside the tree. If it reads `Armed.use` itself,
there's no provider above it to find, and it gets the **fallback**:

```tsx
// This reads the fallback's value.
<button type="button" onClick={() => console.log(Armed.use.value)}>
  Delete
</button>
```

The same goes for code after an `await`, a `setTimeout` callback, or anything else that runs outside the component's
setup. Read `use` in the body, as a `const`, and use that from the handler. Reading it in JSX or in a `derived` is fine
too: those belong to the component.
:::

## Compared with React

| React | weft |
|---|---|
| `const Ctx = createContext(fallback)` | `const Ctx = context(fallback)` |
| `<Ctx value={v}>…</Ctx>` (or `<Ctx.Provider>`) | `Ctx.provide(v, () => <>…</>)` |
| `useContext(Ctx)` | `Ctx.use` |
| A new value renders every reader again | The value is read once; provide a box for a value that changes |
| Can't be called in a handler (hook rules) | Can be read anywhere in setup; in a handler it finds no provider |

`provide` is a function, not a component, so there's no provider component to import. If you want one, it's a few
lines:

```tsx
import { context, derived, type Derived } from '@weft-js/core'

type Density = 'compact' | 'cozy'
const defaultDensity = derived<Density>(() => 'cozy')
export const DensityContext = context<Derived<Density>>(
  defaultDensity,
)

export function DensityScope(
  props: { value: Density; children?: unknown },
) {
  const density = derived(() => props.value)
  return DensityContext.provide(density, () => (
    <div data-density={props.value}>{props.children}</div>
  ))
}
```

Note the `derived`. Passing `props.value` straight to `provide` would read the prop once, when `DensityScope` is made, and
miss every later change; weft reports that as **W001**. A derived value of the prop is live, like a box, and readers read
`.value`. If you do mean the first value only, say so with `untrack(() => props.value)`.

:::deepdive How `use` finds its value
Every component, list row and `provide` is made under an *owner*: the thing that will dispose of it. Owners form a chain
back to the root of the app. `provide` makes a new owner, puts the value on it, and runs `fn` under it. `use` walks up
the owner chain from the code running now and takes the first value it finds for that context.

That's also why `use` gives the fallback in a handler: by the time a click arrives, nothing is being made, so there's no
owner to start from. And it's why a subtree built under `provide` is disposed of with the component that called it: it's
owned by it.

weft uses this itself. Each `defineState` scope finds which app it belongs to through a context (a server renders many
apps at once, one per request), and `<Boundary>` finds the resources inside it the same way.
:::

## Before you use context

Context is tempting because it's quiet. Every value you take out of the props is a value a reader can no longer see at
the call site. Before you reach for it:

- **Start by passing props.** Ten components that each pass one prop is not a problem; it's explicit. Someone reading the
  code can see where the data goes.
- **Pass JSX instead.** If a layout only passes `user` down so a deep child can show an avatar, let the layout take the
  avatar as `children` or a prop, and build it where `user` is: `<Layout sidebar={<Avatar user={user} />}>`. The layer in
  the middle no longer needs to know about `user`.

### Context, a module box, or `defineState`?

There are three ways for distant components to share a value. They fit different jobs:

| Tool | One value per | Use it for |
|---|---|---|
| `context` | subtree: different parts of the page can provide different values | a heading level, a form's layout, the theme of one panel, a list's density |
| A box in a module | JavaScript module: one for the whole browser tab, and one for the whole server | client-only state, such as whether a dev panel is open |
| `defineState` scope | app: one per tab, and one per request on the server | app state such as a basket, the signed-in user's preferences, an editor's document |

If every part of the app sees the same value, you don't need a context: import a `defineState` scope where you need it.
It has persistence, tab sync and undo built in. That's [App-wide state with defineState](/learn/app-wide-state).

Reach for context when the answer depends on *where* in the tree you ask.

## Recap

- Prop drilling is passing a value through components that don't use it. Props are still the default; context is for the
  cases where drilling hurts.
- `const Ctx = context(fallback)` makes a context. `Ctx.provide(value, () => …)` gives a value to everything built inside;
  `Ctx.use` reads the nearest one, or the fallback.
- The provided value is read once. Provide a box for a value that changes, and read its `.value`.
- Read `use` while the component is made: in the body, JSX or a `derived`. In a handler it finds the fallback.
- Use `defineState` for app-wide state, and context for values that depend on where in the tree you are.

## Try it

:::challenge Image size without drilling
Every `Photo` in a gallery takes a `size` prop that the gallery passes through a `Row` that doesn't use it. Remove the
prop drilling with a context, and let a "Large" checkbox change every photo.

```tsx
function Photo(props: { name: string; size: number }) {
  const { name, size } = props
  return <img
    alt={name}
    width={size}
    height={size}
    src={`/photos/${name}.jpg`}
  />
}
function Row(props: { names: string[]; size: number }) {
  const { names, size } = props
  return (
    <div>
      {names.map(n => (
        <Photo
          key={n}
          name={n}
          size={size}
        />
      ))}
    </div>
  )
}
```
:::solution
```tsx
import { context, state, type State } from '@weft-js/core'

const Size = context<State<number>>(state(100))

function Photo(props: { name: string }) {
  const { name } = props
  const size = Size.use
  return <img
    alt={name}
    width={size.value}
    height={size.value}
    src={`/photos/${name}.jpg`}
  />
}

function Row(props: { names: string[] }) {
  const { names } = props
  return <div>{names.map(n => <Photo key={n} name={n} />)}</div>
}

export function Gallery() {
  const size = state(100)
  return Size.provide(size, () => (
    <section>
      <label>
        <input
          type="checkbox"
          checked={size.value === 150}
          onChange={e => (
            size.value = e.currentTarget.checked ? 150 : 100
          )}
        />
        Large
      </label>
      <Row names={['tram', 'harbour', 'tiles']} />
    </section>
  ))
}
```
The context holds the box, so the checkbox changes `size.value` and every photo's width follows, while `Row` knows
nothing about sizes.
:::

:::challenge The fallback in the handler
This button always logs `guest`, even inside a provider for `ana`. Fix it.

```tsx
const User = context('guest')

function Greet() {
  return <button
    type="button"
    onClick={() => console.log(`Hello, ${User.use}`)}
  >
    Greet
  </button>
}
```
:::solution
```tsx
import { context } from '@weft-js/core'

const User = context('guest')

function Greet() {
  const user = User.use
  return <button
    type="button"
    onClick={() => console.log(`Hello, ${user}`)}
  >
    Greet
  </button>
}

export function App() {
  return User.provide('ana', () => <Greet />)
}
```
The handler runs after the component was made, with no provider above it, so `use` there finds the fallback. Read it in
the body and close over the result.
:::

:::challenge Sections that count themselves
Write `Section` and `Title` so that titles nested in sections get smaller automatically, starting from `h2`, and never
going past `h6`.
:::solution
```tsx
import { context } from '@weft-js/core'

type Level = 2 | 3 | 4 | 5 | 6
const LevelContext = context<Level>(2)

export function Section(props: { children?: unknown }) {
  const inner = Math.min(LevelContext.use + 1, 6) as Level
  return LevelContext.provide(inner, () => (
    <section>{props.children}</section>
  ))
}

export function Title(props: { children?: unknown }) {
  const level = LevelContext.use
  return (
    <>
      {level === 2 && <h2>{props.children}</h2>}
      {level === 3 && <h3>{props.children}</h3>}
      {level === 4 && <h4>{props.children}</h4>}
      {level >= 5 && <h5>{props.children}</h5>}
    </>
  )
}
```
Each section reads the level around it and provides one more, so nesting is all it takes. (warp's `Heading` takes a
`level` prop and does the tag choice for you, as the demo at the top of the page does.)
:::
