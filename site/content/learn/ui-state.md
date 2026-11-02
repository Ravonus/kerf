# Hover, focus and shared UI state

:::learn
- How `interaction()` turns hover, focus and press into state you can read
- How warp components fill it and draw it with `ui`
- How one key shares a row between components, tabs and visitors
- How to keep other UI state, such as a collapsed sidebar, the same in every tab
- What U001–U005 catch
:::

Hover, focus and press are usually a pile of event handlers: `pointerenter`, `pointerleave`, `focusin`, `focusout`,
`pointerdown`, and the edge cases between them. Most of the time CSS covers what you need with `:hover` and
`:focus-visible`. When it doesn't, because logic needs to know, or another part of the page should light up, or another
tab or person should see it, `interaction()` from `@weft-js/core/interaction` turns them into state you read like any
other box.

:::demo manage-interaction

## A row of interaction state

```tsx
import { interaction } from '@weft-js/core/interaction'
import { Button } from '@weft-js/warp'

export function Save() {
  const row = interaction()
  return (
    <p>
      <Button ui={row}>Save</Button>
      {row.hover.value && <small>Saves a draft. Nothing is published.</small>}
    </p>
  )
}
```

`interaction()` returns a *row*: three boxes and a little more.

| Read | It means |
|---|---|
| `row.hover.value` | a pointer is over it |
| `row.focus.value` | focus is inside it |
| `row.pressed.value` | it's being pressed |
| `row.remote.value` | how many *others* have each of those, when it's shared (below) |

Hand the row to a warp component with `ui={row}`. The component fills the row from real events and draws from it. The
components that take `ui` are Button, Checkbox, Switch, Radio, Toggle, Chip and Card. Passing `ui` to one that doesn't
take it is **U005**: an attribute is written and nothing is drawn.

The three local values are ordinary boxes, so you can read them anywhere you'd read state: in JSX, in a `derived`, in a
`watch`. You can also write them yourself, for an element warp doesn't draw:

```tsx
import { interaction } from '@weft-js/core/interaction'

export function Tile(props: { title: string }) {
  const row = interaction()
  return (
    <div
      tabIndex={0}
      data-hover={row.hover.value || undefined}
      onPointerEnter={() => (row.hover.value = true)}
      onPointerLeave={() => (row.hover.value = false)}
    >
      {props.title}
    </div>
  )
}
```

An app that never calls `interaction()` ships none of it, and a warp component that's never given `ui` doesn't pull it
in either.

:::note Prefer CSS when CSS can do it
If all you want is a different look on hover, use `:hover` in a style. `interaction()` is for what a style can't reach:
code that runs on hover (prefetching, say), another element that should respond, or someone else's hover.
:::

## One key, one row

Give `interaction` a `share` key, and every call with that key on the page gets **the same row**. Two components that
show the same to-do, in two panes, light up together:

:::demo ui-state

```tsx
import { derived } from '@weft-js/core'
import { interaction } from '@weft-js/core/interaction'
import { Checkbox } from '@weft-js/warp'

export function TodoRow(props: { id: string; text: string }) {
  const row = interaction({ share: () => `todo:${props.id}` })
  const note = derived(() => (row.hover.value ? 'here' : row.remote.value.hover ? 'someone else is here' : ''))
  return <Checkbox ui={row} hint={note.value}>{props.text}</Checkbox>
}
```

The key is read once, when the row is made. A prop goes in as a function, as here, so it's read at the right moment; a
plain string is fine when the key is fixed. To change the key, the row has to be made again, which for a list row means a
new `key` on the row.

Build keys from stable ids. A key made from `Math.random()`, `Date.now()` or `crypto.randomUUID()` can never match
anyone else's, which is **U001**.

## How far it reaches

| Where | How it travels | What you do |
|---|---|---|
| The same page | the same object: one key is one row | nothing |
| Other tabs of this browser | `BroadcastChannel`, at most one message a frame | nothing |
| Other browsers and people | one socket per browser, through the app's realtime server | allow it, below |

Drop `share` and the row is private to that one call. An app without `@weft-js/start` shares on the page and across tabs
only.

### Yours and theirs never mix

What other tabs and people do arrives only in `row.remote`, and only as counts: how many others hover, focus or press it.
Never who. Your own `row.hover` is only ever set by you.

That rule is what makes a shared row safe to run logic on. A `watch` on `row.hover` runs for your hover only, so it can't
fire because someone else pointed at something, and it can't echo back and forth between tabs:

```tsx
import { watch } from '@weft-js/core'
import { interaction } from '@weft-js/core/interaction'
import { Button } from '@weft-js/warp'

export function Open(props: { id: string }) {
  const row = interaction({ share: () => `doc:${props.id}` })
  // Prefetch on your own hover, never on someone else's.
  watch(() => row.hover.value, on => { if (on) void fetch(`/api/docs/${props.id}`) })
  return <Button ui={row} emphasis="soft">Open</Button>
}
```

To draw both by hand, read both: `row.hover.value || row.remote.value.hover > 0`. warp does this for you: a component lit
from anywhere gets `data-hold`, and `data-remote` when it's only others.

`row.remote` is a derived value: only the network writes it. Assigning to it is **U004**.

## Who may see what

Sharing with other browsers is off until the server says who may see which keys. The rule goes in
`src/realtime.server.ts`:

```ts
import { realtime } from '@weft-js/start'

export default realtime({ share: ({ ctx, key }) => ctx.user !== null && key.startsWith('todo:') })
```

The rule runs once per key, when a client joins and at each session re-check. With no `share` rule, the socket refuses
every key (**R011**), and a refused key still works between tabs. `weft check` warns about `interaction({ share })` in an
app with no rule as **U003**, which you can leave if tabs are all you want.

Peers see three bits and an opaque connection id: no name, no pointer position, nothing typed. For names and cursors,
there's `@weft-js/multiplayer`.

:::pitfall Hover tells people things
What someone lingers on in a shared document, or which field of a form has focus, is a real signal. warp never shares by
default: you opt in, row by row, with `share`. Build keys from data the server knows, not from the URL or something
typed: a key taken from user input is **U002**, because the server's rule then authorises a string the user chose. And
it's worth telling your users what others can see.
:::

The [Shared UI state reference](/reference/ui-state) covers the batched form of the rule for long lists, the limits, and
how the browser's one socket is shared between tabs.

## Other UI state, the same in every tab

Hover is momentary. Some UI state lasts: whether the sidebar is collapsed, which tab of a settings page is open, list or
grid view. For those, two tools from the state chapter fit.

### A box that's the same in every tab: `sync: 'tabs'`

A box in a [`defineState` scope](/learn/app-wide-state) can persist through reloads and stay the same in every tab of the
browser:

```ts
// src/state/layout.ts
import { defineState, state } from '@weft-js/core'

export const layout = defineState('layout', () => ({
  sidebar: state(true, { persist: 'local', sync: 'tabs' }),
  view: state<'list' | 'grid'>('list', { persist: 'local', sync: 'tabs' }),
}))
```

```tsx
import { Button } from '@weft-js/warp'
import { layout } from '../state/layout'

export function SidebarToggle() {
  return (
    <Button emphasis="ghost" onClick={() => (layout.sidebar.value = !layout.sidebar.value)}>
      {layout.sidebar.value ? 'Hide sidebar' : 'Show sidebar'}
    </Button>
  )
}
```

Collapse the sidebar in one tab and it collapses in the others; reload, and it's still collapsed. `sync: 'tabs'` needs
`persist`, because a new tab starts from what was stored, and it can't be `'session'`, which is per tab. Getting either
wrong throws **S008** in development. The `@weft-js/core/sync` module that does the work is added by the weft Vite plugin
to the modules that use the option, so you don't import it.

:::note Server rendering and `local`
The server can't read `localStorage`, so it renders `init` and the stored value arrives once the page hydrates. For a
box the first paint depends on, like a theme, persist to `'cookie'` instead, which the server reads from the request. See
[App-wide state with defineState](/learn/app-wide-state#ssr-and-cookies).
:::

### A message to the other tabs: `tabs.channel`

For an event rather than a value, such as "signed out, close everything", `tabs.channel` from `@weft-js/core/browser` is
a typed, validated `BroadcastChannel`:

```tsx
import { tabs } from '@weft-js/core/browser'
import { z } from 'zod'

export function SignOut() {
  const auth = tabs.channel('auth', z.object({ type: z.literal('signed-out') }))
  auth.on(() => location.assign('/login'))
  const signOut = () => {
    auth.post({ type: 'signed-out' })
    location.assign('/login')
  }
  return <button type="button" onClick={signOut}>Sign out</button>
}
```

Create it in the component body: it closes when the component goes. The schema is required, because another tab can be
running an older deploy; a message it refuses is dropped. The [Browser values reference](/reference/browser) has the rest.

## Details worth knowing

- **Touch** has no hover, so `row.hover` stays false on a phone. Press still works, and a phone can show someone else's
  hover.
- **The server** renders every row as idle, so hydration has nothing to reconcile. Rows come alive a moment after the
  page does.
- **Remote state is decoration.** It never touches `aria-*` attributes or focus.
- **Costs.** Joining with a 200-row list is one frame, and changes go out at most once every 60 ms, carrying the latest
  value of every row that changed.

## Recap

- `interaction()` gives you `hover`, `focus` and `pressed` as boxes. Use it when CSS isn't enough.
- `ui={row}` on Button, Checkbox, Switch, Radio, Toggle, Chip or Card fills and draws it (U005 elsewhere).
- `share` makes one row per key: on the page, across tabs, and with a `realtime({ share })` rule, across people.
- Your own state and others' never mix: others arrive only as counts in `row.remote`, which you can't write (U004).
- Build keys from stable ids the server knows (U001, U002), and add a server rule to share beyond tabs (U003).
- Lasting UI state goes in a `defineState` box with `persist` and `sync: 'tabs'`; events between tabs go through
  `tabs.channel`.

## Try it

:::challenge Say what's focused
Under a Switch, show "Press Space to toggle" while it has focus, and nothing otherwise.
:::solution
```tsx
import { interaction } from '@weft-js/core/interaction'
import { Switch } from '@weft-js/warp'

export function Wifi() {
  const row = interaction()
  return (
    <>
      <Switch ui={row}>Wi-Fi</Switch>
      {row.focus.value && <small>Press Space to toggle</small>}
    </>
  )
}
```
The Switch fills `row.focus` from real focus events. The hint is ordinary JSX reading a box.
:::

:::challenge Light up the map pin
A list of cities and a row of pins are separate components. Hovering a city in the list should light up its pin, and
hovering the pin should light up the city. Neither component should know about the other.
:::solution
```tsx
import { interaction } from '@weft-js/core/interaction'
import { Button, Chip } from '@weft-js/warp'

const CITIES = ['Lisbon', 'Oslo', 'Lima']

function CityItem(props: { name: string }) {
  const row = interaction({ share: () => `city:${props.name}` })
  return <Chip ui={row}>{props.name}</Chip>
}

function Pin(props: { name: string }) {
  const row = interaction({ share: () => `city:${props.name}` })
  return <Button ui={row} size="sm" emphasis="ghost">pin: {props.name}</Button>
}

export function MapView() {
  return (
    <>
      <div>{CITIES.map(c => <CityItem key={c} name={c} />)}</div>
      <div>{CITIES.map(c => <Pin key={c} name={c} />)}</div>
    </>
  )
}
```
One key, one row: both calls with `city:Lisbon` get the same row, so a hover from either side draws on both. On one page
this needs no server, and other tabs follow too.
:::

:::challenge Fix the echo
This component tries to show others' hover by writing it into `remote`, and `weft check` reports U004. Fix it.

```tsx
const row = interaction({ share: () => `todo:${props.id}` })
watch(() => row.hover.value, on => { row.remote.value = { hover: on ? 1 : 0, focus: 0, pressed: 0 } })
```
:::solution
Don't write `remote`: it's what others are doing, and only the network writes it. Read it instead, next to your own:

```tsx
import { derived } from '@weft-js/core'
import { interaction } from '@weft-js/core/interaction'
import { Checkbox } from '@weft-js/warp'

export function Todo(props: { id: string; text: string }) {
  const row = interaction({ share: () => `todo:${props.id}` })
  const lit = derived(() => row.hover.value || row.remote.value.hover > 0)
  return <Checkbox ui={row} hint={lit.value ? 'in view' : ''}>{props.text}</Checkbox>
}
```
:::
