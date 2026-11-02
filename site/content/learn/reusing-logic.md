# Reusing logic

:::learn
- How to pull state, derived values and effects out of a component into a plain function
- Why such a function needs no rules about call order, and the one rule it does have
- Why you pass getters into it, and what to return from it
- How to tell sharing logic from sharing state
- How warp-core's framework-free behaviours attach to elements with `use`
:::

Two components often need the same bit of behaviour: follow the pointer, debounce what was typed, know whether the
network is up, count something with a reset. In React you'd write a custom hook, `useSomething()`, and follow the rules
of hooks to call it. In weft you write a function. It calls `state`, `derived`, `watch` or `on` like a component body
does, returns what the caller needs, and that's all.

:::demo escape-debounce

## A function that makes state

Here's the debounced value from the demo, on its own:

```tsx
// src/lib/debounced.ts
import { state, untrack, watch, type Derived } from '@weft-js/core'

/** `source`'s value once it has stopped changing for `ms`. Call it while a component is being set up. */
export function debounced<T>(source: () => T, ms: number): Derived<T> {
  const settled = state(untrack(source))
  watch(source, value => {
    const timer = setTimeout(() => (settled.value = value), ms)
    return () => clearTimeout(timer)
  })
  return settled
}
```

And a component using it:

```tsx
import { state } from '@weft-js/core'
import { Input } from '@weft-js/warp'
import { debounced } from '../lib/debounced'

export function Search() {
  const typed = state('')
  const query = debounced(() => typed.value.trim(), 400)
  return (
    <div>
      <Input label="Search" value={typed.value} onInput={e => (typed.value = e.currentTarget.value)} />
      <p>Searching for “{query.value}”</p>
    </div>
  )
}
```

Nothing about `debounced` is special. It runs inside `Search`'s body, so the box it makes and the `watch` it starts
belong to `Search`, exactly as if you had written them there. When `Search` goes, the `watch` stops and its last timer is
cleared. Each call makes its own box, so two search fields with two `debounced` values don't share anything.

### Why it takes a function

`debounced` takes `() => typed.value`, not `typed.value`. That's the most important habit for functions like this.

A component body runs once, and so does a function called from it. If you passed `typed.value`, the function would
get the string as it was at that moment, `''`, and never hear about a change. A getter is something the function can
call again, from a `watch` source or a `derived`, and weft follows whatever the getter reads. So the input stays live.

The same goes for props. Pass `() => props.delay`, not `props.delay`. Reading a prop in the body to hand it over is
also **W001**, because the body runs once.

:::note When to take a box instead
If the function needs to *write* the value, take the box itself, typed `State<T>`. That's the same rule as for
components: pass a box only to give write access. Most functions only read, so a getter is the norm.
:::

### What to return

Return what the caller needs, in the shape that reads best at the call:

- **One value**: return the box or `derived` itself, as `debounced` does. Type it `Derived<T>` when callers should only
  read it; a `State<T>` fits that type, so you can return the box you write internally.
- **Several things**: return an object, `{ count, increment, reset }`. Callers destructure it or keep the object.
- **Actions only**: return functions. They close over the boxes, so they always see the current values.

```tsx
import { derived, state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

function counter(start = 0, step = 1) {
  const count = state(start)
  const even = derived(() => count.value % 2 === 0)
  return {
    count,
    even,
    increment: () => (count.value += step),
    reset: () => (count.value = start),
  }
}

export function Tally() {
  const cups = counter()
  const pages = counter(10, 5)
  return (
    <div>
      <Button onClick={cups.increment}>Cups: {cups.count.value}</Button>
      <Button onClick={pages.increment}>Pages: {pages.count.value} {pages.even.value ? '(even)' : ''}</Button>
      <Button emphasis="ghost" onClick={() => { cups.reset(); pages.reset() }}>Reset both</Button>
    </div>
  )
}
```

Don't destructure a box's `.value` out of what you return: `const { count: { value } } = counter()` copies the number
once. Keep the box and read `.value` where you use it, as with props.

## The one rule: call it during setup

React's rules of hooks exist because React finds each hook's state by the order of calls in each render. weft doesn't
re-run components, so there's no order to keep. You can call these functions in an `if`, in a loop, or in another
function:

```tsx
import { state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

function counter(start = 0) {
  const count = state(start)
  return { count, increment: () => count.value++ }
}

const NAMES = ['Tea', 'Coffee', 'Water']

export function Drinks() {
  // A counter per name, made in a loop. React would forbid this; here it's an ordinary array.
  const counts = NAMES.map(name => ({ name, ...counter() }))
  return <p>{counts.map(c => <Button key={c.name} onClick={c.increment}>{c.name}: {c.count.value}</Button>)}</p>
}
```

What weft does care about is *when* you call them. `watch`, `on`, `interval` and the browser values attach to the owner
being set up, so the function must run while one is: in a component body, in `onMount`, in a `defineState` setup, or
inside `createRoot`. From a click handler, a timer, a promise callback or after an `await`, there's no owner, and what
they start would never stop. weft reports the browser values there as **W051**, and they throw in development.
[Cleanup and ownership](/learn/cleanup-and-ownership) has the details, and `createRoot` for when you really must start
something from a handler.

A function that only makes `state` and `derived` values can be called anywhere, but the same habit serves you well.

## Naming

Name these functions after what they give you, in the style of weft's own: `online()`, `visible()`, `debounced()`,
`counter()`, `pointer()`. There's no `use` prefix to mark them, because nothing needs to find them: no linter has to
check their call order. A custom `useX()` hook written from React habit is one of the React-isms in weft's diagnostics
catalog (W020), so a `use` name also reads as a mistake to anyone, or any agent, who knows weft.

## Listening to the browser

A function can listen to the browser the same way a component does, with `on` from `@weft-js/core/browser`. The
listener belongs to whoever called the function:

:::demo escape-pointer

```tsx
// src/lib/pointer.ts
import { state } from '@weft-js/core'
import { on } from '@weft-js/core/browser'

/** Where the pointer is over `el()`. The listener goes when the caller's owner does. */
export function pointer(el: () => HTMLElement | undefined) {
  const at = state({ x: 0, y: 0, inside: false })
  on(window, 'pointermove', e => {
    const box = el()?.getBoundingClientRect()
    if (!box) return
    const x = Math.round(e.clientX - box.left), y = Math.round(e.clientY - box.top)
    at.value = { x, y, inside: x >= 0 && y >= 0 && x <= box.width && y <= box.height }
  })
  return at
}
```

It takes the element as a getter too, because the element doesn't exist yet when the function is called: the ref is
assigned later, when the TSX is made. By the time a `pointermove` arrives, it's there.

Before writing one of these, check `@weft-js/core/browser`. React's documentation builds a `useOnlineStatus` hook as its
example; in weft that's `online()`, already written, sharing one listener across every component that reads it. The
same module has `visible()`, `lifecycle()`, `media(query)`, `on`, `interval` and a typed channel between tabs:
[Reference: browser](/reference/browser).

## Sharing logic, or sharing state?

A function like `counter()` shares *logic*: every call makes its own boxes. Two components that call it count
separately. When two components should see the *same* value, you don't want a function, you want one box that both
read:

- For state the whole app shares, a cart, the signed-in user, settings, use `defineState`. Its setup runs once, and
  every component that imports it reads the same boxes. See [App-wide state with defineState](/learn/app-wide-state).
- For state one part of the page shares, pass the box down, or provide it with `context` so the subtree can read it
  without props. See [Passing data deeply](/learn/passing-data-deeply).
- For two siblings, lift the box into their parent. See [Sharing state between components](/learn/sharing-state).

You can combine them: a `defineState` setup can call your functions, since it runs with an owner like a component body.

## Behaviours from warp-core

warp, weft's UI kit, keeps most of its behaviour in `@weft-js/warp-core`, a package that never imports a framework.
Focus handling, tooltips, sliders, listboxes and the rest are *actions*: a function that takes an element and options
and returns `{ update, destroy }`. That shape is the same one Svelte calls an action, and it's how warp-core stays
usable from any framework.

weft attaches an action with `use` from `@weft-js/warp-core/weft`:

```tsx
import { state } from '@weft-js/core'
import type { Action } from '@weft-js/warp-core'
import { use } from '@weft-js/warp-core/weft'

/** Grows a textarea with its text, up to `max` lines. Plain DOM: no framework in here. */
function autosize(el: HTMLTextAreaElement, opts: { max: number }): Action<{ max: number }> {
  let max = opts.max
  const fit = () => {
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, line * max)}px`
  }
  el.addEventListener('input', fit)
  fit()
  return {
    update(next) { max = next.max; fit() },
    destroy() { el.removeEventListener('input', fit) },
  }
}

export function Note() {
  const lines = state(5)
  let box: HTMLTextAreaElement | undefined
  use(autosize, () => box, () => ({ max: lines.value }))
  return <textarea ref={el => (box = el)} aria-label="Note" rows={1} />
}
```

`use(make, el, opts)` waits until the component is mounted, makes the action with the element and the current options,
calls `update` whenever what `opts` reads changes, and calls `destroy` when the component goes. It's a reusable function
like the others on this page, built from `onMount`, `watch` and `onCleanup`. warp's own components use it for nearly
everything they do to an element.

Write an action rather than a weft function when the behaviour is pure DOM and you'd like it to work outside weft too,
or when you're adding to warp-core itself. For app code, a plain weft function is usually simpler.

## Recap

- React's custom hooks are plain functions in weft. They call `state`, `derived`, `watch` and `on`, and return what
  the caller needs.
- What they make belongs to the component that called them, and is disposed with it.
- Pass getters (`() => box.value`, `() => props.x`) so inputs stay live; pass a box only to give write access.
- There are no rules about call order: call them in loops and conditions if you like. Call them during setup, where
  there's an owner, not from handlers or after `await`.
- Name them after what they return. No `use` prefix.
- Each call makes its own state. To share one value, use `defineState`, `context` or a box in a common parent.
- warp-core's actions are framework-free behaviours; `use(make, el, opts)` attaches one to an element.

## Try it

:::challenge Extract a toggle
Several components have a box that flips between `true` and `false`, with a function to flip it. Write
`toggle(initial)` that returns `{ on, flip, set }`, and use it in a component with two independent toggles.
:::solution
The box and the actions live in the function; each call makes a new box.

```tsx
import { state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

function toggle(initial = false) {
  const on = state(initial)
  return {
    on,
    flip: () => (on.value = !on.value),
    set: (value: boolean) => (on.value = value),
  }
}

export function Settings() {
  const sound = toggle(true)
  const motion = toggle()
  return (
    <div>
      <Button onClick={sound.flip}>Sound {sound.on.value ? 'on' : 'off'}</Button>
      <Button onClick={motion.flip}>Motion {motion.on.value ? 'on' : 'off'}</Button>
      <Button emphasis="ghost" onClick={() => { sound.set(false); motion.set(false) }}>All off</Button>
    </div>
  )
}
```
:::

:::challenge The window's width
Write `windowWidth()`, which returns the window's inner width as a value that follows resizes, and works when the
component is rendered on the server (where there's no `window`). Show it in a component.
:::solution
Start from `innerWidth` in the browser and a fixed guess on the server, and listen to `resize` with `on`, which does
nothing on the server and removes itself with the caller.

```tsx
import { state, type Derived } from '@weft-js/core'
import { on } from '@weft-js/core/browser'

function windowWidth(ssr = 1024): Derived<number> {
  const width = state(typeof window === 'undefined' ? ssr : window.innerWidth)
  if (typeof window !== 'undefined') on(window, 'resize', () => (width.value = window.innerWidth))
  return width
}

export function Layout() {
  const width = windowWidth()
  return <p>{width.value < 600 ? 'Phone layout' : 'Wide layout'} ({width.value} px)</p>
}
```

For layout, a CSS media query or `media('(max-width: 599px)', { ssr: false })` from `@weft-js/core/browser` is often
the better tool: it changes only when the answer does, not on every pixel.
:::

:::challenge A countdown with a live start
Write `countdown(from)` that counts down once a second to zero and exposes `{ left, done }`. `from` should be live: when
it changes, the countdown starts over from the new number. Use it with a prop.
:::solution
Take `from` as a getter, so the function can follow it. A `watch` on it starts a timer per run, and its cleanup clears
the old one when `from` changes or the component goes.

```tsx
import { derived, state, watch } from '@weft-js/core'

function countdown(from: () => number) {
  const left = state(0)
  watch(from, start => {
    left.value = start
    const id = setInterval(() => {
      if (left.value > 0) left.value--
    }, 1000)
    return () => clearInterval(id)
  })
  return { left, done: derived(() => left.value === 0) }
}

export function Timer(props: { seconds: number }) {
  const timer = countdown(() => props.seconds)
  return <p>{timer.done.value ? 'Time is up' : `${timer.left.value} s left`}</p>
}
```

Passing `props.seconds` instead of the getter would start once from the first value, and the body read would be
**W001**.
:::
