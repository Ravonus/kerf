# Shared UI state

Hover, focus and press are usually a pile of event handlers. `interaction()` makes them plain values you can read, draw and share. An app that doesn't use it ships none of it.

```tsx
import { derived, watch } from '@weft-js/core'
import { interaction } from '@weft-js/core/interaction'
import { Button, Checkbox } from '@weft-js/warp'

type Todo = { id: string; title: string }

export function TodoRow({ todo }: { todo: Todo }) {
  const row = interaction({ share: () => `todo:${todo.id}` })
  const seen = derived(() => (row.remote.value.hover ? 'someone is here' : ''))
  watch(() => row.hover.value, on => { if (on) void fetch(`/api/todos/${todo.id}`) }) // only ever your own hover
  return (
    <li>
      <Checkbox ui={row}>{todo.title}</Checkbox>
      <Button ui={row} emphasis="soft">Open</Button>
      <small>{seen.value}</small>
    </li>
  )
}
```

Give a warp component the row with `ui`, and it fills the row from real events and draws from it. Everything else is reading:

| Read | It means | Who writes it |
|---|---|---|
| `row.hover.value`, `row.focus.value`, `row.pressed.value` | true or false, on this page | real events, or your code |
| `row.remote.value.hover`, `.focus`, `.pressed` | how many others have it: other tabs and other clients. A count, never who. | only the network |

**Yours and theirs never mix.** Someone else's hover can't set your `row.hover`, so a `watch` on it can't run for them and can't echo back. To draw both by hand, read both: `row.hover.value || row.remote.value.hover`. warp does this for you: a row lit from anywhere gets `data-hold`, and `data-remote` when it's only others.

**What a press leaves behind is data.** `pressed` is true only while a button is held down, so others see the press and then it's gone. The tick a press leaves on a checkbox is the app's data, not UI state: share it the way you share any data, with `state(…, { persist, sync: 'tabs' })` for tabs or live data for other clients. The demo above does both.

## How far it reaches

| Where | How it travels | What you do |
|---|---|---|
| The same page | the same object: one key is one row | nothing |
| Other tabs of this browser | `BroadcastChannel`, one post a frame at most | nothing |
| Other browsers | one socket per browser, held by one tab | allow it, below |

Drop `share` and the row is private to that one `interaction()` call. An app without `@weft-js/start` shares on the page only.

When the tab holding the socket closes or crashes, another tab takes over; nothing flashes, and nobody sees a gap except, for one round trip, a hover made during the handover. When a tab or client goes, what it held clears.

## Who may see what

Sharing with other clients is off until you say who may, in `src/realtime.server.ts`:

```ts
import { realtime } from '@weft-js/start'

export default realtime({ share: ({ ctx, key }) => ctx.user !== null && key.startsWith('todo:') })
```

That rule runs once per key. If it reads a database, a 200-row list means 200 queries, so answer them together instead. You get up to 400 keys in one call and give back the ones allowed:

```ts
import { realtime } from '@weft-js/start'

// visibleKeys is yours: one query that returns the keys this user may see.
declare function visibleKeys(userId: string, keys: string[]): Promise<string[]>

export default realtime({
  share: { keys: async ({ ctx, keys }) => (ctx.user ? visibleKeys(ctx.user.id, keys) : []) },
})
```

Either form runs when a client joins and at each session re-check, and uses the same `ctx` as a channel's `authorize`. A rule that throws refuses what it was asked. With no `share` the socket refuses every key (R011), and a refused key still works between tabs. `() => true` must be written out.

Peers see the three bits and an opaque connection id. No name, no pointer position, nothing typed. For names and cursors use `@weft-js/multiplayer`.

**Hover tells people things.** What someone lingers on in a shared document, or which field of a form has focus, is a real signal. warp never shares by default: you opt in row by row, and it's worth telling your users.

## Details

- **Keys** are read once, so a prop goes in as a function: `share: () => `todo:${props.id}``. A plain string is fine when it's fixed. To change key, give the component a new `key`.
- **Costs.** A 200-row list is one frame to join, and a joiner costs other clients nothing. High-frequency changes send at most one frame per 60 ms, carrying the latest value of every row that changed. `limits.shareKeys` (1000) caps keys per socket.
- **Touch** has no hover, so `row.hover` stays false on a phone; press still works, and a phone can show someone else's hover.
- **The server** renders every row as idle, so hydration has nothing to reconcile. Rows are live a moment after the page is.
- **Components that take `ui`:** Button, Checkbox, Switch, Radio, Toggle, Chip, Card. Remote state never touches `aria-*` or focus: it is decoration.

`weft check` flags keys that can't match (U001), keys built from what a user typed (U002), `share` with no rule (U003), writing `remote` (U004) and `ui` on a component that doesn't take it (U005).

## One browser, one socket

All tabs of a browser share one WebSocket, held by one tab, and `share`, `channel` and `live` all ride it. You don't set this up. To your code and to the server each tab is still its own connection: `exceptSelf`, `left`, presence and rate limits work per tab as they did. `limits.connections` now counts browsers.

When the leader tab closes, another takes over within a few milliseconds. Every tab's channels rejoin and its live queries resubscribe, so presence in other tabs may blink once. A browser without Web Locks gives each tab its own socket. A host that can't do WebSockets falls back to `/_weft/rt` over SSE for `live`.
