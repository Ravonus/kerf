<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">shared/</h1>

<p align="center">
  <strong>The Postgres side of the app bench: one schema, one seed, a clone per variant and a latency proxy.</strong><br>
  It talks to Postgres through <code>psql</code>, so the harness installs no database driver.
</p>

<p align="center">
  <a href="#files">Files</a> ·
  <a href="#envmjs">env.mjs</a> ·
  <a href="#latency-proxymjs">latency-proxy.mjs</a> ·
  <a href="#environment-variables">Environment</a> ·
  <a href="../README.md">All examples</a>
</p>

> [!NOTE]
> Internal tooling, not a published package. Everything here lives in [`pg/`](./pg) and is used by
> [`../bench.mjs`](../bench.mjs), [`../e2e.mjs`](../e2e.mjs), [`../show.mjs`](../show.mjs) and the harness in
> [`../lib`](../lib).

Every database-driven site in `examples/` (`landing`, `todo`, `admin`, `catalog`) and every variant of each reads the
same rows. That only means something if the rows are identical, each variant has its own copy, a reset is fast, and a
query costs a real network round trip. `shared/pg` provides all four.

> [!WARNING]
> `env.mjs` only ever creates, clones or drops databases named `kerf_bench_*`, and refuses any other name. It still runs
> `drop database ... with (force)` on those, so don't keep anything you care about under that prefix.

## Files

| File | What it is |
| --- | --- |
| `pg/schema.sql` | One schema for every app: Better Auth's tables (`user`, `session`, `account`, `verification`, `jwks`) with their default camelCase names, plus `waitlist`, `todos`, `customers`, `orders`, `categories`, `products`, `order_items`, `carts` and `cart_items`. |
| `pg/seed.sql` | Deterministic rows: `setseed` before each table, so contents never depend on insertion order. |
| `pg/env.mjs` | Builds the seeded template, clones and resets per-variant databases, counts queries, measures RTT. |
| `pg/latency-proxy.mjs` | A TCP proxy in front of Postgres that delays each direction and counts what crosses it. |
| `pg/bench-user.json` | The throwaway local account every variant signs in as, and the fixed auth secret for bench servers. |

### What the seed holds

| Table | Rows |
| --- | --- |
| `categories` | 8: Kitchen, Garden, Office, Outdoor, Audio, Lighting, Travel, Bath |
| `products` | 5,000 (`product-1` to `product-5000`); every 400th is featured |
| `customers` | 2,000 |
| `orders` | 10,000, with statuses paid, shipped, pending and refunded, totals summed from their items |
| `order_items` | 1 to 4 per order |
| `user` | `bench-user` and `other-user` |
| `todos` | 200 for `bench-user` (`Seeded todo 1` to `200`, every third done) and 3 for `other-user` |

`bench-user.json` holds a password whose Better Auth hash is in `seed.sql`. It is a local test credential with no use
outside these databases.

## env.mjs

| Export | What it does |
| --- | --- |
| `seedHash()` | The first 12 hex characters of a SHA-256 over `schema.sql` and `seed.sql`. It joins the build key of database apps. |
| `seedName()` | `kerf_bench_seed_<hash>`: the template database. |
| `dbName(app, variant)` | `kerf_bench_<app>_<variant>`, with `_<BENCH_TAG>` appended when set, lower-cased and limited to `[a-z0-9_]`. |
| `ensureSeed()` | Builds the template once per seed hash: creates it under a private name, loads both files, then renames it, so a half-seeded template can never be cloned. |
| `clone(name, from)` | Drops `name` and recreates it with `CREATE DATABASE ... TEMPLATE`, retrying briefly when two clones collide on the template lock. This is also the reset: it cuts the app's connections, and its pool reopens them. |
| `provision(app, variant, { rtt })` | Ensures the seed, clones the variant's database, starts a latency proxy, and returns `env` (`DATABASE_URL` through the proxy, `BETTER_AUTH_SECRET`), `reset`, `sql`, `rows`, `counted`, `rtt`, `measureRtt` and `stop`. |
| `psql(db, sql)`, `rows(db, sql)` | Run SQL through `psql`; `rows` returns objects by going through `json_agg`. |
| `contentHash(db)` | One hash over every row of every public table: what "the same data" means in tests. |
| `countQueries(name, proxy, fn)` | Queries and rows caused by `fn`. Uses `pg_stat_statements` deltas (kept in a separate `kerf_bench_stats` database, skipping `BEGIN`, `COMMIT`, `SET` and the like) when the server preloads it; otherwise the proxy's count of Query and Execute messages, with rows `null` and `source: 'proxy'`. |
| `measureRtt(db, proxyPort)` | Median `select 1` time through the proxy and directly, by `psql`'s own timing, and the difference. |
| `serverInfo()` | The Postgres version and which query counter is in use. |
| `benchUser`, `PSQL` | The parsed `bench-user.json`, and the `psql` binary in use. |

## latency-proxy.mjs

| Export | What it does |
| --- | --- |
| `createProxy({ port, host, rtt })` | The proxy itself: delays each direction by RTT/2, reads the frontend protocol to count Query and Execute messages, and counts round trips (the client speaking after the server did), connections, peak connections and bytes each way. |
| `spawnProxy(options)` | Runs the proxy in a child process driven over IPC, returning `port`, `rtt(ms)`, `stats()`, `reset()` and `stop()`. |

It runs in its own process so its timers don't share an event loop with the bench that is measuring. It proxies
sockets rather than sleeping in the app, so the pool, the wire format and the driver's own round trips all stay in the
measurement. The bench runs each database site at a low and a high RTT (2 and 40 ms by default) and reads
`db.roundTrips` from the TTFB difference.

## Environment variables

| Variable | Default | What it does |
| --- | --- | --- |
| `BENCH_PG_HOST` | `127.0.0.1` | Postgres host. |
| `BENCH_PG_PORT` | `5432` | Postgres port. |
| `BENCH_PG_USER` | your login name | Postgres user. |
| `BENCH_PSQL` | `psql` | Path to the `psql` binary. |
| `BENCH_TAG` | none | Suffix on database names, so two runs of one variant can share a server. |

## Use it

You don't run these files directly; the scripts that need a database provision it themselves:

```bash
cd examples
node e2e.mjs todo kerf                 # provisions kerf_bench_todo_kerf, tests, drops it
node bench.mjs admin                   # one clone per variant, reset between passes
node show.mjs                          # clones kerf_bench_<app>_show for each built app
```

To load the same rows into a database of your own for a comparison variant:

```bash
createdb my_todo
psql my_todo -f examples/shared/pg/schema.sql -f examples/shared/pg/seed.sql
```
