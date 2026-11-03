# Realtime and live data

:::learn
- How to keep a query up to date for every visitor with `.live()`, and why tags are all the server code it needs
- When to reach for a `stream` and a `topic` instead, and how a stream resumes with `tracked`
- How a `channel` carries chat, typing and cursors, and what `sharedState` and presence add on top
- How writes from outside the app reach the page with `dbChanges`, and how several servers share one bus
- Why you never poll or open a socket yourself
:::

A query is fresh when you load it. On a page that several people look at, such as a board, a chat or an order list, it
goes stale the moment someone else changes the data. In React you'd reach for a WebSocket library, a polling interval or
a hosted service, and then write the code that merges what arrives into what you already have.

In weft the server functions you already wrote are most of the answer. A query that has `tags` can stay live, a
generator can push messages, and a room of named messages rides one shared socket that reconnects, resumes and cleans up
for you. This page goes from the smallest change (one word on a query) to the larger tools.

:::demo server-live-tags

## Live queries

Take the scaffold's `listTodos` from [Server functions](/learn/server-functions). It already has `tags: ['todos']`, and
every mutation that changes todos says `invalidates: ['todos']`. To keep it current for everyone, call `.live()` instead
of calling the query:

```tsx
import { listTodos } from '#/server/todos'

export function TodoList() {
  const todos = listTodos.live()
  return (
    <section>
      <p>Status: {todos.live.value}</p>
      <ul>
        {(todos.value ?? []).map(t => (
          <li key={t.id}>{t.title}</li>
        ))}
      </ul>
    </section>
  )
}
```

`listTodos.live()` is the same resource as `listTodos()`: `.value`, `.error` and everything else you know from
[Loading data](/learn/loading-data) work as before. It adds two things to read:

- `todos.live.value` is where the connection stands: `'connecting'`, `'live'`, `'degraded'`, `'reconnecting'` or
  `'offline'`.
- `todos.liveMode.value` says how writes reach this page, which matters once writes come from outside the app. That's
  [later on this page](#writes-from-outside-the-app).

Now, when any mutation invalidates one of the query's tags, on any tab or in any visitor's browser, every reader of the
query refetches. The refetch goes through the query's own `run`, so `auth` and every filter in it run again for each
reader. Rows that didn't change keep their identity, so the keyed list writes only what changed to the page.

### Tags are the contract

There's no server code to write for a live query. The tags you gave the query for caching are the same tags a mutation
names to refresh it, so they are also what decides who hears about a change. That's why a live query needs `tags`:
without them nothing could ever poke it, and `.live()` on such a query is **W053**.

The other half has a check too. In `weft dev`, a mutation that writes a table a live query reads, without naming one of
that query's tags in `invalidates`, is **R003**: open pages wouldn't update.

:::pitfall One user's data needs one user's tag
A tag like `'todos'` is shared by everyone. That's correct (each reader refetches through their own `run`, so nobody
sees someone else's rows), but it means every visitor refetches whenever anybody adds a todo. When the data is per user,
give the query a tag that names the user. `tags` can take `ctx`:

```ts
tags: (_, ctx) => [`todos:${ctx.user.id}`]
```

Then a mutation invalidates `` `todos:${ctx.user.id}` `` and only that user's tabs refetch.
:::

### Changing the input

`.live()` takes the same input forms as a call: a value, or a function that reads boxes, with `skip` to wait. When the
input changes, the subscription moves with it. An options object can come second: `keep` says how long the
subscription outlives the last component reading it, so a quick remount finds it warm.

```tsx
import { state } from '@weft-js/core'
import { skip } from '@weft-js/start'
import { listTodos } from '#/server/todos'

export function Watcher() {
  const watching = state(false)
  const todos = listTodos.live(() => (watching.value ? undefined : skip), { keep: '30s' })
  return (
    <section>
      <button type="button" onClick={() => (watching.value = !watching.value)}>
        {watching.value ? 'Stop watching' : 'Watch'}
      </button>
      <p>{todos.value?.length ?? 0} todos, {todos.live.value}</p>
    </section>
  )
}
```

:::deepdive What a poke is
A live query doesn't send rows down the wire. The server tells each subscriber "these tags changed", which is a poke, and
the client does what it would do after its own mutation: it invalidates its cache for those tags and the query
refetches. So a live query is never more up to date than a normal refetch would be, and never sees more than the user's
own `run` returns. A mutation's own response already carries the fresh queries for the tab that made it, so that tab
isn't poked twice.

All of a browser's tabs share one WebSocket, held by one tab, and live queries, streams, channels and shared UI state all
ride it. To your code and to the server each tab is still its own connection.
:::

## Streams and topics

A live query answers "what does this look like now?" Some data is a sequence of events instead: prices ticking, a build
log, an AI reply arriving word by word. For that, write a `stream`: a server function whose `run` is an async generator.
What it yields goes to the page.

Most streams read from a `topic`, a typed channel on the server that anything (a mutation, a job, a webhook) can publish
to. Define both in a server module, next to your queries:

```ts
// src/server/prices.ts
import { stream, topic } from '@weft-js/start'
import { z } from 'zod'

const Price = z.object({ symbol: z.string(), price: z.number() })

export const priceTopic = topic('prices', { key: z.string().max(12), message: Price })

export const prices = stream({
  input: z.object({ symbols: z.array(z.string().max(12)).max(50) }),
  message: Price,
  auth: 'user',
  async *run({ input, signal, lastEventId }) {
    yield* priceTopic.subscribe(input.symbols, { signal, after: lastEventId })
  },
})
```

Anywhere on the server, `await priceTopic.publish('AAPL', { symbol: 'AAPL', price: 191.2 })` reaches every subscriber
of that key, on every instance. A message over 1 MiB is refused (**R008**): publish an id the client fetches instead.

On the page, call the stream like a query. Without options you get the latest message:

```tsx
import { prices } from '#/server/prices'

export function Ticker() {
  const tick = prices({ symbols: ['AAPL'] })
  return <p>{tick.value ? `${tick.value.symbol} ${tick.value.price}` : 'Waiting…'} ({tick.status.value})</p>
}
```

`tick.status.value` is one of the live statuses, or `'done'` when the generator returns.

### Fold, don't collect in state

To keep every message, not only the latest, pass `fold` and `initial`. The fold lives in weft's cache, not in your
component, so a remount within `keep` finds everything it had:

```tsx
import { state } from '@weft-js/core'
import { prices } from '#/server/prices'

type Prices = Record<string, { symbol: string; price: number }>

export function Board() {
  const symbols = state(['AAPL', 'MSFT'])
  const board = prices(() => ({ symbols: symbols.value }), {
    fold: (acc: Prices, m) => ({ ...acc, [m.symbol]: m }),
    initial: {},
    keep: '30s',
  })
  return (
    <ul>
      {Object.values(board.value).map(p => (
        <li key={p.symbol}>{p.symbol}: {p.price}</li>
      ))}
    </ul>
  )
}
```

Without `fold`, a slow client skips messages and always shows the newest. With one, the server holds up to `buffer`
messages (256 by default) for a client that falls behind.

:::demo server-fold

:::pitfall Never fold a stream into `state` with `watch`
`watch(() => tick.value, m => list.value = [...list.value, m])` looks natural, and it's **W052**. That list belongs to
the component: unmount it and every message is gone, and a second component reading the same stream builds a second
copy. `fold` keeps one list per stream and input, in the cache.
:::

### Resuming where it left off

Connections drop. When one comes back, the client resubscribes and tells the server the id of the last message it saw,
as `lastEventId`. A topic keeps a short replay ring, so `subscribe(keys, { after: lastEventId })` sends what was missed.
Past the ring's window (60 seconds or 256 messages by default) the stream resets instead, and `lastEventId` is
`undefined`: start again, or read what you need from the database.

Topic messages carry their ids for you. When your generator reads from somewhere else, give each message an id yourself
with `tracked`:

```ts
// src/server/feed.ts
import { stream, tracked } from '@weft-js/start'
import { z } from 'zod'

const Line = z.object({ n: z.number(), text: z.string() })

export const buildLog = stream({
  input: z.object({ build: z.string().max(64) }),
  message: Line,
  async *run({ input, signal, lastEventId }) {
    let n = lastEventId ? Number(lastEventId) + 1 : 0
    while (!signal.aborted && n < 3) {
      yield tracked(String(n), { n, text: `${input.build}: step ${n}` })
      n++
    }
  },
})
```

:::pitfall Subscribe before you read
A stream that reads a backlog from the database and then subscribes to a topic has a gap: anything published between the
read and the subscribe is lost. In `weft dev` that's **R006**. Call `topic.subscribe()` first (it starts listening at
once), then read the backlog, or pass `after`.
:::

Bound every input. A stream's `input` decides how much the server holds for a client, so an unbounded string or array
in it is **R005** (`z.string().max(…)`, `z.array(…).max(…)`). The same goes for a channel's params and messages below.

## Channels

Streams go one way. For what the client sends often, such as chat lines, "is typing" and cursors, use a `channel`: a room
of named messages each way, over the shared socket. For anything else, a mutation and a live query are simpler and keep
a record.

Define it in a server module. `authorize` is required (**R001**), and runs on every join and again every five minutes,
so a user who loses access is removed:

```ts
// src/server/rooms.ts
import { channel } from '@weft-js/start'
import { z } from 'zod'

const Said = z.object({ id: z.string(), who: z.string(), text: z.string() })

export const room = channel({
  params: z.object({ roomId: z.string().max(64) }),
  authorize: ({ ctx }) => ctx.user !== null,
  client: {
    say: z.object({ text: z.string().min(1).max(2000) }),
    typing: z.object({}),
  },
  server: {
    said: Said,
    typing: z.object({ who: z.string() }),
  },
  on: {
    say: async ({ msg, ctx, room }) => {
      await room.publish('said', { id: crypto.randomUUID(), who: ctx.user?.name ?? 'Someone', text: msg.text })
    },
    typing: async ({ ctx, room }) => {
      await room.publish('typing', { who: ctx.user?.name ?? 'Someone' }, { exceptSelf: true, volatile: true })
    },
  },
  limits: { perSecond: 10 },
})
```

- `client` messages are always validated; `server` messages are checked in dev and tests.
- `on.say` runs on the server for each `say`. Throw a `FnError` to refuse it: the client's `send` rejects with it.
- `room.publish` reaches everyone in the room, on every instance. `exceptSelf` skips the sender, `to` sends to one
  connection (the `id` a handler gets), and `volatile` means "don't keep this for a resume", which suits typing and
  cursors.
- A `left` handler runs when a connection leaves the room.
- `limits.perSecond` caps what one socket may send; the default is 20 a second (**R008** past it).

On the page, connect with params. A function argument is tracked, so the connection follows `props.roomId`, and `skip`
leaves the room:

```tsx
import { state } from '@weft-js/core'
import { room } from '#/server/rooms'

export function Room(props: { roomId: string }) {
  const chat = room.connect(() => ({ roomId: props.roomId }))
  const said = chat.collect('said', { max: 200, key: m => m.id })
  const typing = state('')
  chat.on('typing', ({ who }) => {
    typing.value = `${who} is typing…`
  })
  const draft = state('')
  const send = async (e: SubmitEvent) => {
    e.preventDefault()
    await chat.send('say', { text: draft.value })
    draft.value = ''
  }
  return (
    <form onSubmit={send}>
      <p>{chat.status.value}</p>
      <ol>
        {said.value.map(m => (
          <li key={m.id}><b>{m.who}</b> {m.text}</li>
        ))}
      </ol>
      <p>{typing.value}</p>
      <input
        aria-label="Message"
        value={draft.value}
        onInput={e => {
          draft.value = e.currentTarget.value
          void chat.send('typing', {})
        }}
      />
      <button type="submit">Send</button>
    </form>
  )
}
```

`chat.status.value` is `'connecting'`, `'open'`, `'reconnecting'`, `'closed'` or `'unauthorized'`. When `authorize`
says no, the status is `'unauthorized'` (**R011**) and `chat.retry()` tries again, say after the user signs in.

`collect` keeps a room's messages of one name in the cache, like a stream's `fold`: a remount within `keep` finds them,
and `key` drops a message it has already seen. `on` calls a function for each message, and is removed with the
component that set it up.

:::pitfall The channel is a wire, not a log
A reconnect replays what the last 60 seconds or 256 messages hold, on that server. Past that, or after a restart,
`collect` empties, `chat.resets` ticks and `chat.onReset(fn)` runs. So what must survive belongs in the database: save
each message in the `say` handler, read history with a query, `collect` the new ones with a `key` that matches the
saved id, and invalidate the history query on a reset.

`send` has no offline queue either. While the socket reconnects it waits up to 10 seconds, then rejects. A `send` that
was in flight when the socket died rejects too, because it may or may not have arrived: put an id in the message if a
retry mustn't count twice.
:::

:::deepdive Origins, sessions and the socket you didn't write
The socket accepts the app's own origin and the ones you list in `realtime({ origins })`, exactly, scheme and port
included (**R010**). A wildcard there, or a WebSocket handler of your own that skips the check, is **R004**: any site
could join with a visitor's cookies. There's nothing else to configure.

After a sign-out or a kick, `invalidate('session:' + userId)` re-checks that user's sockets at once instead of at the
next five-minute check, and a user whose session ended is closed with status `'unauthorized'`.

`authorize` doesn't narrow types: `ctx.user` in `on` is still nullable, which is why the example writes `ctx.user?.name`.
:::

## Shared state

Sometimes a room has one value everybody sees, such as the slide a presenter is on, or a document's title while it's being
edited. `sharedState` is one value per key, last writer wins, as a box. Reads and writes each have a rule, and both are
required:

```ts
// src/server/deck.ts
import { sharedState } from '@weft-js/start'
import { z } from 'zod'

export const deckSlide = sharedState('deck-slide', {
  key: z.string().max(64),
  value: z.number().int().min(0).max(999),
  initial: 0,
  authorize: {
    read: ({ ctx }) => ctx.user !== null,
    write: ({ ctx, key }) => ctx.user !== null && key.startsWith(`${ctx.user.id}:`),
  },
})
```

```tsx
import { deckSlide } from '#/server/deck'

export function Slides(props: { deck: string }) {
  const slide = deckSlide.connect(() => props.deck)
  return (
    <section>
      <p>Slide {slide.value + 1} ({slide.status.value})</p>
      <button type="button" onClick={() => slide.value++}>Next</button>
    </section>
  )
}
```

A write is optimistic: the box changes at once, and if the server refuses it the value goes back and `slide.error` says
why. From the server, `await deckSlide.in(key).set(3)` writes it.

The value lives in server memory. It survives a restart only while another instance is running, so anything that must
last is a mutation. For hover and focus shared between people, see `interaction({ share })` in
[Hover, focus and shared UI state](/learn/ui-state); it rides the same socket.

## Presence, cursors and the multiplayer library

Who else is here, what they're doing, where their pointer is: that's presence, and it's built on a channel by a separate
library, `@weft-js/multiplayer`. It's not a plugin, and an app that doesn't import it ships none of it.

Its server half gives you messages to spread into your own `channel`, so `authorize` and your own messages stay yours.
Who a peer is comes from `user` on the server, never from the client:

```ts
// src/server/doc.ts
import { channel } from '@weft-js/start'
import { multiplayer } from '@weft-js/multiplayer/server'
import { z } from 'zod'

const mp = multiplayer<{ id: string }>({
  user: ({ ctx }) => (ctx.user ? { id: ctx.user.id, name: ctx.user.name } : { id: 'guest' }),
})

export const doc = channel({
  params: z.object({ id: z.string().max(64) }),
  authorize: ({ ctx }) => ctx.user !== null,
  client: { ...mp.client },
  server: { ...mp.server },
  on: { ...mp.on },
  left: mp.left,
})
```

On the page, `presence(connection, { state })` returns `peers`, everyone else in the room with the small state each one
shares, and `cursors(room)` with `<Cursors of={…} />` from `@weft-js/multiplayer/ui` draws their pointers:

```tsx
import { state } from '@weft-js/core'
import { cursors, presence } from '@weft-js/multiplayer'
import { Cursors } from '@weft-js/multiplayer/ui'
import { doc } from '#/server/doc'

export function Board(props: { id: string }) {
  const chat = doc.connect(() => ({ id: props.id }))
  const typing = state(false)
  const room = presence(chat, { state: () => ({ typing: typing.value }) })
  const pointers = cursors(room)
  return (
    <section data-anchor="board">
      <ul>
        {room.peers.value.map(p => (
          <li key={p.id}>{p.user.name ?? 'Someone'}{p.state.typing ? ' is typing' : ''}</li>
        ))}
      </ul>
      <textarea aria-label="Notes" onFocus={() => (typing.value = true)} onBlur={() => (typing.value = false)} />
      <Cursors of={pointers} />
    </section>
  )
}
```

Peers announce themselves, answer when someone new asks, and beat every 15 seconds; one that misses three beats ages out.
There's no roster on the server, so any bus works and a dead instance's peers simply expire. The library also has
`relay` for typed, server-checked events between peers, and `syncedScroll` and `syncedHash` for following someone
through a page.

Cursors go through the server by default. Three packages carry them another way, passed as `transport` to `presence`:
`@weft-js/realtime-webrtc` (`webrtc()`, directly between browsers, signalled through the room),
`@weft-js/realtime-livekit` (`livekit({ url })`, through a LiveKit room you can also use for audio and video) and
`@weft-js/realtime-socketio` (`socketio({ url })`, through a Socket.IO relay you run). Only cursors ride them: state
and the relay stay on the server, which checks them.

## Writes from outside the app

`.live()` follows mutations. A cron job, `psql`, a worker or another service writes to the database without going through
one, so nothing pokes the page. To catch those writes, give the database's changes to `realtime()` in
`src/realtime.server.ts`:

```ts
// src/realtime.server.ts
import { dbChanges, realtime } from '@weft-js/start'
import { db } from '#/db/index.server'
import { todos } from '#/db/schema'

export default realtime({ changes: dbChanges(db, [todos]) })
```

Then run `weft db live`. It writes a migration that adds change triggers to those tables (SQLite, Postgres and MySQL),
which applies on the next request. A table in `changes` that no migration covers is **R018**, and the server falls back to
polling for it.

A change carries a table and primary keys, never a column. It becomes the tags `todos` and `todos:<id>`, so a query
tagged `todos` hears it, and each client refetches through its own `run`: someone who can't see a row gets the same
answer as before. `dbChanges(db, tables, { tagged })` maps a change to your own tags instead. A live query that reads a
table `changes` reports, without a tag that names it, is **R012** in dev.

### What you get depends on where it runs

How the server hears changes depends on the database and the host. At startup it tries the real thing, settles on a
mode and logs it once, and the page can read it too:

| `liveMode` | Means |
|---|---|
| `feed` | This server hears every change. |
| `external` | A separate listener hears them and publishes to the bus. |
| `poll` | A fallback: late, and by table only. `.live` shows `degraded`. |
| `app` | No `changes` configured: mutations only. Not degraded; it's what you asked for. |
| `off` | Nothing can be read: mutations only. `.live` shows `degraded`. |

On Postgres it's triggers and `NOTIFY` on one held connection; on SQLite a cheap `PRAGMA data_version` check every
100 ms on the same host; on MySQL the triggers' log every 500 ms; on MongoDB a change stream with
`mongoChanges(db, collections)` from `@weft-js/db/mongo`. That polling is the framework's watcher, in one place on the
server. Your own code still never polls.

`weft doctor --preset vercel` tells you what a target can do before you deploy there. Serverless hosts end a process with
its request, so nothing can hold a connection: mutations still update `.live()`, and outside writes don't (**R014**).
[Runtimes and deploying](/learn/deploying#live-data-on-serverless-hosts) covers the two ways around that.

:::deepdive Refusing to ship a page that only looks live
`live: { required: true }` on a query (or `q.live(input, { required: true })`) says "this page is wrong without a real
feed". `weft check` and `weft build` fail with **R013** when the target can't provide one, and a server whose startup
probe finds no feed stops with **R015** rather than serve stale data. `liveHealth()` from `@weft-js/start` is the answer
for a health route: `ok: false` while a required query has no working feed.

`live: { verify: 'staging' }` goes further: on every `weft check` and `weft build` it writes one marked row to a
staging database and follows it through trigger, notify, poke and refetch, naming the link that broke (**R019**). Targets
must be marked as not production (**R022**), and passwords come from the environment (**R020**). The
[Full stack reference](/reference/start) has the setup.
:::

## More than one server

On one instance, nothing else is needed: messages, pokes and channels go through a memory bus in the process. Run two
instances behind a load balancer and a message published on one would reach only the clients connected to that one. So
several instances need a shared bus, and `weft build` refuses the memory bus on a preset that runs many instances
(**R002**).

The bus is a plugin or one line in `src/realtime.server.ts`:

- `weft add redis` adds `@weft-js/realtime-redis`, on `REDIS_URL`.
- `weft add nats` adds `@weft-js/realtime-nats`, on `NATS_URL`.
- `postgresBus({ url })` from `@weft-js/start/bus/postgres` uses the Postgres you already have, through `NOTIFY`. It
  needs a direct connection: a pooler in transaction mode breaks `LISTEN`.
- `durableObjectBus({ namespace })` from `@weft-js/realtime-durable-object` is for Cloudflare's `cloudflare_durable`
  preset only.

<!-- example: skip postgresBus needs the postgres driver, which a SQLite app doesn't install -->
```ts
// src/realtime.server.ts
import { realtime } from '@weft-js/start'
import { postgresBus } from '@weft-js/start/bus/postgres'

export default realtime({
  bus: postgresBus({ url: process.env.DATABASE_URL ?? '' }),
  origins: ['https://admin.example.com'],
  maxDuration: 300,
})
```

A `bus` set in this file wins over a bus plugin. `maxDuration` is the host's response limit in seconds: streams end 10
seconds earlier and resume, so a platform timeout never shows. `limits` raises the per-connection numbers (subscriptions,
message sizes, the replay ring) if you need to.

Every bus is at most once. What must survive is a mutation; `collect` plus a history query covers a gap.

## Don't poll

Live queries, streams and channels reconnect, resume and clean up for you. Polling with a timer works against that: it
asks the server the same question whether anything changed or not, and still shows the change late. A socket library of
your own (`ws`, `socket.io-client`, `reconnecting-websocket`) bypasses the origin check, the session re-check and the
shared socket, and `weft check` flags it (**R007**). In a test, a real `WebSocket` or `EventSource` is **T013**: tests use
the fake transport from `@weft-js/core/test`, which [Testing](/learn/testing) covers.

## Recap

- `query.live()` keeps a query current for every reader. The query's `tags` are the contract: a mutation that invalidates
  one pokes every reader, who refetch through their own `run`.
- A `stream` is an async generator for a sequence of events, usually fed by a `topic`. Use `fold` to keep messages, never
  `watch` into `state`; subscribe before you read; `tracked` ids let it resume.
- A `channel` is a room of named, validated messages each way, with `authorize` required. It's a wire, not a log: keep
  what matters in the database.
- `sharedState` is one last-writer-wins value per key; `@weft-js/multiplayer` adds presence, cursors and a relay on a
  channel.
- `dbChanges` brings writes from outside the app to the same queries. What works depends on the database and the host;
  `weft doctor` tells you.
- More than one instance needs a shared bus: Redis, NATS, Postgres or a Durable Object.

## Try it

:::challenge Make a stale page live
This component shows the user's todos, but another tab adding a todo doesn't update it. Make it update, and show a small
note while the connection isn't live.

```tsx
import { listTodos } from '#/server/todos'

export function Count() {
  const todos = listTodos()
  return <p>{todos.value?.length ?? 0} todos</p>
}
```
:::solution
```tsx
import { listTodos } from '#/server/todos'

export function Count() {
  const todos = listTodos.live()
  return (
    <p>
      {todos.value?.length ?? 0} todos
      {todos.live.value !== 'live' && <small> ({todos.live.value})</small>}
    </p>
  )
}
```

`listTodos` already has `tags: ['todos']`, and the scaffold's mutations invalidate `'todos'`, so `.live()` is the whole
change. The status is a box like any other, so the note appears and disappears by itself.
:::

:::challenge Find the lost messages
This stream sends a new order to the kitchen screen. Now and then an order never shows up. Why, and what's the fix?

```ts
async *run({ signal }) {
  const open = await loadOpenOrders()
  for (const o of open) yield o
  yield* orderTopic.subscribe('kitchen', { signal })
}
```
:::solution
An order published after `loadOpenOrders()` read the database and before `subscribe` started listening is in neither, so
it's lost. `weft dev` reports this as **R006**. Subscribe first, then read the backlog:

```ts
async *run({ signal }) {
  const live = orderTopic.subscribe('kitchen', { signal })
  for (const o of await loadOpenOrders()) yield o
  yield* live
}
```

`subscribe` starts listening when it's called, so everything published from then on waits in its queue while the backlog
is read. An order in both is yielded twice, which a `fold` keyed by order id absorbs.
:::

:::challenge A typing indicator that doesn't flood
In the `room` channel above, every keystroke sends `typing`. Make the client send it at most once a second, and make sure
the server never keeps it for a resume.
:::solution
The server half is already right: `typing` is published with `{ exceptSelf: true, volatile: true }`, so the sender
doesn't hear itself and a resume doesn't replay stale typing. On the client, remember when it was last sent:

```tsx
let last = 0
const typed = () => {
  if (Date.now() - last < 1000) return
  last = Date.now()
  void chat.send('typing', {})
}
```

A plain `let` is fine here: nothing on the page reads it, so it doesn't need to be a box. Call `typed()` from `onInput`.
:::

:::challenge Two servers, one chat
You deploy the chat to two instances on a container host behind a load balancer. Alice and Bob land on different
instances and can't see each other's messages, though each sees their own. What's missing?
:::solution
A shared bus. Each instance's memory bus only reaches its own sockets, so `room.publish` on Alice's instance never gets
to Bob's. Add one: `weft add redis` (with `REDIS_URL`), `weft add nats`, or `bus: postgresBus({ url })` in
`src/realtime.server.ts`. On presets weft knows run many instances, `weft build` stops with **R002** before this can
happen; on a container host you choose the instance count, so it's yours to remember.
:::
