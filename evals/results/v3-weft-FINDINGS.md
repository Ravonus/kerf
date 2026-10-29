# v3 on weft: Phase 1 exit check (2026-10-29)

PLAN §9, row 1: *"Agent pass@1 on weft beats both baselines. Every eval failure maps to a W-code, or becomes a new
one."*

**Verdict:**
- **Failure-mapping half: met.** No test failed. The one silent inefficiency that nothing caught is now **W017**.
- **"Beats both baselines": not met as written.** Every framework scores 23/23, so correctness ties at the
  ceiling. weft wins on what the eval can still separate:
  - bundle size,
  - DOM work per price push (1 in both sessions; Solid Sonnet's was 300),
  - no identity regression.
- **Cost:** weft took more tool calls (Haiku 17 vs 10–11, Sonnet 7 vs 5) and about the same time.

## Setup

Driven exactly like the React and Solid v3 baselines ([v3-FINDINGS](v3-FINDINGS.md)):
- **Sessions:** one subagent session per model, with the `haiku` and `sonnet` aliases, n=1.
- **Tickets:** three in sequence, sent as continuations of the same session.
- **Prompts:** taken from `run-app.mjs prompt` with no changes. The tickets match the baselines byte for byte.
- **Setup note:** ticket 1's intro adds one weft-only sentence. It says weft is not React, to read `AGENTS.md`, to
  run `npx weft check --json` after changes and fix what it reports, and to ignore the P002 warnings.
- **Snapshots and stats:** a snapshot after each ticket; stats are the harness's cumulative figures.
- **Grading:** the same hidden tests (23) and the same probe (150 rows).

What weft needed for the setup to be fair:

| Added | Why |
|---|---|
| `tasks-v3/shop/starter/weft/src` + `tests/` | The Solid starter ported to weft idioms (8 files, 2 visible tests). Passes baseline 4/4 and 0 of t1–t3, like the others (`v3-starter`). |
| `AGENTS.md` per workspace | `prepare` runs `weft agents-md`, so it matches the installed compiler (6.5 KB at run time). |
| `@weft/cli` in `frameworks/weft` | `npx weft check --json` works in the workspace. |
| **`weft/jsx-runtime` (types only)** | weft shipped no JSX types. `npm run typecheck` failed on the starter with TS7026 on every element and TS2875. React and Solid agents had a working typecheck. |
| `packages/weft/src/index.ts`, `test.ts` | Two type errors in weft's own source showed up in every app's typecheck: a narrowed-state comparison, and a `vitest` `Assertion` augmentation with the wrong type parameters for vitest 5. |
| `frameworks/weft/adapter.tsx` `stats.commits` | Now reports weft's reactive re-runs. The probe's "renders" column means re-runs for weft. |
| `measure` | Counts `watch(` as an effect and `derived(` as a memo. |

The agents ran on weft **before** W017 existed, so `weft check` had nothing to tell them about it.

## Correctness: 6/6 checkpoints green, no regressions

| | React | Solid | weft |
|---|---|---|---|
| Haiku | 23/23 | 23/23 | **23/23** (t1 9/9, t2 16/16, t3 23/23) |
| Sonnet | 23/23 | 23/23 | **23/23** (t1 9/9, t2 16/16, t3 23/23) |

- **State placement:** both weft sessions kept the subscription and filters in `App`, like every baseline session.
  Sonnet passed the filters down as boxes (`search={search}`); Haiku passed values.
- **Own tests:** Haiku wrote 12 tests (14/14 green), Sonnet none (2/2).
- **Feedback loop:** both ran `weft check` after every ticket. Each run reported 0 errors and only the 3 P002
  warnings. No W- or T-code fired in either session.
- **Identity:** both wrote the price update the AGENTS.md way (`p.id === id ? { ...p, price } : p`). That is the
  pattern that cost Solid Sonnet 300 DOM mutations.

## Cost

Cumulative through t3. Tokens are session context size, as in the baselines, not spend.

| | React | Solid | weft |
|---|---|---|---|
| Haiku | 11 tools · 2.3 min · 77.5k | 10 tools · 2.4 min · 85.1k | 17 tools · 2.8 min · 94.6k |
| Sonnet | 5 tools · 1.0 min · 63.2k | 5 tools · 1.2 min · 65.3k | 7 tools · 1.0 min · 67.6k |

- weft used 2 to 6 more tool calls: reading AGENTS.md, plus a `weft check` per ticket.
- Haiku also wrote 12 tests, which accounts for most of its extra calls.
- There were no self-correction loops.

## Output efficiency

| | bundle gz | price-push (1 of 150) | add-one | type-3-chars |
|---|---|---|---|---|
| React Haiku / Sonnet | 67.9 / 67.8 KB | 4 DOM · 1 commit (whole list) | 4 DOM · 1 commit | 174 / 173 DOM |
| Solid Haiku / Sonnet | 10.5 / 8.8 KB | 1 / **300** DOM | 1 DOM | 152 DOM |
| **weft Haiku** | **5.1 KB** | **1 DOM · 8 re-runs** | 1 DOM · 155 re-runs | 152 DOM · 15 re-runs |
| **weft Sonnet** | **5.0 KB** | **1 DOM · 9 re-runs** | 1 DOM · **452 re-runs** | 152 DOM · 15 re-runs |
| weft reference (before W017) | 4.9 KB | 1 DOM · 9 re-runs | 1 DOM · 452 re-runs | 152 DOM · 21 re-runs |
| weft reference (W017-clean) | 4.9 KB | 1 DOM · 9 re-runs | **1 DOM · 5 re-runs** | 152 DOM · 21 re-runs |

- **Bundle:** about half of Solid and about 1/13 of React, in both sessions. The §3.7 gate (≤ 10 KB brotli) passes.
- **Price push:** within the §3.7 budget (≤ 1 mutation, ≤ 10 re-runs) in both sessions. The Solid spread
  regression didn't recur: the habit and the AGENTS.md rule now point the same way.
- **Add-one: the one silent inefficiency.**
  - Each row reads the cart as a whole object: `inCart={cart[p.id] ?? 0}` in ProductList, `cart[p.id]` in CartView.
  - Adding one item re-runs every row's holes: 452 re-runs for a 1-node change. That is the same amount of work as
    React's whole-list commit.
  - The weft reference had the same habit.
  - No test, no §3.7 budget (add-one ≤ 3 is mutations) and no code caught it.
  - Passing the box and reading `cart.get(p.id)` drops it to 5 re-runs. Checked on a copy of Sonnet's app
    (`results/v3-weft-exp`), still 23/23.

## Every failure, and what caught it

| # | What went wrong | Where | Caught by | Now |
|---|---|---|---|---|
| 1 | Rows read one entry of a whole object (`cart[p.id]`, `paid[p.id]`, `basePrices[p.id]`), so every write re-runs every row (155–452 re-runs on add-one) | Haiku ×3, Sonnet ×3, reference ×2 | nothing | **W017, new** (below) |
| 2 | No JSX types: `npm run typecheck` fails on every weft app (TS7026/TS2875), plus 2 type errors in weft's own source | setup, before any agent ran | nothing (packaging, not a diagnostic) | fixed: `weft/jsx-runtime`, the `index.ts` and `test.ts` type fixes |
| 3 | P002 fires 3 warnings on a clean starter. Its fix ("alias `weft run <name>`") points at a command this build doesn't have (`available: false`) | every `weft check` run | P002 itself is the noise | proposed, not implemented (below) |

No hidden test failed, so there are no W-, T-, S- or P-code misses on correctness.

## New code: W017

**Rule.** A keyed-list row callback, outside its handlers and other nested functions, reads `whole[…item…]`, where
`whole` is a prop (`cart`, `props.cart`) or `box.value`.

**Message.**

> `cart[p.id]` reads one entry of the whole `cart` in every row, so any change to `cart` re-runs every row, not just
> the row whose entry changed.

**Fix.**
- Box form (`cart.value[p.id]`): read `cart.get(p.id)`. This is a safe autofix that rewrites every read of that
  object in the row.
- Prop form: pass the box instead of its value (`cart={cart}`, typed `State<…>`) and read `cart.get(p.id)`. There
  is no autofix, because the parent has to change.

**Severity:** warning. A constant lookup table passed as a prop would trip it, though the eval had none.

**Implemented in:**
- `crates/weft-compiler/src/analyze.rs` (`entry_reads`, `EntryReads`), with 3 tests in `tests/compile.rs`: the prop
  form; the box form, which autofixes to `.get` and leaves a clean file; handlers, constant keys and setup reads,
  which are ignored.
- The CLI catalog, with an example that `probe()` checks.
- AGENTS.md rules 6 and 7. The diagnostics table now lists W017; AGENTS.md is 6.9 KB, under the 8 KB limit.
- `weft docs lists`.

**Reference app:** `reference-v3/weft` now passes the box and reads `cart.get(p.id)`. It is still 23/23, and add-one
drops from 452 to 5 re-runs.

**Validation:** `weft check` on the two final agent apps reports W017 at exactly the 3 sites each, and nothing else
new.

## Proposed, not implemented

- **P002 while `weft run` doesn't exist.**
  - Skip it, or make its fix say "nothing to do until `weft run` ships". As it stands it is noise on every
    project, and the eval prompt had to tell agents to ignore it.
  - Left alone because the agent-layer owner may prefer to ship `weft run`.
- **W016 is missing from the CLI catalog.** The compiler reports it, but `weft docs W016` and AGENTS.md don't list
  it.
- **A §3.7 re-run budget for add-one** (e.g. ≤ 10 re-runs), next to the price-push one, so the verify loop catches
  failure #1 even when W017 can't see it (a whole-object read hidden behind a helper).

## What this says

- **Correctness still doesn't separate frameworks at this size.** That is now 58/58 agent runs across v1–v3. weft
  can't "beat" 100%, so the exit criterion needs a harder eval, or a restatement as "pass@1 ≥ both baselines, and
  efficiency ≥ both".
- **The agent layer worked where it was tested:**
  - Both models followed AGENTS.md's stable-identity rule, the habit behind Solid Sonnet's regression.
  - Both used `weft check` as a loop without being reminded after ticket 1.
- **The remaining habit is entry granularity:** reading `obj[id]` per row. Agents bring it from React, where it is
  free, and weft's own reference had it too. W017 now names it. Whether agents then fix it is untested.
- **Caveats:**
  - n=1 per cell, with subagent sessions as in the baselines.
  - The agents ran before W017 existed.
  - Wall times are jsdom's.
