/** Diagnostic entries in their catalog order. */
export const part06 = [
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
      "A query marked `live: { required: true }` on a target that can't deliver a change feed: a functions preset with no external listener, or no `changes` at all (`weft check`, `weft build`, `weft doctor`)",
    fix: "Run `weft db listen` on an always-on host and set `listener: 'external'`, deploy to a server preset, add `changes: dbChanges(db, [tables])`, or drop `required`",
  },
  {
    code: 'R014',
    severity: 'warning',
    by: 'cli',
    catches:
      "`changes` on a preset with no long-running process: writes from outside the app won't reach `.live()`, which shows `degraded`",
    fix: "Run `weft db listen` on an always-on host and set `listener: 'external'`, or deploy to a server preset",
  },
  {
    code: 'R015',
    severity: 'error',
    by: 'start',
    catches:
      "A required live query, and the server's startup probe found no real change feed (a pooler, no trigger, no trigger permission, a Mongo without a replica set): the server stops rather than serve stale data, and dev answers 503",
    fix: 'What the error names: `dbChanges(db, tables, { listenUrl })` for a direct connection, `weft db live` for triggers',
  },
  {
    code: 'R016',
    severity: 'warning',
    by: 'start',
    catches:
      'The server settled on a degraded live mode (`poll` or `off`), or a working feed went down: `.live()` shows `degraded` or `reconnecting`',
    fix: 'What the log line names; `weft doctor` lists the options',
  },
  {
    code: 'R017',
    severity: 'error',
    by: 'start',
    catches:
      "`dbChanges` on a client it can't watch or something that isn't a table, or `weft db listen` on the memory bus, which stops at that process",
    fix: 'Use a client from `@weft-js/start/db/*` or `mongoChanges`; set `bus` in `src/realtime.server.ts`',
  },
  {
    code: 'R019',
    severity: 'error',
    by: 'cli',
    catches:
      "A query's `live: { verify }` round trip failed against its target (`weft check`, `weft build`): the message names the link that broke, from `trigger` to `cleanup`",
    fix: "What the link says: `weft db live` for a trigger, the app's log for a poke, `verify.row` for a row the query can't see",
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
      "A `verify` target isn't available here: fails `weft build`, and `weft check` warns and skips",
    fix: 'Set `WEFT_STAGING_URL`, `STAGING_DATABASE_URL`, or the variable its target names',
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
      "A `channel` or `sharedState` built for a target that can't hold a WebSocket (Netlify, Vercel, AWS Lambda): `weft build` fails, and where it is let through the page never dials, the channel's `status` is `unavailable` and a send rejects with R024",
    fix: '`weft deploy hosts`, then a server host (`fly`, `render`); or `--unsafe-allow R024` with why, for a demo that may stay offline there',
  },
  {
    code: 'R018',
    severity: 'warning',
    by: 'cli',
    catches:
      'A table in `changes` that no migration gives a change trigger (`weft check`, `weft build`): the server would fall back to polling',
    fix: 'Run `weft db live`',
  },
  // Deploy (research 46): what a host can run, the files and env a deploy needs, CDN and media setup. `weft check` reports
  // them for `deploy.target` (or the host `--preset` names), `weft deploy` before it builds, `weft doctor` for every host.
  {
    code: 'E001',
    severity: 'error',
    by: 'cli',
    catches:
      "A `channel`, `sharedState` or `realtime({ share })` on a deploy target that can't hold a WebSocket (Netlify, Vercel, AWS Lambda): the page loads and never connects (at runtime: R024)",
    fix: "`deploy: { target: 'fly' }` or `'render'`, `'cloudflare'` (Durable Objects), or the split: pages here, realtime on a server (`weft docs deploy`)",
  },
  {
    code: 'E002',
    severity: 'error',
    by: 'cli',
    catches:
      'Something that needs a process between requests on a target that keeps none: a `required` live query (R013), or a `remote()` sidecar',
    fix: "A server host (`fly`, `render`); for a feed, `weft db listen` on one with `listener: 'external'`; for a sidecar, deploy it on its own with `rust.services.<name>.external: true`",
  },
  {
    code: 'E003',
    severity: 'error',
    by: 'cli',
    catches:
      'A SQLite file or media uploads on local disk, on a target whose disk is gone after a request or a deploy, or on a server host with no volume or disk configured (a warning in `weft deploy hosts`)',
    fix: '`deploy.fly.volume` or `deploy.render.disk` (both billed; they mount at `/app/.data`), or a hosted database',
  },
  {
    code: 'E004',
    severity: 'warning',
    by: 'cli',
    catches:
      'A native npm addon (`better-sqlite3`, `sharp`, `bcrypt`…) built on this machine and deployed from here to a Linux function host',
    fix: "Deploy from CI (`deploy.ci: 'github'` builds on Linux), or drop the addon",
  },
  {
    code: 'E005',
    severity: 'info',
    by: 'cli',
    catches:
      'No `deploy.target` (`weft doctor`, `weft deploy hosts`): which hosts can run this app, and the one weft suggests',
    fix: '`weft deploy init <target>`',
  },
  {
    code: 'E006',
    severity: 'warning',
    by: 'cli',
    catches:
      'A file `weft deploy init` writes for `deploy.target` (`fly.toml`, `Dockerfile`, the workflow…) is missing, or was written from an older config',
    fix: '`weft deploy init` (a file edited by hand is left alone; `--force` overwrites it)',
  },
  {
    code: 'E007',
    severity: 'error',
    by: 'cli',
    catches:
      "A variable `weft deploy --yes` reads is unset (an error in CI or for an id the CLI can't find; a warning where the host CLI's own login stands in)",
    fix: "Set it in the environment, or log in with the host's CLI here. Never in a file",
  },
  // oxlint-disable no-template-curly-in-string -- shows the GitHub Actions syntax
  {
    code: 'E008',
    severity: 'error',
    by: 'cli',
    catches:
      'A deploy credential in a committed file: a Netlify or Fly token, a Render deploy hook, a Cloudinary URL with its secret, or a long value for a key named token, secret, api key or password, in the config, a host file or a workflow',
    fix: 'Move it to the environment (host settings, or GitHub secrets as `${{ secrets.NAME }}`), and rotate it' /* oxlint-enable no-template-curly-in-string */,
  },
  {
    code: 'E009',
    severity: 'warning',
    by: 'cli',
    catches:
      "The memory bus on a target that runs many instances: a message reaches one instance's clients (`weft build` fails on it as R002)",
    fix: '`weft add redis` or `weft add nats`, `postgresBus({ url })`, or `durableObjectBus` on Cloudflare',
  },
  {
    code: 'E010',
    severity: 'warning',
    by: 'cli',
    catches:
      "`deploy.cdn.proxy` is Cloudflare, and `site.url` is the host's own domain (`*.fly.dev`, `*.onrender.com`): nothing goes through the proxy",
    fix: 'Set `site.url` to the domain Cloudflare proxies',
  },
  {
    code: 'E011',
    severity: 'warning',
    by: 'cli',
    catches:
      '`deploy.cdn.proxy` in front of a host that is a CDN already (Netlify, Vercel, Cloudflare): two caches, and a deploy purges only its own',
    fix: 'Drop `cdn.proxy`, or deploy to `fly` or `render` behind it',
  },
  {
    code: 'E012',
    severity: 'error',
    by: 'cli',
    catches: "`deploy.cdn.images` is Cloudinary, and `@weft-js/plugin-media` isn't in `plugins`",
    fix: '`weft add media`, or drop `cdn.images`',
  },
  {
    code: 'E013',
    severity: 'error',
    by: 'cli',
    catches:
      '`deploy.cdn.images` with no `cloud` and no `CLOUDINARY_URL`, or the two naming different clouds (a warning when only the env var is unset, at a deploy)',
    fix: "Set `cdn.images.cloud`, and `CLOUDINARY_URL` in the host's environment",
  },
  {
    code: 'E014',
    severity: 'info',
    by: 'cli',
    catches:
      "`deploy.cdn.images` is checked, and this weft doesn't send uploads to Cloudinary yet: they go to `media({ server: { dir } })`",
    fix: 'Nothing yet (research 46 §9); on a function host, uploads need a server host with a disk (E003)',
  },
  {
    code: 'R101',
    severity: 'error',
    by: 'cli',
    catches:
      "A function with `impl` has no `output`, a type JSON can't carry (`z.date()`, `z.bigint()`, `z.void()`, `z.custom()`), or a one-way `.transform()` on its input (`weft build`, `weft check`, `weft dev`)",
    fix: 'Use a codec: `z.codec(z.iso.datetime(), z.date(), { decode, encode })`. `z.null()` says a function returns nothing',
  },
  {
    code: 'R102',
    severity: 'error',
    by: 'cli',
    catches:
      "A plain `z.union` of objects in a function with `impl`: it has no tag, so Rust can't tell its arms apart reliably. Scalar unions and `.nullable()` are fine",
    fix: "Use `z.discriminatedUnion`, or set `rust: { unions: 'allow' }`",
  },
  {
    code: 'R103',
    severity: 'error',
    by: 'cli',
    catches:
      "A sidecar doesn't match the contract: cargo stops where a generated type or method no longer fits (with the function's id), a binary built from another contract, an output the `output` schema rejects, or input serde refuses",
    fix: "Fix the Rust to fit the TS declaration, which is the source of truth; `.weft/rust/<service>.rs` shows what's generated",
  },
  {
    code: 'R104',
    severity: 'error',
    by: 'cli',
    catches:
      "`native()` on a preset that can't run it (no file system for an addon or a `.wasm`), on a preset with no WASM when `wasm: false` is set, or a `.wasm` that won't build (a warning on a preset the addon runs on). At run time, a build with neither for this platform (503)",
    fix: "Use `remote('rust://<name>')`, the same crate behind `weft::router`. `rustup target add wasm32-unknown-unknown`, or `rust.services.<name>.wasm: false` if nothing needs a fallback",
  },
  {
    code: 'R105',
    severity: 'warning',
    by: 'cli',
    catches:
      "A cached Rust query with `tags` that reports no table (`weft check` reads the method; `weft dev` sees the call): Q011 can't see into Rust, so nothing checks that the tags cover what it reads",
    fix: 'Call `ctx.touch("table")` in the Rust, or drop `tags` from a query that reads no table',
  },
]
