# Cleanup and ownership

:::learn
- What an owner is, and why every `watch`, listener and timer has one
- What is disposed when a conditional branch, a list row or a whole app goes away
- How to clean up timers, listeners and subscriptions you start yourself
- How to make an owner by hand with `createRoot`, and when you need one
- What `getOwner`, `within` and `untrack` are for
:::

A `watch` has to stop when its component goes, or it keeps running against a page that no longer shows it. So does an
`on` listener, an `interval`, a socket, a chart widget. In the last two pages you saw that all of these clean up after
themselves. This page is about *how*: who decides when something ends, and what to do when you start something weft
didn't.

:::demo escape-owner

## Owners

Every reactive thing in weft is created *inside* something: a `derived`, a `watch`, a DOM binding the compiler made,
an `onCleanup` callback, an `on` listener. That something is its **owner**. When an owner is disposed, everything it
owns is disposed too: watches stop and run their cleanups, derived values let go of what they read, bindings stop
updating, listeners are removed, and each `onCleanup` callback runs.

Owners form a tree that mirrors your page:

- **`render` (or `hydrate`)** makes the root owner for the whole app. Calling the function `render` returns disposes it.
- **A conditional** in TSX, `{open.value && <Menu />}` or `{a ? <A /> : <B />}`, owns what its branch made. When the
  condition's value changes, the old branch is disposed and the new one is made under it.
- **Each row of a keyed list** is an owner of its own. When a key leaves the list, that row is disposed; rows whose keys
  stay are kept, with their state.
- **A `<Boundary>`** owns its content and its fallback separately, and disposes each when it's replaced.
- **A `watch` or `derived`** owns what its function creates, and disposes it before each re-run.

A component isn't an owner of its own. Its body runs once, inside whichever owner is rendering it, so what it creates
belongs to that place in the tree. That's why the demo's interval needs no cleanup code: `<Ticker />` was made by the
`shown.value && …` branch, the interval belongs to that branch, and turning the switch off disposes the branch.

:::deepdive How React compares
React keeps a fiber for each component and runs effect cleanups when the fiber unmounts. weft has no per-component
object at run time: the compiler turns your TSX into DOM nodes and a handful of bindings, and those bindings hang off
whichever owner is current. The effect is the same, things stop when the UI that made them goes, but it costs one
object per conditional or row rather than one per component, which is part of why weft's memory use stays low.
:::

## Cleaning up what you start

weft cleans up what weft made. When you start something yourself, a raw timer, a listener, a socket, a library
instance, you tell the owner how to end it, with `onCleanup`:

```tsx
import { onCleanup, state } from '@weft-js/core'

export function Clock() {
  const now = state(new Date())
  const id = setInterval(() => (now.value = new Date()), 1000)
  onCleanup(() => clearInterval(id))
  return <p>{now.value.toLocaleTimeString()}</p>
}
```

`onCleanup(fn)` registers `fn` with the current owner. It runs when the owner is disposed, or, inside a `watch` or
`derived`, before that function runs again. You can call it as many times as you like; each callback runs once.

Three ways to say the same thing, from the most specific to the most general:

| You start | Clean up with |
|---|---|
| A listener on `window`, `document` or an element | `on(target, type, fn)` from `@weft-js/core/browser`: no cleanup to write |
| A repeating timer | `interval(every, fn)`: no cleanup to write |
| Something that depends on a value (a connection per room) | `watch(source, act)` and return the cleanup |
| Anything else that lives as long as the component | `onCleanup(() => …)` beside the code that starts it |

**W050** flags a raw `addEventListener`, `setInterval`, `new WebSocket` or `new EventSource` in a component that
never removes, clears or closes it.

:::pitfall setTimeout is yours to clear too
weft doesn't flag `setTimeout`, because a one-shot timer usually ends by itself. But if it can fire after the component
is gone, and its callback touches the page or writes state, clear it:

```tsx
import { onCleanup, state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

export function Saved() {
  const shown = state(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  const flash = () => {
    shown.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (shown.value = false), 2000)
  }
  onCleanup(() => clearTimeout(timer))
  return <Button onClick={flash}>{shown.value ? 'Saved' : 'Save'}</Button>
}
```
:::

### Libraries that draw into an element

A chart, a map or a rich text editor usually takes an element and returns an object with a `destroy` method. Start it
in `onMount`, where the element exists, and register the cleanup there:

```tsx
import { onCleanup, onMount } from '@weft-js/core'

type MapView = { setCentre(lat: number, lng: number): void; destroy(): void }
declare function createMap(el: HTMLElement): MapView

export function Location(props: { lat: number; lng: number }) {
  let box: HTMLElement | undefined
  onMount(() => {
    if (!box) return
    const map = createMap(box)
    map.setCentre(props.lat, props.lng)
    onCleanup(() => map.destroy())
  })
  return <div ref={el => (box = el)} style="block-size:20rem" aria-label="Map" />
}
```

`onMount` runs your function under the component's owner, so the `onCleanup` inside it belongs to the component like
one in the body would. To keep the map centred when the props change, add a `watch` inside the same `onMount`:
`watch(() => [props.lat, props.lng] as const, ([lat, lng]) => map.setCentre(lat, lng))`.

warp's components wire their behaviours the same way, through a helper you can use too: see
[Reusing logic](/learn/reusing-logic).

## Making an owner: `createRoot`

Sometimes you need to start owned work where there is no owner. A click handler runs long after setup, so `on` or
`interval` called there has nothing to attach to: weft reports it as **W051**, and throws in development. The answer is
an owner of your own:

:::demo escape-root

```tsx
import { createRoot, onCleanup, state } from '@weft-js/core'
import { interval } from '@weft-js/core/browser'
import { Button } from '@weft-js/warp'

export function Session() {
  const seconds = state(0)
  let stop: (() => void) | undefined
  const start = () => {
    if (stop) return
    createRoot(dispose => {
      stop = dispose
      interval('1s', () => seconds.value++)
    })
  }
  const end = () => {
    stop?.()
    stop = undefined
  }
  onCleanup(end)
  return (
    <p>
      {seconds.value} s <Button onClick={start}>Start</Button> <Button onClick={end}>Stop</Button>
    </p>
  )
}
```

`createRoot(fn)` runs `fn` under a new owner and hands it `dispose`, which ends the owner and everything it owns. What
`fn` returns, `createRoot` returns.

A root **outlives the code that made it**. It isn't disposed with the component that created it, which is the point:
it lives until you call `dispose`. So whoever makes a root is responsible for ending it. Above, the component ends it in
`onCleanup`, so leaving the page stops the timer even if nobody pressed Stop.

:::note The second argument
`createRoot(fn, parent)` takes an optional parent owner. It's used to look up context values (`ctx.use` searches from
the root up through `parent`), not for disposal: a root with a parent still isn't disposed with it.
:::

### Long-lived things outside components

State that the whole app shares belongs in `defineState`, which runs its setup once, the first time something reads
it, and keeps it for the life of the app. Browser values and listeners work inside its setup, because the setup has an
owner:

```tsx
import { defineState, state } from '@weft-js/core'
import { on } from '@weft-js/core/browser'

export const keyboard = defineState('keyboard', () => {
  const lastKey = state('')
  if (typeof window !== 'undefined') on(window, 'keydown', e => (lastKey.value = e.key))
  return { lastKey }
})
```

Read it from any component as `keyboard.lastKey.value`. See [App-wide state with defineState](/learn/app-wide-state).

Avoid making boxes at module scope in an app that renders on the server: one module is shared by every request, so a
box there leaks one user's state into another's page. weft's catalog names that **W030**.

## Running code under an owner later: `getOwner` and `within`

`getOwner()` returns the owner of what's being created right now, or `null` outside one. `within(owner, fn)` runs
`fn` with that owner current, so whatever `fn` creates belongs to it. Together they let code that runs later attach to
an owner captured earlier.

That's how `onMount` itself works: it notes the component's owner while the body runs, and later runs your callback
`within` it, so an `onCleanup` inside belongs to the component. You can do the same after an `await`:

```tsx
import { getOwner, onCleanup, onMount, within } from '@weft-js/core'

type Player = { stop(): void }
declare function loadPlayer(): Promise<{ start(src: string): Player }>

export function Video(props: { src: string }) {
  const owner = getOwner()
  let alive = true
  onCleanup(() => (alive = false))
  onMount(() => {
    void loadPlayer().then(lib => {
      if (!alive || !owner) return // the component went while the library loaded
      within(owner, () => {
        const player = lib.start(props.src)
        onCleanup(() => player.stop())
      })
    })
  })
  return <div data-player="" />
}
```

Check that the component is still there before you attach: an owner that's already been disposed won't run new
cleanups. Most code never needs `within`; `createRoot` and `onMount` cover nearly every case.

:::pitfall Code after `await` has no owner
An `async` function runs its first part synchronously, then everything after the first `await` later, from the
microtask queue, with no owner. A `watch`, `on` or `interval` created there belongs to nothing and is never stopped.
Create those before the first `await`, or capture the owner and use `within` as above.
:::

## `untrack`: reading without following

The last tool here isn't about disposal, but it is about what a reactive function holds on to. Every box a `derived`,
`watch` source or TSX expression reads is followed: change it, and that function runs again. `untrack(fn)` runs `fn`
without following anything it reads:

```tsx
import { derived, state, untrack } from '@weft-js/core'

export function Total() {
  const items = state([3, 4, 5])
  const currency = state('EUR')
  // Follows `items`; reads `currency` without re-running when it changes.
  const label = derived(() => `${items.value.reduce((a, b) => a + b, 0)} ${untrack(() => currency.value)}`)
  return <p>{label.value}</p>
}
```

Use it sparingly. A value read with `untrack` is a snapshot: if it changes, nothing that read it will notice. In a
component body, `const x = untrack(() => …)` that only the TSX reads never updates, which weft reports as **W018**.
A `watch` act is already untracked, so you don't need `untrack` there.

## Recap

- Everything reactive has an owner. Disposing an owner stops what it owns and runs its `onCleanup` callbacks.
- `render` makes the root; each conditional branch, keyed row and `Boundary` side is an owner; components live in
  whichever owner renders them.
- weft cleans up what it made. For what you start, use `on` and `interval`, return a cleanup from `watch`, or call
  `onCleanup`.
- `createRoot(dispose => …)` makes an owner where there isn't one, such as in a handler. It isn't disposed with its
  creator, so end it yourself, usually in `onCleanup`.
- App-wide work goes in `defineState`, not in module-scope boxes.
- `getOwner` and `within` attach later code to an earlier owner; code after `await` has none.
- `untrack` reads without following; in a body it's a snapshot (W018).

## Try it

:::challenge Stop listening when the panel closes
This panel listens for the Escape key to close itself, but the listener stays after the panel is gone, and each time
the panel opens another one is added. Fix it.

<!-- example: skip shows the W050 leak on purpose -->
```tsx
import { state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

function Panel(props: { onClose: () => void }) {
  const close = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose() }
  window.addEventListener('keydown', close)
  return <p>Press Escape to close.</p>
}

export function Page() {
  const open = state(false)
  return (
    <div>
      <Button onClick={() => (open.value = true)}>Open</Button>
      {open.value && <Panel onClose={() => (open.value = false)} />}
    </div>
  )
}
```
:::solution
Listen with `on` from `@weft-js/core/browser`. The panel's branch owns the listener, so closing the panel removes it:

```tsx
import { state } from '@weft-js/core'
import { on } from '@weft-js/core/browser'
import { Button } from '@weft-js/warp'

function Panel(props: { onClose: () => void }) {
  if (typeof window !== 'undefined') on(window, 'keydown', e => { if (e.key === 'Escape') props.onClose() })
  return <p>Press Escape to close.</p>
}

export function Page() {
  const open = state(false)
  return (
    <div>
      <Button onClick={() => (open.value = true)}>Open</Button>
      {open.value && <Panel onClose={() => (open.value = false)} />}
    </div>
  )
}
```

`window.removeEventListener('keydown', close)` in `onCleanup` works too. The original is what **W050** reports.
:::

:::challenge A toast that dismisses itself
`notify(text)` is called from click handlers all over an app. It should show a message for three seconds, with a
countdown, and then remove it. It uses `interval` for the countdown, which needs an owner. Write it so each message owns
its own interval.
:::solution
Each call makes a root for its message. The interval belongs to that root, and the root disposes itself when the
countdown ends.

```tsx
import { createRoot, state } from '@weft-js/core'
import { interval } from '@weft-js/core/browser'

type Message = { id: number; text: string; left: () => number }
export const messages = state<Message[]>([])
let next = 0

export function notify(text: string) {
  createRoot(dispose => {
    const id = next++
    const left = state(3)
    interval('1s', () => {
      left.value--
      if (left.value > 0) return
      messages.value = messages.value.filter(m => m.id !== id)
      dispose()
    })
    messages.value = [...messages.value, { id, text, left: () => left.value }]
  })
}

export function Messages() {
  return <ul>{messages.value.map(m => <li key={m.id}>{m.text} ({m.left()} s)</li>)}</ul>
}
```

In a server-rendered app, keep `messages` in a `defineState` rather than at module scope, for the reason in W030.
:::

:::challenge Find the leak
This component loads a user's settings and then listens for changes to them. Something it starts is never stopped.
Find it and fix it.

<!-- example: skip shows the W051 leak on purpose -->
```tsx
import { state } from '@weft-js/core'
import { on } from '@weft-js/core/browser'

export function Settings() {
  const theme = state('light')
  const load = async () => {
    const res = await fetch('/api/settings')
    theme.value = ((await res.json()) as { theme: string }).theme
    on(window, 'storage', e => { if (e.key === 'theme' && e.newValue) theme.value = e.newValue })
  }
  void load()
  return <p>Theme: {theme.value}</p>
}
```
:::solution
`on` is called after an `await`, where there's no owner, so the listener is never removed (W051, and a throw in
development). Nothing about the listener depends on the fetch, so create it in the body, before anything waits:

```tsx
import { state } from '@weft-js/core'
import { on } from '@weft-js/core/browser'

export function Settings() {
  const theme = state('light')
  if (typeof window !== 'undefined') on(window, 'storage', e => { if (e.key === 'theme' && e.newValue) theme.value = e.newValue })
  const load = async () => {
    const res = await fetch('/api/settings')
    theme.value = ((await res.json()) as { theme: string }).theme
  }
  void load()
  return <p>Theme: {theme.value}</p>
}
```

Better still, load the settings with `resource` (next pages), which cancels the request if the component goes first.
:::
