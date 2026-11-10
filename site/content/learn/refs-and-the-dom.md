# Refs and the DOM

:::learn
- How to get hold of a DOM element with `ref`, as a variable or a function
- When the element exists, and where you can use it
- How a component hands one of its elements to the component that renders it
- Why a plain `let` does the job React gives to `useRef`
:::

Most of the time you never touch a DOM node. You describe the page in TSX, and the compiler wires every `{value}` to
the exact text node or attribute that shows it. But some things the browser only lets you do on an element: move focus to
it, scroll it into view, measure it, or hand it to a library that draws into it. For those you need the element itself,
and `ref` is how you ask for it.

:::demo escape-focus

## Getting an element with `ref`

Put `ref` on any element and give it a variable. When Weft makes the element, it assigns it:

```tsx
import { Button } from '@weft-js/warp'

export function Focus() {
  // oxlint-disable-next-line no-unassigned-vars -- ref assigns it
  let field!: HTMLInputElement
  return (
    <form>
      <input ref={field} aria-label="Your name" />
      <Button onClick={() => field.focus()}>Focus the field</Button>
    </form>
  )
}
```

Three things make this work:

1. `let`, not `const`. The compiler turns `ref={field}` into an assignment, `field = theInput`, so the variable must be
   assignable. With a `const` it calls the value as a function instead (next section).
2. `!` after the name tells TypeScript the variable will hold an element before you use it. Without it, TypeScript
   says `field` is used before it's assigned, because it can't see the compiler's assignment either.
3. The comment above it. Linters with the `no-unassigned-vars` rule (oxlint, and ESLint 9) flag a variable that is
   declared and read but never written. The write is in the compiled output, so the rule can't see it. Turn it off for
   that one line and say why, as above.

If you'd rather not have the `!` and the comment, use the function form below. Both are common in Weft's own code.

### The function form

`ref` also takes a function. Weft calls it once, with the element:

```tsx
import { Button } from '@weft-js/warp'

export function Focus() {
  let field: HTMLInputElement | undefined
  return (
    <form>
      <input ref={el => (field = el)} aria-label="Your name" />
      <Button onClick={() => field?.focus()}>Focus the field</Button>
    </form>
  )
}
```

Here `field` is honestly `HTMLInputElement | undefined`, so you write `field?.focus()`. The function form is also what
you use when the element goes somewhere other than one variable: into a `Map`, into a library call, or out to a parent.
`ref` takes an array of functions too, `ref={[measure, el => (field = el)]}`, and calls each one.

:::note React's `useRef`
In React, `useRef(null)` gives you a box whose `.current` React fills in. Weft has no `useRef` and no `.current`: the
variable is the element. That works because a Weft component's body runs once. In React the body runs on every render,
so a plain `let` would start over each time; here it's made once and lives as long as the component.
:::

## When the element exists

A component's body runs once, top to bottom, and the TSX it returns is what makes the elements. So while the body is
running, the element doesn't exist yet:

```tsx
export function Broken() {
  let field!: HTMLInputElement
  // TypeError: the input below has not been made yet.
  field.focus()
  return <input ref={field} aria-label="Name" />
}
```

Use the element in code that runs later:

- **Event handlers.** A click can only happen once the element is on the page.
- **`onMount(fn)`.** It runs once the component's elements are in the document, with every ref assigned. This is the
  place for work the first paint needs: measuring, focusing on arrival, starting a library.
- **`watch` after its first run.** A `watch` runs once straight away, while the body runs, and then on each change.
  On that first run the ref is still empty, so guard it with `?.` or start the `watch` inside `onMount`.

```tsx
import { onMount } from '@weft-js/core'

export function Search() {
  let field: HTMLInputElement | undefined
  onMount(() => field?.focus())
  return (
    <input
      ref={el => (field = el)}
      type="search"
      aria-label="Search"
    />
  )
}
```

`onMount` never runs on the server, because there is no document there. Neither does `ref`: the server only writes HTML,
and the browser makes the elements that `ref` points at. Code that needs an element is browser code by nature, so these
are the right places for it.

:::pitfall Focusing on arrival
For "focus this field when it appears", you don't need a ref at all. Write `autofocus` on the element. Weft focuses it
when it's created, the way React does, not only when the page first loads (which is all the plain HTML attribute does):

```tsx
export function NewTask() {
  return <input autofocus aria-label="New task" />
}
```

It skips an element inside a closed `<dialog>` or under `hidden`, where focus would be lost anyway.
:::

### An element a write just showed

Writes in Weft are batched: a handler can change five boxes, and the page updates once, on the next microtask. So right
after `open.value = true`, the element that `open` shows isn't in the page yet. If you need it now, call `flush()`
first. It applies every pending update straight away:

```tsx
import { flush, state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

export function Rename() {
  const editing = state(false)
  let field: HTMLInputElement | undefined
  const start = () => {
    editing.value = true
    flush() // the input is in the page now, and `field` holds it
    field?.select()
  }
  return (
    <div>
      {editing.value ? (
        <input
          ref={el => (field = el)}
          value="Untitled"
          aria-label="Name"
        />
      ) : (
        <Button onClick={start}>Rename</Button>
      )}
    </div>
  )
}
```

React has `flushSync` for the same job. You need it rarely: most DOM work belongs in `onMount` or a handler that runs
after the update anyway.

## Focusing, scrolling and measuring

These are the three jobs refs do most. Each one is a call on the element, from a handler or `onMount`.

**Focus** is `el.focus()`, `el.select()` and `el.blur()`, as in the demo at the top.

**Scrolling** is `el.scrollIntoView()`. When there are many elements, collect them with the function form. A ref
function in a list runs once per row, when that row's element is made:

:::demo escape-scroll

```tsx
import { Button } from '@weft-js/warp'

export function Cats(props: { names: string[] }) {
  const { names } = props
  const rows = new Map<string, HTMLElement>()
  const show = (name: string) =>
    rows.get(name)?.scrollIntoView({ block: 'nearest' })
  return (
    <div>
      <Button emphasis="soft" onClick={() => show('Orlando')}>
        Find Orlando
      </Button>
      <ol style="max-block-size:7rem;overflow:auto">
        {names.map(name => (
          <li
            key={name}
            ref={(el: HTMLElement) => rows.set(name, el)}
          >
            {name}
          </li>
        ))}
      </ol>
    </div>
  )
}
```

A row that is removed leaves its element in the map. That's harmless for a fixed list. For a long-lived list that
changes, delete the entry where you remove the item, or look the element up when you need it
(`list.querySelector(...)`) instead of keeping a map.

**Measuring** reads sizes and positions: `getBoundingClientRect()`, `offsetWidth`, `scrollHeight`. The element must be
in the document and laid out, so measure in `onMount` or later. To follow a size as it changes, start a
`ResizeObserver` in `onMount` and stop it in `onCleanup`:

:::demo escape-measure

The number on screen is state, written by the observer's callback. That's the usual shape of DOM work in Weft: the
element tells you something, you put it in a box, and the page follows the box like anything else.

:::deepdive Why there's no layout effect
React has `useLayoutEffect` for code that must run after the DOM changes but before the browser paints, such as
measuring a tooltip to place it. Weft doesn't need a second kind. `onMount` callbacks run at the end of the same
flush that put the component's nodes in the page, before the browser gets a chance to paint, and a box written there is
applied in that same flush. So a measure-then-place in `onMount` never shows a frame in the wrong place.
:::

## Refs to elements inside other components

`ref` on a component isn't special: it's a prop like any other. A component that wants to give one of its elements to
whoever renders it takes a `ref` prop, a function, and puts it on that element:

:::demo escape-forward

```tsx
import { Button } from '@weft-js/warp'

function NameField(props: {
  label: string
  ref?: ((el: HTMLInputElement) => void) | undefined
}) {
  return (
    <label>
      {props.label} <input ref={props.ref} />
    </label>
  )
}

export function Form() {
  let input: HTMLInputElement | undefined
  return (
    <div>
      <NameField label="Name" ref={el => (input = el)} />
      <Button onClick={() => input?.focus()}>Focus the name</Button>
    </div>
  )
}
```

The parent passes a function, not a variable: on a component, `ref={input}` would pass the variable's current value,
which is `undefined`, because the compiler only turns `ref={x}` into an assignment on an element. Inside `NameField`,
`ref={props.ref}` is on an element, so it calls the function with the input.

This is what React calls forwarding a ref, without `forwardRef`. Warp's components do it where it's useful: `Button`
and `Card` take a `ref` function and call it with their element.

:::pitfall Don't reach into a child's DOM to change it
A ref is for what only the element can do: focus, scroll, measure, play a video. Don't use one to change what a
component renders, by setting `textContent`, toggling classes or removing nodes. Weft owns those nodes and will write
over your change on the next update, or try to update a node you removed. If the page should look different, change the
state that drives it.
:::

## Values that aren't elements

React's `useRef` has a second job: holding a value that survives re-renders without causing one, such as a timer id.
In Weft that's a plain variable in the component body. The body runs once, so the variable is made once and stays:

```tsx
import { onCleanup, state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

export function Stopwatch() {
  const tenths = state(0)
  // Not on screen, so not state.
  let timer: ReturnType<typeof setInterval> | undefined
  const start = () => {
    clearInterval(timer)
    timer = setInterval(() => tenths.value++, 100)
  }
  const stop = () => clearInterval(timer)
  onCleanup(stop)
  return (
    <p>
      {(tenths.value / 10).toFixed(1)} s{' '}
      <Button onClick={start}>Start</Button>{' '}
      <Button onClick={stop}>Stop</Button>
    </p>
  )
}
```

The rule for picking between them: if the page shows it, it's `state`; if only your code reads it, a `let` is enough. A
`let` that the TSX reads never updates the page, because nothing tells the page it changed. The compiler reports
that as **W041**: a `let` written in a handler and read in TSX should be `state`.

## Recap

- `ref={x}` on an element assigns it to a `let` variable; `ref={el => …}` calls a function with it.
- `let x!: T` with `ref={x}` needs the `!` for TypeScript and a `no-unassigned-vars` disable for linters; the
  function form needs neither.
- The element exists once the component's TSX has made it: use it in handlers, `onMount`, or `watch` after its first
  run, never while the body runs. `flush()` puts a just-written change in the page now.
- `autofocus` focuses an element when it's created, with no ref.
- A component passes one of its elements out through a `ref` prop that is a function.
- A plain `let` is Weft's `useRef` for values: the body runs once, so it lasts as long as the component.

## Try it

:::challenge Play and pause a video
This player's button only changes its label. Make it play and pause the video too.

```tsx
import { state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

export function Player() {
  const playing = state(false)
  return (
    <div>
      <Button
        onClick={() => (playing.value = !playing.value)}
      >
        {playing.value ? 'Pause' : 'Play'}
      </Button>
      <video
        src="/flower.mp4"
        width="300"
        muted
        playsinline
      />
    </div>
  )
}
```
:::solution
Take the `<video>` with a ref, and call `play()` or `pause()` in the handler, where the element exists. `play()` returns
a promise that rejects if the browser blocks playback, so the label follows the real state through the element's own
`play` and `pause` events.

```tsx
import { state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

export function Player() {
  const playing = state(false)
  let video: HTMLVideoElement | undefined
  const toggle = () => {
    if (!video) return
    if (video.paused)
      video.play().catch(() => (playing.value = false))
    else video.pause()
  }
  return (
    <div>
      <Button onClick={toggle}>
        {playing.value ? 'Pause' : 'Play'}
      </Button>
      <video
        ref={el => (video = el)}
        src="/flower.mp4"
        width="300"
        muted
        playsinline
        onPlay={() => (playing.value = true)}
        onPause={() => (playing.value = false)}
      />
    </div>
  )
}
```
:::

:::challenge Focus the search field from a shortcut
Press `/` anywhere on the page to focus the search field, the way many sites do. Don't use `addEventListener`.

Hint: `on(window, 'keydown', fn)` from `@weft-js/core/browser` listens until the component goes away.
:::solution
Listen on the window with `on`, and focus the element the ref holds. Skip the key when the user is already typing in
a field, so `/` can still be typed there.

```tsx
import { on } from '@weft-js/core/browser'

export function SiteSearch() {
  let field: HTMLInputElement | undefined
  if (typeof window !== 'undefined')
    on(window, 'keydown', e => {
      const typing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      if (e.key !== '/' || typing) return
      e.preventDefault()
      field?.focus()
    })
  return (
    <input
      ref={el => (field = el)}
      type="search"
      aria-label="Search the site"
      placeholder="Press / to search"
    />
  )
}
```

`on` is called while the body runs, so the component owns the listener and removes it when it goes. The handler runs
later, on a key press, by which time the input exists.
:::

:::challenge Scroll the newest message into view
A chat shows messages in a scrolling list. When a message is added, the list should scroll so the newest one is
visible. Write `Chat(props: { messages: { id: number; text: string }[] })`.
:::solution
Keep the list element with a ref, and scroll it whenever the number of messages changes. Start the `watch` inside
`onMount`, for two reasons. Its first run then happens when the list exists. And effects run in the order they were
created: made in `onMount`, the `watch` is newer than the list's own bindings, so on each change the new row is
already in the list when it scrolls.

```tsx
import { onMount, watch } from '@weft-js/core'

export function Chat(props: {
  messages: { id: number; text: string }[]
}) {
  const { messages } = props
  let list: HTMLElement | undefined
  onMount(() => {
    watch(
      () => messages.length,
      () => list?.lastElementChild?.scrollIntoView({ block: 'end' }),
    )
  })
  return (
    <ol
      ref={el => (list = el)}
      style="max-block-size:12rem;overflow:auto"
    >
      {messages.map(m => (
        <li key={m.id}>{m.text}</li>
      ))}
    </ol>
  )
}
```

Made in the body instead, the `watch` would be older than the list's bindings and would run first, scrolling to the row
before the new one.
:::
