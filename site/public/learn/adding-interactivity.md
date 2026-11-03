# Adding interactivity

:::learn
- How to respond to clicks, typing and other events
- How a component remembers things with state
- How a change reaches the page without anything re-rendering
- How to update objects and arrays, let a child write to its parent, and build forms
:::

Some things on the screen change in response to what people do. Typing in a search box filters a list; pressing a button
adds to a cart; picking a picture in a gallery shows it. In weft, data that changes over time is called *state*. Any
component can hold it in a box, and handlers change it. This chapter covers both, and what happens between a change and
the page showing it.

If you know React, most of this will look familiar, with one difference that runs through every page: a weft component
runs once. There is no re-render. Each spot on the page that reads a box updates when that box changes, and nothing else
does.

## Responding to events

You add interactivity by passing functions to `on` attributes such as `onClick`, `onInput` and `onKeyDown`. A function
like that is an *event handler*. It runs when the event happens, and usually changes some state:

:::demo events

Components can take handlers as props too, so a `Toolbar` can draw the buttons while its parent decides what each one
does. Events bubble up through the page, and a handler can stop that with `e.stopPropagation()`, or stop the browser's own
action with `e.preventDefault()`.

Read **[Responding to events](/learn/responding-to-events)** to learn how to write handlers, pass them as props, and control
how events travel.

## State: a box with .value

A component that should remember something keeps it in a box. `state(0)` makes one; you read and write it through
`.value`, in handlers and in JSX alike:

```tsx
import { state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

export function Like() {
  const likes = state(0)
  return <Button onClick={() => likes.value++}>♥ {likes.value}</Button>
}
```

A plain `let` wouldn't work: the component ran once, so nothing would read it again. A box is different, because reading
`.value` subscribes and writing it tells the readers. A component can keep several boxes, and each copy of a component
has its own:

:::demo interact-gallery

Read **[State: a box with .value](/learn/state)** to learn why state is a box, how it compares with React's `useState`,
and why each instance has its own.

## How an update reaches the DOM

When a handler writes a box, the box changes at once, and the bits of the page that read it are queued. After the
handler, the queue runs once and each binding writes the one DOM node it owns. Your component isn't called again.

So, unlike React's state, there is no snapshot. A read after a write sees the new value, and three writes in a row add up:

:::demo interact-three

Read **[How an update reaches the DOM](/learn/how-updates-reach-the-dom)** to learn what the compiler makes of your JSX,
when the page catches up with your boxes, and what `flush()`, `batch()` and `untrack()` are for.

## Updating objects and arrays

A box compares a new value with the old one using `Object.is`. Changing a property of the object a box holds doesn't write
the box, so nothing updates. Treat objects and arrays in boxes as read-only: make a new one, or let `set` copy it for you.

```tsx
import { state } from '@weft-js/core'

export function makeTodos() {
  const todos = state([{ id: 0, title: 'Buy milk', done: false }])
  const add = (title: string) => (todos.value = [...todos.value, { id: todos.value.length, title, done: false }])
  const toggle = (id: number) => (todos.value = todos.value.map(t => (t.id === id ? { ...t, done: !t.done } : t)))
  const rename = (title: string) => todos.set(d => { d[0] = { ...d[0]!, title } })
  return { todos, add, toggle, rename }
}
```

Read **[Updating objects and arrays](/learn/updating-objects-and-arrays)** to learn how to add, remove and change items,
update nested objects, and what `set` does and doesn't copy.

## Writing to a parent with bind:

A child can change its own props, but those changes stay in the child. When the parent wants them, it says so where it
uses the child, with `bind:`:

```tsx
import { state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

function Stepper(props: { value?: number }) {
  let { value = 0 } = props
  return <Button onClick={() => value++}>{value}</Button>
}

export function Booking() {
  const guests = state(2)
  return (
    <section>
      <Stepper bind:value={guests} />
      <p>Table for {guests.value}</p>
    </section>
  )
}
```

Only the call site decides whether a write leaves a component, so reading a parent tells you every way its state can
change.

Read **[Writing to a parent with bind:](/learn/bind)** to learn how `bind:` works, how it's typed, and when to pass a box
instead.

## Forms and inputs

Every input follows the same pattern: `value` shows the box, and a handler writes it. warp's controls take the same
props, and some, like `Select` and `NumberField`, take the box itself:

:::demo interact-controls

Read **[Forms and inputs](/learn/forms-and-inputs)** to learn each kind of input, when to let the browser keep a value,
and how to submit a form.

## What's next

Head to [Responding to events](/learn/responding-to-events) to start reading this chapter page by page.

Or, if you're comfortable with these topics already, read about [Managing state](/learn/managing-state): how to structure
it, derive values from it, and share it between components.
