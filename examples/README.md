# Real apps, any stack

`benchmarks/compare` is one synthetic screen. This is the other half: point it at a real app and its other versions, and it reports
how weft compares and what to tune in weft or warp because of it. Run it after converting an app, and after changing weft.

    pnpm run setup                              # repo root, Node 26
    cd examples
    node bench.mjs lemonstand                    # one app
    node bench.mjs --all                         # every folder here with an app.json
    node bench.mjs ~/dev/shop --samples=5        # any folder holding an app.json
    node bench.mjs lemonstand --only weft --no-record    # try a change, write nothing
    node bench.mjs lemonstand --detect           # what it worked out, without building

It's a tool for improving weft. Apps are fast by construction: this is not a budget gate, and it isn't a step in an app's
workflow.

`results.json` holds each app's latest run, `../evals/results/apps-history.jsonl` gets a line per run, and `../evals/results/apps.html` is
rewritten from both. Commit all three when a run is worth keeping.

## Adding an app

A folder here (or anywhere) with an `app.json`. No harness code.

```json
{
  "label": "Lemonstand",
  "pages": [{ "path": "/", "probe": { "click": "[role=tab]:nth-of-type(2)", "watch": "[role=tablist]" } }, "/privacy"],
  "variants": {
    "next": { "path": "~/dev/lemonstand-landing" },
    "weft": { "path": "~/dev/lemonstand-weft" },
    "solid": { "path": "solid" }
  }
}
```

A variant's `path` can be outside the repo, and it's only read: bench copies what git would track into
`~/.cache/weft-app-bench` (`BENCH_WORK` moves it) and never copies a real `.env`, `netlify.env`, `.neon`, `.mcp.json` or `*.pem`.
`.env.example` becomes the copy's `.env`.

From each `package.json` it works out the stack (`stacks.json`, most specific first), the package manager, the build and the
start. A variant with no start script is a static build, served from memory with brotli as a CDN would. Anything it gets wrong,
say in the variant: `stack`, `label`, `cwd` (build a subfolder of a copied tree, as `dashboard` does), `install`, `build`, `start`,
`env`, `src`, `publicDir`, `pm`. `setup` on the app runs a command in each copy after install, for a database or a seed.

To add a stack, add a line to `stacks.json`: its `detect` packages, its `out` folders, and regexes that sort sourcemap paths
into `groups`. `sourcemap` is `vite` or `next`; leave it out and that stack gets totals with no split.

A `scaffold` variant has no folder: `"scaffold": {"template": "todo", "db": "postgres", "auth": true}` is passed to create-weft's real
`scaffold()`, into `$BENCH_WORK/gen/<app>/<variant>`, on every load, and it's then a variant like any other. So no weft source lives
here. Give each variant a `label` that declares its component kit.

`probe` is how hydration is timed: bench clicks `click` every frame from the first frame until `watch`'s markup changes, under a
4x CPU throttle. The same DOM event for every framework, so pick a control that exists in every variant. A page with no probe
reports when its long tasks ended, and the chart says which method a number came from.

## What it measures

Per variant and page, on production builds, `--samples` samples (3 by default, 5 before stating a claim):

- Lighthouse mobile and desktop: score, FCP, LCP, TBT, CLS, speed index, on its default simulated throttling.
- The same page mobile with the network and CPU **really** throttled. The score's LCP comes from Lantern, a model; a trace of an
  unthrottled run can't explain it, so the LCP phases come from this run, and Lantern's own phases sit beside them.
- JS, CSS, HTML and font bytes of everything the page fetched, recompressed to brotli 11 and gzip 9 for every variant, so a
  server's encoding can't flatter it; what the server actually sent is reported as well.
- Hydration, script time, heap after a forced GC, DOM nodes split into elements, text and comments.
- Server req/s and p95 at 10 keep-alive connections for 2 s, compressed as a browser would ask, and req/s uncompressed: the two
  together separate rendering from compression.
- Cold build time (`--build-runs`), lines of app code, boot time, server memory.

## Database-driven sites

`landing`, `todo`, `admin` and `catalog` follow [the contract](https://github.com/Ravonus/weft/blob/archive/evals-2026-11/docs/research/40-site-benchmarks.md). Their weft variant is the
template; `solid` and `next` are folders here. `--all` skips a site whose folders aren't written yet, and says so.

    node e2e.mjs todo weft                  # build if needed, database, proxy, production server, tests, stop it all
    node e2e.mjs todo weft --no-build       # the last build as it stands
    node e2e.mjs todo --dir ./my-build      # a local build, by its start script
    node e2e.mjs todo --dir http://localhost:3000 --db weft_bench_x    # a server already running

`<app>/e2e.test.mjs` is node:test on `lib/e2e-kit.mjs`, roles and names only, each test on a fresh copy of the seed. It has to pass on
a variant before that variant's numbers count.

Keys on top of the ones above:

| Key | Where | Meaning |
|---|---|---|
| `db` | app | `{}`, or `{ "rtt": [2, 40], "pool": 10 }`, the defaults. Gives each variant a clone and a proxy; the seed hash joins the build key |
| `login` | app | `{}`, or `path`, `email`, `password`, `submit` to rename the contract's. Signs in through the form as the bench user; the cookie goes to Lighthouse, Playwright and the load client |
| `race` | app | `path`, `list`, `input`, `submit`, `toggle` (a row), `state` (SQL giving `title`, `done`), `away` (`link`, and `keep`, the rows that view shows) |
| `signedOut` | page | `true`: measured without the bench user's cookie, for a page a signed-in visitor is redirected away from |
| `canary` | page | `{ "sql": "update ... set x = $1", "text": true }`: a random value goes in a row the page already shows, and the page has to show it, or the run stops |
| `freshness` | page | `live` needs a canary; `cached` is skipped and labelled. Or a map, `{ "next": "cached", "*": "live" }`. No key and no canary reads `unchecked` |
| `nav` | page | `click`, `url` (a substring), and `see` (text) or `canary` (SQL writing the text to wait for) |
| `interact` | page | targets to click at 4x CPU |
| `streaming` | page | `click`, `status`: clicks from navigation start until the role status with that text changes |
| `mutate` | page | `fill` (target to text), `click`, `see`; `$value` is a random value |
| `rows` | page | `{ "50": sql, "500": sql }`: SQL that gives the page that many rows, after a reset |

A target is `"role:name"`, exact. What a page doesn't declare, or can't do, is `null` in the results, never 0.

| Probe | How |
|---|---|
| `db.queries`, `db.rows` | per HTML request, from `pg_stat_statements` deltas for that database (read from `weft_bench_stats`, skipping BEGIN, COMMIT, SET and the like). Where the server doesn't load it, the proxy counts Query and Execute messages, which includes those, `db.rows` is null, and `db.queries` in the run says which |
| `db.roundTrips` | (TTFB at 40 ms − at 2 ms) ÷ 38, one connection |
| `server.ttfb.p50/p95/p99`, `server.flush.head` | 10 connections, closed loop, uncompressed so the `</head>` byte can be found |
| `flow.nav.url/.paint/.data` `.cold/.second` | a real click to the URL, first frame with a DOM change, the text. Second is after going back |
| `flow.interaction.worst/.p75` | Event Timing at 4x CPU. It reports nothing under 16 ms, so an unreported click counts as 8. Not INP |
| `flow.interaction.streaming` | navigation start to the first click that works |
| `flow.mutate.optimistic/.confirmed/.requests` | input to `see` in the DOM, to the last reply, requests sent |
| `race.*` | `doubleSubmit`, `toggles`, `rollback`, `navigateDuring`, `invalidateDuring`, `twoTabs`: replies held or shuffled by route interception (seeded, the seed is in a failure), then the list on screen against Postgres. Reported above speed |
| `bytes.html.<rows>.raw/.br`, `bytes.data.<rows>.raw/.br` | embedded data is every inline script's body; markup is the rest |

Input is CDP `Input.dispatchMouseEvent`, so it's trusted. `twoTabs` tells the other tab it got focus, because Playwright keeps every
page focused. `toggles` holds an even reply last, as an odd one matches the end state, and timing can still miss it on one sample.

`shared/pg/env.mjs` keeps `weft_bench_seed_<hash>` from `schema.sql` and `seed.sql`, clones it per variant with `CREATE DATABASE ...
TEMPLATE`, and resets by dropping and cloning, which cuts the server's connections for its pool to reopen. It touches only
`weft_bench_*`, needs `psql` (or `BENCH_PSQL`, its path), and takes `BENCH_PG_HOST`, `BENCH_PG_PORT` and `BENCH_PG_USER` (default your login). `shared/pg/latency-proxy.mjs` is its own process,
delays each direction by RTT/2 and counts turns, and each `sitePass` checks the RTT with `SELECT 1` (`db.rtt` in the run, about 1 ms
over at 2 ms on a loaded Mac). `shared/pg/bench-user.json` is a throwaway local account; the hash in the seed is Better Auth's own.

## Why it's quick

It's meant to run after every tweak. Tarballs are packed once per state of `packages/` and `crates/`. A variant's build is keyed on
its source files, lockfile, commands, Node and, for weft, those tarballs, and is reused while the key holds: a weft change rebuilds
the weft variants only, and an unchanged tree rebuilds nothing (`--rebuild` overrides; the output is re-fingerprinted either way).

Measuring runs in phases that never overlap. Variants go side by side with each one's timing-sensitive passes in turn, then
Lighthouse's simulated runs share a pool, shuffled, and last comes server load, one variant at a time. `--jobs=N` and `WEFT_JOBS` set the width
(`scripts/jobs.mjs`); on a busy machine the default narrows by itself. `--jobs=1` runs everything in turn, which is the check that
parallel numbers match a serial run. Last checked on Lemonstand: every score, LCP and byte number agreed within spread; load reads
about 25% low side by side, which is why it isn't.

## Running it on another machine

`BENCH_TAG` suffixes database names, and with its own `BENCH_WORK` lets two runs of one variant share a machine. `BENCH_WORK` moves the work area and `BENCH_HOME` is what `~` means in a manifest, so an external variant can be a copy elsewhere; `BENCH_COMMIT` names the commit when the checkout there is a snapshot.
Bring only the files bench would copy; never a real env file.

On Windows: clone with `core.autocrlf=false`, or the seed hash and build keys change, and put `BENCH_WORK` outside the checkout, somewhere short. `BENCH_PG_*` and `BENCH_PSQL`
reach a private Postgres, `BENCH_CHROME` overrides the installed Chrome it finds by itself, and servers are killed by tree with `taskkill`.

## What it diagnoses

For each weft variant: the mobile points each metric costs; LCP phases and element; the largest resources; JS and CSS that
never ran, from browser coverage; the split into runtime, router, data, warp and app from sourcemaps of a separate build (whose
output has to hash the same, and says if it doesn't); the gap to the best other variant on each metric; what moved since the
app's last run; and a ranked list, where bytes and milliseconds are converted to rough score points at rates at the top of
`lib/diagnose.mjs`. Read the order, not the digits.

## Honesty rules

- A win is only called when no sample of one side overlaps the other and the gap is past the metric's floor (`lib/stats.mjs`).
  Otherwise it's a tie, however far the medians are. Three samples leave a 10% chance of a fluke per comparison.
- Every measurement proves it hit this build. The run writes a canary into `public/`, each sample fetches it back, and every JS
  and CSS file a sample touched has to hash to a file the build wrote. Any miss stops the run.
- Weft variants go through `local.mjs refresh` into a private store, so each run measures this checkout, and the installed `weft`
  is compared to the tarball byte for byte. Servers run on ports checked to be free, each in its own process group (Windows: stopped by process tree, then by port).
- A diff only reports variants that were rebuilt. Ones that weren't are controls: machine drift shows up in them, and is taken off
  timing metrics before anything is called a change.
- Peak load is recorded per run. Over 40 at start it refuses: use another machine, with `BENCH_WORK` set. Windows has no load average, so there it's the percent of CPU in use: a 3 s sample over 80% refuses, and `loadMax` is a percent.

The stack rule still holds: a claim about weft gets measured across the other variants, here and in `benchmarks/compare`.

`node --test lib` covers the win logic, the freshness checks and stack detection; with Postgres up, it also runs the database, proxy
and race probes for real against `lib/fixture`, the todo contract with no framework.

`style-groups/src` holds the source fixture used by core's style and SSR round-trip tests.
