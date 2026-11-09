# You might not need an effect

:::learn
- Why most values you'd keep in sync with an effect are `derived` instead
- Why work caused by a click belongs in the click's handler, not in a `watch`
- How to start a component's state over when what it shows changes
- Why data loading is a `resource` or a query, not a `watch` that fetches
- Which diagnostics point at an effect you don't need
:::

Effects are an escape hatch: they step outside Weft to keep something else in step with your state. When nothing
outside is involved, when all you want is to show a value or respond to a click, an effect is the long way round. It
adds a second copy of the truth, a moment where the two copies disagree, and code that runs at a time you have to think
about. Removing it makes the component shorter and the page right from the first paint.

This page goes through the common cases, most of them familiar from React's page of the same name. In Weft the fixes are
usually simpler still, because a component's body runs once and `derived` is always current.

:::demo escape-filter

## Values computed from other values

Say a form has a first and a last name, and you want the full name. It's tempting to keep it in state and update it
whenever either part changes:

```tsx
import { state, watch } from '@weft-js/core'

export function Form() {
  const first = state('Ada')
  const last = state('Lovelace')
  // Don't: a second box, kept in step by hand.
  const full = state('')
  watch(() => `${first.value} ${last.value}`, name => {
    full.value = name
  })
  return <p>{full.value}</p>
}
```

It works in the browser, but it's more code than it needs, and the server renders an empty name: `watch` doesn't run
there. A value computed from other values is `derived`:

```tsx
import { derived, state } from '@weft-js/core'

export function Form() {
  const first = state('Ada')
  const last = state('Lovelace')
  const full = derived(() => `${first.value} ${last.value}`)
  return <p>{full.value}</p>
}
```

`full` can never disagree with `first` and `last`, on the server or in the browser. When the expression is short, you
can skip the name and write it in the TSX: `<p>{first.value} {last.value}</p>`. TSX is always live.

The demo above is the same idea with a list: `visible` filters the todos by the search box and the switch, and `left`
counts what's still to do in `visible`. Neither is state; neither needs an effect.

:::pitfall A computation in the body runs once
Moving the computation into the component body isn't the fix either:

<!-- example: skip shows the W001 mistake on purpose -->
```tsx
export function Greeting(props: { first: string; last: string }) {
  // Computed once, never again.
  const full = `${props.first} ${props.last}`
  return <p>{full}</p>
}
```

The body runs once, so `full` is whatever the props were then. Weft reports this as **W001**: a prop or `.value` used
to compute something in the body, outside `derived`, a `watch`, TSX or a handler. Wrap it in `derived`, or write it in
the TSX.
:::

### Expensive calculations

React developers reach for `useMemo` when a computation is slow. `derived` is already that: it computes when it's
read, keeps the result, and computes again only when a box it read has changed and something reads it again. A filter
over ten thousand rows runs once per change to the search box, not once per render, because there are no renders.

```tsx
import { derived, state } from '@weft-js/core'

type Row = { id: number; name: string }

export function Directory(props: { rows: Row[] }) {
  const { rows } = props
  const query = state('')
  const matches = derived(() => {
    const lowerQuery = query.value.toLowerCase()
    return rows.filter(r => r.name.toLowerCase().includes(lowerQuery))
  })
  return (
    <div>
      <input
        value={query.value}
        onInput={e => (query.value = e.currentTarget.value)}
        aria-label="Filter"
      />
      <ul>{matches.value.map(r => <li key={r.id}>{r.name}</li>)}</ul>
    </div>
  )
}
```

There's no dependency list to keep right, and nothing to wrap. If the filter itself is slow, measure it before
anything else; [Performance and bundle size](/learn/performance) covers what to do next.

## Starting over when a prop changes

A profile page shows one person at a time, with a note you can write about them. When you switch to another person,
the note should be empty again. In React you'd give the component a `key`; the effect version, clearing state when the
id changes, renders the old note for a moment first.

Weft does the same thing with a key. A list keyed by id throws a row away when its key goes and makes a new one, with
fresh state, when a new key comes. A list of one does the same for a single component:

:::demo escape-keyed

```tsx
import { state } from '@weft-js/core'

type Person = { id: number; name: string }

function Profile(props: { person: Person }) {
  const { person } = props
  const note = state('')
  return (
    <textarea
      value={note.value}
      onInput={e => (note.value = e.currentTarget.value)}
      aria-label={`A note about ${person.name}`}
    />
  )
}

export function People(props: { shown: Person }) {
  const { shown } = props
  return (
    <div>
      {[shown].map(p => <Profile key={p.id} person={p} />)}
    </div>
  )
}
```

Everything inside `Profile` starts again: its boxes, its effects, the elements themselves. Use this when the whole
component should reset.

### Resetting one value

When only one value should start over, keep the component and make that box follow the key. `state.linked(source, {
key })` is a box you can write, which goes back to `source` whenever the key changes:

```tsx
import { state } from '@weft-js/core'

type Contact = { id: number; name: string }

export function Chat(props: { contact: Contact }) {
  const { contact } = props
  const draft = state.linked(() => '', {
    key: () => contact.id,
  })
  return (
    <textarea
      value={draft.value}
      onInput={e => (draft.value = e.currentTarget.value)}
      aria-label={`Message to ${contact.name}`}
    />
  )
}
```

[Choosing the state structure](/learn/choosing-state-structure) and [Passing props](/learn/passing-props) go further
into `state.linked`. What you shouldn't write is `state(props.x)`: it copies the prop once and never follows it (**W005**).

## Work caused by an event

Some code runs because the user did something: added a product, submitted a form, pressed Buy. That code belongs in the
handler for that event, not in an effect that watches for the state the event left behind.

```tsx
import { state, watch } from '@weft-js/core'
import { toast } from '@weft-js/warp'

export function Product() {
  const inCart = state(false)
  // Don't: this also fires when restoring a saved cart.
  watch(() => inCart.value, added => {
    if (added) toast.show({ title: 'Added to your cart' })
  })
  return (
    <button onClick={() => (inCart.value = true)}>Add to cart</button>
  )
}
```

The toast is about the click, so put it with the click:

```tsx
import { state } from '@weft-js/core'
import { Button, toast } from '@weft-js/warp'

export function Product() {
  const inCart = state(false)
  const add = () => {
    inCart.value = true
    toast.show({ title: 'Added to your cart' })
  }
  return <Button onClick={add}>Add to cart</Button>
}
```

The same goes for sending a request when a form is submitted, logging an analytics event for a click, or moving to the
next step of a wizard. Ask: *why* does this code run? If the answer is "because the user did X", it goes in X's handler.
If it's "because the component is on screen" or "because this value is what it is", an effect may be right.

### Chains of updates

A chain of watches, each setting a box that the next one watches, is the same mistake several times over. A card game
where a `watch` on `card` bumps `goldCount`, a `watch` on `goldCount` bumps `round`, and a `watch` on `round` ends the
game is hard to follow and runs one step per pass. Compute what you can with `derived`, and do the rest in the handler
that started it:

```tsx
import { derived, state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

export function Game() {
  const golds = state(0)
  const round = state(1)
  const over = derived(() => round.value > 5)
  const playGold = () => {
    if (over.value) return
    if (golds.value < 3) golds.value++
    else {
      golds.value = 0
      round.value++
    }
  }
  return (
    <div>
      <p>
        Round {round.value}, golds {golds.value}
        {over.value ? ': game over' : ''}
      </p>
      <Button onClick={playGold}>Play a gold card</Button>
    </div>
  )
}
```

A `watch` that writes a box its own source reads is a loop waiting to happen; Weft's catalog names it **W003**.

### Telling the parent

When a child's state changes and the parent should know, call the parent from the same handler that changed it, rather
than watching the child's state:

```tsx
import { state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

function Toggle(props: { onChange: (on: boolean) => void }) {
  const on = state(false)
  const flip = () => {
    on.value = !on.value
    props.onChange(on.value)
  }
  return <Button onClick={flip}>{on.value ? 'On' : 'Off'}</Button>
}

export function Panel() {
  const last = state('nothing yet')
  const changed = (on: boolean) => {
    last.value = on ? 'turned on' : 'turned off'
  }
  return (
    <div>
      <Toggle onChange={changed} />
      <p>The toggle was {last.value}.</p>
    </div>
  )
}
```

Often the cleaner fix is to let the parent own the value and pass it down with `bind:`, so there's one box and no
message at all: see [Writing to a parent with bind:](/learn/bind).

## Values that come from outside

Some values aren't yours: whether the browser is online, the size of the window, the state of a store a library keeps.
The effect version listens and copies each change into a box. Weft has two better answers.

For the browser, `@weft-js/core/browser` already gives you the value. Read it directly:

```tsx
import { online } from '@weft-js/core/browser'

export function Banner() {
  const isOnline = online()
  return (
    <p hidden={isOnline.value}>
      You're offline. Changes will be saved when you reconnect.
    </p>
  )
}
```

Copying it into your own box with a `watch` is **W056**: there's nothing to gain, and the copy is one step behind.

For a library's store, subscribe while the component is set up, write the box from the subscription, and unsubscribe
in `onCleanup`. That's not an effect, just a listener with an owner:

```tsx
import { onCleanup, state } from '@weft-js/core'
import { store } from '@weft-js/warp-core'

const theme = store<'light' | 'dark'>('light')

export function ThemeName() {
  const current = state(theme.get())
  onCleanup(theme.subscribe(value => (current.value = value)))
  return <p>The theme is {current.value}.</p>
}
```

`store` is warp-core's small framework-free store, standing in for any library with `get` and `subscribe`.

## Loading data

Fetching in an effect is the classic React pattern, and the classic source of bugs: two requests in flight, the slow one
lands last and shows stale results, and you need an `ignore` flag to fix it. In Weft you don't write that effect.
`resource` is the async version of `derived`: it fetches, refetches when what it read changes, and cancels the request it
no longer needs.

```tsx
import { Boundary, resource, state } from '@weft-js/core'

type Hit = { id: string; title: string }

function Hits(props: { query: string }) {
  const { query } = props
  const hits = resource(signal =>
    fetch(
      `/api/search?q=${encodeURIComponent(query)}`,
      { signal },
    ).then(r => r.json() as Promise<Hit[]>),
  )
  return (
    <ul>
      {(hits.value ?? []).map(h => <li key={h.id}>{h.title}</li>)}
    </ul>
  )
}

export function Search() {
  const query = state('')
  return (
    <div>
      <input
        value={query.value}
        onInput={e => (query.value = e.currentTarget.value)}
        aria-label="Search"
      />
      {/* The Boundary waits for the resource made in Hits. */}
      <Boundary pending={<p>Searching…</p>}>
        <Hits query={query.value} />
      </Boundary>
    </div>
  )
}
```

With `@weft-js/start` you go one step further and call a query from a server module, which also works during server
rendering and shares its cache across components. [Async and loading states](/learn/async-and-loading) covers
`resource` and `Boundary`; [Loading data](/learn/loading-data) covers queries.

The same holds for live data. A `watch` that appends each message of a stream to a list in `state` is **W052**: the list
dies with the component. A stream's `fold` keeps it in the cache instead: see
[Realtime and live data](/learn/live-data).

## When you do need an effect

After all that, effects are for the cases where something outside Weft has to follow your state, for as long as a
component is on screen:

- a connection to a server that depends on which room, user or document is showing;
- a timer or animation that runs while a value says so;
- a third-party widget (a map, an editor, a chart) that must be told when your data changes;
- `document.title`, or anything else on the page that Weft didn't render.

Those are what [Effects](/learn/effects) is for.

## The diagnostics

Several of the patterns on this page have codes. `weft check` and your editor point at the first five; W003, W004 and
W012 are in the catalog, but this Weft doesn't report them yet.

| Code | What it catches | Instead |
|---|---|---|
| W001 | A prop or `.value` computed in the component body, which runs once | `derived`, or write it in the TSX |
| W005 | `state(prop)`: a box that never follows its prop | `state.linked(() => prop)` |
| W018 | `untrack(…)` in the body that only the TSX reads: a snapshot that never updates | `derived` |
| W052 | A `watch` folding a stream into `state` by hand | the stream's `fold` |
| W056 | A `watch` that copies a browser value (or a live query) into `state` | read the value directly |
| W003 | A `watch` that writes a box its own source reads | `derived` |
| W004 | A `watch` that only copies one value into another box | `derived` |
| W012 | `derived(async …)` | `resource` |

:::note
The last three are in Weft's diagnostics catalog, but this version of the compiler doesn't report them yet. Each code's
page in [Reference: diagnostics](/reference/diagnostics) says whether your version does.
:::

## Recap

- If a value can be computed from props and state, it's `derived`, or an expression in the TSX. Not state kept in
  sync by an effect.
- `derived` is already cached: Weft has no `useMemo` because it doesn't need one.
- Key a component to start all its state over; `state.linked(…, { key })` starts one box over.
- Code caused by an event goes in that event's handler. Tell the parent from the handler, or share a box with `bind:`.
- Read browser values directly, and subscribe to outside stores with `onCleanup`, not a copying `watch`.
- Load data with `resource` or a query: they cancel stale requests for you.

## Try it

:::challenge Remove the effect from the filter
This list keeps its visible items in state with a `watch`. Rewrite it without the effect.

```tsx
import { state, watch } from '@weft-js/core'

type Item = { id: number; name: string; price: number }

export function Cheap(props: { items: Item[] }) {
  const { items } = props
  const max = state(10)
  const shown = state<Item[]>([])
  watch(() => items.filter(i => i.price <= max.value), list => {
    shown.value = list
  })
  return (
    <div>
      <input
        type="number"
        value={max.value}
        onInput={e => (max.value = e.currentTarget.valueAsNumber)}
        aria-label="Maximum price"
      />
      <ul>{shown.value.map(i => <li key={i.id}>{i.name}</li>)}</ul>
    </div>
  )
}
```
:::solution
`shown` is computed from `items` and `max`, so it's `derived`:

```tsx
import { derived, state } from '@weft-js/core'

type Item = { id: number; name: string; price: number }

export function Cheap(props: { items: Item[] }) {
  const { items } = props
  const max = state(10)
  const shown = derived(() =>
    items.filter(i => i.price <= max.value),
  )
  return (
    <div>
      <input
        type="number"
        value={max.value}
        onInput={e => (max.value = e.currentTarget.valueAsNumber)}
        aria-label="Maximum price"
      />
      <ul>{shown.value.map(i => <li key={i.id}>{i.name}</li>)}</ul>
    </div>
  )
}
```

The server now renders the filtered list too, instead of an empty one.
:::

:::challenge Send the order from the handler
This form sends the order with an effect that watches a `submitted` flag. Move the request where it belongs, and drop
the flag.

```tsx
import { state, watch } from '@weft-js/core'
import { Button } from '@weft-js/warp'

export function Checkout() {
  const submitted = state(false)
  watch(() => submitted.value, sent => {
    if (sent) void fetch('/api/order', { method: 'POST' })
  })
  return (
    <Button onClick={() => (submitted.value = true)}>
      Place order
    </Button>
  )
}
```
:::solution
The request happens because the user pressed the button, so it goes in the button's handler. A `sending` box keeps the
button off while it's in flight, which the old version didn't do.

```tsx
import { state } from '@weft-js/core'
import { Button } from '@weft-js/warp'

export function Checkout() {
  const sending = state(false)
  const place = async () => {
    sending.value = true
    try {
      await fetch('/api/order', { method: 'POST' })
    } finally {
      sending.value = false
    }
  }
  return (
    <Button disabled={sending.value} onClick={() => void place()}>
      Place order
    </Button>
  )
}
```

In an app with `@weft-js/start`, this would be a mutation: see [Server functions](/learn/server-functions).
:::

:::challenge Start the editor over for each document
`Editor` shows a document's title in a field you can change. When `doc` changes to another document, the field keeps
the old document's edit. Make it start from the new document's title, without a `watch`.

```tsx
import { state, untrack } from '@weft-js/core'

type Document = { id: string; title: string }

export function Editor(props: { doc: Document }) {
  const { doc } = props
  const title = state(untrack(() => doc.title))
  return (
    <input
      value={title.value}
      onInput={e => (title.value = e.currentTarget.value)}
      aria-label="Title"
    />
  )
}
```
:::solution
`state.linked` follows a source until you write to it. With `key`, an edit holds while the key stays the same, and a
new key starts it over from the source:

```tsx
import { state } from '@weft-js/core'

type Document = { id: string; title: string }

export function Editor(props: { doc: Document }) {
  const { doc } = props
  const title = state.linked(() => doc.title, {
    key: () => doc.id,
  })
  return (
    <input
      value={title.value}
      onInput={e => (title.value = e.currentTarget.value)}
      aria-label="Title"
    />
  )
}
```

Keying the whole `Editor` by `doc.id` where it's rendered works too, and is the better fix when there's more state
inside than this one field.
:::
