/** Diagnostic entries in their catalog order. */
export const part05 = [
  {
    code: 'U001',
    severity: 'error',
    by: 'cli',
    catches:
      'A `share` key built from `Math.random`, `Date.now` or `crypto.randomUUID`: no other tab or client will ever have the same one',
    fix: `Build it from a stable id: \`share: () => \`todo:\${props.id}\`\``,
  },
  {
    code: 'U002',
    severity: 'warning',
    by: 'cli',
    catches:
      'A `share` key taken from the URL or something typed: `realtime({ share })` then authorises a string the user chose',
    fix: 'Build it from data the server knows, and have the rule check it',
  },
  {
    code: 'U003',
    severity: 'warning',
    by: 'cli',
    catches:
      '`interaction({ share })` in an app with no `realtime({ share })`: tabs work, and other clients are refused (R011)',
    fix: 'Add `share: ({ ctx, key }) => …` to `realtime()` in `src/realtime.server.ts`, or leave it if tabs are all you want',
  },
  {
    code: 'U004',
    severity: 'error',
    by: 'cli',
    catches: 'Writing `row.remote`: it is what others are doing, and only the network writes it',
    fix: 'Write `row.hover`, or keep your own `state`',
  },
  {
    code: 'U005',
    severity: 'error',
    by: 'cli',
    catches:
      '`ui` on a warp component that does not take it: an attribute is written and nothing is drawn',
    fix: 'Use Button, Checkbox, Switch, Radio, Toggle, Chip or Card, or read the row yourself',
  },
  {
    code: 'S012',
    severity: 'warning',
    by: 'cli',
    catches:
      '`state.linked` over a query value with no `key`: a refetch resets what someone is typing',
    fix: 'Add `{ key: () => source.value?.id }`',
  },
  {
    code: 'S013',
    severity: 'warning',
    by: 'runtime',
    catches:
      'A `local` or `session` persisted box read in a server render: the page shows `init`, then flashes to the stored value',
    fix: "`persist: { in: 'cookie' }` if it's small, or render it client-only",
  },
  {
    code: 'F001',
    severity: 'error',
    by: 'runtime',
    catches: "`<Form of>` was given something that isn't a mutation",
    fix: '`<Form of={addTodo}>`, with `addTodo` a `mutation()` export of a server module',
  },
  {
    code: 'F002',
    severity: 'error',
    by: 'start',
    catches:
      'A form POST without the same-origin proof (`Origin`, or `Sec-Fetch-Site: same-origin`): 403',
    fix: 'Submit through a `<Form>` on the same origin; behind a proxy, forward the host so the origins match',
  },
  {
    code: 'F003',
    severity: 'error',
    by: 'start',
    catches: 'A form POST naming no known mutation: the page is older than the server',
    fix: 'Reload; keep `mutation` exports in server modules',
  },
  {
    code: 'Q011',
    severity: 'warning',
    by: 'start',
    catches:
      "A function read or wrote a table its `tags`/`invalidates` don't name (dev): a mutation of that table won't refresh it",
    fix: "Add the table's name (or `table:…`) to `tags`/`invalidates`",
  },
  {
    code: 'Q012',
    severity: 'error',
    by: 'start',
    catches: '`@weft-js/start/db*` or `@weft-js/start/auth` reached the client graph',
    fix: "Import it from a server module (`src/server/**`, `*.server.ts`) or a route's `load`",
  },
  {
    code: 'Q013',
    severity: 'error',
    by: 'start',
    catches:
      "A database URL the driver can't open (a `postgres://` URL given to the SQLite entry, or the reverse)",
    fix: 'Use the matching `createDb`: `@weft-js/start/db/sqlite` or `@weft-js/start/db/postgres`',
  },
  {
    code: 'Q014',
    severity: 'error',
    by: 'start',
    catches: "The database doesn't match the schema: a table or column is missing",
    fix: 'Run `weft db generate`, then reload (new migrations apply on the next request)',
  },
  {
    code: 'I001',
    severity: 'error',
    by: 'cli',
    catches: '`<Icon name="as">`, or `Icons.As`, where no such icon exists',
    fix: 'Use the name it suggests. `weft docs icons` has the set; an editor completes it from the type.',
  },
  {
    code: 'I002',
    severity: 'info',
    by: 'cli',
    catches: 'An icon name only known at runtime, so that use loads the pack',
    fix: 'Nothing to do if the name comes from data. To fetch single icons instead, set `icons({ source })`. A list of literals, or a map over one, ships only those.',
  },
  {
    code: 'I003',
    severity: 'info',
    by: 'cli',
    catches: 'The icon pack used as a value, so all of it ships with the page',
    fix: 'Use `Icons.X`, or `Icons[name]`, which loads lazily.',
  },
  {
    code: 'Q015',
    severity: 'warning',
    by: 'cli',
    catches: '`src/db/schema.ts` changed since the last `weft db generate`',
    fix: 'Run `weft db generate`',
  },
  {
    code: 'Q016',
    severity: 'error',
    by: 'start',
    catches:
      "A request used the database while it was down, or a migration it needs failed (503; the server log has the driver's error). Pages that run no statements still serve",
    fix: 'Start the database and check `DATABASE_URL`, or fix the migration: the next statement tries again',
  },
  {
    code: 'A001',
    severity: 'error',
    by: 'start',
    catches: 'The auth secret is missing or under 32 characters on a production server',
    fix: "Set `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) in the server's environment",
  },
  {
    code: 'A002',
    severity: 'error',
    by: 'start',
    catches: "A function with `auth: 'user'` was called with no session (401)",
    fix: 'Sign in first, or guard the route with `redirect()` in its `load`',
  },
  {
    code: 'A003',
    severity: 'error',
    by: 'start',
    catches:
      "`auth: 'user'`, but `ctx` has no `user`: the context file never asked for the session",
    fix: 'Spread `session(auth, request)` into what `src/context.server.ts` returns',
  },
  {
    code: 'A004',
    severity: 'warning',
    by: 'start',
    catches:
      'A mutation changed the session cookie without a redirect: the tab keeps what the last session cached',
    fix: "`redirect()` after it: that's a full load, which drops the client cache",
  },
  {
    code: 'A005',
    severity: 'error',
    by: 'start',
    catches: 'The database provider has no Better Auth adapter',
    fix: 'Pass `options.database` to `createAuth`, or use a provider that has one',
  },
  {
    code: 'C001',
    severity: 'warning',
    by: 'cli',
    catches:
      "A function's `input` or `output` schema can't become JSON Schema: the contract says `{}`",
    fix: "Use a schema with JSON Schema support (Zod 4 has it), or drop what can't be represented",
  },
  {
    code: 'C002',
    severity: 'error',
    by: 'start',
    catches: "A function's value failed its `output` schema (dev and tests)",
    fix: 'Fix `run`, or the schema',
  },
  // Realtime (research 30 §8, research 32 §8; R for realtime).
  {
    code: 'R001',
    severity: 'error',
    by: 'start',
    catches:
      '`channel` or `sharedState` without `authorize` (`weft check`, `weft build`, and thrown at definition)',
    fix: 'Add it (`() => true` must be written explicitly)',
  },
  {
    code: 'R002',
    severity: 'error',
    by: 'cli',
    catches:
      "The memory bus on a multi-instance preset, or `durableObjectBus` outside `cloudflare_durable` (`weft build` fails): a message reaches one instance's clients",
    fix: '`weft add redis` or `weft add nats`, or `realtime({ bus: postgresBus({ url }) })` in `src/realtime.server.ts`',
  },
  {
    code: 'R003',
    severity: 'warning',
    by: 'start',
    catches:
      "A mutation wrote a table a live query reads, and their tags don't intersect (dev): open pages won't update",
    fix: "Add one of the query's tags to `invalidates`",
  },
  {
    code: 'R004',
    severity: 'error',
    by: 'start',
    catches:
      "A wildcard in `realtime({ origins })`, or a hand-written WebSocket handler (`crossws`, `defineWebSocketHandler`) that skips the Origin check: any site could join with a visitor's cookies",
    fix: 'List the origins, scheme and port included; use `channel`',
  },
  {
    code: 'R005',
    severity: 'warning',
    by: 'cli',
    catches:
      "A stream's `input`, a channel's `params` or client messages, or a shared key or value has an unbounded string or array (`weft build`): a client decides how much the server holds",
    fix: 'Add `.max()`',
  },
  {
    code: 'R006',
    severity: 'warning',
    by: 'start',
    catches:
      "A stream's `run` read the database before it subscribed to a topic (dev): what's published in between is lost",
    fix: 'Call `topic.subscribe()` first, or pass `after`',
  },
  {
    code: 'R007',
    severity: 'warning',
    by: 'cli',
    catches:
      '`ws`, `socket.io-client`, `reconnecting-websocket` or `@microsoft/fetch-event-source` in dependencies: weft owns the connection',
    fix: 'Use `stream`, `.live()` or `channel`',
  },
  {
    code: 'R008',
    severity: 'error',
    by: 'start',
    catches:
      'A message over 1 MiB, a request or socket frame over 64 KiB, or a client over the channel rate limit (20 messages a second)',
    fix: 'Send less, or an id the client fetches; `limits` raises it',
  },
  {
    code: 'R009',
    severity: 'error',
    by: 'start',
    catches:
      'Over 100 subscriptions or joins on a connection, or 10 connections or sockets for a user',
    fix: 'Read fewer keys; `limits` raises it',
  },
]
