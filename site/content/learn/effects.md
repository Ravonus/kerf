# Effects

:::learn
- What an effect is for, and what it isn't for
- How `watch(source, act)` runs code when state changes, and cleans up after itself
- How `onMount` and `onCleanup` fit a component's life, and when each runs
- How `@weft-js/core/browser` turns browser events into values, so you rarely write a listener
:::

Most of a Weft app is state, derived values and TSX. A box changes, and everything that reads it follows: text,
attributes, lists, other derived values. None of that needs an effect. Effects are for the rest: keeping something
*outside* Weft in step with your state. A connection to a chat server, a timer, a third-party map widget, the page's
title. Weft can't update those by itself, because they aren't part of what your component renders.

In this demo, choosing a room opens a connection to it. When you choose another room, the old connection closes first:

:::demo escape-room

## `watch`: run code when something changes

`watch` takes two functions:

```tsx
import { state, watch } from '@weft-js/core'

export function ChatRoom() {
  const room = state('general')
  watch(
    () => room.value,
    name => {
      const connection = connect(name)
      return () => connection.close()
    },
  )
  return <p>Welcome to #{room.value}</p>
}

const connect = (name: string) => ({
  close: () => console.log(`closed #${name}`),
})
```

- The **source**, `() => room.value`, says what to follow. Weft notes every box it reads.
- The **act**, `name => { … }`, is the side effect. It gets the source's value, and the previous value as a second
  argument (`undefined` the first time).
- If the act **returns a function**, that is its cleanup. Weft calls it before the next act, and when the component
  goes away.

The act runs once straight away, as the component is set up, and again each time something the source read changes.
So with three room changes you get: connect to `general`; close `general`, connect to `travel`; close `travel`, connect
to `music`; and when the component is removed, close `music`. There is always exactly one open connection, and never
one left behind.

:::note Only the source is followed
The act runs untracked: reading a box inside it doesn't subscribe to that box. That's deliberate. The source says what
the effect depends on, and the act can read anything else it needs, such as the current user or a setting, without
re-running whenever those change. If you want a box to re-run the effect, read it in the source.
:::

### Following several values

The source can read as much as it likes. Return what the act needs, a tuple or an object:

```tsx
import { state, watch } from '@weft-js/core'

export function Connection() {
  const room = state('general')
  const server = state('eu.chat.example')
  watch(() => [server.value, room.value] as const, ([host, name]) => {
    const socket = new WebSocket(`wss://${host}/${name}`)
    return () => socket.close()
  })
  return <p>#{room.value} on {server.value}</p>
}
```

The act runs when *either* changes. Weft decides by what the source read, not by comparing what it returned: a new
tuple every time is fine. The flip side is that if the source computes something from several boxes, say `a.value +
b.value`, the act runs whenever `a` or `b` changes, even if the sum came out the same. When that matters, compute the
value in a `derived` and read that in the source: a `derived` only tells its readers when its result really changes.

:::deepdive watch and useEffect
React's `useEffect(fn, [deps])` and Weft's `watch(source, act)` do the same job: keep something outside in step with
state, with a cleanup in between. The differences come from components running once.

- **No dependency array.** The source is your dependency list, and Weft builds it by watching what the source reads.
  You can't forget a dependency, and there's no lint rule to keep the list honest. A dependency array written out of
  React habit is one of the React-isms in Weft's diagnostics catalog (W020).
- **It runs when it's created.** `useEffect` runs after React commits and the browser paints. A `watch` runs its act
  synchronously during setup, then whenever its source changes, before the page updates. For work that needs the
  rendered elements, use `onMount` (below).
- **No double run in development.** React's Strict Mode mounts each component twice to flush out missing cleanups.
  Weft doesn't, because nothing re-runs your component body. Write the cleanup anyway: it runs every time the source
  changes, and when the component goes.
- **No stale closures.** A React effect sees the props and state of the render that made it. A Weft act reads `.value`
  when it runs, so it always sees the current value.
:::

## `onMount` and `onCleanup`

Two smaller tools cover a component's arrival and departure.

`onMount(fn)` runs once, after the component's elements are in the document and every `ref` is set. That's the place
for DOM work: measuring, focusing, handing an element to a library. `onCleanup(fn)` runs when the component goes away.

```tsx
import { onCleanup, onMount } from '@weft-js/core'

export function Chart() {
  let canvas: HTMLCanvasElement | undefined
  onMount(() => {
    const chart = drawChart(canvas)
    onCleanup(() => chart.destroy())
  })
  return (
    <canvas
      ref={el => (canvas = el)}
      width="400"
      height="200"
      aria-label="Sales by month"
    />
  )
}

const drawChart = (el: HTMLCanvasElement | undefined) => ({
  destroy: () => el?.remove(),
})
```

`onCleanup` inside `onMount` belongs to the component, like one in the body: `onMount` runs your function under the
component's owner. If the component is removed before it ever mounted, the `onMount` callback is skipped.

Here's the stopwatch from earlier pages again. A `watch` starts and stops the timer, and a function ref gives the
button its input:

:::demo effects

The `watch` there is the whole timer: `if (!on) return` means a stopped watch starts nothing, and the returned
`clearInterval` stops the old timer whenever `running` flips or the stopwatch is removed.

## When effects run

Writes in Weft are batched. A handler can change five boxes, and nothing else runs until it returns. Then, on the next
microtask, Weft runs every effect and DOM update that the writes touched, once each:

1. Effects run in the order they were created. A component is created before its children, so a parent's effects run
   before its children's.
2. DOM bindings are effects too, so they're in the same queue. An effect created in the body is older than the bindings
   of the TSX the body returns, so it runs before them; one created in `onMount` is newer, and runs after.
3. When the queue is empty, waiting `onMount` callbacks run. If they write state, that's applied in the same pass.

`flush()` runs that queue now instead of on the next microtask, which you need when a handler must see the page as a
write left it (focusing an element it just showed, say).

### Nothing runs on the server

With server rendering, a component's body runs on the server to make HTML. `state` and `derived` work there, so the
HTML has the right content. But `watch`, `onMount` and `effect` don't run on the server at all: there's no document, no
socket worth opening, and nothing to clean up after the page is sent. They run in the browser once it takes the page
over. So an effect is also the safe place for code that touches `window` or `document`.

## `effect`: the compiler's tool

`@weft-js/core` also exports `effect(compute, apply)`. It's what the compiler emits for each live part of your TSX:
`compute` is tracked, and `apply` writes the DOM with the new value and the previous one.

```tsx
import { effect, state } from '@weft-js/core'

export function Title() {
  const unread = state(3)
  effect(
    () => unread.value,
    n => (document.title = n ? `(${n}) Inbox` : 'Inbox'),
  )
  return <p>{unread.value} unread</p>
}
```

You can call it, but `watch` is the one to write: it gives the act its previous value and a cleanup, and reads more
plainly. `effect` is there for the rare binding you write by hand.

## Browser events as values

A lot of effects in other frameworks exist to listen to the browser: is the network up, is the tab visible, does the
user prefer dark mode, which key was pressed. `@weft-js/core/browser` turns those into values you read like a box:

:::demo escape-browser

```tsx
import { state } from '@weft-js/core'
import {
  interval,
  media,
  on,
  online,
  visible,
} from '@weft-js/core/browser'

export function Toolbar() {
  const isOnline = online()
  const shown = visible()
  const dark = media('(prefers-color-scheme: dark)', { ssr: false })
  const now = state(Date.now())
  const open = state(true)
  if (typeof window !== 'undefined')
    on(window, 'keydown', e => {
      if (e.key === 'Escape') open.value = false
    })
  interval('1s', () => (now.value = Date.now()))
  return (
    <p hidden={!open.value}>
      {isOnline.value ? 'Online' : 'Offline'},{' '}
      {dark.value ? 'dark' : 'light'},{' '}
      {shown.value ? 'visible' : 'hidden'},
      {new Date(now.value).toLocaleTimeString()}
    </p>
  )
}
```

- `online()`, `visible()`, `lifecycle()` and `media(query)` are read-only values. Every component that reads one shares
  a single listener, and the listener goes when the last reader does.
- `on(target, type, fn)` is `addEventListener` that removes itself when the component goes. The event is typed from the
  target: `e` above is a `KeyboardEvent`.
- `interval(every, fn)` is `setInterval` that clears itself, with durations like `'500ms'`, `'1s'` or `'5m'`.

On the server, each value is its server value (`online` and `visible` are `true`), and `on` and `interval` do nothing.
`media` can't know the screen, so pass what the server should render: `media(query, { ssr: false })`. Leaving it out
in a server-rendered component is **W054**. The full list, with tabs and the page lifecycle, is in
[Reference: browser](/reference/browser).

:::pitfall The server has no `window`
`on` does nothing on the server, but its arguments are still worked out before it's called, and `window` doesn't
exist there. A server-rendered component that writes `on(window, …)` throws a `ReferenceError` while the page renders.
Check first, as the example above does: `if (typeof window !== 'undefined') on(window, 'keydown', …)`. An element you
reach through `ref` doesn't need this, because `onMount` only runs in the browser.
:::

:::pitfall Create them while the component is set up
`online()`, `on` and `interval` attach to the component being set up, which is how they know when to stop. Called from
a click handler, a timer or after an `await`, there's no component being set up, so nothing would ever remove them.
Weft reports that as **W051**, and throws in development. Create them in the body, or see
[Cleanup and ownership](/learn/cleanup-and-ownership) for making an owner of your own.
:::

Raw `addEventListener`, `setInterval`, `new WebSocket` or `new EventSource` in a component with no matching cleanup
is **W050**, with an edit to `on` or `interval` where one fits. You can still use them: remove the listener, clear the
interval or close the socket in `onCleanup` or a `watch` cleanup, and the warning goes.

## Two more tools

- `untrack(() => …)` reads boxes without following them. Inside a `derived` or a `watch` source, it lets you read a
  value without re-running when it changes. In a component body it's a one-time snapshot that never updates, so it isn't
  for anything you render (**W018**).
- `batch(fn)` runs `fn` and returns its result. Writes are always batched until the next flush, so it does nothing
  extra; it exists to say so at the call, for readers coming from libraries where batching is opt-in.

## Recap

- Effects keep things outside Weft in step with state. What Weft renders follows state by itself.
- `watch(source, act)`: the source is followed, the act isn't. The act runs now, then whenever what the source read
  changes. A returned function cleans up before the next run and when the component goes.
- There's no dependency array: Weft finds dependencies by watching what the source reads.
- `onMount` runs once the elements are in the document; `onCleanup` runs when the component goes.
- Effects run on the next microtask, in creation order, and never on the server. `flush()` runs them now.
- `@weft-js/core/browser` gives you `online`, `visible`, `lifecycle`, `media`, `on` and `interval`, which clean up
  after themselves. Create them in setup, not in handlers.

## Try it

:::challenge Pause the countdown when the tab is hidden
This countdown keeps ticking in a background tab. Make it pause while the page isn't visible, and carry on when it
comes back.

```tsx
import { state } from '@weft-js/core'
import { interval } from '@weft-js/core/browser'

export function Countdown() {
  const left = state(60)
  interval('1s', () => { if (left.value > 0) left.value-- })
  return <p>{left.value} s left</p>
}
```
:::solution
Follow `visible()` with a `watch`, and run a timer only while it's true. The returned cleanup clears it when the page
is hidden, and when the countdown is removed.

```tsx
import { state, watch } from '@weft-js/core'
import { visible } from '@weft-js/core/browser'

export function Countdown() {
  const left = state(60)
  const shown = visible()
  watch(
    () => shown.value,
    on => {
      if (!on) return
      const id = setInterval(() => {
        if (left.value > 0) left.value--
      }, 1000)
      return () => clearInterval(id)
    },
  )
  return <p>{left.value} s left</p>
}
```

The act can't use `interval` here: it runs again on each change, outside setup, so nothing would own a new
`interval`. A raw timer with a returned cleanup is exactly what `watch` is for.
:::

:::challenge Keep the page title in step
Show the number of unread messages in the tab's title, as `(3) Inbox`, and put the title back to what it was when the
component goes away.
:::solution
A `watch` on the count writes `document.title`. Remember the title from before the component came, and restore it in
`onCleanup`.

```tsx
import { onCleanup, state, watch } from '@weft-js/core'
import { Button } from '@weft-js/warp'

export function Inbox() {
  const unread = state(3)
  const before = typeof document === 'undefined' ? '' : document.title
  watch(
    () => unread.value,
    n => {
      document.title = n ? `(${n}) Inbox` : 'Inbox'
    },
  )
  onCleanup(() => (document.title = before))
  return (
    <Button onClick={() => unread.value++}>
      New message ({unread.value})
    </Button>
  )
}
```

The body runs on the server too, where there's no `document`, hence the `typeof` check. The `watch` and the cleanup only
run in the browser. In an app with `@weft-js/start`, a route's `meta` sets the title for you: see
[Metadata and share images](/learn/metadata-and-share-images).
:::

:::challenge Find the effect that shouldn't be one
This component works, but it has an effect it doesn't need. Find it and remove it.

```tsx
import { state, watch } from '@weft-js/core'

export function Price(props: { amount: number; quantity: number }) {
  const total = state(0)
  watch(() => props.amount * props.quantity, t => { total.value = t })
  return <p>Total: {total.value.toFixed(2)}</p>
}
```
:::solution
`total` is computed from props, so it's a `derived`, not state kept in step by a `watch`. The `watch` version holds a
second copy of the truth, and it's wrong on the server: `watch` doesn't run there, so the HTML says `0.00`.

```tsx
import { derived } from '@weft-js/core'

export function Price(props: { amount: number; quantity: number }) {
  const total = derived(() => props.amount * props.quantity)
  return <p>Total: {total.value.toFixed(2)}</p>
}
```

The next page, [You might not need an effect](/learn/you-might-not-need-an-effect), is all about this.
:::
