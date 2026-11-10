# Components run once

:::learn
- What "the body runs once" means, and how it differs from React's re-rendering
- How reads in markup become bindings that update the page on their own
- What that means for local variables, and why Weft needs no hook rules or dependency arrays
- The mistakes this model makes possible, and the diagnostics that catch them
:::

This is the page to read if you know React. Almost everything in Weft looks like React: functions, TSX, props, `.map`
with keys. The one deep difference is when your code runs. A React component runs again every time its state or props
change. A Weft component runs once. Everything else on this page follows from that.

:::demo describe-runs

## One run, then bindings

When a Weft component first appears, Weft calls its function. The body runs top to bottom: it creates its state, defines
its handlers, and returns markup. Then it's done, and Weft never calls that function again for that piece of the page.

What keeps the page up to date is the markup. The compiler turns every expression in braces and every dynamic attribute
into a binding: a small function attached to the exact text node or attribute it fills. When a binding runs, it records
what it read. When one of those values changes, that binding, and only that binding, runs again and writes its one spot
in the page.

In the demo, the component body ran once and made a `let worked = 0`. The paragraph reads `line.value`, a `derived` that
reads `clicks.value`. Each click changes `clicks`, so `line` is worked out again and the paragraph's text is written. The
counter keeps climbing because the closure that holds `worked` was made once and lives as long as the component. In
React, the same `let` would be created afresh, at zero, on every render.

Here's what runs when, for a component that's on the page:

| Code | When it runs |
|---|---|
| The component body | Once, when the component first appears |
| An expression in braces, a dynamic attribute | Once to start, then each time something it read changes |
| `derived(() => …)` | When it's read after something it read changed (it's lazy) |
| `watch(() => source, act)` | `act` runs when `source`'s value changes |
| An event handler | Each time the event fires |
| `onMount(fn)` | Once, after the component's nodes are in the page |
| `onCleanup(fn)` | Once, when the part of the page that owns the component goes away |

## Reads in markup become bindings

Because each binding records its own reads, Weft knows exactly what depends on what without you saying so:

```tsx
import { state } from '@weft-js/core'

export function Profile() {
  const name = state('Ana')
  const online = state(false)
  return (
    <section>
      <h2>{name.value}</h2>
      <p class={online.value ? 'online' : 'away'}>
        {online.value ? 'Online' : 'Away'}
      </p>
      <button
        type="button"
        onClick={() => (online.value = !online.value)}
      >
        Toggle
      </button>
    </section>
  )
}
```

Toggling `online` runs two bindings: the `class` on the `<p>` and its text. The heading doesn't run, because it never read
`online`. `Profile` doesn't run either. An update in Weft costs what changed, not the size of the component around it.

A binding's reads can change from one run to the next. `{loggedIn.value ? user.value.name : 'Guest'}` reads `user` only
while someone is logged in, so a change to `user` while logged out does nothing at all.

:::deepdive Why Weft does it this way
React's model is: run the component, get a description of the UI, compare it with the last one, and write the
difference. It's simple to reason about, and it costs work proportional to the size of the component on every change,
which is why React has `memo`, `useMemo` and `useCallback` to skip some of it.

Weft's model skips the comparison. The compiler knows, from your TSX, which parts of the markup can change and what
they read, so it wires those parts straight to their data. There's nothing to compare and nothing to memoise, and the
code you write has no performance hints in it. The cost is a rule you have to keep in mind: code in the body is setup
code, not render code. The rest of this page is about that rule.
:::

## What it means for local variables

A local variable in the body is made once. It isn't reset, and it isn't reactive. Both facts are useful once you know
them.

**It isn't reset**, so a plain variable can hold anything a component needs to remember that the page doesn't show: a
timer, an element, a cache. React needs `useRef` for this; Weft doesn't:

```tsx
import { onCleanup, state } from '@weft-js/core'

export function Stopwatch() {
  const seconds = state(0)
  let timer: ReturnType<typeof setInterval> | undefined
  const start = () => {
    timer ??= setInterval(() => seconds.value++, 1000)
  }
  const stop = () => {
    clearInterval(timer)
    timer = undefined
  }
  onCleanup(stop)
  return (
    <p>
      {seconds.value}s{' '}
      <button type="button" onClick={start}>
        Start
      </button>
      <button type="button" onClick={stop}>
        Stop
      </button>
    </p>
  )
}
```

`timer` is shared by `start`, `stop` and the cleanup, for as long as the stopwatch is on the page.

**It isn't reactive**, so the page doesn't follow it. This is the mistake to watch for:

<!-- example: skip deliberately wrong: the count never updates -->
```tsx
export function Counter() {
  let count = 0
  return (
    <button type="button" onClick={() => count++}>
      Clicked {count} times
    </button>
  )
}
```

The button says "Clicked 0 times" for ever. The handler does increment `count`, but `count` is a plain number: nothing
records that the text read it, so nothing runs when it changes. Anything the page shows and the user can change belongs in
`state`:

```tsx
import { state } from '@weft-js/core'

export function Counter() {
  const count = state(0)
  return (
    <button type="button" onClick={() => count.value++}>
      Clicked {count.value} times
    </button>
  )
}
```

:::pitfall The `let` counter
The compiler reports this mistake as **W041** ("a `let` mutated in a handler and read in JSX"): if a variable is changed
in a handler and shown in the markup, it should be `state`. A `let` that names a prop is a different thing, a writable
alias, and works: see [Passing props](/learn/passing-props).
:::

## No hook rules, no dependency arrays

React's rules of hooks exist because React finds a component's state by the order of the hook calls in each render. Call
`useState` inside an `if`, and the order changes between renders, and the state gets mixed up. Weft has no such order to
keep. `state()` returns a box, and the box is yours: keep it in a variable, put it in an object, create it in a loop or
in a helper function, or behind a condition. Since the body runs once, there's no second render to get out of step with.

```tsx
import { state } from '@weft-js/core'

// A plain function that makes state: weft's custom hook has
// no naming rule and no call-order rule.
function toggle(initial: boolean) {
  const on = state(initial)
  return { on, flip: () => (on.value = !on.value) }
}

// One box per setting is fine: the body runs once.
const names = ['Dark mode', 'Compact rows', 'Sounds']

export function Settings() {
  const settings = names.map((name) => ({
    name,
    ...toggle(false),
  }))
  return (
    <>
      {settings.map((s) => (
        <button
          type="button"
          key={s.name}
          aria-pressed={s.on.value}
          onClick={s.flip}
        >
          {s.name}
        </button>
      ))}
    </>
  )
}
```

There are no dependency arrays either. `derived`, `watch` and the bindings in your markup record what they read while
they run, every time they run. A dependency can't be forgotten, because there's no list to forget it from.

| React | Weft |
|---|---|
| `useState(0)` | `state(0)`, read and written as `.value` |
| `useMemo(() => a * b, [a, b])` | `derived(() => a.value * b.value)` |
| `useEffect(() => { … }, [id])` | `watch(() => id.value, id => { … })`, or `onMount` for DOM work |
| `useRef(null)` | a plain `let`, or `ref={el}` for an element |
| `useCallback(fn, [deps])` | a plain function: it's made once anyway |
| `useContext(Theme)` | `Theme.use`, from `context()` |
| `memo(Component)` | nothing: a component never re-runs |

## The mistakes this makes possible

The run-once model has one trap: code in the body that looks like it computes something the page shows, but runs only
once. The compiler knows which values are state and which are props, so it catches the common shapes.

### Computing in the body: W001

<!-- example: skip deliberately wrong: reports W001 -->
```tsx
export function Cart(props: { items: { price: number }[] }) {
  // W001
  const total = props.items.reduce((sum, i) => sum + i.price, 0)
  return <p>Total: {total}</p>
}
```

`total` is worked out once, from the first `items`. The compiler reports **W001** ("read once when the component is set
up, so this never updates") and offers to wrap it in `derived`:

```tsx
import { derived } from '@weft-js/core'

export function Cart(props: { items: { price: number }[] }) {
  const total = derived(() =>
    props.items.reduce((sum, i) => sum + i.price, 0)
  )
  return <p>Total: {total.value}</p>
}
```

The same code catches an early `return` or an `if` on state or a prop in the body: Weft can't run the body again to
check it, so branch in the markup instead (see [Conditional rendering](/learn/conditional-rendering)).

What W001 doesn't flag: naming a prop. `const items = props.items` and `const { items } = props` are aliases, not
computations: every use reads the current prop. Only something that does more than name it, such as `.reduce`, `??` or
arithmetic, is a one-time computation.

### Copying a prop into state: W005

`state(props.value)` copies the prop once into a new box, and the box never follows the prop again: **W005**. Use
`state.linked(() => props.value)` for a local copy that resets when the prop changes.

### Forgetting `.value`: W015

`{count}` in markup, where `count` is a box, renders the box rather than its value: **W015**. Read `{count.value}`.

### A snapshot only the markup reads: W018

`const first = untrack(() => live.get(id))` reads a value once on purpose. If the only place that reads `first` is the
markup, it shows the setup-time value for ever, which is rarely what you meant: **W018**, a warning, suggests `derived`.

:::deepdive How "once" is enforced
Weft calls a component inside `untrack`: while the body runs, nothing it reads is recorded, because the body isn't a
binding and will never run again. That's also why a read there can't update anything: there's no one listening. The
bindings the body's markup creates are owned by whatever created the component, so when that part of the page goes
away, they go with it (see [Your UI as a tree](/learn/your-ui-as-a-tree)).

Updates are batched. Several writes in one handler are applied together, and each binding that read any of them runs
once. To apply pending updates immediately, for example before measuring the page, call `flush()`.
:::

## Where code goes

A short guide to putting each kind of code in the right place:

- **Setting up**: creating state, `derived` values, handlers, timers that are started by an event. The body.
- **Showing something that changes**: an expression in the markup, or a `derived` read in the markup.
- **Doing something when a value changes** (saving, syncing, logging): `watch(() => source, value => …)`. See
  [Effects](/learn/effects), and [You might not need an effect](/learn/you-might-not-need-an-effect) first.
- **Touching the DOM after it's built** (focus, measure, a third-party widget): `onMount`.
- **Tidying up** (timers, listeners, sockets): `onCleanup`, or a function returned from `watch`.

## Recap

- A Weft component's body runs once. React's runs on every change.
- Expressions in markup are bindings: each records what it reads and runs again, alone, when one of those changes.
- A local variable lives as long as the component, so it can hold a timer or an element. But it isn't reactive: what
  the page shows belongs in `state`.
- There are no hook rules and no dependency arrays: state is a value you hold, and reads are recorded as they happen.
- The compiler catches the run-once mistakes: W001 (computing or branching in the body), W005 (`state(prop)`), W015
  (a box without `.value`), W018 (a snapshot only the markup reads).

## Try it

:::challenge Make the counter count
This counter never changes on screen. Fix it.

<!-- example: skip the starting point: the count never updates -->
```tsx
export function Likes() {
  let likes = 0
  return (
    <button type="button" onClick={() => likes++}>
      {likes} likes
    </button>
  )
}
```
:::solution
```tsx
import { state } from '@weft-js/core'

export function Likes() {
  const likes = state(0)
  return (
    <button type="button" onClick={() => likes.value++}>
      {likes.value} likes
    </button>
  )
}
```
A plain `let` isn't tracked, so the text has no reason to update. A box is: the text reads `likes.value`, and each write
to it runs that binding.
:::

:::challenge Translate a React component
Rewrite this React component in Weft.

<!-- example: skip React code, for translation -->
```tsx
function Search({ items }) {
  const [query, setQuery] = useState('')
  const found = useMemo(
    () => items.filter((i) => i.includes(query)),
    [items, query],
  )
  useEffect(() => {
    document.title = `${found.length} results`
  }, [found])
  return (
    <>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <p>{found.length} found</p>
    </>
  )
}
```
:::solution
```tsx
import { derived, state, watch } from '@weft-js/core'

export function Search(props: { items: string[] }) {
  const query = state('')
  const found = derived(() =>
    props.items.filter((i) => i.includes(query.value))
  )
  watch(
    () => found.value.length,
    (n) => {
      document.title = `${n} results`
    },
  )
  return (
    <>
      <input
        aria-label="Search"
        value={query.value}
        onInput={(e) => (query.value = e.currentTarget.value)}
      />
      <p>{found.value.length} found</p>
    </>
  )
}
```
`useState` becomes a box, `useMemo` becomes `derived` with no dependency list, and `useEffect` becomes `watch` on the
value it cares about. `props.items` is read inside `derived`, so a new list from the parent is filtered again.
:::

:::challenge Count the runs
In this component, after clicking the button three times, how many times has the body run? How many times has the `<p>`
text been written? And the `<h2>`?

```tsx
import { state } from '@weft-js/core'

export function Score() {
  const points = state(0)
  const player = state('Ana')
  return (
    <section>
      <h2>{player.value}</h2>
      <p>{points.value} points</p>
      <button type="button" onClick={() => (points.value += 10)}>
        Score
      </button>
    </section>
  )
}
```
:::solution
The body has run once. The `<p>` text has been written four times: once when it was made and once per click, because it
reads `points`. The `<h2>` has been written once, when it was made: it reads only `player`, which the clicks never
change.
:::
