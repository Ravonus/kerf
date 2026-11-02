# Live data

:::learn
- How to keep a query up to date for every visitor with `.live()`
- When to use a `channel` instead
- Why you never poll or open a socket yourself
:::

A query is fresh when you load it. To keep it fresh while other people change the data, make it live.

## Live queries

```tsx
const todos = listTodos.live()
todos.live.value   // 'connecting' | 'live' | 'degraded' | 'reconnecting' | 'offline'
```

`listTodos.live()` is the same resource as `listTodos()`. Now, when any mutation invalidates one of the query's tags, on
any tab or any visitor's browser, every reader gets the new rows. Rows that didn't change keep their identity, so only what
changed is written to the page.

A live query needs `tags` (**W053**). There is no server code to write: tags are the contract.

## Channels

For messages a client sends often, such as chat, typing or cursors, use a `channel`: a WebSocket with named messages each
way. You define it in a server module, and `authorize` is required (**R001**):

```tsx
const chat = room.connect(() => ({ roomId: props.roomId }))
const said = chat.collect('said', { max: 200, key: m => m.id })
await chat.send('say', { text })
chat.status.value   // 'connecting' | 'open' | 'reconnecting' | 'closed' | 'unauthorized'
```

The site's [examples](/examples) include a real chat on a channel that survives a cut connection.

## Don't poll

Live queries, streams and channels reconnect, resume and clean up for you. Polling with a timer, or adding your own socket
library, works against that, and `weft check` says so (**R007**).

The [Full stack reference](/reference/start) covers channels, streams, writes from outside the app and hosting.

## Recap

- `query.live()` keeps a query current for everyone, through its tags.
- `channel` is for frequent client messages, with `authorize` required.
- Never poll or manage sockets yourself.
