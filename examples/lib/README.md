<p align="center">
  <a href="https://github.com/Ravonus/weft">
    <img src="https://raw.githubusercontent.com/Ravonus/weft/main/site/public/logo.svg" width="88" height="88" alt="Weft">
  </a>
</p>

<h1 align="center">lib/</h1>

<p align="center">
  <strong>The harness behind the app bench: build, serve, measure, flow, race, diagnose, and the e2e kit.</strong><br>
  Every module is small, imports no app code, and either measures something or proves a measurement hit the right build.
</p>

<p align="center">
  <a href="#modules">Modules</a> ·
  <a href="#tests">Tests</a> ·
  <a href="../bench/README.md">bench/</a> ·
  <a href="../README.md">All examples</a> ·
  <a href="https://github.com/Ravonus/weft">GitHub</a>
</p>

> [!NOTE]
> Internal tooling, not a published package. It is imported by [`../bench.mjs`](../bench.mjs),
> [`../bench/`](../bench), [`../e2e.mjs`](../e2e.mjs), [`../chart.mjs`](../chart.mjs) and each app's `e2e.test.mjs`. Its
> dependencies (`playwright-core`, `lighthouse`, `chrome-launcher`, `@jridgewell/trace-mapping`) come from
> [`../package.json`](../package.json), installed with `pnpm install` in `examples/`.

Each top-level `*.mjs` is a module's public face; the folder of the same name holds its parts. The rule running through
all of it: a number only counts if the harness can show it came from this run's build, on a server it started, against
the database state it set.

## Contents

- [Modules](#modules)
  - [app.mjs](#appmjs)
  - [build.mjs and build/](#buildmjs-and-build)
  - [serve.mjs and serve/](#servemjs-and-serve)
  - [measure.mjs, measure/ and lighthouse-run.mjs](#measuremjs-measure-and-lighthouse-runmjs)
  - [flow.mjs and flow/](#flowmjs-and-flow)
  - [race.mjs and race/](#racemjs-and-race)
  - [attribute.mjs](#attributemjs)
  - [diagnose.mjs and diagnose/](#diagnosemjs-and-diagnose)
  - [stats.mjs](#statsmjs)
  - [e2e-kit.mjs](#e2e-kitmjs)
  - [fixture/](#fixture)
- [Tests](#tests)

## Modules

| Module | One line |
| --- | --- |
| `app.mjs` | Loads an `app.json` and works out each variant's stack, package manager, install, build and start. |
| `build.mjs` | Copies a variant (read only), installs, cold-builds, fingerprints the output, and reuses builds by key. |
| `serve.mjs` | Starts production servers on free ports and proves they serve this build. |
| `measure.mjs` | One sample of Lighthouse, bytes, hydration and load. |
| `lighthouse-run.mjs` | One Lighthouse run in its own process. |
| `flow.mjs` | Database-site passes: canaries, TTFB, nav, interaction, streaming, mutate, sign-in. |
| `race.mjs` | Race probes that compare the list on screen with Postgres. |
| `attribute.mjs` | Splits JS bytes into runtime, router, data, kit, app and other from sourcemaps. |
| `diagnose.mjs` | What to tune in Weft or Warp, ranked, plus the printed report. |
| `stats.mjs` | Metric definitions, spreads and the win/tie/loss rule. |
| `e2e-kit.mjs` | What an app's `e2e.test.mjs` imports. |
| `fixture/` | The todo contract with no framework, for testing the harness. |

### app.mjs

| Export | What it does |
| --- | --- |
| `here` | The `examples/` folder. |
| `historyFile` | `../evals/results/apps-history.jsonl`. |
| `stacks` | [`../stacks.json`](../stacks.json), parsed. |
| `allApps()` | Every folder beside `lib/` with an `app.json`: what `--all` means. |
| `detect(pkg)` | The first stack in `stacks.json` whose `detect` packages are all in the `package.json`; `stacks.json` is ordered most specific first. |
| `freshness(page, variant)` | `live`, `cached` or `unchecked` for a page, from a string or a per-variant map with `*`. Throws if `live` has no canary. |
| `loadApp(target, { only })` | Resolves a name under `examples/`, a folder with `app.json` or the file itself, and returns the app with resolved variants, pages, `db` and `login` defaults. |

The defaults it fills in: `db` gets `rtt: [2, 40]`, `pool: 10` and the seed hash; `login` gets `/login`, `Email`,
`Password` and `Sign in`. A variant's package manager comes from `spec.pm`, then `packageManager`, then the lockfile
(pnpm, bun, yarn, npm in that order), then npm. Install is `ci` for npm and `install --frozen-lockfile` for the rest.
Build is `npm run build` if there is a build script, else `npx vite build`. Start is `npm run start` if there is a start
script, else `null`, meaning a static build. A `scaffold` variant is regenerated on every load by calling
`scaffold()` from `../packages/create/src/index.mjs` into `$BENCH_WORK/gen/<app>/<variant>`, with the bench user's fixed
auth secret so the build key doesn't change.

### build.mjs and build/

| Export | What it does |
| --- | --- |
| `packOnce(store, log)` | Runs `packages/create/scripts/local.mjs pack` into the store, once per state of the Weft inputs. |
| `prepare(app, v, opts)` | Places the variant, computes its build key, reuses a matching build or copies, installs, runs `buildRuns` cold builds and a separate sourcemap build. |
| `lastBuild(app, v, { work })` | Loads the last build as it stands, for `e2e.mjs --no-build`. |
| `linesOfCode(v)` | Non-blank lines of `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` and `.css` under the variant's `src` folders. |
| `repoState()` | `{ commit, dirty }`: `BENCH_COMMIT` or the short HEAD, and whether `packages/` or `crates/` has changes. |

The build key hashes Node's version, the stack, install and build commands, env, the app's `setup`, the Weft tarball
inputs for Weft variants, the seed hash for database apps, and every copied file. Each cold build first deletes the
stack's output folders and `node_modules/.vite` and `node_modules/.cache`.

| Part | What it holds |
| --- | --- |
| `build/copy.mjs` | `SECRET` (never copied: `.env*` except `.env.example`, `netlify.env`, `.neon`, `.mcp.json`, `*.pem`), `SKIP` (`node_modules`, `.git`, build folders and the like), `files()` and `copy()`. |
| `build/stage.mjs` | `placeVariant`, `reuseStamp`, `stageSource` and `install`. Sets `NEXT_TELEMETRY_DISABLED=1` and `SKIP_ENV_VALIDATION=1` for builds, and installs Weft variants through `local.mjs`. |
| `build/fingerprint.mjs` | `sha`, `walkBuild`, `fingerprint` (a hash of every output file), `installedIsPacked` (the installed Weft matches the tarball byte for byte) and `weftInputs`. |
| `build/maps.mjs` | `buildWithMaps(v)`: a separate build with hidden sourcemaps, for the byte split. |
| `build/sourcemaps.mjs` | `wrapViteConfig` and `wrapNextConfig`: turn sourcemaps on by wrapping the app's config, leaving the config file itself alone. |
| `build/run.mjs` | `run(cmd, { cwd, env, log })`: runs a command, logs it and returns its time. |
| `build/repo.mjs` | `linesOfCode` and `repoState`. |

### serve.mjs and serve/

| Export | What it does |
| --- | --- |
| `startServer(v, firstPage, { proveBuild })` | Picks a free port, refuses if anything already answers there, starts the variant's start command (or the static host) in its own process group, waits up to 30 s for `firstPage`, and records boot time. |
| `assertFresh(v, server, paths)` | Fetches this run's canary file, and hashes every given asset against the build's fingerprints. Any miss throws `STALE`. |
| `quote`, `rssMB` | Shell quoting and a server's resident memory. |

Servers get `NODE_ENV=production`, `PORT`, `HOST=127.0.0.1`, `NITRO_HOST`, `NITRO_PORT`, the build env and, for database
apps, `BETTER_AUTH_URL`.

| Part | What it holds |
| --- | --- |
| `serve/static-host.mjs` | The host for a variant with no start script: serves the output folder from memory, brotli then gzip, like a CDN. |
| `serve/tree.mjs` | `killTree`, `listeners`, `rssMB` and `quote`. On Windows, where there are no process groups, servers are stopped by process tree and then by port. |

### measure.mjs, measure/ and lighthouse-run.mjs

| Export | What it does |
| --- | --- |
| `launchBrowser()` | Playwright's Chromium, or `BENCH_CHROME`, or installed Chrome on Windows. |
| `chromePath()` | The path Lighthouse uses. |
| `lighthouseRun(url, formFactor, keepTo, cookie)` | A simulated-throttling Lighthouse run in its own process, retried up to 3 times when Chrome drops the connection. |
| `lighthouseThrottled(url, cookie)` | Mobile Lighthouse with `throttlingMethod: 'devtools'`, so LCP and its phases come from one real trace. |
| `bytesPass(browser, url, opts)` | Every response the page fetched, by type (JS, CSS, HTML, font), recompressed at brotli 11 and gzip 9, plus what the server actually sent. |
| `hydrationPass(browser, url, probe, opts)` | Clicks `probe.click` every frame until `probe.watch` changes, under a 4x CPU throttle; with no probe, when long tasks stopped. Also script time, heap after GC and DOM counts. |
| `loadPass(url, opts)` | `connections` keep-alive clients (default 10) for `seconds` (default 2), returning `rps`, `p50`, `p95`, errors and the encoding served. |

`lighthouse-run.mjs` is the child process: it takes its arguments as JSON, runs Lighthouse with its own Chrome and
profile, and prints a digest: scores, metrics, the score points each metric lost, LCP element and phases, and findings.
Lighthouse keeps global state, so overlapping runs each need a process.

### flow.mjs and flow/

`flow.mjs` re-exports the parts. Input goes through CDP `Input.dispatchMouseEvent`, so clicks are trusted events.

| Part | Exports | What it does |
| --- | --- | --- |
| `flow/auth.mjs` | `signIn`, `canaryPass` | Signs in through the page's own form by role, returning the cookies that stack sets. Writes a random value into a row the page shows and fails unless the page shows it. |
| `flow/http.mjs` | `ttfbPass`, `htmlPass`, `splitHtml` | TTFB p50/p95/p99 and the `</head>` flush over 10 connections, uncompressed. Splits HTML into markup and embedded data (inline script bodies). |
| `flow/page.mjs` | `cookieHeader`, `randomValue`, `target`, `centre`, `press`, `trustedClick`, `settled` | Turns `"role:name"` into a locator and clicks it through CDP. |
| `flow/interaction.mjs` | `interactionPass`, `streamingPass` | Event Timing at 4x CPU for the `interact` targets; navigation start to the first working click for `streaming`. |
| `flow/passes.mjs` | `navPass`, `mutatePass`, `browserPage` | A real click to a URL (first DOM change, then the text), and input to optimistic and confirmed `see`. |
| `flow/site.mjs` | `sitePass` | Everything above per page and sample, plus query counts, `db.roundTrips` from the TTFB difference between the low and high RTT, and the race probes. Resets the database between passes. |
| `flow/tracker.mjs` | `tracker` | Requests a page has open and when it last finished one. |

### race.mjs and race/

| Export | What it does |
| --- | --- |
| `raceOnce({ browser, url, race, fresh, rows, seed, only })` | Runs each probe in a fresh browser context after a database reset and returns pass or fail per probe, with the seed in a failure. |
| `parseList(yaml)` | Reads checkbox rows (name and state) from the accessibility tree, the same in every stack. |
| `mismatch(dom, db)` | Names the difference between the list on screen and the database. |

`race/probes.mjs` holds `PROBES` (`doubleSubmit`, `toggles`, `rollback`, `navigateDuring`, `invalidateDuring`, `twoTabs`)
and `shuffled(n, seed)`, a seeded permutation so a failure can be replayed. Replies are held or reordered with
Playwright route interception; the server still does the work in order.

### attribute.mjs

`attribute(v, { maps, same, total }, pages)` reads the sourcemaps from the separate build and splits each page's JS, in
brotli bytes, into the groups `stacks.json` names for that stack's family (for Weft: warp, router, data, runtime, app,
other). Bytes it can't map are reported as `unmapped` or `wrapper`, not guessed.

### diagnose.mjs and diagnose/

| Export | What it does |
| --- | --- |
| `diagnose(run, prev)` | Per Weft variant: the gap to the best other variant on each metric in its list, what moved since the previous run, and a ranked tune list. |
| `report(run)` | The text `bench.mjs` prints. |

| Part | What it holds |
| --- | --- |
| `diagnose/gaps.mjs` | `tuneGaps`: turns size and timing gaps into tune items, using the sourcemap split to name where JS bytes went. |
| `diagnose/losses.mjs` | `tuneLosses`: Lighthouse score points lost and LCP phases mapped to advice. |
| `diagnose/tune.mjs` | `tuneFor`: collects and ranks the items for one variant. |
| `diagnose/diff.mjs` | `diffRuns`: changes since the last run, with machine drift measured on variants that weren't rebuilt and taken off timing metrics. |
| `diagnose/units.mjs` | `PER`: the stated conversion rates (`kb: 0.1`, `hydrateMs: 0.02`, `heapMB: 0.3` score points per unit) and `kb()`. |
| `diagnose/report.mjs` | `report`. |

The rates in `units.mjs` are there so bytes and milliseconds can be ranked against each other at all. Read the order,
not the digits.

### stats.mjs

| Export | What it does |
| --- | --- |
| `METRICS` | Every metric: label, unit, which way is better, and `floor`, the smallest difference worth calling. |
| `SITE_METRICS` | The `db.*`, `flow.*`, `server.ttfb*`, `server.flush*` and `bytes.{html,data}.<rows>` keys. |
| `spread(xs)` | `{ med, min, max, n }`, dropping holes. |
| `compare(key, a, b)` | `win` or `loss` only when the gap is past the floor and no sample of one side overlaps the other; otherwise `tie`. |
| `fmt(key, s)` | Formats a value for the report. |
| `median`, `sleep` | Re-exported from `../scripts/lib/helpers.mjs`. |

### e2e-kit.mjs

What an app's `e2e.test.mjs` imports. It only works under [`../e2e.mjs`](../e2e.mjs), which sets `BENCH_E2E`.

| Export | What it does |
| --- | --- |
| `site.open({ signedIn, js })` | A new browser context, signed in as the bench user and with JavaScript off if asked. |
| `site.go(page, path)` | Navigates and waits up to 3 s for the network to go idle. |
| `site.sql(q)`, `site.rows(q)` | Queries the test's database. |
| `site.path(page)`, `site.query(page, k)` | The current path and a search parameter. |
| `see`, `gone` | Wait for a locator to be visible or hidden (10 s). |
| `name(role, text)` | `[role, { name: text, exact: true }]` for `getByRole`. |
| `eventually(fn, ms)` | Retries an assertion for up to 8 s. |
| `choose(locator, option)` | Picks an option from a native `select` or a listbox built on a button. |
| `user`, `assert` | The bench user and `node:assert/strict`. |

Every test starts on a fresh clone of the seeded database.

```js
import { test } from 'node:test'
import { assert, see, site } from '../lib/e2e-kit.mjs'

test('signed in, the list shows the seeded rows', async () => {
  const page = await site.open({ signedIn: true })
  await site.go(page, '/todos')
  await see(page.getByRole('checkbox', { name: 'Seeded todo 1', exact: true }))
})
```

### fixture/

`fixture/server.mjs` is the todo contract in the smallest form that really talks to Postgres (through `psql`), with
signed session cookies and no framework. It is not a benchmark variant: it exists so the database, proxy and race probes
can be tested end to end. `FIXTURE_BUG=1` removes its ordering guard, and the race tests check that the probes catch it.

## Tests

```bash
cd examples
node --test lib
```

| File | Covers | Needs |
| --- | --- | --- |
| `harness.test.mjs` | The canary refuses an older server, unknown assets are refused, overlapping samples tie, gaps under the floor tie, `spread` drops holes, the most specific stack wins. | nothing |
| `serve.test.mjs` | A production server starts and stops without a database. | nothing |
| `sites.test.mjs` | Freshness rules, that each site manifest has what the contract needs, scaffold variants regenerate the same way, unknown templates are refused, database names stay in `weft_bench_*`, the seed hash. | the repo's `packages/create` |
| `sites/probes.test.mjs` | Markup and data split, first byte and `</head>` byte, accessibility-tree parsing, seeded shuffles, the latency proxy. | nothing |
| `sites/database.test.mjs` | Clones hold the seed, resets restore it, the proxy adds its RTT. | Postgres and `psql` |
| `sites/race.test.mjs` | A correct client passes every race; a client with no ordering guard fails. | Postgres, `psql`, Chromium |
| `sites/site-pass.test.mjs` | `sitePass` fills what applies and leaves the rest `null`. | Postgres, `psql`, Chromium |

`sites/harness.mjs` is shared by the database tests: it checks whether Postgres is up (`pgUp`), defines the fixture
manifest and starts the fixture server with a provisioned database (`liveHarness`).
