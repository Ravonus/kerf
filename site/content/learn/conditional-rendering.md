# Conditional rendering

:::learn
- How to show different markup depending on a condition, with `? :` and `&&`
- Why an early `return` that depends on state or props doesn't work in Kerf, and what to write instead
- How to render nothing
- What happens to the markup, and the state inside it, when a condition flips
:::

Your components often need to show different things in different situations: a sign-in button or a profile, an empty
state or a list, a struck-through item once it's packed. In Kerf you write conditions with the same JavaScript you'd use
in React, `? :` and `&&`, inside the markup. The one thing that changes is where the condition goes: since a component's
body runs once, the condition has to live in the markup, where it can be checked again.

:::demo describe-packing

## Conditionally returning markup

Say you have a `PackingList` of `Item`s, each either packed or not, and you want a packed item to look different. In
React you might reach for an `if` with an early `return`:

<!-- example: skip deliberately wrong: reports W001 -->
```tsx
function Item(
  { name, isPacked }: { name: string; isPacked: boolean },
) {
  if (isPacked) {
    return <li class="item">{name} (packed)</li>
  }
  return <li class="item">{name}</li>
}
```

In React that works, because `Item` runs again whenever `isPacked` changes. In Kerf, `Item` runs once. The `if` would
check `isPacked` when the item first appears, pick a branch, and never look again, so ticking the item later would
change nothing. The compiler stops you with **W001**: "`isPacked` is read once when the component is set up, so this
never updates."

The fix is to move the condition into the markup. Markup is the part of a component that stays live:

```tsx
function Item(
  { name, isPacked }: { name: string; isPacked: boolean },
) {
  return (
    <li class="item">
      {name} {isPacked ? '(packed)' : ''}
    </li>
  )
}

export default function PackingList() {
  return (
    <ul>
      <Item isPacked name="Space suit" />
      <Item isPacked name="Helmet with a golden leaf" />
      <Item isPacked={false} name="Photo of Tam" />
    </ul>
  )
}
```

This is the rule for the whole page: **branch in the markup, not in the body.**

:::note An `if` that's fine
An `if` in the body is fine when what it tests can't change: a module constant, a value from `import.meta.env`, or a
prop you deliberately read once with `untrack`. The compiler only objects when the test reads state or a prop, because
that's when the answer could change after the body has run.
:::

## Conditionally returning nothing with `null`

Sometimes a component shouldn't show anything at all. In React you'd `return null` early. In Kerf the same rule applies:
`return null` is fine when it's unconditional, but a `return` that depends on a prop or state is **W001**, and so is a
ternary on the `return` line:

<!-- example: skip deliberately wrong: reports W001 -->
```tsx
function Item(
  { name, isPacked }: { name: string; isPacked: boolean },
) {
  // W001: the test is outside the markup
  return isPacked ? null : <li class="item">{name}</li>
}
```

Put the condition inside the markup, wrapping it in a fragment if there's no element to hold it:

```tsx
export function Item(
  { name, isPacked }: { name: string; isPacked: boolean },
) {
  return <>{isPacked ? null : <li class="item">{name}</li>}</>
}
```

The fragment is the markup, and the braces in it are a live expression: when `isPacked` turns true the `<li>` is
removed, and when it turns false again a new one is made.

Often the clearer choice is for the parent to decide whether to render the child at all: `{!packed && <Item … />}`. A
component that renders nothing in some cases can surprise whoever uses it.

## Conditionally including markup

When most of the markup is the same and only a piece differs, put the condition around that piece.

### The conditional (ternary) operator `? :`

JavaScript's `cond ? a : b` reads as "if `cond`, then `a`, otherwise `b`". In markup it picks between two pieces:

```tsx
export function Item(
  { name, isPacked }: { name: string; isPacked: boolean },
) {
  return (
    <li class="item">
      {isPacked ? <del>{name} (packed)</del> : name}
    </li>
  )
}
```

Either branch can be any markup, including components and nested conditions. If a branch grows long, move it into a
small component of its own.

:::deepdive Are these two the same?
In React, `{isPacked ? <del>{name}</del> : name}` and the early-return version produce the same result: React compares
the output either way. In Kerf they differ, and the markup version is the one that works, but it's worth seeing
exactly what it does.

The compiler tracks a conditional's test on its own, separately from its branches. While `isPacked` keeps the same
value, the branch on screen stays exactly as it is, and the expressions inside it (`{name}` here) update in place. Only
when the test's result changes does Kerf remove the old branch, cleaning up everything it owned, and build the other.
So a condition costs nothing until it flips.
:::

### The logical AND operator `&&`

Another shortcut is `&&`: "if `cond`, show this, otherwise nothing":

```tsx
export function Item(
  { name, isPacked }: { name: string; isPacked: boolean },
) {
  return (
    <li class="item">
      {name} {isPacked && <small>(packed)</small>}
    </li>
  )
}
```

When `isPacked` is `false`, the whole expression is `false`, and `false` renders nothing, as do `true`, `null` and
`undefined`.

:::pitfall Don't put a number on the left of `&&`
`{count.value && <Badge>{count.value}</Badge>}` shows `0` when `count` is zero. `&&` returns its left side when that
side is falsy, and `0` is a number, which renders as text. Make the left side a boolean:

```tsx
import { state } from '@kerf/core'
import { Badge, Button } from '@kerf/veneer'

export function Inbox() {
  const count = state(0)
  return (
    <p>
      Messages {count.value > 0 && <Badge count>{count.value}</Badge>}
      <Button size="sm" onClick={() => count.value++}>
        Receive
      </Button>
    </p>
  )
}
```

The compiler reports this mistake as **W011**. There's a second reason to prefer `count.value > 0`: the test is tracked on its own, so with
`count.value > 0` the badge is built once and its number updates in place, while with `count.value &&` the test's
result changes on every new count, and the badge is rebuilt each time.
:::

### Choosing markup in a function

In React you might assign markup to a variable with an `if` and use the variable in the return. In Kerf a variable in
the body is set once, so give the choice a function instead, and call the function in the markup:

```tsx
export function Item(
  { name, isPacked }: { name: string; isPacked: boolean },
) {
  const label = () => {
    if (isPacked) return <del>{name} (packed)</del>
    return name
  }
  return <li class="item">{label()}</li>
}
```

The function body can use any JavaScript, `if` and `switch` included. `{label()}` is a live expression: it runs the
function again when something it read changes. The function itself reads nothing until it's called, so the compiler
has nothing to object to. This is the most flexible form, and it's handy when the choice has more than two cases.

## What stays mounted

When a condition flips, the branch that was on screen goes away, and the one coming in is built fresh. "Goes away" means
more than hiding: its DOM nodes are removed, the bindings and watches inside it are disposed, its cleanups run, and any
state its components held is gone. Bring it back and its components run again, from the start.

That's usually what you want. Sometimes it isn't: a half-filled form in a collapsed panel, say. To keep something while
it's out of sight, leave it in the page and hide it with the `hidden` attribute or CSS instead of a condition:

:::demo describe-mounted

The first field is inside `{open.value && …}`: switching off removes it, and switching back makes a new, empty one. The
second is always in the page with `hidden={!open.value}`: switching off only hides it, so what you typed is still there.

| You write | When the condition turns off | Its state |
|---|---|---|
| `{cond && <Panel />}` | Removed from the page, cleaned up | Lost; a new `Panel` runs when it comes back |
| `{cond ? <A /> : <B />}` | One branch removed, the other built | Each side starts fresh when it's shown |
| `<Panel hidden={!cond} />` | Stays in the page, hidden | Kept |

Hidden markup still costs its DOM nodes and keeps its bindings running, so use `hidden` for things that come and go
often, and a condition for the rest. A third option for state that should outlive the markup is to keep the state in a
parent, or in [defineState](/learn/app-wide-state), and pass it down: then the child can come and go and the data stays.

:::deepdive How Kerf knows what to clean up
Each piece of markup is built under an owner: the binding that made it. When the condition flips, that binding runs
again, and before it does, it disposes everything it owned the last time: the bindings in the old branch, the watches
created there, the `onCleanup` callbacks registered there. Nothing has to be unsubscribed by hand, and nothing leaks.
[Your UI as a tree](/learn/your-ui-as-a-tree) shows this ownership tree in action.
:::

## Recap

- Branch in the markup with `? :` and `&&`. Markup stays live; the body runs once.
- An early `return`, or a ternary on the `return` line, that reads state or a prop is W001. Wrap the condition in markup:
  `return <>{cond ? <A /> : null}</>`.
- `null`, `undefined`, `true` and `false` render nothing.
- Write `n > 0 && …`, not `n && …`: a number on the left renders `0`.
- For a choice with several cases, call a function from the markup: `{label()}`.
- A branch that goes away is cleaned up, state and all. Use `hidden` to keep something while it's out of sight.

## Try it

:::challenge Show an icon for incomplete items
Use `? :` to show "(done)" after a packed item and "(to do)" after the others.

<!-- example: skip the starting point: the prop it asks you to use is still unused -->
```tsx
function Item(
  { name, isPacked }: { name: string; isPacked: boolean },
) {
  return <li class="item">{name}</li>
}

export default function PackingList() {
  return (
    <ul>
      <Item isPacked name="Space suit" />
      <Item isPacked={false} name="Photo of Tam" />
    </ul>
  )
}
```
:::solution
```tsx
function Item(
  { name, isPacked }: { name: string; isPacked: boolean },
) {
  return (
    <li class="item">
      {name} {isPacked ? '(done)' : '(to do)'}
    </li>
  )
}

export default function PackingList() {
  return (
    <ul>
      <Item isPacked name="Space suit" />
      <Item isPacked={false} name="Photo of Tam" />
    </ul>
  )
}
```
:::

:::challenge Show the item importance with `&&`
Each item has an `importance` from 0 to 3. After an important item's name, show "(Importance: X)" in italics. Items with
importance 0 should show nothing extra, and certainly not a `0`.

<!-- example: skip the starting point: the prop it asks you to use is still unused -->
```tsx
function Item(
  { name, importance }: { name: string; importance: number },
) {
  return <li class="item">{name}</li>
}

export default function PackingList() {
  return (
    <ul>
      <Item importance={9} name="Space suit" />
      <Item importance={0} name="Helmet with a golden leaf" />
      <Item importance={6} name="Photo of Tam" />
    </ul>
  )
}
```
:::solution
```tsx
function Item(
  { name, importance }: { name: string; importance: number },
) {
  return (
    <li class="item">
      {name}
      {importance > 0 && (
        <>
          {' '}
          <i>(Importance: {importance})</i>
        </>
      )}
    </li>
  )
}

export default function PackingList() {
  return (
    <ul>
      <Item importance={9} name="Space suit" />
      <Item importance={0} name="Helmet with a golden leaf" />
      <Item importance={6} name="Photo of Tam" />
    </ul>
  )
}
```
`importance > 0` is a boolean, so a zero renders nothing. `importance && …` would have shown a `0`.
:::

:::challenge Fix the early return
This greeting never changes after it first appears, and the compiler reports W001. Make it follow `user`.

<!-- example: skip the starting point, which reports W001 -->
```tsx
import { state } from '@kerf/core'

export function Greeting() {
  const user = state<string | null>(null)
  if (!user.value) {
    return (
      <button type="button" onClick={() => (user.value = 'Ana')}>
        Sign in
      </button>
    )
  }
  return <p>Hello, {user.value}.</p>
}
```
:::solution
Move the branch into the markup, so it's checked every time `user` changes:

```tsx
import { state } from '@kerf/core'

export function Greeting() {
  const user = state<string | null>(null)
  return (
    <>
      {user.value ? (
        <p>Hello, {user.value}.</p>
      ) : (
        <button type="button" onClick={() => (user.value = 'Ana')}>
          Sign in
        </button>
      )}
    </>
  )
}
```
Pressing the button sets `user`, the test's result flips, and the button is swapped for the greeting.
:::

:::challenge Keep the draft
Closing this panel throws away what was typed in it. Keep the text while the panel is closed, without moving any state.

```tsx
import { state } from '@kerf/core'

export function Notes() {
  const open = state(true)
  return (
    <section>
      <button
        type="button"
        onClick={() => (open.value = !open.value)}
      >
        {open.value ? 'Close' : 'Open'}
      </button>
      {open.value && <textarea aria-label="Notes" />}
    </section>
  )
}
```
:::solution
Keep the `<textarea>` in the page and hide it, so it isn't removed and made again:

```tsx
import { state } from '@kerf/core'

export function Notes() {
  const open = state(true)
  return (
    <section>
      <button
        type="button"
        onClick={() => (open.value = !open.value)}
      >
        {open.value ? 'Close' : 'Open'}
      </button>
      <textarea aria-label="Notes" hidden={!open.value} />
    </section>
  )
}
```
:::
