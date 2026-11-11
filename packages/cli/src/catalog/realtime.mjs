/** realtime diagnostic entries in catalog order. */
export const realtime = [
  // Realtime (research 30 §8, research 32 §8; R for realtime).
  {
    code: 'R001',
    severity: 'error',
    by: 'start',
    catches:
      '`channel` or `sharedState` without `authorize` (`kerf check`, `kerf build`, and thrown at definition)',
    fix: 'Add it (`() => true` must be written explicitly)',
  },
  {
    code: 'R002',
    severity: 'error',
    by: 'cli',
    catches:
      "The memory bus on a multi-instance preset, or `durableObjectBus` outside `cloudflare_durable` (`kerf build` fails): a message reaches one instance's clients",
    fix: '`kerf add redis` or `kerf add nats`, or `realtime({ bus: postgresBus({ url }) })` in `src/realtime.server.ts`',
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
      "A stream's `input`, a channel's `params` or client messages, or a shared key or value has an unbounded string or array (`kerf build`): a client decides how much the server holds",
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
      '`ws`, `socket.io-client`, `reconnecting-websocket` or `@microsoft/fetch-event-source` in dependencies: kerf owns the connection',
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
  {
    code: 'R010',
    severity: 'error',
    by: 'start',
    catches:
      "An origin that isn't the app's own or in `realtime({ origins })` tried to open a connection",
    fix: 'List it, scheme and port included',
  },
  {
    code: 'R011',
    severity: 'error',
    by: 'start',
    catches:
      "A channel's `authorize` refused a join or a write (the status is `unauthorized`), at the join or a session re-check",
    fix: 'Sign in, or check `authorize`',
  },
  {
    code: 'R012',
    severity: 'warning',
    by: 'start',
    catches:
      "A live query reads a table `changes` reports and no tag names it, or a table `changes` doesn't list (dev): writes from outside the app won't refresh it",
    fix: "Add the table's name to `tags`, or the table to `dbChanges`",
  },
  {
    code: 'R013',
    severity: 'error',
    by: 'cli',
    catches:
      "A query marked `live: { required: true }` on a target that can't deliver a change feed: a functions preset with no external listener, or no `changes` at all (`kerf check`, `kerf build`, `kerf doctor`)",
    fix: "Run `kerf db listen` on an always-on host and set `listener: 'external'`, deploy to a server preset, add `changes: dbChanges(db, [tables])`, or drop `required`",
  },
  {
    code: 'R014',
    severity: 'warning',
    by: 'cli',
    catches:
      "`changes` on a preset with no long-running process: writes from outside the app won't reach `.live()`, which shows `degraded`",
    fix: "Run `kerf db listen` on an always-on host and set `listener: 'external'`, or deploy to a server preset",
  },
  {
    code: 'R015',
    severity: 'error',
    by: 'start',
    catches:
      "A required live query, and the server's startup probe found no real change feed (a pooler, no trigger, no trigger permission, a Mongo without a replica set): the server stops rather than serve stale data, and dev answers 503",
    fix: 'What the error names: `dbChanges(db, tables, { listenUrl })` for a direct connection, `kerf db live` for triggers',
  },
  {
    code: 'R016',
    severity: 'warning',
    by: 'start',
    catches:
      'The server settled on a degraded live mode (`poll` or `off`), or a working feed went down: `.live()` shows `degraded` or `reconnecting`',
    fix: 'What the log line names; `kerf doctor` lists the options',
  },
  {
    code: 'R017',
    severity: 'error',
    by: 'start',
    catches:
      "`dbChanges` on a client it can't watch or something that isn't a table, or `kerf db listen` on the memory bus, which stops at that process",
    fix: 'Use a client from `@kerf/start/db/*` or `mongoChanges`; set `bus` in `src/realtime.server.ts`',
  },
  {
    code: 'R019',
    severity: 'error',
    by: 'cli',
    catches:
      "A query's `live: { verify }` round trip failed against its target (`kerf check`, `kerf build`): the message names the link that broke, from `trigger` to `cleanup`",
    fix: "What the link says: `kerf db live` for a trigger, the app's log for a poke, `verify.row` for a row the query can't see",
  },
  {
    code: 'R020',
    severity: 'error',
    by: 'cli',
    catches:
      'A connection string with a password in source, in a `verify` or a target: it would be committed',
    fix: 'Read it from the environment: `verify: { db: process.env.STAGING_DATABASE_URL }`',
  },
  {
    code: 'R021',
    severity: 'error',
    by: 'cli',
    catches:
      "A `verify` target isn't available here: fails `kerf build`, and `kerf check` warns and skips",
    fix: 'Set `KERF_STAGING_URL`, `STAGING_DATABASE_URL`, or the variable its target names',
  },
  {
    code: 'R022',
    severity: 'error',
    by: 'cli',
    catches:
      'A `verify` target that looks like production, or that nothing marks as not: a round trip writes rows',
    fix: 'Name it in `live.targets` with `production: false`; a name or host that says production is always refused',
  },
  {
    code: 'R023',
    severity: 'warning',
    by: 'cli',
    catches: 'A `verify` passed with only one kind of target, so some links went untested',
    fix: 'Give it both a URL and a database',
  },
  {
    code: 'R024',
    severity: 'error',
    by: 'cli',
    catches:
      "A `channel` or `sharedState` built for a target that can't hold a WebSocket (Netlify, Vercel, AWS Lambda): `kerf build` fails, and where it is let through the page never dials, the channel's `status` is `unavailable` and a send rejects with R024",
    fix: '`kerf deploy hosts`, then a server host (`fly`, `render`); or `--unsafe-allow R024` with why, for a demo that may stay offline there',
  },
  {
    code: 'R018',
    severity: 'warning',
    by: 'cli',
    catches:
      'A table in `changes` that no migration gives a change trigger (`kerf check`, `kerf build`): the server would fall back to polling',
    fix: 'Run `kerf db live`',
  },
]
