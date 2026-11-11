# Responding to events

:::learn
- How to write an event handler and pass it to an element
- How a component takes handlers as props, and how to name them
- How events travel up the page, and how to stop them or their default
- How Kerf attaches handlers, and what happens to a click before the code has loaded
:::

A page that only shows things is half a page. Event handlers are your own functions that run when something happens: a
click, a key, a change in a field. You pass them as `on` attributes, `onClick`, `onInput`, `onKeyDown` and the rest, and a
handler usually changes some [state](/learn/state). The page follows.

:::demo events

## Adding an event handler

To make a button do something, first write a function, then pass it to the button's `onClick`:

```tsx
import { Button } from '@kerf/veneer'

export function Greeter() {
  function handleClick() {
    alert('You clicked me!')
  }
  return <Button onClick={handleClick}>Click me</Button>
}
```

That's three steps: declare `handleClick` inside the component, write what it does, and pass it with `onClick={handleClick}`.
Handlers usually live inside the component, so they can read its props and state. Name them as you like; `handleClick`,
`onClickSave` and plain verbs like `add` or `save` are all common.

For a short handler, write it inline:

```tsx
<Button onClick={() => alert('You clicked me!')}>Click me</Button>
```

Both forms are the same thing: a function the button calls later.

:::pitfall Pass a function, don't call it
`onClick={handleClick}` passes the function. `onClick={handleClick()}` calls it once, while the button is being made, and
passes whatever it returns. The alert would show as the page loads, and clicks would do nothing.

| Passes a function (right) | Calls a function (wrong) |
|---|---|
| `onClick={handleClick}` | `onClick={handleClick()}` |
| `onClick={() => alert('Hi')}` | `onClick={alert('Hi')}` |

When the handler needs an argument, wrap it: `onClick={() => remove(item.id)}`.
:::

### A handler reads what's current

A handler runs when the event happens, not when the component ran. So it reads props and state as they are at that moment:

```tsx
import { Button } from '@kerf/veneer'

export function AlertButton(props: {
  message: string
  children?: unknown
}) {
  const { message, children } = props
  return (
    <Button onClick={() => alert(message)}>
      {children}
    </Button>
  )
}

export function Toolbar() {
  return (
    <div>
      <AlertButton message="Playing!">Play movie</AlertButton>
      <AlertButton message="Uploading!">Upload image</AlertButton>
    </div>
  )
}
```

If the parent later passes a different `message`, the next click shows the new one. Nothing re-created the handler: it
reads `message` each time it runs. In React a handler closes over one render's values; in Kerf there is one run of
the component, and every read is live.

## Passing handlers as props

Often the component that draws a button isn't the one that knows what it should do. A `Toolbar` draws two buttons; the
app using it decides what they mean. Pass the handlers down as props:

:::demo interact-toolbar

`Toolbar` takes `onPlay` and `onUpload` and hands each to a `Button`. It doesn't know what playing or uploading is. That's
the same move as passing any other prop: a function is a value like the rest.

Veneer's own components work this way. `Button`'s `onClick` is a prop, and `Button` passes it to the real `<button>` inside.

### Naming handler props

On a built-in element such as `<button>` or `<input>`, the name must be a browser event: `onClick`, `onInput`, `onKeyDown`.
On your own components you choose. By convention a handler prop starts with `on` and a capital letter, and names what
happened in your app's words rather than the browser's:

```tsx
<Toolbar onPlay={play} onUpload={upload} />    // what the user meant
// How they did it: harder to read.
<Toolbar onClickOne={play} onClickTwo={upload} />
```

A prop called `onPlay` might be fired by a click today and by a key tomorrow. The parent doesn't need to know.

## What a handler receives

A handler gets the browser's event. `e.currentTarget` is typed as the element the handler is on, so on an `<input>`,
`e.currentTarget.value` is a string with no cast:

```tsx
<input
  value={draft.value}
  onInput={e => (draft.value = e.currentTarget.value)}
/>
```

`e.target` is where the event started, which may be a child of the element: a click on the icon inside a button has the
icon as its `target` and the button as its `currentTarget`. Read `currentTarget` unless you mean the child.

Multi-word events use camelCase: `onKeyDown`, `onPointerEnter`, `onDoubleClick` (which listens for the browser's
`dblclick`). A `Capture` suffix, as in `onClickCapture`, listens in the capture phase: on the way down, before any
handler below it.

## `onChange` fires on every edit

As in React, `onChange` on a text field fires on each keystroke, not when the field loses focus. On a checkbox, radio,
select or file input it fires when the value changes. Kerf listens for both the browser's `input` and `change` events and
drops the `change` that only repeats an edit it already reported, so your handler runs once per edit. To act when the user
is done with a field, use `onBlur`.

`onInput` and `onChange` are interchangeable on text fields. The examples here use `onInput`, which is the browser's own
name for "the value changed".

## Event propagation

An event starts at the element it happened on and then travels up through its parents. That's *bubbling*: a click on a
button inside a toolbar is also a click on the toolbar. A handler on the parent hears clicks from all of its children.

:::demo interact-propagation

Press **Open**: its handler runs, then the toolbar's. Press **Star**: only its own handler runs, because it called
`e.stopPropagation()`. Every event bubbles this way except a few that only make sense on their own element, such as
`focus`, `blur` and `scroll`.

### Stopping propagation

```tsx
function onStar(e: MouseEvent) {
  e.stopPropagation()
  star()
}

const button = <Button onClick={onStar}>Star</Button>
```

`e.stopPropagation()` stops the event from reaching any parent's handler. Use it when a child's action shouldn't also
count as the parent's: a delete button inside a clickable row shouldn't open the row.

Often you don't need it. If a parent should do something extra for one child, have the child call a handler prop instead
of relying on the event bubbling up. Code that passes handlers explicitly is easier to follow than code that depends on
which events escape.

### Preventing default behaviour

Some events have something the browser does by itself. Submitting a `<form>` loads a new page; clicking a link follows
it. `e.preventDefault()` stops that, and you handle the event yourself:

```tsx
import { Button, Input } from '@kerf/veneer'

export function Signup() {
  const submit = (e: SubmitEvent) => {
    e.preventDefault()
    alert('Submitting!')
  }
  return (
    <form onSubmit={submit}>
      <Input
        label="Email"
        name="email"
        type="email"
      />
      <Button type="submit">Send</Button>
    </form>
  )
}
```

The two are unrelated: `stopPropagation()` stops handlers above from running, `preventDefault()` stops the browser's
default. You can call either, both or neither. [Forms and inputs](/learn/forms-and-inputs) covers submitting in more depth.

:::deepdive How Kerf attaches handlers
Kerf doesn't put a listener on every button. For the common bubbling events (`click`, `input`, `keydown`, `keyup`,
`pointerdown` and the other pointer, mouse and touch events, `focusin`, `focusout`, `dblclick`, `contextmenu`,
`beforeinput`) the compiler stores your handler on the element itself, and the page has one listener per event type, on
the `document`. When a click arrives there, that listener walks from the clicked element up through its parents and calls
each handler it finds, with `e.currentTarget` set to the element whose handler it is. A thousand rows with an `onClick`
each cost a thousand property writes, not a thousand listeners.

`stopPropagation()` works as you expect inside this walk: the walk ends at the handler that called it. A disabled element's
handler is skipped, as the browser would.

Everything else gets an ordinary listener on its own element: the events not on that list (`focus`, `blur`, `scroll`,
`pointerenter`, `submit` and so on), `onChange` (which listens to both `input` and `change`), and every `Capture` handler.

Two consequences, both shared with React, which delegates the same way:

- A listener you add yourself with `addEventListener` on a parent element runs *before* Kerf's handlers for a bubbling
  event, because the event reaches that parent before it reaches the `document`. A Kerf handler's `stopPropagation()`
  can't stop it.
- A listener of your own that calls `stopPropagation()` keeps the event from reaching the `document`, so Kerf handlers
  above it don't run.

You rarely need your own listeners on elements. For the window or the document, use `on(window, 'keydown', …)` from
`@kerf/core/browser`: it's removed when the component goes. A bare `addEventListener` in a component with no cleanup
is **W050**. See [Browser values](/reference/browser).
:::

:::pitfall A handler on an element is read once
The compiler attaches a handler to a built-in element once, when the element is made. A choice made in the attribute is
made only then:

```tsx
// On a veneer component: fine, props are live.
<Button onClick={editing.value ? save : edit}>…</Button>
// On a built-in element: stays on the first choice.
<button onClick={editing.value ? save : edit}>…</button>
```

Make the choice inside the handler, where it runs on every click:

```tsx
<button
  type="button"
  onClick={() => (editing.value ? save() : edit())}
>
  …
</button>
```
:::

## Handlers are where things happen

Handlers are the place for side effects: changing state, calling a server, starting a timer, focusing a field. Unlike the
component body, which runs once, and `derived`, which must only compute (writing state inside one is **W002**), a handler
runs because the user did something, so that's where you change things.

A handler can also `await`. State you change after the `await` updates the page like any other write:

:::demo async

The button disables itself while `saving.value` is `true`, so a second press can't start a second save.

## Before the code arrives

With `@kerf/start`, pages are rendered on the server, and a component with nothing to do in the browser ships no
JavaScript at all. Components that do have handlers become *islands*. An island whose only work is its handlers loads
when someone first interacts with it, not with the page. One with work that starts by itself loads when it comes into
view, if the compiler can prove that's safe, and with the page otherwise.

So what happens to a click that arrives before the island's code? Every such page carries a tiny inline script that
catches events on islands that haven't loaded yet, holds a click, submit or reset with its default held back, loads the
code, and replays the events in order once the island is ready. Typing and focus already happened in the field, and are
replayed so the island's state catches up. The click you made while the code was on its way isn't lost, and you write
nothing for it.

You can tell the compiler what it can't see for itself with a comment above a component: `/* @kerf client */` loads it
with the page, `/* @kerf visible */` when it scrolls into view. `.kerf/hydration.json` says when each island loads and
why. [SSR, islands and hydration](/learn/ssr-and-hydration) covers this in full.

## Recap

- Pass a function to `onClick`, `onInput`, `onKeyDown` and friends: `onClick={save}` or `onClick={() => save(id)}`, never
  `onClick={save()}`.
- A handler reads props and state when it runs, so it always sees the current values.
- Components take handlers as props. Name them `on` plus what happened in your app: `onPlay`, `onSelect`.
- `e.currentTarget` is the element the handler is on, already typed. `onChange` fires on every edit.
- Events bubble to parents. `e.stopPropagation()` stops that; `e.preventDefault()` stops the browser's default.
- Kerf delegates common events to one listener on the document. Handlers on built-in elements are read once.
- On a server-rendered page, events that arrive before an island's code are held and replayed.

## Try it

:::challenge Clear with Escape
In the notes demo at the top of this page, make Escape in the input clear the draft.
:::solution
Add a branch to the `onKeyDown` handler:

```tsx
onKeyDown={e => {
  if (e.key === 'Enter') add()
  if (e.key === 'Escape') draft.value = ''
}}
```

`e.key` names the key that was pressed. The handler writes the box, and the input, which reads `draft.value`, empties.
:::

:::challenge Change the colour from a handler prop
`ColorSwitch` should let its parent change the page's colour, but it doesn't know how. Give it an `onChangeColor` prop
and call it from the button. Make sure clicking the button doesn't also count as a click on the parent, which counts
clicks on the card.

```tsx
import { state } from '@kerf/core'
import { Button, Card } from '@kerf/veneer'

function ColorSwitch() {
  return <Button>Change colour</Button>
}

export function App() {
  const clicks = state(0)
  const hue = state(200)
  return (
    <div
      role="group"
      aria-label="Colour"
      onClick={() => clicks.value++}
    >
      <Card title={`Hue ${hue.value}`}>
        <ColorSwitch />
        <p>Clicks on the card: {clicks.value}</p>
      </Card>
    </div>
  )
}
```
:::solution
```tsx
import { state } from '@kerf/core'
import { Button, Card } from '@kerf/veneer'

function ColorSwitch(props: {
  onChangeColor: () => void
}) {
  const { onChangeColor } = props
  const changeColor = (e: MouseEvent) => {
    e.stopPropagation()
    onChangeColor()
  }
  return (
    <Button onClick={changeColor}>Change colour</Button>
  )
}

export function App() {
  const clicks = state(0)
  const hue = state(200)
  return (
    <div
      role="group"
      aria-label="Colour"
      onClick={() => clicks.value++}
    >
      <Card title={`Hue ${hue.value}`}>
        <ColorSwitch
          onChangeColor={() =>
            (hue.value = (hue.value + 40) % 360)
          }
        />
        <p>Clicks on the card: {clicks.value}</p>
      </Card>
    </div>
  )
}
```

`ColorSwitch` passes the click on as `onChangeColor` and stops it there, so the group's counter doesn't move.
:::

:::challenge Fix a handler that runs too early
This button is meant to say "Saved" when pressed, but the message shows as soon as the page loads, and pressing does
nothing. Fix it.

<!-- example: skip deliberately broken: the challenge is to find the bug -->
```tsx
import { state } from '@kerf/core'
import { Button } from '@kerf/veneer'

export function Save() {
  const status = state('Not saved')
  const save = () => {
    status.value = 'Saved'
  }
  return (
    <p>
      <Button onClick={save()}>Save</Button> {status.value}
    </p>
  )
}
```
:::solution
`onClick={save()}` calls `save` while the button is made and passes its result, `undefined`. Pass the function:

```tsx
import { state } from '@kerf/core'
import { Button } from '@kerf/veneer'

export function Save() {
  const status = state('Not saved')
  const save = () => {
    status.value = 'Saved'
  }
  return (
    <p>
      <Button onClick={save}>Save</Button> {status.value}
    </p>
  )
}
```
:::
