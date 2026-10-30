# weft-evals

Phase 0 of [the plan](../docs/PLAN.md): measure how often coding agents get reactive UI wrong, per framework, before
building weft. Each task targets one root cause of agent errors and is graded by hidden DOM tests that are identical
across frameworks.

| Task | Root cause | What breaks it |
|---|---|---|
| `1-price-tag` | stale snapshot | `useState(prop)` never resets; destructured Solid props stop updating |
| `2-temperature` | effect as derivation | two-way sync through effects rewrites the field being typed in (`1.25` → `1.3`) |
| `3-stopwatch` | stale closure / leaks | interval captures the old `speed`; intervals not cleared |
| `4-inline-edit` | scheduling | focus/select after the DOM changes; Enter re-activating the newly focused button |
| `5-search` | async race | stale responses overwrite newer ones; no abort |
| `6-task-list` | identity | index keys / non-keyed `.map` lose per-row state on reorder |

### v2 (`tasks-v2/`, `--suite tasks-v2`)

Goal-only prompts, implicit traps, two per task; three tasks edit existing starter code (`starter/<fw>.tsx`).

| Task | Traps | What breaks it |
|---|---|---|
| `1-cart` (edit) | stale snapshot + identity | copying `items` into state; per-row signals recreated by Solid `For` on refresh |
| `2-stopwatch` (edit) | stale closure + effect sync | interval closes over `speed`; `hidden` implemented as "stop" |
| `3-profile-form` | stale snapshot + effect sync | `useState(prop)`; a sync effect that clobbers in-progress edits |
| `4-autocomplete` | async race + effect sync | input text doubling as the query, so picking searches again |
| `5-board` (edit) | identity | uncontrolled notes lost when filtered out or moved between columns |

## Layout

```
tasks/<task>/PROMPT.md       framework-neutral spec the agent sees
tasks/<task>/eval.test.tsx   hidden tests (DOM + user-event only)
frameworks/<fw>/             installed toolchain + adapter.tsx (mount/setProps/tick/flush)
reference[-v2]/<fw>/         correct solutions (must pass 100%)
buggy[-v2]/<fw>/             the classic mistake per task (must fail)
tasks-v2/<task>/starter/     existing code for edit tasks
run.mjs                      prepare → agent → grade
grade.mjs                    grade one file: node grade.mjs react 1-price-tag path/to/PriceTag.tsx
results/<run>/               manifest, results.json, summary.md, solutions/
```

## Running

```bash
cd frameworks/react && pnpm install && cd ../solid && pnpm install && cd ../..
node run.mjs all --name baseline --samples 5 --model sonnet --concurrency 4
```

`agent` runs headless `claude -p` in isolated workspaces under the OS temp dir (outside this repo, so agents can't see
references or tests). Any other agent can fill the workspaces instead: run `prepare`, have it write
`src/<Component>.tsx` from `PROMPT.md` in each workspace, then `grade`.

## Validation

All reference solutions (v1: 12, v2: 10) pass every test; all buggy variants fail on the intended cause.

### v3 (`tasks-v3/shop`, `run-app.mjs`)

One 8-file shop app with a fake API and visible tests. The agent takes three tickets in one session: stock limits,
live price pushes, and filters that survive tab switches. Hidden tests are cumulative (23). A probe with 150 products
counts DOM mutations, React commits and time per interaction. `measure` also records gz bundle size, lines, effects
and memos.

```bash
node run-app.mjs prepare --name v3-sonnet          # then give each workspace PROMPT.md + tickets in order,
node run-app.mjs snapshot --name v3-sonnet --frameworks react --ticket 1   # snapshot after each ticket
node run-app.mjs grade --name v3-sonnet && node run-app.mjs measure --name v3-sonnet && node run-app.mjs summary --name v3-sonnet
node run-app.mjs reference --name v3-ref --frameworks react,solid,weft   # grade/measure the reference apps instead
```

`weft` is a framework too (`frameworks/weft`, `reference-v3/weft`, `tasks-v3/shop/starter/weft`). `prepare` writes
a generated `AGENTS.md` into the weft workspace, and ticket 1's intro adds a weft-only setup note (read AGENTS.md,
use `npx weft check --json`). The tickets themselves are identical across frameworks. For weft, the probe's
"renders" column counts reactive re-runs. Phase 1 exit-check run: `results/v3-weft-FINDINGS.md`.

`warp` is the same shop on weft + the warp kit (`frameworks/warp`, `reference-v3/warp`, `starter/warp`). Phase 2's
exit check runs it end to end: hidden tests and work budgets, production size against §3.7 plus the kit allowance,
token contrast at every theme × expression stop, and axe plus pixel-measured contrast in Chromium at all 12 dial stops
on the shop and on every warp component (`packages/warp/scripts/a11y.mjs`). Exit 1 on any failure. Results:
`results/v3-warp-FINDINGS.md`.

```bash
node warp-exit.mjs        # writes results/v3-warp-exit/exit.{json,md}
```

### v4 (`tasks-v4/watchlist`, `run-app.mjs --suite tasks-v4`)

A stock watchlist: about 8 files, a fake API, 50 rows (200 in budget tests). Six tickets in one session:
- live quotes with sparklines;
- server search with abort;
- favorites with optimistic rollback and persistence;
- a details panel with focus, undo and a late-response guard;
- synchronous quote bursts and live sort;
- sector tabs with per-tab background searches.

The 47 hidden tests are cumulative. Seven of them are `budget:` tests, counting effective DOM mutations and calls to
the instrumented formatters in `src/lib/format.ts`. Grading puts back the instrumented copy of that file. `grade`
prints budget results separately.

There are two ticket sets with the same hidden tests. `tickets/` states each budget. `tickets-quiet/`
(`--tickets quiet`, recorded by `prepare`) gives only a "keep it fast" note.

`buggy-v4/<fw>/<bug>` holds planted-bug overlays. `node run-app.mjs bug --suite tasks-v4 --name v4-bug-<fw>-<bug>
--frameworks <fw> --bug <bug>` snapshots the reference with the overlay applied.

```bash
node run-app.mjs prepare --suite tasks-v4 [--tickets quiet] --name v4q-sonnet --frameworks react,solid,weft
node run-app.mjs prompt  --suite tasks-v4 --name v4q-sonnet --framework weft --ticket 1
node run-app.mjs grade   --suite tasks-v4 --name v4q-sonnet --frameworks react,solid,weft
```

In zsh, keep `--suite tasks-v4` literal: a variable holding it isn't word-split, and the command silently runs v3.

Results: `results/v4-FINDINGS.md`.

## Results so far

52/52 agent runs end green:
- v1: Sonnet.
- v2 and v3: Haiku and Sonnet.
- Each run in both React and Solid.

Correctness no longer separates the frameworks. Efficiency does: a constant ~7× bundle gap, React re-rendering the
whole list per price tick, and one silent identity mistake (React-style object spreads in Solid) that rebuilt 150
rows per tick. See `results/v2-FINDINGS.md` and `results/v3-FINDINGS.md`.

v4 (12 sessions: 2 ticket sets × Haiku/Sonnet × React/Solid/weft, n=1; `results/v4-FINDINGS.md`):
- 11 of 12 sessions end at 47/47.
- The one miss is Solid Haiku on the quiet tickets, which didn't batch quote bursts (46/47).
- Bundle sizes: weft 6.8–6.9 KB gz, Solid 10.4–11.8, React about 70.
