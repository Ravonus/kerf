# State: a box with .value

:::learn
- How to give a component memory with `state`
- Why state is a box, and why you read and write `.value`
- Why a plain variable doesn't update the page
- How to keep several boxes, and why each copy of a component has its own
- How Weft's boxes compare with React's `useState`
:::

Components often need to remember things. A product card remembers how many are in the cart; a gallery remembers which
picture it's on; a form remembers what you typed. In Weft that memory is *state*, and a piece of state is a box: `state(0)`
makes a box holding `0`, and you read and write it through `.value`.

:::demo getting-started

## When a plain variable isn't enough

Here's a gallery that should move to the next picture when you press Next. It keeps its position in a `let`:

<!-- example: skip deliberately broken: W041 is the point of the example -->
```tsx
import { Button } from '@weft-js/warp'

const pictures = [
  'Homenaje a la Neurocirugía',
  'Floralis Genérica',
  'Eternal Presence',
]

export function Gallery() {
  let index = 0
  return (
    <section>
      <h2>{pictures[index]}</h2>
      <Button onClick={() => index++}>Next</Button>
    </section>
  )
}
```

Pressing Next changes `index`, but the heading never moves. The component body ran once, built the heading from `index`
as it was then, and finished. Nothing reads `index` again, and nothing knows it changed.

The fix is to make it state. The catalog names a `let` that a handler changes and JSX reads **W041**, but this Weft
doesn't report it yet, so watch for it yourself. (A `let` that names a prop is different, and allowed: see
[Passing props](/learn/passing-props).)

To update the page, a value needs two things:

1. It has to **keep its value** for as long as the component is on the page.
2. Changing it has to **reach the parts of the page that show it**.

A box does both.

## Adding a box

Import `state` from `@weft-js/core` and make a box in the component body:

```tsx
import { state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

const pictures = [
  'Homenaje a la Neurocirugía',
  'Floralis Genérica',
  'Eternal Presence',
]

export function Gallery() {
  const index = state(0)
  return (
    <section>
      <h2>{pictures[index.value]}</h2>
      <Button
        onClick={() => (
          index.value = (index.value + 1) % pictures.length
        )}
      >
        Next
      </Button>
    </section>
  )
}
```

Three changes: `state(0)` makes the box, the heading reads `index.value`, and the handler writes `index.value`. Now the
heading follows:

:::demo interact-gallery

## Meet your first box

`state(initial)` returns an object of type `State<T>` with a `value` property. That's all a box is, from the outside:

```tsx
const index = state(0)
index.value        // read: 0
index.value = 1    // write
index.value++      // read, then write: 2
```

`.value` is how Weft knows who reads what. When JSX reads `index.value`, that spot in the page subscribes to the box. When
a handler writes it, the box tells exactly those spots, and they update. `Gallery` doesn't run again; nothing else on the
page does either.

`index` itself is `const`, and stays the same box for the life of the component. Only what's inside changes. That's why
the box can keep its value: the body ran once, but the box it made lives on in every closure and binding that holds it.

The type comes from the initial value. When it can't, say it:

```tsx
import { state } from '@weft-js/core'

type Draft = { text: string; at: number }

export function makeBoxes() {
  const name = state('')                       // State<string>
  // Without <…> this would be State<null>.
  const picked = state<string | null>(null)
  // Without <…> this would be State<never[]>.
  const drafts = state<Draft[]>([])
  return { name, picked, drafts }
}
```

:::pitfall Always `.value`, JSX included
`{index}` renders the box, not the number inside it. That's **W015**, and the fix is to add `.value`. The same goes for
attributes: `disabled={busy.value}`, not `disabled={busy}`.

When you pass a box to another component, pass `.value` unless the child should write it. Passing a box where the child
expects a number, or the other way round, is **W008** in the catalog (not reported yet). See
[Writing to a parent with bind:](/learn/bind) for the cases where passing the box is the point.
:::

:::deepdive Why a box, and not a variable or a setter?
A plain variable can't tell anyone it changed: JavaScript has no hook for "this `let` was reassigned". React solves this
by running your whole component again after each change and comparing the result. Weft doesn't re-run components, so it
needs the reads and writes themselves to be visible, and a property access is the cheapest place to see them. Reading
`.value` registers the reader; writing `.value` tells the readers.

React's `useState` gives you a value and a setter:

```tsx
const [index, setIndex] = useState(0)   // React
setIndex(index + 1)

const index = state(0)                   // weft
index.value = index.value + 1
```

The differences follow from that:

- **One name, not two.** You read and write through the same box.
- **No snapshot.** `index.value` right after a write is the new value. In React, `index` stays the old value until the
  next render. [How an update reaches the DOM](/learn/how-updates-reach-the-dom) shows what this means in practice.
- **No hook rules.** `useState` must be called in the same order on every render, so never in a condition or a loop. A Weft
  component runs once, so there's no order to keep: a box is an object you make like any other.
- **Nothing re-renders.** A write updates the spots that read the box, not the component.

If you have used signals in Solid, Preact or Vue, a box is the same idea, with `.value` where Solid uses a call.
:::

## Writing the same value does nothing

A write compares the new value with the old one using `Object.is`. If they're the same, nothing happens: no reader runs,
nothing on the page is touched.

```tsx
const size = state('small')
size.value = 'small'   // same string: nothing happens
size.value = 'large'   // different: readers update
```

For numbers and strings that's what you'd expect. For objects and arrays it means you must give the box a *new* object
for a change to count. Changing a property inside the object the box already holds is invisible to it. That's the subject
of [Updating objects and arrays](/learn/updating-objects-and-arrays).

## Giving a component several boxes

A component can have as many boxes as it needs. The gallery above has two: `index` for which picture, and `showMore` for
whether the details are open:

```tsx
const index = state(0)
const showMore = state(false)
```

They change for different reasons, so they're separate. Pressing Next writes `index`; only what reads `index` updates.
Pressing Show details writes `showMore`; only the details update.

When two values always change together, one box holding an object can be clearer:

```tsx
// A pointer position: x and y move together.
const position = state({ x: 0, y: 0 })
```

[Choosing the state structure](/learn/choosing-state-structure) has the guidelines. And a value you can work out from
other boxes isn't state at all: make it [`derived`](/learn/derived) and it can never go stale.

## State is per component instance

Each place you use a component runs its function once, so each one makes its own boxes. Two counters are two counters:

:::demo interact-instances

Pressing `+1` on Coffee writes Coffee's box. Tea's box is a different object, made by a different run of the same
function, and doesn't change.

State is also private. The parent of a `Counter` can't read or write the count inside it; the count belongs to that
`Counter`. When two components need the same value, you move the box up to their common parent and pass it down, or
share it app-wide:

- [Sharing state between components](/learn/sharing-state) moves a box up and passes `.value` down.
- [Writing to a parent with bind:](/learn/bind) lets a child write a box its parent owns.
- [App-wide state with defineState](/learn/app-wide-state) makes a named scope of boxes any component can import.

:::note A box at module level
A box made outside any component, at the top of a module, is shared by everything that imports it. That's handy in a
small client-only demo, but on a server it would be shared by every request: the catalog names that **W030**, though this
Weft doesn't report it yet. Use `defineState` for state that should be app-wide.
:::

## Names in the dev tools

In a development build, the compiler gives each box a name from where it was made: `const index = state(0)` in `Gallery`
is called `Gallery.index`. That's the name you see in the reactive graph (`weft browser snapshot`, the dev overlay, and
`graph()` from `@weft-js/core/devtools`), and the name an AI agent sees through `weft mcp`. You don't write anything for it.

A box made inside a helper function rather than straight in a component has no such name. `name(box, 'label')` from
`@weft-js/core` gives it one, and returns the box so you can wrap the call:

```tsx
import { name, state } from '@weft-js/core'

export function makeToggle(label: string) {
  return name(state(false), `toggle.${label}`)
}
```

In a production build `name` does nothing.

## Recap

- A plain variable doesn't keep a change on the page: the body ran once. Make it `state`.
- `state(initial)` makes a box. Read and write `.value`, in handlers and in JSX alike (**W015** without it).
- Reading `.value` subscribes; writing it updates exactly the readers. The component doesn't run again.
- A write that is `Object.is` the old value does nothing, so objects and arrays need a new value to count as changed.
- A component can have many boxes. Each instance has its own, and they're private to it.
- Compared with `useState`: one name instead of two, no snapshot, no hook rules, no re-render.

## Try it

:::challenge Remove from the cart
In the add-to-cart demo at the top of the page, add a second button that takes one away, but never below zero.
:::solution
```tsx
<Button
  emphasis="ghost"
  disabled={inCart.value === 0}
  onClick={() => inCart.value--}
>
  Remove
</Button>
```

`disabled` reads `inCart.value`, so the button turns off at zero and on again as soon as you add one.
:::

:::challenge Complete the gallery
Add a Previous button to the gallery. Neither button should go past the ends: disable Previous on the first picture and
Next on the last, and show "2 of 3" between them.

```tsx
import { state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

const pictures = [
  'Homenaje a la Neurocirugía',
  'Floralis Genérica',
  'Eternal Presence',
]

export function Gallery() {
  const index = state(0)
  return (
    <section>
      <h2>{pictures[index.value]}</h2>
      <Button onClick={() => index.value++}>Next</Button>
    </section>
  )
}
```
:::solution
```tsx
import { state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

const pictures = [
  'Homenaje a la Neurocirugía',
  'Floralis Genérica',
  'Eternal Presence',
]

export function Gallery() {
  const index = state(0)
  return (
    <section>
      <h2>{pictures[index.value]}</h2>
      <Button
        emphasis="outline"
        disabled={index.value === 0}
        onClick={() => index.value--}
      >
        Previous
      </Button>
      <span> {index.value + 1} of {pictures.length} </span>
      <Button
        disabled={index.value === pictures.length - 1}
        onClick={() => index.value++}
      >
        Next
      </Button>
    </section>
  )
}
```

Each `disabled` reads `index.value`, so both buttons follow the box with no extra code.
:::

:::challenge Fix a stuck form
Typing in this form does nothing to the greeting. Fix it.

<!-- example: skip deliberately broken: the challenge is to fix the two lets -->
```tsx
import { Input } from '@weft-js/warp'

export function Greeting() {
  let first = ''
  let last = ''
  return (
    <section>
      <Input
        label="First name"
        value={first}
        onInput={e => (first = e.currentTarget.value)}
      />
      <Input
        label="Last name"
        value={last}
        onInput={e => (last = e.currentTarget.value)}
      />
      <p>Hi, {first} {last}</p>
    </section>
  )
}
```
:::solution
```tsx
import { state } from '@weft-js/core'
import { Input } from '@weft-js/warp'

export function Greeting() {
  const first = state('')
  const last = state('')
  return (
    <section>
      <Input
        label="First name"
        value={first.value}
        onInput={e => (first.value = e.currentTarget.value)}
      />
      <Input
        label="Last name"
        value={last.value}
        onInput={e => (last.value = e.currentTarget.value)}
      />
      <p>Hi, {first.value} {last.value}</p>
    </section>
  )
}
```

Each `let` becomes a box, and every read and write goes through `.value`, so the greeting follows both fields.
:::
