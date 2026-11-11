# Escape hatches

:::learn
- How to reach a DOM element when only the element can do the job
- How to keep things outside Kerf in step with your state, and when you shouldn't
- How Kerf decides when work stops, and how to clean up what you start
- How to reuse stateful logic between components with plain functions
- How to load data, show loading states, and keep text, media and canvases from moving the page
:::

So far, everything has stayed inside Kerf: state in boxes, values derived from them, TSX that follows both. That covers
most of an app. Some things live outside it, though: a DOM element you need to focus, a socket to a chat server, a
timer, a map widget, a request that answers later, a canvas. This chapter is about stepping outside, safely, and
coming back. Most apps need these tools in a few places, and the first lesson of each page is often that you need them
less than you think.

## Refs and the DOM

Some things only an element can do: take focus, scroll into view, report its size. `ref` gives you the element, as a
variable or through a function:

:::demo escape-focus

```tsx
import { Button } from '@kerf-js/veneer'

export function Focus() {
  let field: HTMLInputElement | undefined
  return (
    <div>
      <input ref={el => (field = el)} aria-label="Your name" />
      <Button onClick={() => field?.focus()}>Focus</Button>
    </div>
  )
}
```

Because a component runs once, a plain variable holds the element for its whole life: there's no `useRef` and no
`.current`.

Read **[Refs and the DOM](/learn/refs-and-the-dom)** to learn when the element exists, how to focus, scroll and measure,
and how a component hands one of its elements to its parent.

## Effects

An effect keeps something outside Kerf in step with state. `watch(source, act)` runs `act` now and whenever what
`source` read changes, and a function it returns cleans up before the next run:

:::demo escape-room

```tsx
import { state, watch } from '@kerf-js/core'

export function Room() {
  const room = state('general')
  watch(() => room.value, name => {
    const socket = new WebSocket(`wss://chat.example/${name}`)
    return () => socket.close()
  })
  return <p>#{room.value}</p>
}
```

There's no dependency array: Kerf follows what the source reads.

Read **[Effects](/learn/effects)** to learn how `watch`, `onMount` and `onCleanup` work, when they run, and how
`@kerf-js/core/browser` turns browser events into values.

## You might not need an effect

Most effects in other frameworks copy one value into another, or run code because of a click. In Kerf, a value computed
from others is `derived`, and code caused by an event goes in its handler:

```tsx
import { derived, state } from '@kerf-js/core'

export function Name() {
  const first = state('Ada')
  const last = state('Lovelace')
  // Not a watch that writes a box.
  const full = derived(() => `${first.value} ${last.value}`)
  return <p>{full.value}</p>
}
```

Read **[You might not need an effect](/learn/you-might-not-need-an-effect)** to learn the common cases, how to start a
component's state over, why data loading isn't an effect, and which diagnostics catch these.

## Cleanup and ownership

Every `watch`, listener and timer belongs to an owner: the conditional branch, list row or root that made it. When the
owner goes, what it owns stops:

:::demo escape-owner

```tsx
import { state } from '@kerf-js/core'
import { interval } from '@kerf-js/core/browser'

export function Ticker() {
  const seconds = state(0)
  // Cleared when this component's branch goes.
  interval('1s', () => seconds.value++)
  return <p>{seconds.value} s</p>
}
```

Read **[Cleanup and ownership](/learn/cleanup-and-ownership)** to learn what is disposed when, how to clean up what you
start yourself, and how `createRoot` makes an owner where there isn't one.

## Reusing logic

React has custom hooks. Kerf has functions: anything that makes state, derived values or effects can move out of a
component into a function, and each call gets its own:

```tsx
import { derived, state } from '@kerf-js/core'
import { Button } from '@kerf-js/veneer'

function counter(start = 0) {
  const count = state(start)
  return {
    count,
    double: derived(() => count.value * 2),
    increment: () => count.value++,
  }
}

export function Tally() {
  const cups = counter()
  return (
    <Button onClick={cups.increment}>
      {cups.count.value} cups, {cups.double.value} halves
    </Button>
  )
}
```

Read **[Reusing logic](/learn/reusing-logic)** to learn why there are no rules about call order, why you pass getters,
and how veneer-core's behaviours attach with `use`.

## Async and loading states

`resource` is `derived` for data that arrives later. It refetches when what it read changes and cancels the request it
no longer needs. `<Boundary>` says what to show while the first answer loads; after that, `pending` tells you a newer
one is on its way, so you can dim the old one instead of emptying the page:

:::demo loading

```tsx
import { Boundary, resource } from '@kerf-js/core'
import { Spinner } from '@kerf-js/veneer'

function Report(props: { city: string }) {
  const report = resource((signal) =>
    fetch(`/api/weather/${props.city}`, { signal }).then((r) =>
      r.text()
    )
  )
  return (
    <p aria-busy={report.pending ? 'true' : 'false'}>
      {report.value}{' '}
      {report.pending && report.value !== undefined && (
        <Spinner label="Updating" />
      )}
    </p>
  )
}

// The resource is inside the Boundary, which knows to wait.
export function Weather(props: { city: string }) {
  return (
    <Boundary pending={<p>Loading…</p>}>
      <Report city={props.city} />
    </Boundary>
  )
}
```

Read **[Async and loading states](/learn/async-and-loading)** to learn how refetches keep the page still, how errors and
retries work, and how loaded data is rendered on the server.

## Text, media and shapes

Some content needs to hold its place: text that hasn't arrived, text that streams, images, skeletons, canvases. Kerf has
a small module for each, so nothing moves as the page fills in:

:::demo escape-stream

```tsx
import { Text } from '@kerf-js/core/text'

export function Reply(props: { text: string }) {
  return <Text stream>{props.text}</Text>
}
```

Read **[Text, media and shapes](/learn/text-media-and-shapes)** to learn about `<Text>`, `<Media>`,
`<Boundary pending="shape">`, `<Surface>` and the `@kerf-js/text` plugin.

## Recap

- `ref` reaches an element; a plain `let` holds it, because a component runs once.
- `watch` keeps outside things in step with state, with no dependency array; `onMount` and `onCleanup` mark arrival
  and departure.
- Most would-be effects are `derived` values or handler code.
- Owners decide when work stops; `createRoot` makes one by hand.
- Reusable logic is a plain function called during setup.
- `resource` and `<Boundary>` load data; `<Text>`, `<Media>`, shapes and `<Surface>` keep the page still.

## What's next

Head to [Refs and the DOM](/learn/refs-and-the-dom) to start the chapter.
