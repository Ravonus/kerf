# 40. Site benchmarks: pre-registration

Status: 2026-11-01, written and committed before any app or number below existed. The research behind it (seven researchers,
a skeptic for each, two critics, a judge) is in [40-evidence.md](40-evidence.md).

Four real sites, each built on weft + warp, SolidStart and Next, measured by `evals/apps`. The weft variant of each is the
`create-weft` template of the same name, so what we measure is what people and agents start from. These runs are internal: no
public "faster than Solid" claim comes from them. That needs a critic from each stack, open-loop load and agent runs.

## Rules

1. First-run numbers are kept beside final ones. At most two fix passes, then stop.
2. `catalog` is the holdout: built like the others, and no change to weft or warp is made because of its numbers.
3. Same data: `evals/apps/shared/pg/{schema,seed}.sql` (a seed hash is part of the build key). Each variant gets its own Postgres
   database cloned from a seeded template, reset before every mutating sample, reached through one latency proxy at 2 ms and 40 ms
   RTT. Same pool size (10).
4. Same data layer in every stack: postgres.js 4, Drizzle 0.45, Better Auth 1.7. The framework is the variable.
5. Each variant is the idiomatic, documented production setup, written the way that stack's docs advise, without benchmark tricks:
   - Next 16.4 latest patch, React 19, App Router, Server Components, Server Actions, `next/font`, `next/image`, Cache Components,
     Tailwind 4 with Radix where a component needs it. No compiler plugin.
   - SolidStart 2.1, `query` + `createAsync` + `action` + route `preload`, Tailwind 4 with Kobalte where a component needs it.
   - weft + warp through `create-weft --template`, with no hand-tuning beyond what the template ships.
6. `e2e.mjs` per app, role-based, passes on every variant before any number counts.
7. A correctness failure outranks any millisecond win: a race failure is reported above speed.
8. Wins use `lib/stats.mjs`: no sample overlap and past the metric's floor. No composite score. Lighthouse is not the headline.
9. Every report has a table of where weft loses.
10. All stacks in a comparison run on one host, in one run. `bench.mjs` refuses over load 40.
   Todo, admin and catalog use system fonts and no images in all three stacks, so `next/font`, `next/image` and their equivalents
   are exercised on landing, where every stack loads the same web font and hero image.

## The sites

Everything an interaction test touches is a role and name, the same in every stack.

**landing** `/`, `/pricing`, `/privacy`. No reads. Shared hero image and font. Form: textbox "Email", button "Join"; adds to
`waitlist`; shows "You're on the list"; works with JavaScript off.

**todo** `/login` (textbox "Email", textbox "Password", button "Sign in"), `/todos`. Signed-out `/todos` redirects to `/login`.
Textbox "New todo" with button "Add"; list "Todos" of list items, each a checkbox named by its title and a button "Delete <title>";
links "All", "Active", "Done" set `?filter=`; text "N left". Optimistic where the stack has it. Only your own rows.

**admin** Signed in. `/admin`: stat labels Revenue, Orders, Customers, Refunded, a revenue chart by month, the 10 latest orders.
`/admin/orders`: 50 rows a page, server-side: column header buttons sort, select "Status", textbox "Search" (customer name), links
"Next" and "Previous", all in the URL (`page`, `sort`, `dir`, `status`, `q`); row checkboxes and a button "Mark shipped".
`/admin/orders/[id]`: customer, items with product names, select "Status". Shape pages for what agents really write:
`/admin/nested` (layout, section and page each load their own data), `/admin/per-row` (a row component loads its own customer, the
natural N+1), `/admin/slow` (a header with a button "Count" and a status "Count: N", beside a panel "Report" that waits `pg_sleep(2)`
and streams in).

**catalog** `/` (categories, 12 featured), `/c/[slug]` (24 a page; `min`, `max`, `stock`, `page` in the URL), `/p/[slug]` (details, 4
related, button "Add to cart"); unknown slug answers 404. Header link "Cart (N)" for an anonymous cookie cart, behind Suspense, so
it mustn't stop the page being fast.

Bench user for signed-in pages: `bench@weft.dev`, a throwaway local test account, password in `evals/apps/shared/pg/`.

## Metrics, on top of what `bench.mjs` already takes

| Probe | Definition |
|---|---|
| `db.canary` | before each sample, a random value is written to a row the page already shows (the page's `canary` in `app.json`); the page must show it, else the sample fails. Pages labelled `cached` are skipped and labelled. No benchmark code in a shipped template |
| `db.queries`, `db.rows` | per request, from `pg_stat_statements` deltas |
| `db.roundTrips` | (TTFB at 40 ms − TTFB at 2 ms) ÷ 38 ms |
| `server.ttfb.p50/p95/p99`, `server.flush.head` | server load client: time to first byte and to the `</head>` byte |
| `flow.nav.url/.paint/.data` | real click to URL change, first new paint, a named element: cold, and on a second visit |
| `flow.interaction.worst/.p75` | CDP trusted input, 4× CPU, event timing. Never called INP |
| `flow.interaction.streaming` | time to the first "Count" click that works during `/admin/slow`'s 2 s |
| `flow.mutate.optimistic/.confirmed/.requests` | input to optimistic DOM, to confirmed DOM, requests per mutation |
| `race.*` | pass/fail, final DOM equals the database: double submit, 5 toggles with shuffled replies, failure rollback, navigate during mutation, invalidate during read, two tabs |
| `bytes.html`, `bytes.data` | markup against embedded data, raw and brotli, at 50 and 500 rows |

Cut for now, with reasons in the evidence: blog and SaaS templates, tuned and naive variants, Caddy and open-loop load, agent runs,
Early Hints, Speculation Rules, a separate `@weft/adk`. So nothing here says agents get optimal code unprompted; that needs real
agent runs.

## First run

2026-11-01, commit `ecc436e`, yuna-mbp (M3 Pro), 3 samples, peak load 5.5, private Postgres 17 at 2 ms RTT, Chromium headless shell.
A one-line `BENCH_CHROME` patch was applied on that machine, since full Chrome can't start over ssh on a Mac. Before tuning anything:
`evals/results/sites/first-run-yuna.json`, summary in `first-run-yuna.txt`. Builders' friction reports: `40-friction.json`.

Where weft loses, all stacks in one run: server throughput on every database page (`/todos` 75 req/s, Solid 568, Next 213;
`/admin/nested` 20, 502, 266), TTFB, server memory on admin (2.4 GB, 414 MB, 504 MB), first working click during a 2 s stream
(2,188 ms, 292, 408), hydration on `/todos` (376 ms, 118, 167), HTML brotli (31 KB on `/admin`, 3, 6), DOM nodes (about double), boot
(about 900 ms, 200, 400), and `race.toggles`, which fails on weft only. Where it wins: mobile LCP on most database pages, and JS
against Next by 118 to 147 KB. Against Solid, JS is smaller on landing and catalog and larger on admin.

A second first run, commit `8db76dd` (`ecc436e` plus Windows harness and path fixes, no tuning), GatorBuilder (i9-13900K, Windows 11),
3 samples, private Postgres, installed Chrome: `first-run-windows.json`. Peak CPU reached 100% with WSL busy, so read its timings as
the pattern, not the value. Numbers from the two hosts are never compared with each other. It shows the same losses: admin server memory
2.1 GB, `race.toggles` 0 of 3, `/todos` 40 req/s against 300 and 90, `/admin/nested` 20 against 360 and 112.
