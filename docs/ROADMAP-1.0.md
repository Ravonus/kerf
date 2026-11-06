# weft 1.0: the road to an open-source release

Written 2026-11-04 from an audit of `main` at `ceb25cda`. It's a plan, so the numbers below are a
snapshot. Each sprint ends by updating its **Status** line here.

The goal is a release that someone can clone, read and change in an afternoon, with or without an
agent. It ships three things:

1. **Code people can read on the page.** Every sample on the site and in the docs fits its box
   without wrapping strangely.
2. **The idea, fully kept.** Every React habit the plan promises to catch really is a compile error.
   Cheap agents can build apps from the docs alone. The benchmarks back the claims.
3. **A repo that looks like other good repos.** The layout is normal, nothing is left lying around,
   files and functions are small, code is DRY and KISS, and the community files a project needs are
   all there.

## Where things stand

| Area | Finding | Evidence |
|---|---|---|
| Code samples | Every `<pre>` wraps at any character, so long lines break mid-token | `site/src/styles/site.css:177` sets `pre-wrap` and `overflow-wrap: anywhere` |
| Code samples | 812 lines in Markdown code fences are over 80 columns, across 86 files | Worst: `packages/cli/docs/start.md` (50), `learn/tutorial.md` (35), `learn/auth.md` (21) |
| Code samples | 2,060 lines in site example and demo `.tsx` files are over 80 columns | `site/src/toolkit/examples/*.tsx`, `site/src/demos/` |
| Core promise | 18 compiler codes are in the catalog but nothing emits them, including every React-ism | See Sprint 4 |
| CI | `quality.yml` and `runtime-matrix.yml` have failed on every recent push | `gh run list`: Firefox and WebKit missing in CI, a gitleaks hit in `cli/test/deploy.test.mjs` |
| Size | weft + warp is 53.0 KB br, over the 50 KB ceiling. It was 40.8 KB on 10-31 | `evals/results/compare-history.jsonl` |
| Speed | weft + warp loads in 210 ms against Solid + Kobalte's 155 ms. weft alone takes 113 ms | Same file |
| Agent eval | The head-to-head eval (research 42) is built but has never been run | `evals/agent-eval/`, with nothing in `evals/results/` |
| Layout | 2,497 of the 5,507 tracked files are in `evals/`, and 1,561 of those are run snapshots | `evals/results/` |
| Size of code | 99 source files are over 400 lines. Some functions are over 400 lines | `start/src/server.tsx` `createHandler` (601), `start/src/hub.ts` `createHub` (415) |
| Line width | No JS/TS formatter. 13,000+ lines are over 120 columns, the longest 3,365 | `rustfmt.toml` is 120, and there's nothing for TS |
| DRY | `freePort`, `sleep`, `until`, `esc`, `walk` and `median` are each written 7 to 12 times | Scripts, tests and four runtime packages |
| Release scope | The README says the add-ons aren't released, but `scripts/release.mjs` publishes every non-private package | All 20 packages are public at 0.1.1 |

## Rules for 1.0

These are the rules every sprint works to. Sprint 0 makes the tools enforce them, so they don't
depend on anyone remembering them.

| Rule | Limit | Enforced by |
|---|---|---|
| Source line width (TS, JS, Rust) | 100 | `oxfmt` (`printWidth: 100`), `rustfmt` (`max_width = 100`) |
| Code in doc fences and callouts | 70 columns | `site/scripts/content.mjs` fails the build |
| Code shown in split example panes | 58 columns | Same check, run over `site/src/toolkit/examples` and `site/src/demos` |
| File length | 400 lines (generated, vendored and test files: 800) | `oxlint` `max-lines`, with a shrinking allowlist |
| Function length | 80 lines | `oxlint` `max-lines-per-function`; `clippy::too_many_lines` for Rust |
| Shared helpers | One home for each, and no private copy | `scripts/check.mjs` greps for the known duplicates |
| Folder names | A package's folder matches its npm name | A check in `scripts/check.mjs` |

The sample widths come from measuring the site's code boxes with IBM Plex Mono at 13 to 14 px:

| Box | 1440 px | 1024 px | 390 px |
|---|---|---|---|
| Doc column | 89 | 76 | 32 |
| Pitfall and challenge callouts | 74 | 71 | 28 |
| Split example pane (`/examples`, home) | 59 to 78 | about 55 | 38 |

So 70 columns fits every doc box on a tablet or anything wider. 58 fits the narrowest split pane.
On a phone, nothing fits without breaking lines, so phones get the hanging-indent wrap from Sprint 1.

Why 100 for source: Svelte, Solid and Astro all use 100, react.dev and Vite use 80. Our code is
denser than theirs, so 80 would mean a lot of churn for little gain. Docs are held to tighter
limits because their boxes are narrower than an editor.

## Sprints

Sprints are ordered by what unblocks what. They're scoped by work, not by calendar. Run heavy jobs
on yuna-mbp, never on this Mac: full `check`, `compare/measure.mjs`, the agent eval, cargo builds.
Steps marked ∥ can each run in their own session or worktree at the same time.

### Sprint 0: guardrails

Make `main` trustworthy, and make the rules above automatic before anyone starts moving code.

**Status:** implemented. Source formatting includes Rust in evals, benchmarks and spikes.
Length baselines only shrink, and sample-width violations remain warnings.

- [x] Get CI green. Install Firefox and WebKit in `quality.yml`, allowlist the deploy fixture in
      `.gitleaks.toml`, and fix `runtime-matrix.yml`. Its header still says there's no CI.
- [x] Add `oxfmt` with `printWidth: 100`, set `rustfmt` to `max_width = 100`, and format the whole
      repo in one commit. Add that commit's hash to `.git-blame-ignore-revs`.
- [x] Turn on `max-lines` and `max-lines-per-function` in `.oxlintrc.json`, and
      `clippy::too_many_lines` for Rust. Every current offender goes on an allowlist (the
      `evals/results/` baseline pattern). The allowlist can only shrink, and check fails if it grows.
- [x] Add the sample-width check to `site/scripts/content.mjs` as a warning that prints a count.
      Sprint 1 turns it into an error.

**Exit:** two green CI runs in a row on `main`. `pnpm run check` reports formatting, length and
sample-width counts, and the allowlists are committed.

### Sprint 1: code you can read on the page

The first thing in the brief: samples that fit their box, written the way we want people to write.

**Status:** implemented. Samples fit 70 columns in docs and 58 in split panes. Width violations
fail the content build and quality check. All 206 site checks pass, including 30 rendered-page
checks at 1440, 1024 and 390 px. Copy and annotated hanging indents have failing-before probes.

**Rendering** (`site/src/styles/site.css`, `docs.css`, `example.css`, and the highlighter that emits
`[data-part="line"]`):

- [x] Stop wrapping at any character. Wrap only at spaces (`overflow-wrap: normal`) and keep the
      leading spaces.
- [x] Indent wrapped lines past the line's own indent. The highlighter sets `--indent` on each line
      span, and CSS uses `padding-inline-start: calc(var(--indent) + 2ch)` with a matching negative
      `text-indent`. A wrapped line then reads as a continuation, as in Expressive Code's
      `hangingIndent`.
- [x] Copy still copies the original lines, as it does now.
- [x] Below 600 px, try horizontal scroll with an edge fade against the hanging wrap. Keep the one
      that passes `site/test/qa.mjs` and reads better on a phone.

**Content:** rewrite to fit 70 columns (docs) and 58 (split panes). The patterns to use:

- Destructure props and results: `const { items, taxRate } = props`, not `props.items.reduce(…)`
  inline in JSX.
- Name the steps. A `derived` gets a name, and so does a handler longer than one call: write
  `onClick={save}`, not a 120-column arrow function.
- Past two attributes, put one attribute on each line, and close the tag on its own line.
- Break long chains (`.filter().map()`) and long conditions (`a && b && c`) one per line, or name
  them.
- No long string literals in samples. Use shorter copy, or split the string.
- Imports: one per line once they pass the width.

Order, worst first. `packages/cli/docs/start.md`, `learn/tutorial.md`, `auth.md`,
`metadata-and-share-images.md`, `updating-objects-and-arrays.md` and
`you-might-not-need-an-effect.md` come first. Then the rest of `site/content/learn` and
`packages/cli/docs` ∥. Then `site/src/toolkit/examples/*.tsx` and `site/src/demos` ∥.

Apply the same patterns to the samples in `README.md` and in each `packages/*/README.md`.

**Exit:** the width check is an error. `site/test/qa.mjs` gains a test that loads 10 pages at 1440,
1024 and 390 px and fails if any desktop or tablet code line wraps. Before-and-after screenshots
go in the PR.

### Sprint 2: a normal repo layout

**Status:** complete. Packages, benchmarks, gates and archives use the target layout.

Moves and deletes come before the refactors, because moving files later would collide with every
open branch.

The target top level:

```
packages/        npm packages. Folder = npm name without the scope
crates/          Rust: weft, weft-compiler, weft-layout
site/            the docs site (weft.dev); generated pages untracked
examples/        small runnable apps people copy
benchmarks/      published size, speed and interactive comparisons
evals/           agent evals: tasks, references and gates; latest only
scripts/         repo tooling, plus scripts/lib for the shared helpers
docs/            contributor docs, ARCHITECTURE.md, decisions/
.github/         CI, templates, CODEOWNERS, dependabot
```

- [x] Rename folders to match npm names: `weft` becomes `core`, `icons` becomes
      `warp-icons`, and `create-weft` becomes `create`. Fix every link and path.
- [x] Move `evals/results/`, the 1,561 run snapshots, out of the tree. Tag the current tree as
      `archive/evals-2026-11`, then publish the snapshots as a release asset or in a
      `weft-js/eval-results` repo. Keep one summary file, plus `compare-history.jsonl`.
- [x] Remove the frozen Phase 0 eval baselines (`tasks`, `tasks-v2`, `reference`, `reference-v2`,
      `buggy`, `buggy-v2`) and keep the latest version of each. The archive tag keeps the history.
- [x] Move the nine exit scripts and e2e companions to `evals/gates/`, sharing one `evals/lib/gate.mjs`
      for `run`, `must`, `until`, `eq` and `check`.
- [x] Put the dashboard, speed and arena benchmarks in `benchmarks/`, with one README that
      explains the method (see Sprint 5).
- [x] Remove `site/review/` (21 screenshots). Stop tracking the generated `site/public/reference`
      and `site/public/learn`, and generate them in `build`.
- [x] Stop tracking other build output: `packages/warp/test/a11y/gallery/assets/*`,
      `packages/warp-icons/contact-sheet.html`, `packages/cli/.vitest/`,
      `evals/results/sites/first-run-*.json` and `benchmarks/speed/lab.json`. Add them to `.gitignore`.
- [x] Archive `docs/research/` (58 notes), `docs/design/warp/reviews/` (215 files),
      `docs/design/warp/specimens/` and `spikes/` under the archive tag. In their place, write
      `docs/decisions/`: one short file per decision that still holds, linking to the archived
      note. Cut `docs/PLAN.md` down to `docs/ARCHITECTURE.md` plus this roadmap.
- [x] Remove absolute home-directory paths from tracked files (`docs/research/04`, `40`, and
      `evals/agent-eval/lib/transcript.mjs`).
- [x] Delete `scripts/rename-scope.mjs`, which was a one-off.

**Exit:** the top level matches the tree above. No archived or generated path is tracked, and a
`scripts/quality/` check fails if one comes back. 3,099 tracked files after S2 (measured), down from
5,533. `pnpm run check` and the site build pass after the moves, run on yuna-mbp.

### Sprint 3: KISS and DRY

**Status:** implemented. Accepted measured exceptions are +1,684 B of warp size (51,397 to
53,081 B) and Firefox text preparation at +8.5% paired median; both have Sprint 5 follow-ups.

Every file under 400 lines and every function under 80, with the allowlist from Sprint 0 empty.

**Flaky tests first** (found in S2's verification, 2026-11-04). Make these deterministic, by waiting
on the state rather than on wall-clock time, before any split. Each one failed once and passed on a re-run:
- [x] `packages/warp/test/sweep.browser.test.ts`: the per-step draw limit (`< 6`) fails on a slow
      ARM VM at 13.1.
- [x] `packages/start/test/ui-state.browser.test.ts`, "killing the leader mid-hover: no stuck hover
      anywhere", fails with "Matcher did not succeed in time".
- [x] `packages/start` SSR test asserting the page doesn't yet contain "In stock" (the streamed slot
      resolved first), in Linux CI `quality` run 41905808021, attempt 1.

**Splits**, largest first. Each split moves code as-is and doesn't change behaviour, so each can be
its own PR.

| File | Function(s) | Split into |
|---|---|---|
| `start/src/server.tsx` (1,180) | `createHandler` (601) | `server/` with request routing, SSR render, server-function calls, assets and errors |
| `start/src/hub.ts` (822) | `createHub` (415) | Connections, rooms, presence and delivery, each a factory `createHub` composes |
| `start/src/vite.mjs` (968) | `weftStart` (264) | One Vite plugin per concern, and `weftStart` returns the array |
| `start/src/data.ts` (1,106) | `mutate` (81) | Query, mutate and cache modules |
| `core/vite.mjs` (628) | `styleGroups` (148) | `vite/style-groups.mjs` |
| `cli/src/tests.mjs` (572) | `checkTestFile` (214) | One function per rule, plus a table |
| `warp/src/schedule/Calendar.tsx` (865) | `useCalendar`, `TimeGrid`, `MonthGrid`, `Timeline` | One file per view, plus a `calendar-state.ts` |
| `warp-core/src/live.ts` (815) | `transportSim` (147) | `live/sim.ts` |
| `weft-compiler/src/emit.rs` (1,604) | `walk` (283), `props` (99) | `emit/{walk,props,list,attrs}.rs` |
| `weft-compiler/src/analyze.rs` (1,901) | `analyze_list` (106) | `analyze/` with one module per diagnostic family |
| `weft-compiler/src/hydration.rs` (1,220) | `facts` (223), `visit_jsx_element` (107) | `hydration/{facts,visit}.rs` |
| `site/src/toolkit/examples/canvas.tsx` (1,036) | `Landing` (148), `lookKit` (128) | One file per demo |

**One home for each helper:**

- [x] `scripts/lib/` (repo-internal, unpublished) holds `freePort`, `sleep`, `until`, `walk`,
      `median` and `repoRoot`. Twelve copies become imports, and 58 scripts stop computing their
      own `repo`, `root` or `here`.
- [x] An HTML `esc` is exported once, from `@weft-js/core/markup`. Today there are copies in
      `start/src/server.tsx`, `start/src/inline.mjs`, `core/src/head.ts` and
      `warp-core/src/{code,editor}.ts`.
- [x] The six `realtime-*` packages share one `vitest` and `tsconfig` base. Their configs are
      byte-identical today.
- [x] `site/src/toolkit/world.ts` holds the shared demo data (`TONES`, `WORDS`, `VIEWS`, `Cell`…).

**Conventions** (written into CONTRIBUTING and AGENTS.md):

- [x] Inside `src/`, use `.ts` and `.tsx`. Use `.mjs` only for files Node runs untranspiled
      (configs, `bin`, scripts). One extension style per package: `cli` stays `.mjs` with JSDoc
      types, and `start` stops mixing.
- [x] Tests are `*.test.ts(x)` for unit tests and `*.browser.test.ts(x)` for browser tests, in
      `test/`. The 56 ad-hoc `packages/*/scripts/*-e2e.mjs` move into `test/e2e/` and run under
      `pnpm test:e2e`.
- [x] One `vitest.config.ts` per package (15 are `.mjs` today).

**Exit:** both length allowlists are empty and the duplicate-helper grep finds nothing. Every
benchmark is within noise of the Sprint 0 numbers, or a measured exception is recorded in
ESCALATIONS.md and carried into S5.

### Sprint 4: keep the promise

Design rule 2 says every React habit that's silently wrong in weft is a hard compile error with a
fix. At the baseline, these catalog rules had no implementation:

| Code | Catches |
|---|---|
| W020 to W029 | React-isms: `useState`, `useEffect`, `useMemo`, `useRef`, `useCallback`, custom `useX()` hooks, dependency arrays |
| W040 | An early `return` that depends on state (the body runs once, so it's never checked again) |
| W041 | A `let` changed in a handler and read in JSX (it never updates) |
| W011 | A number on the left of `&&` (renders `0`) |
| W012 | `derived(async …)`, or reads after `await` in `resource` |
| W002 | Writing state inside `derived` |
| W003 | A `watch` that writes state its own source reads (a cycle) |
| W004 | A `watch` that only copies one value into another |
| W008 | A box where a value is expected at a prop, or the reverse |
| W030 | Module-level `state` the server entry can reach (it leaks across requests) |

- [x] Implement them in `crates/weft-compiler` in that order. The React-isms and W040 come first:
      they're the bugs agents write most. Each code gets a failing fixture, a fix and a
      `tests/compile.rs` case. Where the fix can't change meaning, it gets an autofix. W008 may be
      better as a TS-error mapping, which the plan allows.
- [x] Add W016 to the catalog (it's emitted at `analyze.rs:946` but has no entry) and give W085 a
      test.
- [x] Type `form.field()` values by field kind. A text field currently returns
      `string | string[] | undefined`; the landing template narrows its email value at the call site.
- [x] Add a check that the catalog matches the compiler. Every `by: 'compiler'` entry must have an
      emit site and a test, and every emitted code must have an entry. The catalog can't drift
      again.
- [x] Trim the public API. Move the runtime internals out of the `@weft-js/core` root (`DIRTY`,
      `rt`, `listener`, `read`, `reach`, `clean`, `setFlat`, `flat`, `collecting`, `runMounts`,
      `setKeyed`, `NONE`, `stats`, `devComponent`, `Box`) into `@weft-js/core/internal`, which the
      compiler's output imports. Document `memo`, `hole`, `localProps` and `restOf`, or move them
      too.
- [x] For each undocumented subpath export (9 in core, 23 in start), either document it in
      `packages/cli/docs` or remove it from `exports`. Commit an API snapshot (`api.json` per
      package) that `check` compares against, so API changes are deliberate.
- [x] Settle the 1.0 scope in `docs/ARCHITECTURE.md`. In: core, cli, create, start, db, warp,
      warp-core, warp-icons. Out: native (6a, 6b, 6d), the native half of pay, and anything with
      one conformance test. Unreleased packages get `"private": true` until they're ready, so
      `release.mjs` and the README agree.
- [x] Record the exit results for phases 1b, 3x and 3c in this file. Answer or defer each open
      question in PLAN §11.

**Exit:** the catalog check passes. `buggy-v4` reports every seeded React-ism as an error with the
right code. The API snapshots are committed.

**Status:** implemented. W020 uses resolved React imports and local wrappers; opaque imports
remain outside the single-file proof. W008 and W030 use CLI TypeScript/project analysis.
Seven `buggy-v4/weft/react-isms` seed/repair pairs have exact-compiler receipts; their core
test is part of integration. Core/start API snapshots and the empty catalog baseline are
committed. Field type assertions pass a direct Start type check. All-stack results are at
`d245aef6`; final integration applies the recorded WebKit-only exception when applicable.

### Earlier phase exits and open questions

The archived plan at `46198714^:docs/PLAN.md` records these exit criteria. Its phase 1b status
says the verify loop was built and names `evals/gate.mjs`; it does not record the exit result.
The current tree has no verified 1b exit receipt here, so acceptance of every reference test and
rejection of planted junk remains unverified. Phase 3x requires the todo and auth app across tested
engines, data layers and runtimes plus a hand-written auth provider. Phase 3c requires the Velatis
slice and live sessions to pass conformance and security suites. Neither exit has a verified result
in this record. Both remain unverified; package scope does not establish a pass.

The archived plan's §11 questions have these dispositions:

- `.value` in JSX: required; W015 catches bare boxes.
- Compiler spike: settled, then superseded by weft's own backend.
- Event replay: capture script for lazy-island pages.
- Partial hydration: inferred by default, with explicit overrides.
- Lazy islands: inferred by default, with explicit overrides.
- Hydrated resources: retain the current server value; background revalidation is deferred.
- Style group syntax and CSS-file input: defer the unresolved spike decision.
- OG renderer: defer the renderer decision; do not infer it from a dependency alone.
- Keyed record reads: `box.get(key)`; the compiler hint remains a follow-up.
- Bun and Deno native addons: retain the archived best-effort qualification; current proof is
  unverified here.
- Nitro v3: pin the beta; h3 v2 is the fallback.
- Android host and iOS engine: defer to the out-of-scope 6a spike.
- Better Auth on Native connections across engines: defer pending cross-engine proof.
- Default `idiom`: defer the choice and wizard behavior.
- Store payment policy ownership and refresh cadence: defer; no owner decision is recorded here.
- Names: weft is the framework; warp is its default UI toolkit.
- warp-core: framework-independent behavior and CSS; the `/weft` binding imports weft.

### Sprint 5: prove it (size and load time)

**Status:** in progress. Final owner scope, 2026-11-05: T01, T02 and T05.

- [ ] Get the comparison dashboard's weft + warp JS+CSS Brotli total below 51,200 B.
      Recover S3's growth from 51,397 B to 53,081 B without changing the UI or behavior.
- [x] Run `benchmarks/compare/measure.mjs` once on Yuna against Solid + Kobalte and
      record the first-load numbers.
- [x] `benchmarks/README.md` explains machines, runs, medians, measurements and
      reproduction. The site's numbers link to it.

S5 measurement (Yuna M3 Pro, Node 26.13.0, source `1b397bf4`): first-load task
time is 215 ms for weft + warp and 150 ms for Solid + Kobalte; FCP is 204 ms and
132 ms. Style time is 70 ms and 3 ms. The six-stack command exits 0 and all nine
parity steps pass for each stack. Warp long-list `heightMoved` is 0 despite an
empty error list, so scrolling acceptance remains unverified. Dashboard JS+CSS
Brotli remains 52,700 B. The owner requires recording this comparison, not closing
the load-time gap, for 1.0.

After merging main at `bb77d2da`, a source-matched dashboard size build measures
52,685 B (30,011 B JS + 22,674 B CSS). The two Listbox event alternatives measure
52,866 B and 52,861 B and are rejected. The 51,200 B size exit remains unmet.

The accepted Table state changes at `85f7078e` measure 52,488 B (29,814 B JS +
22,674 B CSS), a 197 B reduction from that control. All six stack builds pass and
the other stacks retain their byte totals. At least 1,289 B of recovery remains.

The private cell helper change at `546a6065` measures 52,464 B (29,790 B JS +
22,674 B CSS), another 24 B reduction. Same-setup production runs exit 0 with all
54 parity steps passing and 1,590 sampled warp nodes in both. Task times are
222/159 ms for control warp/Solid and 240/172 ms for candidate warp/Solid; the
unchanged stacks also slow in the later run, so no speedup is claimed. Warp
long-list `heightMoved` stays 0. At least 1,265 B of size recovery remains.

The private Row/Fields/Editor/Sheet helper change at `47af9980` measures 52,411 B
(29,737 B JS + 22,674 B CSS), 53 B below the fresh `97a2eaa0` control. It still
needs 1,212 B to be strictly below 51,200 B. Both canonical comparison runs pass
54 parity steps; warp keeps 1,590 sampled nodes and its design checks. Task time
is 236→240 ms against Solid's 173→169 ms; these ordered runs do not isolate a
speed effect. Warp's long-list heightMoved remains zero, so scrolling is not
proven. Full source-labeled evidence: S5 `manager-size-35/size-receipts.tar.gz`.

The Select private state and Item helper changes at `721fde60` measure 52,333 B
(29,659 B JS + 22,674 B CSS), 78 B below the fresh `ce1c4ccb` control. Tuples alone
measure 52,407 B. All other stacks retain identical sizes. Both canonical runs
pass 54 parity steps; warp retains 1,590 sampled nodes and its design checks.
Task time is 225→238 ms against Solid's 173→168 ms; style is 70→77 ms despite
identical CSS. No isolated code speed effect is inferred. Long-list heightMoved
remains zero. At least 1,134 B of recovery remains before the strict ceiling.
Full source-labeled evidence: S5 `manager-size-36/size-receipts.tar.gz`.

**Deferred until after 1.0 by the owner:**

- Firefox text preparation: confirm or fix the S3 paired-median increase.
- Submit the keyed js-framework-benchmark entry upstream. The existing local
  implementation remains in the repo; submission is the owner's later action.
- Cheap-agent evaluations, the React comparison matrix, and Learn-page friction
  runs, including fixes and reruns. T03, T04 and T06 are cancelled for this sprint.

**Exit:** dashboard JS+CSS Brotli is below 51,200 B, the load comparison and method
are recorded, and the sprint branch passes `weft-orchestra/bin/gate` before it
merges to main. No eval or upstream benchmark submission is required for 1.0.

### Sprint 6: open-source release

Everything a first-time visitor and their agent expect to find.

**Files.** These exist: LICENSE, CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, and issue and PR
templates. Add:

- [ ] `AGENTS.md` at the root: what weft is, the commands, the rules above and where things live.
      Add nested `AGENTS.md` files in `packages/core`, `packages/start`, `packages/warp` and
      `crates/weft-compiler`. Keep the root `CLAUDE.md` as one line pointing to `AGENTS.md`.
- [ ] `docs/ARCHITECTURE.md`: how compile, runtime and SSR fit together, and a map of the folders.
- [ ] `NOTICE` for the third-party code and fonts: pretext, Figtree, Fraunces, and alien-signals'
      algorithm.
- [ ] `.github/CODEOWNERS`, `GOVERNANCE.md` (who decides and how), `SUPPORT.md`, and optionally
      `.github/FUNDING.yml`.
- [ ] A `CHANGELOG.md` for each package, from Changesets.

**Release tooling:**

- [ ] Adopt Changesets, as Svelte, Astro, Solid and TanStack do. Use `changeset version` for
      releases and `--snapshot` for canaries on a `next` tag. Previews per PR on pkg.pr.new are
      optional.
- [ ] Decide on provenance. Commit `f9119ac9` moved publishing back to local `release.mjs --otp`,
      which means no npm provenance. Trusted publishing from Actions gives provenance and satisfies
      Scorecard's Signed-Releases check. The rule that signing stays on this Mac argues for local
      publishing. This decision belongs to the owner.

**Hardening** (OpenSSF Scorecard):

- [ ] Branch protection on `main`: required checks, no force-push.
- [ ] Workflows set `permissions: {}` at the top, grant per job, and pin every action to a full
      commit SHA.
- [ ] Use Dependabot or Renovate, with the same 3-day minimum release age that
      `pnpm-workspace.yaml` sets. Never route around it.
- [ ] Turn on CodeQL, and run Scorecard as an action with its badge in the README.

**Fresh-clone test:**

- [ ] On yuna-mbp, in an empty `~/work/weft-rc`: clone the repo, then run `pnpm install`,
      `pnpm run setup`, `pnpm run check` and `npm create @weft-js` from the packed tarballs. Then
      build the app and deploy it. Time each step, and fix anything that needed knowledge not in
      the README. Delete the checkout afterwards.

**Exit:** GitHub's community profile is 100%. The Scorecard is 7 or higher. A fresh clone gets
through the steps above with only the README. `1.0.0-rc.0` is published to the `next` tag.

## Decisions to confirm

Each has a default. The plan proceeds on the default unless the owner says otherwise.

| Decision | Default | Alternative |
|---|---|---|
| Code on phones | Hanging-indent wrap at spaces | Horizontal scroll with an edge fade |
| Source width | 100 for TS and Rust | 80 (react.dev, Vite) or 120 (today's `rustfmt`) |
| Formatter | `oxfmt`, part of the Oxc toolchain weft already uses | Prettier or Biome |
| Archive for research, run snapshots and spikes | An archive git tag, plus an eval-results repo | Keep them in `docs/archive/` |
| Folder renames (`weft` to `core`, and so on) | Rename in Sprint 2 | Keep the current names and document the mapping |
| Unreleased add-ons | `private: true` until each has real tests | Publish as `0.x` experimental |
| Provenance | Owner's call (see Sprint 6) | — |

## Status

- Sprint 0: guardrails implemented; formatting, lengths, sample warnings and CI are enforced
- Sprint 1: implemented; fatal sample widths, hanging indents and 206 site checks pass
- Sprint 2: complete; layout and archive regression gates pass
- Sprint 3: implemented
- Sprint 4: implemented
- Sprint 5: not started
- Sprint 6: not started
