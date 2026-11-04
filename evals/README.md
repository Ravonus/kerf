# weft evals

The v3 shop and v4 watchlist evaluations remain here. The Phase 0 tasks, their commands, and historical results are in the [archive](https://github.com/Ravonus/weft/tree/archive/evals-2026-11/evals).

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
"renders" column counts reactive re-runs. Phase 1 exit-check run: [findings](https://github.com/Ravonus/weft/blob/archive/evals-2026-11/evals/results/v3-weft-FINDINGS.md).

`warp` is the same shop on weft + the warp kit (`frameworks/warp`, `reference-v3/warp`, `starter/warp`). Phase 2's
exit check runs it end to end: hidden tests and work budgets, production size against §3.7 plus the kit allowance,
token contrast at every theme × expression stop, and axe plus pixel-measured contrast in Chromium at all 12 dial stops
on the shop and on every warp component (`packages/warp/scripts/a11y.mjs`). Exit 1 on any failure. Results:
[findings](https://github.com/Ravonus/weft/blob/archive/evals-2026-11/evals/results/v3-warp-FINDINGS.md).

The historical [exit command](https://github.com/Ravonus/weft/blob/archive/evals-2026-11/evals/warp-exit.mjs) and results are archived.

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

Results: [findings](https://github.com/Ravonus/weft/blob/archive/evals-2026-11/evals/results/v4-FINDINGS.md).

## Results so far

52/52 agent runs end green:
- v1: Sonnet.
- v2 and v3: Haiku and Sonnet.
- Each run in both React and Solid.

Correctness no longer separates the frameworks. Efficiency does: a constant ~7× bundle gap, React re-rendering the
whole list per price tick, and one silent identity mistake (React-style object spreads in Solid) that rebuilt 150
rows per tick. See [v2 findings](https://github.com/Ravonus/weft/blob/archive/evals-2026-11/evals/results/v2-FINDINGS.md) and [v3 findings](https://github.com/Ravonus/weft/blob/archive/evals-2026-11/evals/results/v3-FINDINGS.md).

v4 (12 sessions: 2 ticket sets × Haiku/Sonnet × React/Solid/weft, n=1; [findings](https://github.com/Ravonus/weft/blob/archive/evals-2026-11/evals/results/v4-FINDINGS.md)):
- 11 of 12 sessions end at 47/47.
- The one miss is Solid Haiku on the quiet tickets, which didn't batch quote bursts (46/47).
- Bundle sizes: weft 6.8–6.9 KB gz, Solid 10.4–11.8, React about 70.

## Comparing stacks

`benchmarks/compare/` builds one dashboard in every stack and charts the numbers. New scenarios, benchmarks and size or speed claims go
through it; see [its rule](../benchmarks/compare/README.md#the-rule).
